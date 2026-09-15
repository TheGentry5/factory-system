/**
 * 物料分类 API
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

router.get('/', async (req, res) => {
  try {
    const gf = groupFilter(req, 'mc');
    const [rows] = await pool.query(
      `SELECT * FROM material_categories mc WHERE 1=1 ${gf.sql} ORDER BY mc.sort_order, mc.id`,
      gf.params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[categories] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
