/**
 * 库存管理 API（融合仓库管理 + 库存总览 + 调拨 + 盘点 + 呆滞料预警）
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');

// ==================== 自动建表 ====================

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transfer_no VARCHAR(30) NOT NULL,
        material_id INT NOT NULL,
        from_location_id INT NOT NULL,
        to_location_id INT NOT NULL,
        quantity DECIMAL(12,2) NOT NULL,
        status ENUM('pending','approved','completed','cancelled') DEFAULT 'pending',
        requested_by VARCHAR(50),
        approved_by VARCHAR(50),
        remark VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_check_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_no VARCHAR(30) NOT NULL,
        title VARCHAR(100) NOT NULL,
        zone_id INT,
        status ENUM('pending','in_progress','submitted','approved') DEFAULT 'pending',
        created_by VARCHAR(50),
        checked_by VARCHAR(50),
        approved_by VARCHAR(50),
        remark VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_check_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        location_id INT,
        material_id INT,
        system_quantity DECIMAL(12,2) DEFAULT 0,
        actual_quantity DECIMAL(12,2) DEFAULT 0,
        difference DECIMAL(12,2) DEFAULT 0,
        reason VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.error('[inventory] 自动建表失败:', e.message);
  }
})();

// ==================== 库存总览 ====================

router.get('/overview', async (req, res) => {
  try {
    const [[{ totalSku }]] = await pool.query('SELECT COUNT(*) AS totalSku FROM materials WHERE status = 1');
    const [[{ totalStock }]] = await pool.query('SELECT COALESCE(SUM(current_stock), 0) AS totalStock FROM materials WHERE status = 1');
    const [[{ totalValue }]] = await pool.query('SELECT COALESCE(SUM(current_stock * unit_price), 0) AS totalValue FROM materials WHERE status = 1');
    const [[{ lowStockCount }]] = await pool.query(
      'SELECT COUNT(*) AS lowStockCount FROM materials WHERE status = 1 AND current_stock <= safety_stock AND safety_stock > 0'
    );
    const [[{ zoneCount }]] = await pool.query('SELECT COUNT(*) AS zoneCount FROM warehouse_zones WHERE parent_id IS NOT NULL');
    const [[{ locationCount }]] = await pool.query('SELECT COUNT(*) AS locationCount FROM storage_locations');

    // 本月入库量
    const [[{ monthInbound }]] = await pool.query(
      "SELECT COALESCE(SUM(quantity), 0) AS monthInbound FROM operation_log WHERE type IN ('inbound','manual_inbound','restock') AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())"
    );
    // 本月出库量
    const [[{ monthOutbound }]] = await pool.query(
      "SELECT COALESCE(SUM(quantity), 0) AS monthOutbound FROM operation_log WHERE type = 'outbound' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())"
    );

    res.json({
      success: true,
      data: {
        totalSku, totalStock, totalValue, lowStockCount,
        zoneCount, locationCount, monthInbound, monthOutbound,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 库存搜索 ====================

router.get('/search', async (req, res) => {
  try {
    const { keyword, location_code, material_id, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];

    if (keyword) {
      where.push('(m.name LIKE ? OR m.code LIKE ? OR sl.code LIKE ? OR li.batch_no LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (location_code) {
      where.push('sl.code = ?');
      params.push(location_code);
    }
    if (material_id) {
      where.push('li.material_id = ?');
      params.push(material_id);
    }

    const [rows] = await pool.query(
      `SELECT li.*, m.code AS material_code, m.name AS material_name, m.spec, m.unit, m.safety_stock,
              sl.code AS location_code, sl.shelf_type, wz.code AS zone_code, wz.name AS zone_name
       FROM location_inventory li
       JOIN materials m ON li.material_id = m.id
       JOIN storage_locations sl ON li.location_id = sl.id
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       WHERE ${where.join(' AND ')}
       ORDER BY li.stored_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM location_inventory li
       JOIN materials m ON li.material_id = m.id
       JOIN storage_locations sl ON li.location_id = sl.id
       WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 呆滞料预警 ====================

router.get('/slow-moving', async (req, res) => {
  try {
    const { days = 90, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    // 查找 N 天内没有任何操作日志的库位物料
    const [rows] = await pool.query(
      `SELECT li.*, m.code AS material_code, m.name AS material_name, m.spec, m.unit,
              sl.code AS location_code, wz.name AS zone_name,
              DATEDIFF(CURDATE(), COALESCE(
                (SELECT MAX(ol.created_at) FROM operation_log ol WHERE ol.material_id = li.material_id AND ol.location_id = li.location_id),
                li.stored_at
              )) AS idle_days
       FROM location_inventory li
       JOIN materials m ON li.material_id = m.id
       JOIN storage_locations sl ON li.location_id = sl.id
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       WHERE li.stored_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND NOT EXISTS (
           SELECT 1 FROM operation_log ol
           WHERE ol.material_id = li.material_id
             AND ol.location_id = li.location_id
             AND ol.created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY)
         )
       ORDER BY idle_days DESC
       LIMIT ? OFFSET ?`,
      [Number(days), Number(days), Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM location_inventory li
       WHERE li.stored_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND NOT EXISTS (
           SELECT 1 FROM operation_log ol
           WHERE ol.material_id = li.material_id
             AND ol.location_id = li.location_id
             AND ol.created_at > DATE_SUB(CURDATE(), INTERVAL ? DAY)
         )`,
      [Number(days), Number(days)]
    );

    // 汇总呆滞总金额
    const totalValue = rows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0);

    res.json({ success: true, data: rows, total, totalValue, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 库存预警 ====================

router.get('/alerts', async (req, res) => {
  try {
    // 低库存预警
    const [lowStock] = await pool.query(
      `SELECT id, code, name, spec, unit, current_stock, safety_stock,
              (safety_stock - current_stock) AS shortage
       FROM materials
       WHERE status = 1 AND safety_stock > 0 AND current_stock <= safety_stock
       ORDER BY (current_stock / NULLIF(safety_stock, 0)) ASC`
    );

    // 满库位预警
    const [fullLocations] = await pool.query(
      `SELECT sl.code, sl.used_capacity, sl.capacity, wz.name AS zone_name
       FROM storage_locations sl
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       WHERE sl.status = 'full'
       ORDER BY sl.used_capacity DESC
       LIMIT 20`
    );

    res.json({ success: true, data: { lowStock, fullLocations } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 调拨管理 ====================

// GET 调拨单列表
router.get('/transfers', async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];
    if (status) { where.push('t.status = ?'); params.push(status); }

    const [rows] = await pool.query(
      `SELECT t.*, m.code AS material_code, m.name AS material_name, m.unit,
              sl1.code AS from_location_code, sl2.code AS to_location_code
       FROM inventory_transfers t
       JOIN materials m ON t.material_id = m.id
       JOIN storage_locations sl1 ON t.from_location_id = sl1.id
       JOIN storage_locations sl2 ON t.to_location_id = sl2.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_transfers t WHERE ${where.join(' AND ')}`, params
    );

    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 创建调拨单
router.post('/transfers', async (req, res) => {
  try {
    const { material_id, from_location_code, to_location_code, quantity, requested_by, remark } = req.body;

    if (!material_id || !from_location_code || !to_location_code || !quantity) {
      return res.status(400).json({ success: false, message: '物料、来源库位、目标库位和数量为必填项' });
    }

    // 查找库位
    const [[fromLoc]] = await pool.query('SELECT * FROM storage_locations WHERE code = ?', [from_location_code]);
    const [[toLoc]] = await pool.query('SELECT * FROM storage_locations WHERE code = ?', [to_location_code]);
    if (!fromLoc) return res.status(404).json({ success: false, message: `来源库位 ${from_location_code} 不存在` });
    if (!toLoc) return res.status(404).json({ success: false, message: `目标库位 ${to_location_code} 不存在` });

    // 检查来源库位存量
    const [[{ available }]] = await pool.query(
      'SELECT COALESCE(SUM(quantity), 0) AS available FROM location_inventory WHERE location_id = ? AND material_id = ?',
      [fromLoc.id, material_id]
    );
    if (available < parseFloat(quantity)) {
      return res.status(400).json({ success: false, message: `来源库位存量不足(仅有${available})` });
    }

    // 生成调拨单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(transfer_no, -4)), 0) + 1, 4, '0') AS seq
       FROM inventory_transfers WHERE transfer_no LIKE ?`,
      [`TR-${dateStr}-%`]
    );
    const transferNo = `TR-${dateStr}-${seq}`;

    const [result] = await pool.query(
      `INSERT INTO inventory_transfers (transfer_no, material_id, from_location_id, to_location_id, quantity, requested_by, remark)
       VALUES (?,?,?,?,?,?,?)`,
      [transferNo, material_id, fromLoc.id, toLoc.id, quantity, requested_by || null, remark || null]
    );

    res.json({ success: true, data: { id: result.insertId, transfer_no: transferNo } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 执行调拨（审批通过并实际移动库存）
router.put('/transfers/:id/approve', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { approved_by } = req.body;

    const [[transfer]] = await conn.query('SELECT * FROM inventory_transfers WHERE id = ?', [req.params.id]);
    if (!transfer) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '调拨单不存在' });
    }
    if (transfer.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `调拨单状态为 ${transfer.status}，无法执行` });
    }

    const qty = parseFloat(transfer.quantity);

    // FIFO 从来源库位取出
    const [invRows] = await conn.query(
      `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? ORDER BY stored_at ASC`,
      [transfer.from_location_id, transfer.material_id]
    );

    let remaining = qty;
    const deductions = [];
    for (const row of invRows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(row.quantity));
      deductions.push({ id: row.id, take, quantity: row.quantity, batch_no: row.batch_no });
      remaining -= take;
    }

    if (remaining > 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `来源库位存量不足(差额${remaining})` });
    }

    // 扣减来源库位
    for (const d of deductions) {
      if (d.take >= parseFloat(d.quantity)) {
        await conn.query('DELETE FROM location_inventory WHERE id = ?', [d.id]);
      } else {
        await conn.query('UPDATE location_inventory SET quantity = quantity - ? WHERE id = ?', [d.take, d.id]);
      }
    }

    // 存入目标库位（同类合并）
    const [existRows] = await conn.query(
      `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? AND COALESCE(batch_no,'') = ?`,
      [transfer.to_location_id, transfer.material_id, deductions[0]?.batch_no || '']
    );
    if (existRows.length > 0) {
      await conn.query('UPDATE location_inventory SET quantity = quantity + ? WHERE id = ?',
        [qty, existRows[0].id]);
    } else {
      await conn.query(
        'INSERT INTO location_inventory (location_id, material_id, quantity, batch_no) VALUES (?,?,?,?)',
        [transfer.to_location_id, transfer.material_id, qty, deductions[0]?.batch_no || null]
      );
    }

    // 更新来源库位状态
    await updateLocationStatus(conn, transfer.from_location_id);
    // 更新目标库位状态
    await updateLocationStatus(conn, transfer.to_location_id);

    // 更新调拨单状态
    await conn.query(
      "UPDATE inventory_transfers SET status = 'completed', approved_by = ? WHERE id = ?",
      [approved_by || null, req.params.id]
    );

    // 写操作日志
    const [[fromLoc]] = await conn.query('SELECT code FROM storage_locations WHERE id = ?', [transfer.from_location_id]);
    const [[toLoc]] = await conn.query('SELECT code FROM storage_locations WHERE id = ?', [transfer.to_location_id]);

    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, remark)
       VALUES ('move', ?, ?, ?, ?, ?),
              ('move', ?, ?, ?, ?, ?)`,
      [transfer.material_id, transfer.from_location_id, -qty, approved_by || 'system',
       `调拨发出→${toLoc.code} | 调拨单:${transfer.transfer_no}`,
       transfer.material_id, transfer.to_location_id, qty, approved_by || 'system',
       `调拨接收←${fromLoc.code} | 调拨单:${transfer.transfer_no}`]
    );

    await conn.commit();
    res.json({ success: true, data: { status: 'completed' } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// DELETE 取消/删除调拨单
router.delete('/transfers/:id', async (req, res) => {
  try {
    const [[transfer]] = await pool.query('SELECT * FROM inventory_transfers WHERE id = ?', [req.params.id]);
    if (!transfer) return res.status(404).json({ success: false, message: '调拨单不存在' });
    if (transfer.status === 'completed') {
      return res.status(400).json({ success: false, message: '已完成的调拨单不可删除' });
    }
    await pool.query("UPDATE inventory_transfers SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 盘点管理 ====================

// GET 盘点任务列表
router.get('/check-tasks', async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];
    if (status) { where.push('t.status = ?'); params.push(status); }

    const [rows] = await pool.query(
      `SELECT t.*, wz.name AS zone_name
       FROM inventory_check_tasks t
       LEFT JOIN warehouse_zones wz ON t.zone_id = wz.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );

    // 每个任务的明细数量
    for (const task of rows) {
      const [[{ detailCount }]] = await pool.query(
        'SELECT COUNT(*) AS detailCount FROM inventory_check_details WHERE task_id = ?', [task.id]
      );
      task.detail_count = detailCount;
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_check_tasks t WHERE ${where.join(' AND ')}`, params
    );

    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 创建盘点任务
router.post('/check-tasks', async (req, res) => {
  try {
    const { title, zone_id, created_by } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: '任务名称为必填项' });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(task_no, -4)), 0) + 1, 4, '0') AS seq
       FROM inventory_check_tasks WHERE task_no LIKE ?`,
      [`CK-${dateStr}-%`]
    );
    const taskNo = `CK-${dateStr}-${seq}`;

    const [result] = await pool.query(
      `INSERT INTO inventory_check_tasks (task_no, title, zone_id, created_by) VALUES (?,?,?,?)`,
      [taskNo, title, zone_id || null, created_by || null]
    );

    // 自动生成盘点明细（如果指定了库区）
    if (zone_id) {
      const [locItems] = await pool.query(
        `SELECT li.location_id, li.material_id, li.quantity, li.batch_no
         FROM location_inventory li
         JOIN storage_locations sl ON li.location_id = sl.id
         WHERE sl.zone_id = ?`,
        [zone_id]
      );
      for (const item of locItems) {
        await pool.query(
          `INSERT INTO inventory_check_details (task_id, location_id, material_id, system_quantity)
           VALUES (?,?,?,?)`,
          [result.insertId, item.location_id, item.material_id, item.quantity]
        );
      }
    }

    res.json({ success: true, data: { id: result.insertId, task_no: taskNo } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 盘点任务详情（含明细）
router.get('/check-tasks/:id', async (req, res) => {
  try {
    const [[task]] = await pool.query(
      `SELECT t.*, wz.name AS zone_name
       FROM inventory_check_tasks t
       LEFT JOIN warehouse_zones wz ON t.zone_id = wz.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!task) return res.status(404).json({ success: false, message: '盘点任务不存在' });

    const [details] = await pool.query(
      `SELECT d.*, m.code AS material_code, m.name AS material_name, m.unit,
              sl.code AS location_code
       FROM inventory_check_details d
       LEFT JOIN materials m ON d.material_id = m.id
       LEFT JOIN storage_locations sl ON d.location_id = sl.id
       WHERE d.task_id = ?
       ORDER BY d.id`,
      [req.params.id]
    );

    task.details = details;
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 提交盘点结果
router.post('/check-tasks/:id/submit', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { checked_by, details } = req.body;

    const [[task]] = await conn.query('SELECT * FROM inventory_check_tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '盘点任务不存在' });
    }

    // 更新明细
    if (details && Array.isArray(details)) {
      for (const d of details) {
        const actualQty = parseFloat(d.actual_quantity) || 0;
        const sysQty = parseFloat(d.system_quantity) || 0;
        const diff = actualQty - sysQty;

        if (d.id) {
          // 更新已有明细
          await conn.query(
            `UPDATE inventory_check_details SET actual_quantity = ?, difference = ?, reason = ? WHERE id = ?`,
            [actualQty, diff, d.reason || null, d.id]
          );
        } else {
          // 新增明细（手动添加的项）
          await conn.query(
            `INSERT INTO inventory_check_details (task_id, location_id, material_id, system_quantity, actual_quantity, difference, reason)
             VALUES (?,?,?,?,?,?,?)`,
            [task.id, d.location_id || null, d.material_id, sysQty, actualQty, diff, d.reason || null]
          );
        }
      }
    }

    // 更新任务状态
    await conn.query(
      "UPDATE inventory_check_tasks SET status = 'submitted', checked_by = ? WHERE id = ?",
      [checked_by || null, req.params.id]
    );

    // 写操作日志
    await conn.query(
      `INSERT INTO operation_log (type, quantity, operator_name, remark)
       VALUES ('check', 0, ?, ?)`,
      [checked_by || 'system', `盘点提交 | 任务单:${task.task_no} | ${task.title}`]
    );

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// PUT 审批盘点（差异处理）
router.put('/check-tasks/:id/approve', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { approved_by } = req.body;

    const [[task]] = await conn.query('SELECT * FROM inventory_check_tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '盘点任务不存在' });
    }

    // 根据盘点差异更新系统库存
    const [details] = await conn.query(
      'SELECT * FROM inventory_check_details WHERE task_id = ? AND difference != 0',
      [req.params.id]
    );

    for (const d of details) {
      const diff = parseFloat(d.difference);
      if (diff === 0) continue;

      if (d.location_id && d.material_id) {
        // 更新库位库存
        const [existRows] = await conn.query(
          'SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? ORDER BY stored_at ASC LIMIT 1',
          [d.location_id, d.material_id]
        );
        if (existRows.length > 0) {
          const newQty = parseFloat(existRows[0].quantity) + diff;
          if (newQty <= 0) {
            await conn.query('DELETE FROM location_inventory WHERE id = ?', [existRows[0].id]);
          } else {
            await conn.query('UPDATE location_inventory SET quantity = ? WHERE id = ?',
              [newQty, existRows[0].id]);
          }
          await updateLocationStatus(conn, d.location_id);
        } else if (diff > 0) {
          // 盘盈：新增记录
          await conn.query(
            'INSERT INTO location_inventory (location_id, material_id, quantity) VALUES (?,?,?)',
            [d.location_id, d.material_id, diff]
          );
          await updateLocationStatus(conn, d.location_id);
        }
      }

      if (d.material_id) {
        // 更新物料总库存
        await conn.query(
          'UPDATE materials SET current_stock = current_stock + ? WHERE id = ?',
          [diff, d.material_id]
        );
      }

      // 写盘点调整日志
      const [[loc]] = d.location_id
        ? await conn.query('SELECT code FROM storage_locations WHERE id = ?', [d.location_id])
        : [null];

      await conn.query(
        `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, remark)
         VALUES ('check', ?, ?, ?, ?, ?)`,
        [d.material_id, d.location_id || null, diff, approved_by || 'system',
         `盘点调整 | 任务:${task.task_no} | 库位:${loc?.code || '未知'} | 差异:${diff > 0 ? '+' : ''}${diff} | ${d.reason || ''}`]
      );
    }

    await conn.query(
      "UPDATE inventory_check_tasks SET status = 'approved', approved_by = ? WHERE id = ?",
      [approved_by || null, req.params.id]
    );

    await conn.commit();
    res.json({ success: true, data: { adjustedCount: details.length } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// DELETE 盘点任务
router.delete('/check-tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inventory_check_details WHERE task_id = ?', [req.params.id]);
    await pool.query('DELETE FROM inventory_check_tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 共用：更新库位状态 ====================

async function updateLocationStatus(conn, locationId) {
  const [[{ totalStored }]] = await conn.query(
    'SELECT COALESCE(SUM(quantity), 0) AS totalStored FROM location_inventory WHERE location_id = ?',
    [locationId]
  );
  const [[location]] = await conn.query('SELECT * FROM storage_locations WHERE id = ?', [locationId]);
  let status = 'available';
  if (totalStored >= parseFloat(location.capacity)) status = 'full';
  else if (totalStored > 0) status = 'partial';
  await conn.query(
    'UPDATE storage_locations SET used_capacity = ?, status = ? WHERE id = ?',
    [totalStored, status, locationId]
  );
}

module.exports = router;
