/**
 * 财务模块 - 应付/付款 API（挂载在 /api/finance）
 * GET  /ap                        应付单列表
 * GET  /ap/accounts/list          资金账户下拉
 * GET  /ap/payments/list          付款单列表
 * POST /ap                        新建应付单
 * PUT  /ap/:id/match              登记发票并确认（生成 借:原材料 贷:应付账款 凭证）
 * POST /ap/:id/pay                付款（自动核销 + 生成 借:应付账款 贷:资金 凭证）
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db.cjs');
const voucherService = require('../../services/finance/voucher-service.cjs');
const { nextDocNo, localDateStr } = require('../../services/finance/doc-no.cjs');

const gid = (req) => req.groupId ?? null;

function fail(res, err) {
  const tech = /(ER_|connect|pool|ECONN|query)/i.test(String(err.message || err));
  res.status(tech ? 500 : 400).json({ success: false, message: err.message || '操作失败' });
}

/** 确认应付（发票匹配）：生成 借 1403 原材料 / 贷 2202 应付账款 凭证，状态 open → matched */
async function confirmAPDoc(conn, { groupId, apDocId, operator }) {
  const [docs] = await conn.query('SELECT * FROM fin_ap_docs WHERE id = ? AND group_id <=> ?', [apDocId, groupId]);
  if (docs.length === 0) throw new Error('应付单不存在');
  const doc = docs[0];
  if (['paid', 'written_off'].includes(doc.status)) throw new Error('该应付单已结清，无需确认');
  if (doc.voucher_id) return { duplicate: true, ap_doc: doc };

  const bizDate = localDateStr();
  const res = await voucherService.createVoucher(conn, {
    groupId, voucherDate: bizDate, periodNo: bizDate.slice(0, 7),
    voucherType: 'ap', sourceType: 'ap', sourceId: doc.id,
    remark: `应付确认 ${doc.doc_no}${doc.invoice_no ? ' 发票:' + doc.invoice_no : ''}`, createdBy: operator,
    entries: [
      { subject_code: '1403', direction: 'debit', amount: Number(doc.amount), summary: `采购入库挂应付 ${doc.supplier_name || ''}` },
      { subject_code: '2202', direction: 'credit', amount: Number(doc.amount), summary: `应付供应商 ${doc.supplier_name || ''}` },
    ],
  });
  if (res.duplicate) {
    const [vdoc] = await conn.query('SELECT id FROM fin_vouchers WHERE voucher_no = ?', [res.voucher_no]);
    await conn.query("UPDATE fin_ap_docs SET status = 'matched', voucher_id = ? WHERE id = ?", [vdoc.id, doc.id]);
    return { duplicate: true, ap_doc: { ...doc, status: 'matched' } };
  }
  await conn.query("UPDATE fin_ap_docs SET status = 'matched', voucher_id = ? WHERE id = ?", [res.id, doc.id]);
  return { duplicate: false, ap_doc: { ...doc, status: 'matched' } };
}

