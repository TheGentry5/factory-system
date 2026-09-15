/**
 * 财务模块 - 记账凭证 API（挂载在 /api/finance）
 * GET  /vouchers                        凭证列表（分页）
 * GET  /vouchers/subjects/list          会计科目下拉
 * GET  /vouchers/:id                    凭证详情
 * POST /vouchers                        新增凭证（草稿或直接过账）
 * PUT  /vouchers/:id/post               过账
 * PUT  /vouchers/:id/reverse            红冲
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db.cjs');
const voucherService = require('../../services/finance/voucher-service.cjs');

const gid = (req) => req.groupId ?? null;

function fail(res, err) {
  const tech = /(ER_|connect|pool|ECONN|query)/i.test(String(err.message || err));
  res.status(tech ? 500 : 400).json({ success: false, message: err.message || '操作失败' });
}

// GET /vouchers/subjects/list —— 科目下拉（必须先于 /vouchers/:id）
router.get('/vouchers/subjects/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.code, s.name, s.parent_id, s.direction, s.type
       FROM fin_subjects s WHERE s.enabled = 1 ORDER BY s.code`
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// GET /vouchers 凭证列表
router.get('/vouchers', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 15);
    const where = ['v.group_id <=> ?'];
    const params = [gid(req)];

    if (req.query.status) { where.push('v.status = ?'); params.push(req.query.status); }
    if (req.query.period_no) { where.push('v.period_no = ?'); params.push(req.query.period_no); }
    if (req.query.keyword) {
      where.push('(v.voucher_no LIKE ? OR v.remark LIKE ? OR v.created_by LIKE ?)');
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    const whereSql = where.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM fin_vouchers v WHERE ${whereSql}`, params
    );
    const [rows] = await pool.query(
      `SELECT v.*
       FROM fin_vouchers v
       WHERE ${whereSql}
       ORDER BY v.voucher_date DESC, v.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (err) { fail(res, err); }
});

// GET /vouchers/:id 详情（含分录）
router.get('/vouchers/:id', async (req, res) => {
  try {
    const detail = await voucherService.getVoucherDetail(pool, gid(req), Number(req.params.id));
    if (!detail) return res.status(404).json({ success: false, message: '凭证不存在' });
    res.json({ success: true, data: detail });
  } catch (err) { fail(res, err); }
});

// POST /vouchers 新增（草稿 draft 或直接过账 posted）
router.post('/vouchers', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { voucher_date, period_no, voucher_type, remark, created_by, entries, status } = req.body;
    if (!voucher_date) throw new Error('缺少记账日期');
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('凭证至少需要一条分录');

    const periodNo = period_no || voucher_date.slice(0, 7);
    const st = status === 'posted' ? 'posted' : 'draft';
    const r = await voucherService.createVoucher(conn, {
      groupId: gid(req), voucherDate: voucher_date, periodNo,
      voucherType: voucher_type || 'generic', sourceType: 'manual', sourceId: null,
      remark, createdBy: created_by || 'system', entries, status: st,
    });
    await conn.commit();
    res.json({ success: true, data: { id: r.id, voucher_no: r.voucher_no, entry_count: r.entry_count } });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally {
    conn.release();
  }
});

// PUT /vouchers/:id/post 过账
router.put('/vouchers/:id/post', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await voucherService.postVoucher(conn, Number(req.params.id), gid(req), req.body.operator_name || req.body.created_by);
    await conn.commit();
    res.json({ success: true, data: r });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally {
    conn.release();
  }
});

// PUT /vouchers/:id/reverse 红冲
router.put('/vouchers/:id/reverse', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await voucherService.reverseVoucher(conn, {
      voucherId: Number(req.params.id), groupId: gid(req),
      operator: req.body.operator_name || req.body.created_by, remark: req.body.remark,
    });
    await conn.commit();
    res.json({ success: true, data: r });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally {
    conn.release();
  }
});

module.exports = router;
