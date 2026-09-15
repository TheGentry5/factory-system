/**
 * 采购单 API（支持正常采购 + 紧急补填）
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// GET 采购单列表
router.get('/', async (req, res) => {
  try {
    const { status, order_type, page = 1, pageSize = 15 } = req.query;
    const offset = (page - 1) * pageSize;
    let where = ['1=1'];
    let params = [];
    const gf = groupFilter(req, 'po');
    if (status) { where.push('po.status = ?'); params.push(status); }
    if (order_type) { where.push('po.order_type = ?'); params.push(order_type); }

    const [rows] = await pool.query(
      `SELECT po.*, m.code AS material_code, m.name AS material_name, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN materials m ON po.material_id = m.id
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY po.is_overdue DESC, po.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, ...gf.params, Number(pageSize), Number(offset)]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM purchase_orders po WHERE ${where.join(' AND ')} ${gf.sql}`, [...params, ...gf.params]
    );
    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 创建采购单
router.post('/', async (req, res) => {
  try {
    const { order_type, material_id, supplier_id, quantity, unit_price, expected_date,
            actual_arrival_date, reason, created_by } = req.body;

    // 生成单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ seq }]] = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(order_no, -3)), 0) + 1, 3, '0') AS seq
       FROM purchase_orders WHERE order_no LIKE ?`,
      [`PO-${dateStr}-%`]
    );
    const orderNo = `PO-${dateStr}-${seq}`;

    // 补填逻辑：计算是否超2天
    let isOverdue = 0;
    let overdueHours = 0;
    let supplementalAt = null;

    if (order_type === 'supplemental' && actual_arrival_date) {
      supplementalAt = now;
      const arrivalDate = new Date(actual_arrival_date);
      const diffMs = now - arrivalDate;
      overdueHours = diffMs / (1000 * 60 * 60);
      if (overdueHours > 48) {
        isOverdue = 1;
      }
    }

    // 未提交审批的保存为 draft
    const finalStatus = order_type === 'supplemental' ? 'arrived' : 'draft';

    const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(unit_price) || 0);

    const [result] = await pool.query(
      `INSERT INTO purchase_orders (order_no, order_type, material_id, supplier_id, quantity,
       unit_price, total_amount, expected_date, actual_arrival_date, reason, status,
       supplemental_at, is_overdue, overdue_hours, created_by, group_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNo, order_type || 'normal', material_id, supplier_id || null, quantity,
       unit_price || null, totalAmount, expected_date || null, actual_arrival_date || null,
       reason || null, finalStatus, supplementalAt, isOverdue, overdueHours, created_by || null, req.groupId || null]
    );

    res.json({
      success: true,
      data: { id: result.insertId, order_no: orderNo, is_overdue: isOverdue, overdue_hours: overdueHours },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 采购经理审批
router.put('/:id/review', async (req, res) => {
  try {
    const { reviewed_by, action, comment } = req.body;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE purchase_orders SET status=?, reviewed_by=?, reviewed_at=NOW(), review_comment=? WHERE id=?`,
      [newStatus, reviewed_by || null, comment || null, req.params.id]
    );
    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 确认到货（仅更新采购单状态，物料进入暂存区由 /api/staging 处理）
router.put('/:id/arrive', async (req, res) => {
  try {
    await pool.query(
      `UPDATE purchase_orders SET status='arrived', actual_arrival_date=CURDATE() WHERE id=?`,
      [req.params.id]
    );
    res.json({ success: true, data: { status: 'arrived' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 标记采购单完成
router.put('/:id/complete', async (req, res) => {
  try {
    await pool.query(
      `UPDATE purchase_orders SET status='completed' WHERE id=?`,
      [req.params.id]
    );
    res.json({ success: true, data: { status: 'completed' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
