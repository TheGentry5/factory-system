/**
 * 暂存区管理 API
 *
 * 流程：到货 → 暂存(pending_inspection) → 质检 → pass/fail
 *   pass → 入库(stored)
 *   fail → 采购经理处置 → 退货(returned) / 全检接收(partial_accepted) → 入库
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// ==================== 查询列表 ====================
router.get('/', async (req, res) => {
  try {
    const { status, material_id, keyword, start_date, end_date, page = 1, pageSize = 15 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];

    if (status) {
      where.push('sr.status = ?');
      params.push(status);
    }
    if (material_id) {
      where.push('sr.material_id = ?');
      params.push(material_id);
    }
    if (keyword) {
      where.push('(sr.staging_no LIKE ? OR sr.batch_no LIKE ? OR m.name LIKE ? OR m.code LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (start_date) {
      where.push('sr.arrival_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      where.push('sr.arrival_date <= ?');
      params.push(end_date);
    }

    const gf = groupFilter(req, 'sr');
    const [rows] = await pool.query(
      `SELECT sr.*, m.code AS material_code, m.name AS material_name, m.unit,
              s.name AS supplier_name, po.order_no AS po_no
       FROM staging_records sr
       LEFT JOIN materials m ON sr.material_id = m.id
       LEFT JOIN suppliers s ON sr.supplier_id = s.id
       LEFT JOIN purchase_orders po ON sr.purchase_order_id = po.id
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY sr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, ...gf.params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM staging_records sr WHERE ${where.join(' AND ')} ${gf.sql}`,
      [...params, ...gf.params]
    );

    res.json({ success: true, data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[staging] GET / error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 下一个暂存单号 ====================
router.get('/next-no', async (req, res) => {
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(staging_no, -3)), 0) + 1, 3, '0') AS seq
       FROM staging_records WHERE staging_no LIKE ?`,
      [`STG-${dateStr}-%`]
    );
    res.json({ success: true, data: { staging_no: `STG-${dateStr}-${seq}` } });
  } catch (err) {
    console.error('[staging] GET /next-no error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 暂存详情（含质检明细） ====================
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT sr.*, m.code AS material_code, m.name AS material_name, m.unit,
              s.name AS supplier_name, po.order_no AS po_no
       FROM staging_records sr
       LEFT JOIN materials m ON sr.material_id = m.id
       LEFT JOIN suppliers s ON sr.supplier_id = s.id
       LEFT JOIN purchase_orders po ON sr.purchase_order_id = po.id
       WHERE sr.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: '暂存记录不存在' });

    // 质检明细
    const [details] = await pool.query(
      'SELECT * FROM inspection_details WHERE staging_id = ? ORDER BY id',
      [req.params.id]
    );
    row.inspection_details = details;

    // 该物料的检验标准
    const [standards] = await pool.query(
      'SELECT * FROM inbound_standards WHERE material_id = ? ORDER BY sort_order',
      [row.material_id]
    );
    row.standards = standards;

    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[staging] GET /:id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 创建暂存记录（到货接收） ====================
router.post('/', async (req, res) => {
  try {
    const { purchase_order_id, material_id, supplier_id, quantity, batch_no,
            duty_personnel, storage_area, created_by } = req.body;

    if (!material_id || !quantity) {
      return res.status(400).json({ success: false, message: '物料和数量为必填项' });
    }

    // 生成暂存单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(staging_no, -3)), 0) + 1, 3, '0') AS seq
       FROM staging_records WHERE staging_no LIKE ?`,
      [`STG-${dateStr}-%`]
    );
    const stagingNo = `STG-${dateStr}-${seq}`;

    const [result] = await pool.query(
      `INSERT INTO staging_records (staging_no, purchase_order_id, material_id, supplier_id, quantity,
       batch_no, duty_personnel, storage_area, arrival_date, created_by, group_id)
       VALUES (?,?,?,?,?,?,?,?,CURDATE(),?,?)`,
      [stagingNo, purchase_order_id || null, material_id, supplier_id || null, quantity,
       batch_no || null, duty_personnel || null, storage_area || null, created_by || null, req.groupId || null]
    );

    // 如果有关联采购单，更新采购单状态为 arrived
    if (purchase_order_id) {
      await pool.query(
        "UPDATE purchase_orders SET status='arrived', actual_arrival_date=CURDATE() WHERE id=?",
        [purchase_order_id]
      );
    }

    res.json({ success: true, data: { id: result.insertId, staging_no: stagingNo } });
  } catch (err) {
    console.error('[staging] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 质检 ====================
router.post('/:id/inspect', async (req, res) => {
  try {
    const { inspector, inspect_result, inspect_remark, qualified_quantity, details } = req.body;

    if (!inspector || !inspect_result) {
      return res.status(400).json({ success: false, message: '质检员和检验结论为必填项' });
    }

    let newStatus;
    if (inspect_result === 'pass') {
      newStatus = 'passed';
    } else if (inspect_result === 'partial') {
      newStatus = 'partial_accepted';
    } else {
      newStatus = 'failed';
    }

    await pool.query(
      `UPDATE staging_records SET status=?, inspect_result=?, inspector=?,
       inspect_date=NOW(), inspect_remark=?, qualified_quantity=?
       WHERE id=?`,
      [newStatus, inspect_result, inspector, inspect_remark || null, qualified_quantity || null, req.params.id]
    );

    // 写入逐项质检明细
    if (details && Array.isArray(details) && details.length > 0) {
      for (const d of details) {
        await pool.query(
          `INSERT INTO inspection_details (staging_id, standard_id, inspection_item, standard_value, actual_value, result, remark, group_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [req.params.id, d.standard_id || null, d.inspection_item, d.standard_value || null,
           d.actual_value || null, d.result || 'na', d.remark || null, req.groupId || null]
        );
      }
    }

    res.json({ success: true, data: { status: newStatus, inspect_result } });
  } catch (err) {
    console.error('[staging] POST inspect error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 采购经理处置 ====================
router.put('/:id/disposition', async (req, res) => {
  try {
    const { disposition, disposition_by, disposition_remark, qualified_quantity } = req.body;

    if (!disposition || !disposition_by) {
      return res.status(400).json({ success: false, message: '处置决定和处置人为必填项' });
    }

    let newStatus;
    if (disposition === 'return') {
      newStatus = 'returned';
    } else if (disposition === 'accept_partial') {
      newStatus = 'partial_accepted';
    } else {
      // full_inspect → 回到待检状态
      newStatus = 'pending_inspection';
    }

    await pool.query(
      `UPDATE staging_records SET status=?, disposition=?, disposition_by=?,
       disposition_date=NOW(), disposition_remark=?,
       qualified_quantity=IF(? IS NOT NULL, ?, qualified_quantity)
       WHERE id=?`,
      [newStatus, disposition, disposition_by, disposition_remark || null,
       qualified_quantity, qualified_quantity, req.params.id]
    );

    res.json({ success: true, data: { status: newStatus, disposition } });
  } catch (err) {
    console.error('[staging] PUT disposition error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 入库上架 ====================
router.post('/:id/store', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { location_code, operator_name, store_quantity } = req.body;

    const [[staging]] = await conn.query('SELECT * FROM staging_records WHERE id = ?', [req.params.id]);
    if (!staging) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '暂存记录不存在' });
    }
    if (!['passed', 'partial_accepted'].includes(staging.status)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: '仅已通过质检的物料可以入库' });
    }

    const qty = parseFloat(store_quantity) || parseFloat(staging.qualified_quantity) || parseFloat(staging.quantity);

    // 1. 生成入库单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await conn.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(record_no, -4)), 0) + 1, 4, '0') AS seq
       FROM inbound_records WHERE record_no LIKE ?`,
      [`IN${dateStr}%`]
    );
    const recordNo = `IN${dateStr}${seq}`;

    // 2. 创建入库记录
    const [inResult] = await conn.query(
      `INSERT INTO inbound_records (purchase_order_id, record_no, material_id, supplier_id, quantity,
       batch_no, inspector, duty_personnel, storage_area, inspect_result, status, inbound_date, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,CURDATE(),?)`,
      [staging.purchase_order_id, recordNo, staging.material_id, staging.supplier_id, qty,
       staging.batch_no, staging.inspector, staging.duty_personnel, staging.storage_area,
       'pass', 'approved', req.groupId || null]
    );

    // 3. 存入库位
    if (location_code) {
      const [[location]] = await conn.query('SELECT * FROM storage_locations WHERE code = ?', [location_code]);
      if (!location) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: '库位不存在' });
      }

      // 同类合并
      const [existRows] = await conn.query(
        `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? AND COALESCE(batch_no,'') = ?`,
        [location.id, staging.material_id, staging.batch_no || '']
      );
      if (existRows.length > 0) {
        await conn.query('UPDATE location_inventory SET quantity = quantity + ? WHERE id = ?',
          [qty, existRows[0].id]);
      } else {
        await conn.query(
          'INSERT INTO location_inventory (location_id, material_id, quantity, batch_no, inbound_record_id, group_id) VALUES (?,?,?,?,?,?)',
          [location.id, staging.material_id, qty, staging.batch_no || null, inResult.insertId, req.groupId || null]
        );
      }

      // 更新库位状态
      const [[{ totalStored }]] = await conn.query(
        'SELECT COALESCE(SUM(quantity), 0) AS totalStored FROM location_inventory WHERE location_id = ?',
        [location.id]
      );
      let locStatus = 'available';
      if (totalStored >= parseFloat(location.capacity)) locStatus = 'full';
      else if (totalStored > 0) locStatus = 'partial';
      await conn.query(
        'UPDATE storage_locations SET used_capacity = ?, status = ? WHERE id = ?',
        [totalStored, locStatus, location.id]
      );
    }

    // 4. 更新物料库存
    await conn.query('UPDATE materials SET current_stock = current_stock + ? WHERE id = ?',
      [qty, staging.material_id]);

    // 5. 更新暂存状态
    await conn.query("UPDATE staging_records SET status='stored' WHERE id=?", [req.params.id]);

    // 6. 操作日志
    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, inbound_record_id, quantity, operator_name, source_type, remark, group_id)
       VALUES ('inbound', ?, (SELECT id FROM storage_locations WHERE code=?), ?, ?, ?, 'web', ?, ?)`,
      [staging.material_id, location_code || null, inResult.insertId, qty,
       operator_name || staging.duty_personnel || 'system',
       `暂存入库 | 暂存单:${staging.staging_no} | 批次:${staging.batch_no || '无'} | 库位:${location_code || '未指定'}`,
       req.groupId || null
      ]
    );

    // 7. 如果采购单所有物料都已入库，标记完成
    if (staging.purchase_order_id) {
      const [[{ pending }]] = await conn.query(
        "SELECT COUNT(*) AS pending FROM staging_records WHERE purchase_order_id = ? AND status != 'stored' AND status != 'returned'",
        [staging.purchase_order_id]
      );
      if (pending === 0) {
        await conn.query("UPDATE purchase_orders SET status='completed' WHERE id=?", [staging.purchase_order_id]);
      }
    }

    await conn.commit();
    res.json({ success: true, data: { inbound_id: inResult.insertId, record_no: recordNo, quantity: qty } });
  } catch (err) {
    await conn.rollback();
    console.error('[staging] POST store error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ==================== 删除 ====================
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inspection_details WHERE staging_id = ?', [req.params.id]);
    await pool.query('DELETE FROM staging_records WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[staging] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 统计摘要 ====================
router.get('/stats/summary', async (req, res) => {
  try {
    const [[{ pending }]] = await pool.query(
      "SELECT COUNT(*) AS pending FROM staging_records WHERE status = 'pending_inspection'"
    );
    const [[{ passed }]] = await pool.query(
      "SELECT COUNT(*) AS passed FROM staging_records WHERE status IN ('passed','partial_accepted') AND DATE(inspect_date) = CURDATE()"
    );
    const [[{ failed }]] = await pool.query(
      "SELECT COUNT(*) AS failed FROM staging_records WHERE status = 'failed'"
    );
    res.json({ success: true, data: { pending, passed_today: passed, failed } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