// GET /ap —— 应付单列表
router.get('/ap', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['a.group_id <=> ?'];
    const params = [gid(req)];
    if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
    if (req.query.keyword) {
      where.push('(a.doc_no LIKE ? OR a.supplier_name LIKE ?)');
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM fin_ap_docs a WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT a.*, (a.amount - a.paid_amount) AS remaining
       FROM fin_ap_docs a WHERE ${whereSql}
       ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// GET /ap/accounts/list —— 资金账户下拉
router.get('/ap/accounts/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM fin_bank_accounts WHERE is_active = 1 AND group_id <=> ? ORDER BY id',
      [gid(req)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// GET /ap/payments/list —— 付款单列表
router.get('/ap/payments/list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['p.group_id <=> ?'];
    const params = [gid(req)];
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM fin_payments p WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT p.*, ba.name AS account_name
       FROM fin_payments p
       LEFT JOIN fin_bank_accounts ba ON p.bank_account_id = ba.id
       WHERE ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// POST /ap —— 新建应付单
router.post('/ap', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { supplier_id, supplier_name, amount, source_type, source_id, invoice_no, due_date, remark, created_by } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('应付金额必须大于 0');
    if (!supplier_id && !supplier_name) throw new Error('缺少供应商');

    let sName = supplier_name;
    if (!sName && supplier_id) {
      const [sup] = await pool.query('SELECT name FROM suppliers WHERE id = ?', [supplier_id]);
      if (sup.length === 0) throw new Error('供应商不存在');
      sName = sup[0].name;
    }
    const docNo = await nextDocNo(conn, { prefix: 'AP' });
    const [r] = await conn.query(
      `INSERT INTO fin_ap_docs (group_id, doc_no, source_type, source_id, supplier_id, supplier_name, amount, invoice_no, due_date, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [gid(req), docNo, source_type || 'manual', source_id ?? null, supplier_id ?? null, sName, amt,
        invoice_no || null, due_date || null, remark || null, created_by || null]
    );
    await conn.commit();
    res.json({ success: true, data: { id: r.insertId, doc_no: docNo } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// PUT /ap/:id/match —— 登记发票并确认（生成应付凭证）
router.put('/ap/:id/match', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const apId = Number(req.params.id);
    const invoiceNo = req.body.invoice_no || null;
    if (invoiceNo) {
      await conn.query('UPDATE fin_ap_docs SET invoice_no = ? WHERE id = ? AND group_id <=> ?', [invoiceNo, apId, gid(req)]);
    }
    const r = await confirmAPDoc(conn, { groupId: gid(req), apDocId: apId, operator: req.body.operator_name || req.body.created_by });
    await conn.commit();
    res.json({ success: true, data: r });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// POST /ap/:id/pay —— 付款（自动确认 + 核销 + 凭证）
router.post('/ap/:id/pay', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const apId = Number(req.params.id);
    const { payment_type, bank_account_id, operator, remark } = req.body;
    const groupId = gid(req);

    // 1. 未确认过则先确认挂账
    const [docs] = await conn.query('SELECT * FROM fin_ap_docs WHERE id = ? AND group_id <=> ?', [apId, groupId]);
    if (docs.length === 0) throw new Error('应付单不存在');
    const doc = docs[0];
    if (['paid', 'written_off'].includes(doc.status)) throw new Error('该应付单已结清，无需重复付款');
    if (!doc.voucher_id) {
      await confirmAPDoc(conn, { groupId, apDocId: apId, operator });
    }

    // 2. 可付金额
    const remaining = Number(doc.amount) - Number(doc.paid_amount);
    let payAmount = req.body.amount ? Number(req.body.amount) : remaining;
    if (payAmount <= 0) throw new Error('无可付余额');
    if (payAmount > remaining + 0.01) throw new Error(`付款金额超出应付余额（剩余 ${remaining.toFixed(2)}）`);

    // 3. 付款单 + 分配
    const payNo = await nextDocNo(conn, { prefix: 'PAY' });
    const [pr] = await conn.query(
      `INSERT INTO fin_payments (group_id, pay_no, payment_type, bank_account_id, supplier_id, amount, pay_date, operator, status, remark)
       VALUES (?,?,?,?,?,?,?,?,'paid',?)`,
      [groupId, payNo, payment_type || 'bank', bank_account_id ?? null, doc.supplier_id,
        payAmount, localDateStr(), operator || null, remark || null]
    );
    await conn.query(
      `INSERT INTO fin_payment_allocations (group_id, payment_id, ap_doc_id, amount) VALUES (?,?,?,?)`,
      [groupId, pr.insertId, apId, payAmount]
    );

    // 4. 更新应付单已付/状态
    const newPaid = Number(doc.paid_amount) + payAmount;
    const newStatus = newPaid >= Number(doc.amount) - 0.01 ? 'paid' : 'partial_paid';
    await conn.query(
      'UPDATE fin_ap_docs SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, newStatus, apId]
    );

    // 5. 付款凭证：借 2202 应付账款 / 贷 资金科目
    const [acc] = await conn.query('SELECT subject_code FROM fin_bank_accounts WHERE id = ?', [bank_account_id ?? 0]);
    const cashCode = acc[0]?.subject_code || (payment_type === 'cash' ? '1001' : '1002');
    const v = await voucherService.createVoucher(conn, {
      groupId, voucherDate: localDateStr(), periodNo: localDateStr().slice(0, 7),
      voucherType: 'ap', sourceType: 'ap-payment', sourceId: pr.insertId,
      remark: `付款 ${payNo} 核销应付 ${doc.doc_no}`, createdBy: operator,
      entries: [
        { subject_code: '2202', direction: 'debit', amount: payAmount, summary: `付供应商 ${doc.supplier_name || ''}` },
        { subject_code: cashCode, direction: 'credit', amount: payAmount, summary: `${payment_type || 'bank'}支付` },
      ],
    });
    await conn.query('UPDATE fin_payments SET voucher_id = ? WHERE id = ?', [v.id, pr.insertId]);

    await conn.commit();
    res.json({ success: true, data: { pay_no: payNo, amount: payAmount, ap_status: newStatus, voucher_no: v.voucher_no } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

module.exports = router;
