/**
 * 生产管理 API（工单管理 + 生产报工 + 审核 + 生产总览）
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// ==================== 自动建表 ====================

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(30) NOT NULL,
        product_name VARCHAR(100) NOT NULL COMMENT '产品名称',
        customer_name VARCHAR(100) COMMENT '客户公司名称',
        spec VARCHAR(100) COMMENT '规格型号',
        quantity DECIMAL(12,2) NOT NULL COMMENT '计划数量',
        completed_quantity DECIMAL(12,2) DEFAULT 0 COMMENT '已完成数量',
        unit VARCHAR(20) DEFAULT '个',
        status ENUM('draft','pending','in_progress','completed','cancelled') DEFAULT 'draft',
        priority ENUM('low','normal','high','urgent') DEFAULT 'normal',
        planned_start DATE COMMENT '计划开始',
        planned_end DATE COMMENT '计划结束',
        delivery_date DATE COMMENT '交期',
        actual_start DATE COMMENT '实际开始',
        actual_end DATE COMMENT '实际结束',
        assigned_to VARCHAR(50) COMMENT '负责人/班组',
        created_by VARCHAR(50),
        remark VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT COMMENT '关联工单ID',
        employee_name VARCHAR(50) NOT NULL COMMENT '报工人',
        report_date DATE NOT NULL COMMENT '报工日期',
        output_quantity DECIMAL(12,2) NOT NULL COMMENT '良品产量',
        defective_quantity DECIMAL(12,2) DEFAULT 0 COMMENT '不良数',
        work_hours DECIMAL(5,1) COMMENT '工时(小时)',
        machine_name VARCHAR(100) COMMENT '设备/机台',
        shift VARCHAR(20) COMMENT '班次(早班/中班/晚班)',
        status ENUM('submitted','approved','rejected') DEFAULT 'submitted',
        reviewed_by VARCHAR(50) COMMENT '审核人',
        review_remark VARCHAR(500),
        remark VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_bom (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_name VARCHAR(100) NOT NULL COMMENT '成品名称',
        material_id INT NOT NULL COMMENT '物料ID',
        quantity DECIMAL(12,2) NOT NULL COMMENT '用量',
        unit VARCHAR(20) COMMENT '单位',
        process_order INT DEFAULT 0 COMMENT '工序顺序',
        remark VARCHAR(200),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 兼容旧表：添加列（忽略已存在的错误）
    try { await pool.query("ALTER TABLE production_orders ADD COLUMN customer_name VARCHAR(100) COMMENT '客户公司名称' AFTER product_name"); } catch (e) { if (e.errno !== 1060) console.error('[production]', e.message); }
    try { await pool.query("ALTER TABLE production_orders ADD COLUMN delivery_date DATE COMMENT '交期' AFTER planned_end"); } catch (e) { if (e.errno !== 1060) console.error('[production]', e.message); }
  } catch (e) {
    console.error('[production] 自动建表失败:', e.message);
  }
})();

// ==================== 生产总览 ====================

router.get('/overview', async (req, res) => {
  try {
    const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) AS totalOrders FROM production_orders');
    const [[{ inProgress }]] = await pool.query("SELECT COUNT(*) AS inProgress FROM production_orders WHERE status = 'in_progress'");
    const [[{ completedToday }]] = await pool.query(
      "SELECT COUNT(*) AS completedToday FROM production_orders WHERE status = 'completed' AND DATE(updated_at) = CURDATE()"
    );
    const [[{ totalOutput }]] = await pool.query(
      "SELECT COALESCE(SUM(output_quantity), 0) AS totalOutput FROM production_reports WHERE status != 'rejected' AND MONTH(report_date) = MONTH(CURDATE()) AND YEAR(report_date) = YEAR(CURDATE())"
    );
    const [[{ totalDefective }]] = await pool.query(
      "SELECT COALESCE(SUM(defective_quantity), 0) AS totalDefective FROM production_reports WHERE status != 'rejected' AND MONTH(report_date) = MONTH(CURDATE()) AND YEAR(report_date) = YEAR(CURDATE())"
    );
    const [[{ reportCount }]] = await pool.query(
      "SELECT COUNT(*) AS reportCount FROM production_reports WHERE DATE(report_date) = CURDATE()"
    );
    const [[{ pendingReview }]] = await pool.query(
      "SELECT COUNT(*) AS pendingReview FROM production_reports WHERE status = 'submitted'"
    );

    // 不良率
    const total = parseFloat(totalOutput) + parseFloat(totalDefective);
    const defectRate = total > 0 ? ((parseFloat(totalDefective) / total) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        totalOrders, inProgress, completedToday,
        monthOutput: totalOutput, monthDefective: totalDefective, defectRate,
        todayReports: reportCount, pendingReview,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 工单管理 ====================

// GET 工单列表
router.get('/orders', async (req, res) => {
  try {
    const { status, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (keyword) {
      where.push('(order_no LIKE ? OR product_name LIKE ? OR assigned_to LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [rows] = await pool.query(
      `SELECT * FROM production_orders
       WHERE ${where.join(' AND ')}
       ORDER BY FIELD(priority,'urgent','high','normal','low'), created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM production_orders WHERE ${where.join(' AND ')}`, params
    );

    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 下一个工单号
router.get('/orders/next-no', async (req, res) => {
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(order_no, -3)), 0) + 1, 3, '0') AS seq
       FROM production_orders WHERE order_no LIKE ?`,
      [`WO-${dateStr}-%`]
    );
    res.json({ success: true, data: { order_no: `WO-${dateStr}-${seq}` } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 创建工单
router.post('/orders', async (req, res) => {
  try {
    const { product_name, customer_name, spec, quantity, unit, priority, planned_start, planned_end,
            delivery_date, assigned_to, created_by, remark } = req.body;

    if (!product_name || !quantity) {
      return res.status(400).json({ success: false, message: '产品名称和计划数量为必填项' });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(order_no, -3)), 0) + 1, 3, '0') AS seq
       FROM production_orders WHERE order_no LIKE ?`,
      [`WO-${dateStr}-%`]
    );
    const orderNo = `WO-${dateStr}-${seq}`;

    const [result] = await pool.query(
      `INSERT INTO production_orders (order_no, product_name, customer_name, spec, quantity, unit, priority,
       planned_start, planned_end, delivery_date, assigned_to, created_by, remark, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNo, product_name, customer_name || null, spec || null, quantity, unit || '个',
       priority || 'normal', planned_start || null, planned_end || null,
       delivery_date || null, assigned_to || null, created_by || null, remark || null, req.groupId || null]
    );

    res.json({ success: true, data: { id: result.insertId, order_no: orderNo } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 更新工单
router.put('/orders/:id', async (req, res) => {
  try {
    const { product_name, customer_name, spec, quantity, unit, priority, planned_start, planned_end,
            delivery_date, assigned_to, remark } = req.body;
    await pool.query(
      `UPDATE production_orders SET product_name=?, customer_name=?, spec=?, quantity=?, unit=?, priority=?,
       planned_start=?, planned_end=?, delivery_date=?, assigned_to=?, remark=? WHERE id=?`,
      [product_name, customer_name || null, spec || null, quantity, unit || '个', priority || 'normal',
       planned_start || null, planned_end || null, delivery_date || null,
       assigned_to || null, remark || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 变更工单状态
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };
    if (status === 'in_progress') updates.actual_start = new Date().toISOString().slice(0, 10);
    if (status === 'completed') updates.actual_end = new Date().toISOString().slice(0, 10);

    const setClauses = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      setClauses.push(`${k} = ?`);
      params.push(v);
    }
    params.push(req.params.id);

    await pool.query(`UPDATE production_orders SET ${setClauses.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: updates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除工单
router.delete('/orders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM production_orders WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 生产报工 ====================

// GET 报工列表
router.get('/reports', async (req, res) => {
  try {
    const { status, order_id, employee_name, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];
    const gf = groupFilter(req, 'pr');
    if (status) { where.push('pr.status = ?'); params.push(status); }
    if (order_id) { where.push('pr.order_id = ?'); params.push(order_id); }
    if (employee_name) { where.push('pr.employee_name LIKE ?'); params.push(`%${employee_name}%`); }

    const [rows] = await pool.query(
      `SELECT pr.*, po.order_no, po.product_name, po.spec AS product_spec
       FROM production_reports pr
       LEFT JOIN production_orders po ON pr.order_id = po.id
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY pr.report_date DESC, pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, ...gf.params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM production_reports pr WHERE ${where.join(' AND ')} ${gf.sql}`, [...params, ...gf.params]
    );

    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 提交报工（员工端）
router.post('/reports', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { order_id, employee_name, report_date, output_quantity, defective_quantity,
            work_hours, machine_name, shift, remark } = req.body;

    if (!employee_name || !output_quantity) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: '报工人和良品产量为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO production_reports (order_id, employee_name, report_date, output_quantity,
       defective_quantity, work_hours, machine_name, shift, remark, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [order_id || null, employee_name, report_date || new Date().toISOString().slice(0, 10),
       output_quantity, defective_quantity || 0, work_hours || null,
       machine_name || null, shift || null, remark || null, req.groupId || null]
    );

    // 更新关联工单的完成数量
    if (order_id) {
      await conn.query(
        'UPDATE production_orders SET completed_quantity = completed_quantity + ? WHERE id = ?',
        [output_quantity, order_id]
      );
      // 如果完成数量 >= 计划数量，自动标记完成
      const [[order]] = await conn.query('SELECT * FROM production_orders WHERE id = ?', [order_id]);
      if (order && parseFloat(order.completed_quantity) >= parseFloat(order.quantity)) {
        await conn.query(
          "UPDATE production_orders SET status = 'completed', actual_end = CURDATE() WHERE id = ?",
          [order_id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// PUT 审核报工（管理者端）
router.put('/reports/:id/review', async (req, res) => {
  try {
    const { status, reviewed_by, review_remark } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: '审核结果须为 approved 或 rejected' });
    }

    await pool.query(
      `UPDATE production_reports SET status=?, reviewed_by=?, review_remark=? WHERE id=?`,
      [status, reviewed_by || null, review_remark || null, req.params.id]
    );

    // 如果拒绝，回退工单完成数量
    if (status === 'rejected') {
      const [[report]] = await pool.query('SELECT * FROM production_reports WHERE id = ?', [req.params.id]);
      if (report && report.order_id) {
        await pool.query(
          'UPDATE production_orders SET completed_quantity = GREATEST(0, completed_quantity - ?) WHERE id = ?',
          [report.output_quantity, report.order_id]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除报工记录
router.delete('/reports/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM production_reports WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== BOM 管理 ====================

// GET BOM 列表（按产品分组）
router.get('/bom', async (req, res) => {
  try {
    const { product_name } = req.query;
    let where = ['1=1'];
    let params = [];
    const gf = groupFilter(req, 'pb');
    if (product_name) { where.push('pb.product_name LIKE ?'); params.push(`%${product_name}%`); }

    const [rows] = await pool.query(
      `SELECT pb.*, m.code AS material_code, m.name AS material_name, m.spec AS material_spec, m.unit AS material_unit
       FROM production_bom pb
       LEFT JOIN materials m ON pb.material_id = m.id
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY pb.product_name, pb.process_order, pb.id`,
      [...params, ...gf.params]
    );

    // 按产品分组
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.product_name]) grouped[row.product_name] = [];
      grouped[row.product_name].push(row);
    }

    res.json({ success: true, data: rows, grouped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 添加 BOM 条目
router.post('/bom', async (req, res) => {
  try {
    const { product_name, material_id, quantity, unit, process_order, remark } = req.body;
    if (!product_name || !material_id || !quantity) {
      return res.status(400).json({ success: false, message: '成品名称、物料和用量为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO production_bom (product_name, material_id, quantity, unit, process_order, remark, group_id)
       VALUES (?,?,?,?,?,?,?)`,
      [product_name, material_id, quantity, unit || null, process_order || 0, remark || null, req.groupId || null]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE BOM 条目
router.delete('/bom/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM production_bom WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 生产日报 ====================
router.get('/daily-stats', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // 当日报工汇总
    const gf = groupFilter(req, 'pr');
    const [reports] = await pool.query(
      `SELECT pr.employee_name, pr.machine_name, pr.shift,
              SUM(pr.output_quantity) AS total_output,
              SUM(pr.defective_quantity) AS total_defective,
              SUM(pr.work_hours) AS total_hours,
              COUNT(*) AS report_count
       FROM production_reports pr
       WHERE pr.report_date = ? AND pr.status != 'rejected' ${gf.sql}
       GROUP BY pr.employee_name, pr.machine_name, pr.shift
       ORDER BY pr.employee_name`,
      [targetDate, ...gf.params]
    );

    res.json({ success: true, data: { date: targetDate, reports } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
