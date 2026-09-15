/**
 * 入库记录 API（含双检制度支持）
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');

// GET 入库记录列表
router.get('/', async (req, res) => {
  try {
    const { status, material_id, page = 1, pageSize = 15 } = req.query;
    const offset = (page - 1) * pageSize;

    let where = ['1=1'];
    let params = [];

    if (status) {
      where.push('ir.status = ?');
      params.push(status);
    }
    if (material_id) {
      where.push('ir.material_id = ?');
      params.push(material_id);
    }

    const [rows] = await pool.query(
      `SELECT ir.*, m.name AS material_name, m.code AS material_code, m.dual_inspection,
              s.name AS supplier_name
       FROM inbound_records ir
       LEFT JOIN materials m ON ir.material_id = m.id
       LEFT JOIN suppliers s ON ir.supplier_id = s.id
       WHERE ${where.join(' AND ')}
       ORDER BY ir.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inbound_records ir WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({ success: true, data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[inbound] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 创建入库记录
router.post('/', async (req, res) => {
  try {
    const { material_id, supplier_id, quantity, batch_no, duty_personnel, storage_area, created_by } = req.body;
    // 生成入库单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(record_no, -4)), 0) + 1, 4, '0') AS seq
       FROM inbound_records WHERE record_no LIKE ?`,
      [`IN${dateStr}%`]
    );
    const recordNo = `IN${dateStr}${seq}`;

    const [result] = await pool.query(
      `INSERT INTO inbound_records (record_no, material_id, supplier_id, quantity, batch_no, duty_personnel, storage_area, created_by, status)
       VALUES (?,?,?,?,?,?,?,?,'submitted')`,
      [recordNo, material_id, supplier_id || null, quantity, batch_no || null, duty_personnel || null, storage_area || null, created_by || null]
    );
    res.json({ success: true, data: { id: result.insertId, record_no: recordNo } });
  } catch (err) {
    console.error('[inbound] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 检验审批（支持双检）
router.put('/:id/inspect', async (req, res) => {
  try {
    const { inspector, result, remark, isSecond } = req.body;
    if (isSecond) {
      // 第二检验人
      await pool.query(
        `UPDATE inbound_records SET inspector2=?, inspect2_result=?, inspect2_remark=?, inspect2_time=NOW() WHERE id=?`,
        [inspector, result, remark || null, req.params.id]
      );
    } else {
      // 第一检验人
      await pool.query(
        `UPDATE inbound_records SET inspector=?, inspect_result=?, inspect_remark=? WHERE id=?`,
        [inspector, result, remark || null, req.params.id]
      );
    }

    // 检查是否可以最终放行
    const [[record]] = await pool.query(
      `SELECT ir.*, m.dual_inspection FROM inbound_records ir
       JOIN materials m ON ir.material_id = m.id WHERE ir.id = ?`,
      [req.params.id]
    );

    let finalStatus = null;
    if (record.dual_inspection) {
      // 双检：两人都通过才放行，任何一人拒绝就退回
      if (record.inspect_result === 'reject' || record.inspect2_result === 'reject') {
        finalStatus = 'rejected';
      } else if (record.inspect_result === 'pass' && record.inspect2_result === 'pass') {
        finalStatus = 'approved';
      }
    } else {
      // 单检：一人通过即可
      if (record.inspect_result === 'pass') finalStatus = 'approved';
      if (record.inspect_result === 'reject') finalStatus = 'rejected';
    }

    if (finalStatus) {
      await pool.query(
        `UPDATE inbound_records SET status=?, inbound_date=IF(?='approved', CURDATE(), inbound_date) WHERE id=?`,
        [finalStatus, finalStatus, req.params.id]
      );

      // 放行后不立即更新库存——由仓库存入(warehouse/store)时更新
      // 前端检验通过后会自动弹出库位推荐 → 用户确认 → store → 库存+1
    }

    // 返回物料信息供前端调库位推荐
    const [[materialInfo]] = await pool.query(
      'SELECT id, code, name, unit, category_id FROM materials WHERE id = ?',
      [record.material_id]
    );

    res.json({
      success: true,
      finalStatus,
      needsStore: finalStatus === 'approved',
      material: finalStatus === 'approved' ? {
        ...materialInfo,
        quantity: record.quantity,
        batch_no: record.batch_no,
        duty_personnel: record.duty_personnel,
        storage_area: record.storage_area,
        record_id: record.id,
        record_no: record.record_no,
      } : null,
    });
  } catch (err) {
    console.error('[inbound] PUT inspect error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inbound_records WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
