/**
 * 机时费管理 API
 *
 * 核心口径：机时费 = 实际工时 × 小时单价
 *   - 实际工时：production_reports.work_hours（实际结算口径）
 *   - 小时单价：production_machines.hourly_cost（按 machine_name 精确匹配）
 *
 * 机器为跨组共享的物理设施（沿用 owner_group_id 标识归属，不加 group_id），
 * 机时费统计时按产生报工记录的 production_reports.group_id 做多组隔离。
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// ==================== 建表 / 兼容旧库（幂等） ====================

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(200) NOT NULL,
        machine_type VARCHAR(100) COMMENT '印刷/折页/糊盒/切纸',
        owner_group_id VARCHAR(50) COMMENT '归属业务组',
        hourly_cost DECIMAL(10,2) DEFAULT 150 COMMENT '机时费(元/时)',
        daily_available_hours INT DEFAULT 16 COMMENT '每日可用工时',
        status TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(50) COMMENT '最后修改人',
        UNIQUE KEY uk_name (machine_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 兼容旧库：缺失列时补列，errno 1060 = 列已存在
    try { await pool.query("ALTER TABLE production_machines ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"); } catch (e) { if (e.errno !== 1060) console.error('[machine-cost]', e.message); }
    try { await pool.query("ALTER TABLE production_machines ADD COLUMN updated_by VARCHAR(50) COMMENT '最后修改人'"); } catch (e) { if (e.errno !== 1060) console.error('[machine-cost]', e.message); }

    // 单价变更历史（审计留痕）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS machine_rate_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_id INT NOT NULL,
        machine_name VARCHAR(200),
        old_rate DECIMAL(10,2),
        new_rate DECIMAL(10,2) NOT NULL,
        changed_by VARCHAR(50),
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_machine (machine_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='机器小时单价变更历史'
    `);

    console.log('[machine-cost] 机时费表已就绪');
  } catch (e) {
    console.error('[machine-cost] 建表失败:', e.message);
  }
})();

// ==================== 工具函数 ====================

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** 校验小时单价：不小于 0，且最多 2 位小数；非法返回 null */
function parseRate(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 默认统计区间：本月初 ~ 今天 */
function resolveRange(q) {
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: q.from || fmt(first),
    to: q.to || fmt(today),
  };
}

// ==================== 机器单价维护 ====================

