/**
 * 入库质检标准 API（完整 CRUD）
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');

// GET 质检标准列表（可按物料筛选）
router.get('/', async (req, res) => {
  try {
    const { material_id } = req.query;
    let query = 'SELECT * FROM inbound_standards';
    let params = [];
    if (material_id) {
      query += ' WHERE material_id = ?';
      params.push(material_id);
    }
    query += ' ORDER BY sort_order, id';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[inbound-standards] GET error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 某物料的入库标准（兼容旧路由 /:materialId）
router.get('/by-material/:materialId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM inbound_standards WHERE material_id = ? ORDER BY sort_order',
      [req.params.materialId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[inbound-standards] GET by material error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 单个标准详情
router.get('/:id', async (req, res) => {
  try {
    // 如果是数字ID，查单条；否则当作materialId兼容旧路由
    if (/^\d+$/.test(req.params.id)) {
      const [[row]] = await pool.query('SELECT * FROM inbound_standards WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: '标准不存在' });
      return res.json({ success: true, data: row });
    }
    // 兼容旧路由: /inbound-standards/:materialId
    const [rows] = await pool.query(
      'SELECT * FROM inbound_standards WHERE material_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[inbound-standards] GET /:id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 添加检验标准
router.post('/', async (req, res) => {
  try {
    const { material_id, inspection_item, standard_value, tolerance_upper, tolerance_lower,
            test_method, is_required, sort_order } = req.body;
    if (!material_id || !inspection_item) {
      return res.status(400).json({ success: false, message: '物料和检验项目为必填项' });
    }
    const [result] = await pool.query(
      `INSERT INTO inbound_standards (material_id, inspection_item, standard_value, tolerance_upper,
       tolerance_lower, test_method, is_required, sort_order)
       VALUES (?,?,?,?,?,?,?,?)`,
      [material_id, inspection_item, standard_value || null, tolerance_upper || null,
       tolerance_lower || null, test_method || null, is_required ?? 1, sort_order || 0]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('[inbound-standards] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 更新检验标准
router.put('/:id', async (req, res) => {
  try {
    const { material_id, inspection_item, standard_value, tolerance_upper, tolerance_lower,
            test_method, is_required, sort_order } = req.body;
    await pool.query(
      `UPDATE inbound_standards SET material_id=?, inspection_item=?, standard_value=?,
       tolerance_upper=?, tolerance_lower=?, test_method=?, is_required=?, sort_order=?
       WHERE id=?`,
      [material_id, inspection_item, standard_value || null, tolerance_upper || null,
       tolerance_lower || null, test_method || null, is_required ?? 1, sort_order || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound-standards] PUT error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除检验标准
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inbound_standards WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[inbound-standards] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
