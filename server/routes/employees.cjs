/**
 * 员工管理 API
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// GET 员工列表（支持搜索、部门筛选）
router.get('/', async (req, res) => {
  try {
    const { keyword, department, status, page = 1, pageSize = 15 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = ['1=1'];
    let params = [];

    if (keyword) {
      where.push('(emp_no LIKE ? OR name LIKE ? OR position LIKE ? OR phone LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (department) {
      where.push('department = ?');
      params.push(department);
    }
    if (status !== undefined && status !== '') {
      where.push('status = ?');
      params.push(Number(status));
    }

    const gf = groupFilter(req);
    const [rows] = await pool.query(
      `SELECT * FROM employees
       WHERE ${where.join(' AND ')} ${gf.sql}
       ORDER BY emp_no
       LIMIT ? OFFSET ?`,
      [...params, ...gf.params, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM employees WHERE ${where.join(' AND ')} ${gf.sql}`,
      [...params, ...gf.params]
    );

    res.json({ success: true, data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[employees] GET / error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 下一个工号（必须在 /:id 之前，否则会被 :id 捕获）
router.get('/next-emp-no', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      "SELECT emp_no FROM employees WHERE emp_no REGEXP '^EMP[0-9]+$' ORDER BY id DESC LIMIT 1"
    );
    let next = 'EMP001';
    if (row && row.emp_no) {
      const num = parseInt(row.emp_no.replace('EMP', ''), 10);
      next = 'EMP' + String(num + 1).padStart(3, '0');
    }
    res.json({ success: true, data: { emp_no: next } });
  } catch (err) {
    console.error('[employees] GET /next-emp-no error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 单个员工详情
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: '员工不存在' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[employees] GET /:id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST 新增员工
router.post('/', async (req, res) => {
  try {
    const { emp_no, name, gender, department, position, phone, email, hire_date, remark } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: '姓名为必填项' });
    }

    // 自动生成工号（如未提供）
    let finalEmpNo = emp_no;
    if (!finalEmpNo) {
      const [[row]] = await pool.query(
        "SELECT emp_no FROM employees WHERE emp_no REGEXP '^EMP[0-9]+$' ORDER BY id DESC LIMIT 1"
      );
      let nextNum = 1;
      if (row && row.emp_no) {
        nextNum = parseInt(row.emp_no.replace('EMP', ''), 10) + 1;
      }
      finalEmpNo = 'EMP' + String(nextNum).padStart(3, '0');
    }

    // 检查工号唯一
    const [[existing]] = await pool.query('SELECT id FROM employees WHERE emp_no = ?', [finalEmpNo]);
    if (existing) {
      return res.status(400).json({ success: false, message: `工号 ${finalEmpNo} 已存在` });
    }

    const [result] = await pool.query(
      `INSERT INTO employees (emp_no, name, gender, department, position, phone, email, hire_date, remark, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [finalEmpNo, name, gender || null, department || null, position || null,
       phone || null, email || null, hire_date || null, remark || null, req.groupId || null]
    );
    res.json({ success: true, data: { id: result.insertId, emp_no: finalEmpNo } });
  } catch (err) {
    console.error('[employees] POST error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT 更新员工
router.put('/:id', async (req, res) => {
  try {
    const { emp_no, name, gender, department, position, phone, email, hire_date, status, remark } = req.body;

    // 检查工号是否与其他记录冲突
    if (emp_no) {
      const [[dup]] = await pool.query(
        'SELECT id FROM employees WHERE emp_no = ? AND id != ?',
        [emp_no, req.params.id]
      );
      if (dup) {
        return res.status(400).json({ success: false, message: `工号 ${emp_no} 已被其他员工使用` });
      }
    }

    await pool.query(
      `UPDATE employees SET emp_no=?, name=?, gender=?, department=?, position=?,
       phone=?, email=?, hire_date=?, status=?, remark=? WHERE id=?`,
      [emp_no, name, gender || null, department || null, position || null,
       phone || null, email || null, hire_date || null, status ?? 1, remark || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[employees] PUT error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE 删除员工
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[employees] DELETE error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
