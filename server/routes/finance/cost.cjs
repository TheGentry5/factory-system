/**
 * 财务模块 - 成本核算 API（挂载在 /api/finance）
 * GET  /cost                     成本计算单列表
 * GET  /cost/:id                 成本单详情（含明细行）
 * POST /cost/build-material      领料成本归集 + 结转凭证
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db.cjs');
const { buildMaterialCost } = require('../../services/finance/cost-service.cjs');

const gid = (req) => req.groupId ?? null;

function fail(res, err) {
  const tech = /(ER_|connect|pool|ECONN|query)/i.test(String(err.message || err));
  res.status(tech ? 500 : 400).json({ success: false, message: err.message || '操作失败' });
}

// GET /cost
router.get('/cost', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM fin_cost_sheet_lines l WHERE l.sheet_id = c.id) AS line_count
       FROM fin_cost_sheet c
       WHERE c.group_id <=> ?
       ORDER BY c.period_no DESC, c.id DESC`,
      [gid(req)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// GET /cost/:id
router.get('/cost/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[sheet]] = await pool.query(
      'SELECT * FROM fin_cost_sheet WHERE id = ? AND group_id <=> ?', [id, gid(req)]
    );
    if (!sheet) return res.status(404).json({ success: false, message: '成本单不存在' });
    const [lines] = await pool.query(
      `SELECT l.*, m.code AS material_code, m.name AS material_name, m.unit
       FROM fin_cost_sheet_lines l
       LEFT JOIN materials m ON l.material_id = m.id
       WHERE l.sheet_id = ? ORDER BY l.id`, [id]
    );
    res.json({ success: true, data: { ...sheet, lines } });
  } catch (err) { fail(res, err); }
});

// POST /cost/build-material —— 归集某期间领料成本
router.post('/cost/build-material', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { period_no, operator, create_voucher, remark } = req.body;
    if (!period_no) throw new Error('缺少期间（period_no = YYYY-MM）');
    const r = await buildMaterialCost(conn, {
      groupId: gid(req), periodNo: period_no,
      operator: operator || req.body.created_by,
      withVoucher: create_voucher !== false,
      remark,
    });
    await conn.commit();
    res.json({
      success: true,
      data: {
        duplicate: r.duplicate, sheet_no: r.sheet.sheet_no, period_no: r.sheet.period_no,
        material_cost: r.sheet.material_cost, labor_cost: r.sheet.labor_cost,
        overhead_cost: r.sheet.overhead_cost, total_cost: r.sheet.total_cost,
        status: r.sheet.status, voucher_no: r.voucher_no,
        line_count: r.lines.length, voucher_existed: r.duplicate,
      },
    });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

module.exports = router;