// GET 机器列表（支持 keyword / status 过滤）
router.get('/', async (req, res) => {
  try {
    const { keyword = '', status } = req.query;
    const where = ['1=1'];
    const params = [];
    if (keyword) {
      where.push('(machine_name LIKE ? OR machine_type LIKE ? OR owner_group_id LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status === '0' || status === '1') {
      where.push('status = ?');
      params.push(Number(status));
    }
    const [rows] = await pool.query(
      `SELECT id, machine_name, machine_type, owner_group_id, hourly_cost,
              daily_available_hours, status, updated_by, updated_at, created_at
       FROM production_machines
       WHERE ${where.join(' AND ')}
       ORDER BY status DESC, id`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 新增机器
router.post('/', async (req, res) => {
  const { machine_name, machine_type, owner_group_id,
          hourly_cost = 150, daily_available_hours = 16, operator_name } = req.body || {};

  const name = String(machine_name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: '设备名称不能为空' });

  const rate = parseRate(hourly_cost);
  if (rate === null) return res.status(400).json({ success: false, message: '小时单价必须为不小于 0 的数字' });

  const hours = Number(daily_available_hours);
  const availableHours = Number.isFinite(hours) && hours >= 0 ? Math.round(hours) : 16;

  try {
    const [dup] = await pool.query('SELECT id FROM production_machines WHERE machine_name = ?', [name]);
    if (dup.length) return res.status(400).json({ success: false, message: '设备名称已存在' });

    const [result] = await pool.query(
      `INSERT INTO production_machines
         (machine_name, machine_type, owner_group_id, hourly_cost, daily_available_hours, status, updated_by)
       VALUES (?,?,?,?,?,1,?)`,
      [name, machine_type || null, owner_group_id || null, rate, availableHours, operator_name || null]
    );

    await pool.query(
      'INSERT INTO machine_rate_history (machine_id, machine_name, old_rate, new_rate, changed_by) VALUES (?,?,?,?,?)',
      [result.insertId, name, null, rate, operator_name || null]
    );

    res.json({ success: true, data: { id: result.insertId }, message: '设备已新增' });
  } catch (err) {
    if (err.errno === 1062) return res.status(400).json({ success: false, message: '设备名称已存在' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 修改机器信息（含单价、状态）
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: '设备 ID 非法' });

  const { machine_name, machine_type, owner_group_id, hourly_cost,
          daily_available_hours, status, operator_name } = req.body || {};

  try {
    const [rows] = await pool.query('SELECT * FROM production_machines WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '设备不存在' });
    const old = rows[0];

    const fields = [];
    const params = [];

    if (machine_name !== undefined) {
      const name = String(machine_name).trim();
      if (!name) return res.status(400).json({ success: false, message: '设备名称不能为空' });
      if (name !== old.machine_name) {
        const [dup] = await pool.query('SELECT id FROM production_machines WHERE machine_name = ? AND id <> ?', [name, id]);
        if (dup.length) return res.status(400).json({ success: false, message: '设备名称已存在' });
      }
      fields.push('machine_name = ?'); params.push(name);
    }

    let newRate = old.hourly_cost;
    if (hourly_cost !== undefined) {
      const rate = parseRate(hourly_cost);
      if (rate === null) return res.status(400).json({ success: false, message: '小时单价必须为不小于 0 的数字' });
      newRate = rate;
      fields.push('hourly_cost = ?'); params.push(rate);
    }

    if (machine_type !== undefined) { fields.push('machine_type = ?'); params.push(machine_type || null); }
    if (owner_group_id !== undefined) { fields.push('owner_group_id = ?'); params.push(owner_group_id || null); }
    if (daily_available_hours !== undefined) {
      const hours = Number(daily_available_hours);
      fields.push('daily_available_hours = ?');
      params.push(Number.isFinite(hours) && hours >= 0 ? Math.round(hours) : 16);
    }
    if (status !== undefined) { fields.push('status = ?'); params.push(status ? 1 : 0); }

    fields.push('updated_by = ?'); params.push(operator_name || null);

    await pool.query(`UPDATE production_machines SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);

    // 单价变化 → 记录变更历史
    if (hourly_cost !== undefined && Number(old.hourly_cost) !== Number(newRate)) {
      await pool.query(
        'INSERT INTO machine_rate_history (machine_id, machine_name, old_rate, new_rate, changed_by) VALUES (?,?,?,?,?)',
        [id, machine_name !== undefined ? String(machine_name).trim() : old.machine_name, old.hourly_cost, newRate, operator_name || null]
      );
    }

    res.json({ success: true, message: '已保存' });
  } catch (err) {
    if (err.errno === 1062) return res.status(400).json({ success: false, message: '设备名称已存在' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 软删除（置 status = 0，保留历史费用）
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: '设备 ID 非法' });
  try {
    const { operator_name } = req.body || {};
    const [result] = await pool.query(
      'UPDATE production_machines SET status = 0, updated_by = ? WHERE id = ?',
      [operator_name || null, id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '设备不存在' });
    res.json({ success: true, message: '设备已停用' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 机时费统计 ====================

/** 各维度汇总：机时费 = Σ(work_hours × hourly_cost) */
router.get('/costs/summary', async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const groupBy = ['machine', 'order', 'date', 'group'].includes(req.query.groupBy)
    ? req.query.groupBy : 'machine';
  const gf = groupFilter(req, 'r');

  const baseParams = [from, to, ...gf.params];
  let sql;

  if (groupBy === 'machine') {
    // 从机器主数据出发，未被报工引用的机器也展示（合计为 0）
    sql = `
      SELECT CAST(m.id AS CHAR) AS rowKey, m.machine_name AS label, m.machine_type AS sublabel,
             m.owner_group_id AS ownerGroup, m.hourly_cost AS hourlyCost,
             COALESCE(SUM(r.work_hours), 0) AS totalHours,
             COUNT(r.id) AS reportCount,
             ROUND(COALESCE(SUM(r.work_hours), 0) * m.hourly_cost, 2) AS totalCost
      FROM production_machines m
      LEFT JOIN production_reports r
             ON r.machine_name = m.machine_name
            AND r.status <> 'rejected'
            AND r.report_date BETWEEN ? AND ?${gf.sql}
      GROUP BY m.id, m.machine_name, m.machine_type, m.owner_group_id, m.hourly_cost
      ORDER BY totalCost DESC, m.id`;
  } else if (groupBy === 'order') {
    sql = `
      SELECT IFNULL(CAST(r.order_id AS CHAR), '__none__') AS rowKey,
             IFNULL(po.order_no, IFNULL(CONCAT('未关联工单 #', r.order_id), '未关联工单')) AS label,
             po.product_name AS sublabel,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)), 2) AS totalCost,
             ROUND(SUM(COALESCE(r.work_hours,0)), 2) AS totalHours,
             COUNT(r.id) AS reportCount,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)) / NULLIF(SUM(COALESCE(r.work_hours,0)),0), 2) AS hourlyCost
      FROM production_reports r
      LEFT JOIN production_machines m ON m.machine_name = r.machine_name
      LEFT JOIN production_orders po ON po.id = r.order_id
      WHERE r.status <> 'rejected' AND r.report_date BETWEEN ? AND ?${gf.sql}
      GROUP BY r.order_id, po.order_no, po.product_name
      ORDER BY totalCost DESC`;
  } else if (groupBy === 'date') {
    sql = `
      SELECT DATE_FORMAT(r.report_date, '%Y-%m-%d') AS rowKey,
             DATE_FORMAT(r.report_date, '%Y-%m-%d') AS label,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)), 2) AS totalCost,
             ROUND(SUM(COALESCE(r.work_hours,0)), 2) AS totalHours,
             COUNT(r.id) AS reportCount,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)) / NULLIF(SUM(COALESCE(r.work_hours,0)),0), 2) AS hourlyCost
      FROM production_reports r
      LEFT JOIN production_machines m ON m.machine_name = r.machine_name
      WHERE r.status <> 'rejected' AND r.report_date BETWEEN ? AND ?${gf.sql}
      GROUP BY r.report_date
      ORDER BY r.report_date`;
  } else {
    sql = `
      SELECT IFNULL(r.group_id, '__none__') AS rowKey,
             IFNULL(r.group_id, '未分组/共享') AS label,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)), 2) AS totalCost,
             ROUND(SUM(COALESCE(r.work_hours,0)), 2) AS totalHours,
             COUNT(r.id) AS reportCount,
             ROUND(SUM(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0)) / NULLIF(SUM(COALESCE(r.work_hours,0)),0), 2) AS hourlyCost
      FROM production_reports r
      LEFT JOIN production_machines m ON m.machine_name = r.machine_name
      WHERE r.status <> 'rejected' AND r.report_date BETWEEN ? AND ?${gf.sql}
      GROUP BY r.group_id
      ORDER BY totalCost DESC`;
  }

  try {
    const [raw] = await pool.query(sql, baseParams);
    const rows = raw.map((r) => ({
      key: String(r.rowKey),
      label: r.label,
      sublabel: r.sublabel || null,
      ownerGroup: r.ownerGroup || null,
      hourlyCost: r.hourlyCost === null ? null : Number(r.hourlyCost),
      totalHours: round2(r.totalHours),
      totalCost: round2(r.totalCost),
      reportCount: Number(r.reportCount) || 0,
    }));

    const totals = rows.reduce((acc, r) => ({
      totalHours: round2(acc.totalHours + r.totalHours),
      totalCost: round2(acc.totalCost + r.totalCost),
      reportCount: acc.reportCount + r.reportCount,
    }), { totalHours: 0, totalCost: 0, reportCount: 0 });

    res.json({ success: true, data: { range: { from, to }, groupBy, rows, totals } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** 报工级明细（分页），每条含 work_hours / hourly_cost / subtotal_cost */
router.get('/costs/detail', async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const { page = 1, pageSize = 20, matched } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 20));
  const offset = (pageNum - 1) * size;
  const gf = groupFilter(req, 'r');

  let extra = '';
  if (matched === '0') extra = " AND (r.machine_name IS NULL OR m.id IS NULL)";
  else if (matched === '1') extra = ' AND m.id IS NOT NULL';

  const where = `r.status <> 'rejected' AND r.report_date BETWEEN ? AND ?${gf.sql}${extra}`;
  const params = [from, to, ...gf.params];

  try {
    const [rows] = await pool.query(
      `SELECT r.id, DATE_FORMAT(r.report_date, '%Y-%m-%d') AS reportDate,
              r.employee_name AS employeeName, r.shift,
              r.machine_name AS machineName,
              po.order_no AS orderNo, po.product_name AS productName,
              r.output_quantity AS outputQuantity, r.work_hours AS workHours, r.status,
              (m.id IS NOT NULL) AS matched,
              m.hourly_cost AS hourlyCost,
              ROUND(COALESCE(r.work_hours,0) * COALESCE(m.hourly_cost,0), 2) AS subtotalCost,
              (r.work_hours IS NULL) AS missingHours
       FROM production_reports r
       LEFT JOIN production_machines m ON m.machine_name = r.machine_name
       LEFT JOIN production_orders po ON po.id = r.order_id
       WHERE ${where}
       ORDER BY r.report_date DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM production_reports r
       LEFT JOIN production_machines m ON m.machine_name = r.machine_name
       WHERE ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        matched: !!r.matched,
        missingHours: !!r.missingHours,
        workHours: r.workHours === null ? null : Number(r.workHours),
        hourlyCost: r.hourlyCost === null ? null : Number(r.hourlyCost),
        subtotalCost: round2(r.subtotalCost),
      })),
      total,
      page: pageNum,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** 未匹配机器主数据的报工（需补录机器） */
router.get('/costs/unmatched', async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const gf = groupFilter(req, 'r');
  try {
    const [rows] = await pool.query(
      `SELECT r.id, DATE_FORMAT(r.report_date, '%Y-%m-%d') AS reportDate,
              r.employee_name AS employeeName, r.shift,
              r.machine_name AS machineName, r.work_hours AS workHours,
              po.order_no AS orderNo, po.product_name AS productName
       FROM production_reports r
       LEFT JOIN production_machines m ON m.machine_name = r.machine_name
       LEFT JOIN production_orders po ON po.id = r.order_id
       WHERE r.status <> 'rejected' AND r.report_date BETWEEN ? AND ?${gf.sql}
         AND (r.machine_name IS NULL OR m.id IS NULL)
       ORDER BY r.report_date DESC, r.id DESC
       LIMIT 200`,
      [from, to, ...gf.params]
    );
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, workHours: r.workHours === null ? null : Number(r.workHours) })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
