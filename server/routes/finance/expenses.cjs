/**
 * 财务模块 - 费用报销 API（挂载在 /api/finance）
 * GET  /expenses                  费用单列表
 * GET  /expenses/employees/list   报销人(员工)下拉
 * POST /expenses                  员工提单
 * PUT  /expenses/:id/review       主管审批（approve/reject，通过生成 借:管理费用 贷:其他应付款 凭证）
 * PUT  /expenses/:id/pay          财务付款（生成 借:其他应付款 贷:资金 凭证）
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

const totalOf = (exp) => Number(exp.amount) + Number(exp.tax_amount || 0);

// GET /expenses —— 费用单列表
router.get('/expenses', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['e.group_id <=> ?'];
    const params = [gid(req)];
    if (req.query.status) { where.push('e.status = ?'); params.push(req.query.status); }
    if (req.query.department) { where.push('e.department = ?'); params.push(req.query.department); }
    if (req.query.period_no) { where.push("DATE_FORMAT(e.created_at, '%Y-%m') = ?"); params.push(req.query.period_no); }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM fin_expenses e WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT e.* FROM fin_expenses e WHERE ${whereSql} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// GET /expenses/employees/list —— 报销人下拉
router.get('/expenses/employees/list', async (req, res) => {
  try {
    const gf = req.groupId ? ' AND group_id = ?' : '';
    const params = req.groupId ? [req.groupId] : [];
    const [rows] = await pool.query(
      `SELECT id, emp_no, name, department, position FROM employees WHERE status = 1${gf} ORDER BY emp_no`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// POST /expenses —— 员工提单
router.post('/expenses', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { employee_id, employee_name, department, expense_type, amount, tax_amount, attachment_count, exp_date, remark, created_by, status } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('报销金额必须大于 0');
    if (!employee_id && !employee_name) throw new Error('缺少报销人');

    const expNo = await nextDocNo(conn, { prefix: 'EXP' });
    const st = status === 'draft' ? 'draft' : 'submitted';
    const [r] = await conn.query(
      `INSERT INTO fin_expenses (group_id, exp_no, employee_id, employee_name, department, expense_type,
         amount, tax_amount, attachment_count, exp_date, status, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [gid(req), expNo, employee_id ?? null, employee_name || null, department || null,
        expense_type || '其他', amt, Number(tax_amount || 0), Number(attachment_count || 0),
        exp_date || null, st, remark || null, created_by || null]
    );
    await conn.commit();
    res.json({ success: true, data: { id: r.insertId, exp_no: expNo } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// PUT /expenses/:id/review —— 主管审批
router.put('/expenses/:id/review', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = Number(req.params.id);
    const { action, approver } = req.body;
    const [rows] = await conn.query('SELECT * FROM fin_expenses WHERE id = ? AND group_id <=> ?', [id, gid(req)]);
    if (rows.length === 0) throw new Error('费用单不存在');
    const exp = rows[0];
    if (exp.status !== 'submitted' && exp.status !== 'draft') throw new Error('仅草稿/待审费用单可审批');

    if (action === 'reject') {
      await conn.query("UPDATE fin_expenses SET status = 'rejected', approver = ?, approved_at = NOW() WHERE id = ?", [approver || null, id]);
      await conn.commit();
      return res.json({ success: true, data: { status: 'rejected' } });
    }
    if (action !== 'approve') throw new Error('action 必须为 approve/reject');

    // 审批通过 → 借 6602 管理费用 / 贷 2211 其他应付款-员工
    const bizDate = localDateStr();
    const v = await voucherService.createVoucher(conn, {
      groupId: gid(req), voucherDate: bizDate, periodNo: bizDate.slice(0, 7),
      voucherType: 'expense', sourceType: 'expense-approve', sourceId: id,
      remark: `费用审批通过 ${exp.exp_no}`, createdBy: approver,
      entries: [
        { subject_code: '6602', direction: 'debit', amount: totalOf(exp), summary: `${exp.employee_name || ''} ${exp.expense_type}费用报销` },
        { subject_code: '2211', direction: 'credit', amount: totalOf(exp), summary: '其他应付款-员工' },
      ],
    });
    await conn.query(
      "UPDATE fin_expenses SET status = 'approved', approver = ?, approved_at = NOW(), voucher_id = ? WHERE id = ?",
      [approver || null, v.id, id]
    );
    await conn.commit();
    res.json({ success: true, data: { status: 'approved', voucher_no: v.voucher_no } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// PUT /expenses/:id/pay —— 财务付款
router.put('/expenses/:id/pay', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = Number(req.params.id);
    const { payment_type, bank_account_id, operator } = req.body;
    const groupId = gid(req);
    const [rows] = await conn.query('SELECT * FROM fin_expenses WHERE id = ? AND group_id <=> ?', [id, groupId]);
    if (rows.length === 0) throw new Error('费用单不存在');
    const exp = rows[0];
    if (exp.status !== 'approved') throw new Error('仅审批通过的费用单可付款');

    const total = totalOf(exp);
    const bizDate = localDateStr();
    const [acc] = await conn.query('SELECT subject_code FROM fin_bank_accounts WHERE id = ?', [bank_account_id ?? 0]);
    const cashCode = acc[0]?.subject_code || (payment_type === 'cash' ? '1001' : '1002');

    const v = await voucherService.createVoucher(conn, {
      groupId, voucherDate: bizDate, periodNo: bizDate.slice(0, 7),
      voucherType: 'expense', sourceType: 'expense-pay', sourceId: id,
      remark: `费用付款 ${exp.exp_no}`, createdBy: operator,
      entries: [
        { subject_code: '2211', direction: 'debit', amount: total, summary: `付给员工 ${exp.employee_name || ''}` },
        { subject_code: cashCode, direction: 'credit', amount: total, summary: `${payment_type || 'bank'}支付` },
      ],
    });
    await conn.query(
      "UPDATE fin_expenses SET status = 'paid', paid_via = ?, voucher_id = ? WHERE id = ?",
      [payment_type || 'bank', v.id, id]
    );
    await conn.commit();
    res.json({ success: true, data: { status: 'paid', voucher_no: v.voucher_no } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

module.exports = router;
