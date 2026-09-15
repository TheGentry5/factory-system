/**
 * 物料主数据 API（编码按物料分类自动生成）
 */

// 物料分类 → 编码前缀映射
const CATEGORY_PREFIX = {
  4: 'MAT-ZZ',   // 纸张类
  5: 'MAT-YM',   // 油墨类
  6: 'MAT-BC',   // 版材类
  2: 'MAT-FL',   // 辅料
  3: 'MAT-BCP',  // 半成品
  1: 'MAT-YL',   // 原材料
};
const DEFAULT_PREFIX = 'MAT-QT';

const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// GET 物料列表（支持搜索、分类筛选）
router.get('/', async (req, res) => {
  try {
    const { keyword, category_id, status, page = 1, pageSize = 15 } = req.query;
    const offset = (page - 1) * pageSize;

    let where = ['1=1'];
    let params = [];

    if (keyword) {
      where.push('(m.code LIKE ? OR m.name LIKE ? OR m.spec LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (category_id) {
      where.push('m.category_id = ?');
      params.push(category_id);
    }
    if (status !== undefined && status !== '') {
      where.push('m.status = ?');
      params.push(status);
    }

    const gf = groupFilter(req, 'm');
    const [rows] = await pool.query(
      `SELECT m.*, c.name AS category_name, s.name AS supplier_name
       FROM materials m
       LEFT JOIN material_categories c ON m.category_id = c.id
       LEFT JOIN suppliers s ON m.supplier_id = s.id
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY m.id
       LIMIT ? OFFSET ?`,
      [...params, ...gf.params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM materials m WHERE ${where.join(' AND ')} ${gf.sql}`,
      [...params, ...gf.params]
    );

    res.json({ success: true, data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[materials] GET / error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 单个物料详情（含入库标准）
router.get('/:id', async (req, res) => {
  try {
    const [[material]] = await pool.query(
      `SELECT m.*, c.name AS category_name, s.name AS supplier_name
       FROM materials m
       LEFT JOIN material_categories c ON m.category_id = c.id
       LEFT JOIN suppliers s ON m.supplier_id = s.id
       WHERE m.id = ?`,
      [req.params.id]
    );
    if (!material) return res.status(404).json({ success: false, message: '物料不存在' });

    const [standards] = await pool.query(
      `SELECT * FROM inbound_standards WHERE material_id = ? ORDER BY sort_order`,
      [req.params.id]
    );
    material.standards = standards;

    res.json({ success: true, data: material });
  } catch (err) {
    console.error('[materials] GET /:id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 新增物料（编码按分类前缀自动生成）
router.post('/', async (req, res) => {
  try {
    const { name, spec, category_id, unit, paper_type, gram_weight,
            safety_stock, unit_price, supplier_id, remark } = req.body;

    if (!category_id) {
      return res.status(400).json({ success: false, message: '请选择物料分类以生成编码' });
    }

    const prefix = CATEGORY_PREFIX[category_id] || DEFAULT_PREFIX;

    // 该分类下取最大序号+1
    const [[{ nextCode }]] = await pool.query(
      `SELECT CONCAT(?, '-', LPAD(COALESCE(MAX(CAST(SUBSTRING(code, LENGTH(?) + 2) AS UNSIGNED)), 0) + 1, 3, '0')) AS nextCode
       FROM materials WHERE code LIKE CONCAT(?, '-%')`,
      [prefix, prefix, prefix]
    );

    const [result] = await pool.query(
      `INSERT INTO materials (code, name, spec, category_id, unit, paper_type, gram_weight, safety_stock, unit_price, supplier_id, remark, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [nextCode, name, spec, category_id, unit || '个', paper_type || null,
       gram_weight || null, safety_stock || 0, unit_price || 0, supplier_id || null, remark || null, req.groupId || null]
    );
    res.json({ success: true, data: { id: result.insertId, code: nextCode } });
  } catch (err) {
    console.error('[materials] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 更新物料（编码不可更改）
router.put('/:id', async (req, res) => {
  try {
    const { name, spec, category_id, unit, paper_type, gram_weight,
            safety_stock, unit_price, supplier_id, status, remark } = req.body;
    await pool.query(
      `UPDATE materials SET name=?, spec=?, category_id=?, unit=?, paper_type=?, gram_weight=?,
       safety_stock=?, unit_price=?, supplier_id=?, status=?, remark=? WHERE id=?`,
      [name, spec, category_id || null, unit, paper_type || null, gram_weight || null,
       safety_stock, unit_price, supplier_id || null, status ?? 1, remark || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[materials] PUT error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除物料
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM materials WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[materials] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
