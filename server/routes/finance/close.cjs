/**
 * 财务模块 - 期末结账 API（挂载在 /api/finance）
 * GET  /close/periods               期间列表
 * POST /close/periods               初始化/开启期间（幂等）
 * GET  /close/logs                  结账日志
 * POST /close/:period/precheck      ① 预检
 * POST /close/:period/trial-balance ⑤ 试算平衡
 * POST /close/:period/close-profit  ④ 损益结转
 * POST /close/:period/close         ⑥ 结账（原子事务）
 * POST /close/:period/reopen        ⑧ 反结账
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db.cjs');
const closeService = require('../../services/finance/close-service.cjs');
const { localDateStr } = require('../../services/finance/doc-no.cjs');

const gid = (req) => req.groupId ?? null;

function fail(res, err) {
  const tech = /(ER_|connect|pool|ECONN|query)/i.test(String(err.message || err));
  res.status(tech ? 500 : 400).json({ success: false, message: err.message || '操作失败' });
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /close/periods
router.get('/close/periods', async (req, res) => {
  try {
    const rows = await closeService.listPeriods(pool, gid(req));
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// POST /close/periods —— 开启一个期间（幂等）
router.post('/close/periods', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let periodNo = req.body.period_no || localDateStr().slice(0, 7);
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const groupId = gid(req);

    const [exist] = await conn.query(
      'SELECT * FROM fin_periods WHERE group_id <=> ? AND period_no = ?', [groupId, periodNo]
    );
    if (exist.length > 0) {
      if (exist[0].status === 'closed') throw new Error(`期间 ${periodNo} 已结账，无法开启`);
      await conn.commit();
      return res.json({ success: true, data: exist[0] });
    }
    // 自动补齐中间缺失期间（保证前序期间可结账）
    const [maxOpen] = await conn.query(
      "SELECT MAX(period_no) AS m FROM fin_periods WHERE group_id <=> ? AND status = 'open'", [groupId]
    );
    const from = maxOpen[0]?.m || periodNo;
    let cursor = from;
    const to = periodNo;
    let guard = 0;
    while (cursor !== to && guard < 120) {
      const [y, m] = cursor.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      await conn.query(
        "INSERT INTO fin_periods (group_id, period_no, status) VALUES (?, ?, 'open') ON DUPLICATE KEY UPDATE status=status",
        [groupId, next]
      );
      cursor = next;
      guard += 1;
    }
    if (cursor !== to) {
      await conn.query(
        "INSERT INTO fin_periods (group_id, period_no, status) VALUES (?, ?, 'open') ON DUPLICATE KEY UPDATE status=status",
        [groupId, periodNo]
      );
    }
    const [[row]] = await conn.query(
      'SELECT * FROM fin_periods WHERE group_id <=> ? AND period_no = ?', [groupId, periodNo]
    );
    await conn.commit();
    res.json({ success: true, data: row });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// GET /close/logs
router.get('/close/logs', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM fin_close_log WHERE group_id <=> ? ORDER BY id DESC LIMIT 200',
      [gid(req)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// POST /close/:period/precheck
router.post('/close/:period/precheck', async (req, res) => {
  try {
    const periodNo = req.params.period;
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const data = await closeService.runPrecheck(pool, gid(req), periodNo);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /close/:period/trial-balance
router.post('/close/:period/trial-balance', async (req, res) => {
  try {
    const periodNo = req.params.period;
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const data = await closeService.runTrial(pool, gid(req), periodNo);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /close/:period/close-profit —— 损益结转（幂等，可重入）
router.post('/close/:period/close-profit', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const periodNo = req.params.period;
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const data = await closeService.runCloseProfit(conn, gid(req), periodNo, req.body.operator_name || req.body.created_by);
    await conn.commit();
    res.json({ success: true, data });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// POST /close/:period/close —— 结账（原子事务：预检 + 锁期间）
router.post('/close/:period/close', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const periodNo = req.params.period;
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const groupId = gid(req);

    const pre = await closeService.runPrecheck(conn, groupId, periodNo);
    if (!pre.pass) {
      throw new Error(`预检未通过：${pre.checks.filter(c => c.level === 'block').map(c => c.label).join('；')}`);
    }
    const data = await closeService.runClose(conn, groupId, periodNo, req.body.operator_name || req.body.created_by);
    await conn.commit();
    res.json({ success: true, data });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

// POST /close/:period/reopen —— 反结账
router.post('/close/:period/reopen', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const periodNo = req.params.period;
    if (!PERIOD_RE.test(periodNo)) throw new Error('期间格式必须为 YYYY-MM');
    const data = await closeService.runReopen(conn, gid(req), periodNo, req.body.operator_name || req.body.created_by);
    await conn.commit();
    res.json({ success: true, data });
  } catch (err) {
    await conn.rollback();
    fail(res, err);
  } finally { conn.release(); }
});

module.exports = router;
