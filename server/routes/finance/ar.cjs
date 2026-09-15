/**
 * 财务模块 - 应收/收款 API（挂载在 /api/finance）
 * GET  /ar                      应收单列表
 * GET  /ar/customers/list       客户下拉
 * GET  /ar/receipts/list        收款单列表
 * POST /ar                      新建应收单
 * PUT  /ar/:id/confirm          确认销售（生成 借:应收账款 贷:主营业务收入 凭证）
 * POST /ar/:id/receipt          收款（自动确认 + 核销 + 生成 借:资金 贷:应收账款 凭证）
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

/** 确认应收：生成 借 1122 / 贷 6001 凭证，状态 open → matched */
async function confirmARDoc(conn, { groupId, arDocId, operator }) {
  const [docs] = await conn.query('SELECT * FROM fin_ar_docs WHERE id = ? AND group_id <=> ?', [arDocId, groupId]);
  if (docs.length === 0) throw new Error('应收单不存在');
  const doc = docs[0];
  if (['paid', 'written_off'].includes(doc.status)) throw new Error('该应收单已结清，无需确认');
  if (doc.voucher_id) return { duplicate: true, ar_doc: doc };

  const bizDate = localDateStr();
  const res = await voucherService.createVoucher(conn, {
    groupId, voucherDate: bizDate, periodNo: bizDate.slice(0, 7),
    voucherType: 'ar', sourceType: 'ar', sourceId: doc.id,
    remark: `销售确认 ${doc.doc_no}${doc.invoice_no ? ' 发票:' + doc.invoice_no : ''}`, createdBy: operator,
    entries: [
      { subject_code: '1122', direction: 'debit', amount: Number(doc.amount), summary: '应收账款' },
      { subject_code: '6001', direction: 'credit', amount: Number(doc.amount), summary: '主营业务收入' },
    ],
  });
  if (res.duplicate) {
    const [vdoc] = await conn.query('SELECT id FROM fin_vouchers WHERE voucher_no = ?', [res.voucher_no]);
    await conn.query("UPDATE fin_ar_docs SET status = 'matched', voucher_id = ? WHERE id = ?", [vdoc.id, doc.id]);
    return { duplicate: true, ar_doc: { ...doc, status: 'matched' } };
  }
  await conn.query("UPDATE fin_ar_docs SET status = 'matched', voucher_id = ? WHERE id = ?", [res.id, doc.id]);
  return { duplicate: false, ar_doc: { ...doc, status: 'matched' } };
}

