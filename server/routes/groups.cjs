/**
 * GET /api/groups — 返回所有业务组列表
 *
 * 用途：登录页下拉选择器
 * 不受 group 过滤（用户尚未选择组）
 */
const pool = require('../db.cjs');

const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, group_name, group_code, description FROM `groups` ORDER BY id'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[groups] 查询失败:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
