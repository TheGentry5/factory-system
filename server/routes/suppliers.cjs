/**
 * 供应商 API（编码按供货类别自动生成）
 */

// 供货类别 → 编码前缀映射
const CATEGORY_PREFIX = {
  4: 'SUP-ZZ',  // 纸张类
  5: 'SUP-YM',  // 油墨类
  6: 'SUP-BC',  // 版材类
  2: 'SUP-FL',  // 辅料类
  // 其他类别默认
};
const DEFAULT_PREFIX = 'SUP-QT';

const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// GET 全部供应商（含供货类别名）
router.get('/', async (req, res) => {
  try {
    const gf = groupFilter(req, 's');
    const [rows] = await pool.query(
      `SELECT s.*, c.name AS supply_category_name
       FROM suppliers s LEFT JOIN material_categories c ON s.supply_category_id = c.id
       WHERE 1=1 ${gf.sql}
       ORDER BY s.id`,
      gf.params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[suppliers] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 新增供应商（编码按供货类别自动生成）
router.post('/', async (req, res) => {
  try {
    const { name, supply_category_id, contact_person, contact_phone, address, rating, remark } = req.body;

    const prefix = CATEGORY_PREFIX[supply_category_id] || DEFAULT_PREFIX;

    // 查找该类别下的最大序号+1
    const [[{ nextCode }]] = await pool.query(
      `SELECT CONCAT(?, '-', LPAD(COALESCE(MAX(CAST(SUBSTRING(code, LENGTH(?) + 2) AS UNSIGNED)), 0) + 1, 3, '0')) AS nextCode
       FROM suppliers WHERE code LIKE CONCAT(?, '-%')`,
      [prefix, prefix, prefix]
    );

    const [result] = await pool.query(
      `INSERT INTO suppliers (code, name, supply_category_id, contact_person, contact_phone, address, rating, remark, group_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [nextCode, name, supply_category_id || null, contact_person || null, contact_phone || null, address || null, rating || 'B', remark || null, req.groupId || null]
    );
    res.json({ success: true, data: { id: result.insertId, code: nextCode } });
  } catch (err) {
    console.error('[suppliers] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 更新供应商（编码不可更改）
router.put('/:id', async (req, res) => {
  try {
    const { name, supply_category_id, contact_person, contact_phone, address, rating, status, remark } = req.body;
    await pool.query(
      `UPDATE suppliers SET name=?, supply_category_id=?, contact_person=?, contact_phone=?, address=?, rating=?, status=?, remark=? WHERE id=?`,
      [name, supply_category_id || null, contact_person, contact_phone, address, rating, status ?? 1, remark || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[suppliers] PUT error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除供应商
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[suppliers] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