// GET /ar —— 应收单列表
router.get('/ar', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['a.group_id <=> ?'];
    const params = [gid(req)];
    if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
    if (req.query.keyword) {
      where.push('(a.doc_no LIKE ? OR c.name LIKE ?)');
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM fin_ar_docs a LEFT JOIN fin_customers c ON a.customer_id = c.id WHERE ${whereSql}`, params
    );
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS customer_name, (a.amount - a.received_amount) AS remaining
       FROM fin_ar_docs a LEFT JOIN fin_customers c ON a.customer_id = c.id
       WHERE ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// GET /ar/customers/list —— 客户下拉
router.get('/ar/customers/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, code, name FROM fin_customers WHERE group_id <=> ? ORDER BY id', [gid(req)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// GET /ar/receipts/list —— 收款单列表
router.get('/ar/receipts/list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['r.group_id <=> ?'];
    const params = [gid(req)];
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM fin_receipts r WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT r.*, ba.name AS account_name
       FROM fin_receipts r LEFT JOIN fin_bank_accounts ba ON r.bank_account_id = ba.id
       WHERE ${whereSql} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// POST /ar —— 新建应收单
router.post('/ar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { customer_id, amount, invoice_no, due_date, remark, created_by } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('应收金额必须大于 0');
    if (!customer_id) throw new Error('缺少客户');
    const [[cust]] = await pool.query('SELECT name FROM fin_customers WHERE id = ?', [customer_id]);
    if (!cust) throw new Error('客户不存在');

    const docNo = await nextDocNo(conn, { prefix: 'AR' });
    const [r] = await conn.query(
      `INSERT INTO fin_ar_docs (group_id, doc_no, customer_id, amount, invoice_no, due_date, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [gid(req), docNo, customer_id, amt, invoice_no || null, due_date || null, remark || null, created_by || null]
    );
    await conn.commit();
    res.json({ success: true, data: { id: r.insertId, doc_no: docNo, customer_name: cust.name } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// PUT /ar/:id/confirm —— 确认销售
router.put('/ar/:id/confirm', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const arId = Number(req.params.id);
    const invoiceNo = req.body.invoice_no || null;
    if (invoiceNo) {
      await conn.query('UPDATE fin_ar_docs SET invoice_no = ? WHERE id = ? AND group_id <=> ?', [invoiceNo, arId, gid(req)]);
    }
    const r = await confirmARDoc(conn, { groupId: gid(req), arDocId: arId, operator: req.body.operator_name || req.body.created_by });
    await conn.commit();
    res.json({ success: true, data: r });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// POST /ar/:id/receipt —— 收款
router.post('/ar/:id/receipt', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const arId = Number(req.params.id);
    const { receipt_type, bank_account_id, operator, remark } = req.body;
    const groupId = gid(req);

    const [docs] = await conn.query('SELECT * FROM fin_ar_docs WHERE id = ? AND group_id <=> ?', [arId, groupId]);
    if (docs.length === 0) throw new Error('应收单不存在');
    const doc = docs[0];
    if (['paid', 'written_off'].includes(doc.status)) throw new Error('该应收单已结清，无需重复收款');
    if (!doc.voucher_id) {
      await confirmARDoc(conn, { groupId, arDocId: arId, operator });
    }

    const remaining = Number(doc.amount) - Number(doc.received_amount);
    let recAmount = req.body.amount ? Number(req.body.amount) : remaining;
    if (recAmount <= 0) throw new Error('无可收余额');
    if (recAmount > remaining + 0.01) throw new Error(`收款金额超出应收余额（剩余 ${remaining.toFixed(2)}）`);

    const receiptNo = await nextDocNo(conn, { prefix: 'REC' });
    const [pr] = await conn.query(
      `INSERT INTO fin_receipts (group_id, receipt_no, customer_id, receipt_type, bank_account_id, amount, receipt_date, operator, status, remark)
       VALUES (?,?,?,?,?,?,?,?,'paid',?)`,
      [groupId, receiptNo, doc.customer_id, receipt_type || 'bank', bank_account_id ?? null,
        recAmount, localDateStr(), operator || null, remark || null]
    );

    const newReceived = Number(doc.received_amount) + recAmount;
    const newStatus = newReceived >= Number(doc.amount) - 0.01 ? 'paid' : 'partial_paid';
    await conn.query('UPDATE fin_ar_docs SET received_amount = ?, status = ? WHERE id = ?', [newReceived, newStatus, arId]);

    const [acc] = await conn.query('SELECT subject_code FROM fin_bank_accounts WHERE id = ?', [bank_account_id ?? 0]);
    const cashCode = acc[0]?.subject_code || (receipt_type === 'cash' ? '1001' : '1002');
    const v = await voucherService.createVoucher(conn, {
      groupId, voucherDate: localDateStr(), periodNo: localDateStr().slice(0, 7),
      voucherType: 'ar', sourceType: 'ar-receipt', sourceId: pr.insertId,
      remark: `收款 ${receiptNo} 核销应收 ${doc.doc_no}`, createdBy: operator,
      entries: [
        { subject_code: cashCode, direction: 'debit', amount: recAmount, summary: `${receipt_type || 'bank'}收款` },
        { subject_code: '1122', direction: 'credit', amount: recAmount, summary: '核销应收账款' },
      ],
    });
    await conn.query('UPDATE fin_receipts SET voucher_id = ? WHERE id = ?', [v.id, pr.insertId]);

    await conn.commit();
    res.json({ success: true, data: { receipt_no: receiptNo, amount: recAmount, ar_status: newStatus, voucher_no: v.voucher_no } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

module.exports = router;
