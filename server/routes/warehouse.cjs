/**
 * 仓库库位 + 存取操作 API
 *
 * Web 端使用完整功能，小程序端预留：
 *   - GET  /api/warehouse/recommend?material_id=&quantity=  推荐库位
 *   - POST /api/warehouse/store                             存入（入库后）
 *   - POST /api/warehouse/retrieve                          取出（领料）
 *   - GET  /api/warehouse/inventory/:materialId             查某物料所有库位
 */
const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');

// ==================== 区域查询 ====================

// GET 全部区域树
router.get('/zones', async (req, res) => {
  try {
    const [zones] = await pool.query(
      `SELECT wz.*, mc.name AS category_name
       FROM warehouse_zones wz
       LEFT JOIN material_categories mc ON wz.category_id = mc.id
       ORDER BY wz.sort_order, wz.id`
    );
    // 构建树
    const roots = zones.filter(z => !z.parent_id);
    const tree = roots.map(r => ({
      ...r,
      children: zones.filter(z => z.parent_id === r.id),
    }));
    res.json({ success: true, data: tree });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 库位查询 ====================

// GET 库位（支持按大区/小分区查询）
router.get('/locations', async (req, res) => {
  try {
    const { zone_code, parent_code } = req.query;
    let query = `
      SELECT sl.*, wz.code AS zone_code, wz.name AS zone_name,
             COALESCE(SUM(li.quantity), 0) AS total_stored
      FROM storage_locations sl
      JOIN warehouse_zones wz ON sl.zone_id = wz.id
      LEFT JOIN location_inventory li ON sl.id = li.location_id
    `;
    let params = [];
    let conditions = [];

    if (zone_code) {
      // 精确匹配小分区
      conditions.push('wz.code = ?');
      params.push(zone_code);
    } else if (parent_code) {
      // 大区：匹配旗下所有小分区
      conditions.push('wz.parent_id IN (SELECT id FROM warehouse_zones WHERE code = ?)');
      params.push(parent_code);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' GROUP BY sl.id ORDER BY sl.code';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 单个库位详情（含存放物料清单）
router.get('/locations/:code', async (req, res) => {
  try {
    const [[location]] = await pool.query(
      `SELECT sl.*, wz.code AS zone_code, wz.name AS zone_name
       FROM storage_locations sl
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       WHERE sl.code = ?`,
      [req.params.code]
    );
    if (!location) return res.status(404).json({ success: false, message: '库位不存在' });

    const [items] = await pool.query(
      `SELECT li.*, m.code AS material_code, m.name AS material_name, m.spec, m.unit,
              ir.record_no AS inbound_no
       FROM location_inventory li
       JOIN materials m ON li.material_id = m.id
       LEFT JOIN inbound_records ir ON li.inbound_record_id = ir.id
       WHERE li.location_id = ?`,
      [location.id]
    );
    location.items = items;
    res.json({ success: true, data: location });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 库位推荐 ====================

// GET 推荐库位（小程序也可调用）
router.get('/recommend', async (req, res) => {
  try {
    const { material_id, quantity } = req.query;
    if (!material_id) return res.status(400).json({ success: false, message: '缺少 material_id' });

    const qty = parseFloat(quantity) || 0;

    // 获取物料信息
    const [[material]] = await pool.query(
      `SELECT m.*, c.id AS cat_id FROM materials m
       LEFT JOIN material_categories c ON m.category_id = c.id
       WHERE m.id = ?`, [material_id]
    );
    if (!material) return res.status(404).json({ success: false, message: '物料不存在' });

    // 策略1: 该物料已有库位，且容量够 → 优先推荐（同批聚集）
    const [existing] = await pool.query(
      `SELECT sl.*, wz.code AS zone_code, wz.name AS zone_name,
              COALESCE(SUM(li.quantity), 0) AS total_stored
       FROM storage_locations sl
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       JOIN location_inventory li ON sl.id = li.location_id AND li.material_id = ?
       WHERE sl.status != 'full' AND (sl.capacity - sl.used_capacity) >= ?
       GROUP BY sl.id
       ORDER BY sl.priority DESC, sl.distance_from_entrance ASC
       LIMIT 3`,
      [material_id, qty]
    );

    // 策略2: 同小分区空位
    const categoryId = material.category_id;
    const [sameZone] = await pool.query(
      `SELECT sl.*, wz.code AS zone_code, wz.name AS zone_name, 0 AS total_stored
       FROM storage_locations sl
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       WHERE wz.category_id = ? AND sl.status = 'available'
         AND (sl.capacity - sl.used_capacity) >= ?
         AND sl.id NOT IN (SELECT DISTINCT location_id FROM location_inventory)
       ORDER BY sl.priority DESC, sl.used_capacity ASC
       LIMIT 5`,
      [categoryId, qty]
    );

    // 合并
    const recommendations = [
      ...existing.map(l => ({ ...l, score: 100, reason: `同物料已有${l.total_stored}${material.unit}在此` })),
      ...sameZone.map(l => ({ ...l, score: 80, reason: '同分类空位' })),
    ].sort((a, b) => b.score - a.score).slice(0, 3);

    res.json({ success: true, data: { material: { id: material.id, code: material.code, name: material.name }, recommendations } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 存入操作 ====================

// POST 存入（质检通过后自动调用 / 仓管员手动存入）
router.post('/store', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { material_id, location_code, quantity, batch_no, inbound_record_id, operator_name, source_type } = req.body;

    // 查找库位
    const [[location]] = await conn.query('SELECT * FROM storage_locations WHERE code = ?', [location_code]);
    if (!location) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '库位不存在' });
    }

    if (location.status === 'maintenance') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: '库位维护中' });
    }

    // 检查容量
    const newUsed = parseFloat(location.used_capacity) + parseFloat(quantity);
    if (newUsed > parseFloat(location.capacity)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `库存位容量不足(剩余${location.capacity - location.used_capacity})` });
    }

    // 写入 location_inventory
    const [existRows] = await conn.query(
      `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? AND COALESCE(batch_no,'') = ?`,
      [location.id, material_id, batch_no || '']
    );
    if (existRows.length > 0) {
      await conn.query(
        'UPDATE location_inventory SET quantity = quantity + ? WHERE id = ?',
        [quantity, existRows[0].id]
      );
    } else {
      await conn.query(
        'INSERT INTO location_inventory (location_id, material_id, quantity, batch_no, inbound_record_id) VALUES (?,?,?,?,?)',
        [location.id, material_id, quantity, batch_no || null, inbound_record_id || null]
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

    // 更新物料库存
    await conn.query(
      'UPDATE materials SET current_stock = current_stock + ? WHERE id = ?',
      [quantity, material_id]
    );

    // 标记入库单为已上架
    if (inbound_record_id) {
      await conn.query(
        "UPDATE inbound_records SET status = 'stored' WHERE id = ?",
        [inbound_record_id]
      );
    }

    // 写操作日志
    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, inbound_record_id, quantity, operator_name, source_type, remark)
       VALUES ('inbound',?,?,?,?,?,?,?)`,
      [material_id, location.id, inbound_record_id || null, quantity, operator_name || 'system', source_type || 'web',
       `存入 ${location_code} | ${batch_no || '无批次'}`
      ]
    );

    await conn.commit();
    res.json({ success: true, data: { location_code, quantity, material_id } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ==================== 取出操作 ====================

// POST 取出（仓管员扫码领料 / 小程序端也可调用）
router.post('/retrieve', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { material_id, location_code, quantity, operator_name, source_type, remark } = req.body;

    // 查找库位
    const [[location]] = await conn.query('SELECT * FROM storage_locations WHERE code = ?', [location_code]);
    if (!location) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '库位不存在' });
    }

    // 查找该库位该物料的存放记录（FIFO：先入库的批次先取）
    const [invRows] = await conn.query(
      `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ?
       ORDER BY stored_at ASC`,
      [location.id, material_id]
    );
    if (invRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: '该库位没有此物料' });
    }

    // FIFO 扣减
    let remaining = parseFloat(quantity);
    const deductions = [];
    for (const row of invRows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(row.quantity));
      deductions.push({ id: row.id, take, quantity: row.quantity, batch_no: row.batch_no });
      remaining -= take;
    }

    if (remaining > 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `该库位物料不足(仅有${parseFloat(quantity) - remaining})` });
    }

    for (const d of deductions) {
      if (d.take >= parseFloat(d.quantity)) {
        await conn.query('DELETE FROM location_inventory WHERE id = ?', [d.id]);
      } else {
        await conn.query('UPDATE location_inventory SET quantity = quantity - ? WHERE id = ?', [d.take, d.id]);
      }
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

    // 更新物料总库存
    await conn.query(
      'UPDATE materials SET current_stock = current_stock - ? WHERE id = ?',
      [quantity, material_id]
    );

    // 日志
    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, source_type, remark)
       VALUES ('outbound',?,?,?,?,?,?)`,
      [material_id, location.id, quantity, operator_name || 'system', source_type || 'web',
       `从 ${location_code} 取出 | ${remark || ''}`
      ]
    );

    await conn.commit();
    res.json({ success: true, data: { location_code, quantity, deductions } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ==================== 查询某物料所有库位 ====================

// GET 物料库存分布（小程序也可调用）
router.get('/inventory/:materialId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT li.*, sl.code AS location_code, sl.shelf_type, wz.code AS zone_code, wz.name AS zone_name,
              ir.record_no AS inbound_no
       FROM location_inventory li
       JOIN storage_locations sl ON li.location_id = sl.id
       JOIN warehouse_zones wz ON sl.zone_id = wz.id
       LEFT JOIN inbound_records ir ON li.inbound_record_id = ir.id
       WHERE li.material_id = ?
       ORDER BY li.stored_at ASC`,
      [req.params.materialId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET 操作日志
router.get('/logs', async (req, res) => {
  try {
    const { type, material_id, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    let where = ['1=1'];
    let params = [];
    if (type) { where.push('ol.type = ?'); params.push(type); }
    if (material_id) { where.push('ol.material_id = ?'); params.push(material_id); }

    const [rows] = await pool.query(
      `SELECT ol.*, m.name AS material_name, m.code AS material_code, sl.code AS location_code
       FROM operation_log ol
       LEFT JOIN materials m ON ol.material_id = m.id
       LEFT JOIN storage_locations sl ON ol.location_id = sl.id
       WHERE ${where.join(' AND ')}
       ORDER BY ol.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM operation_log ol WHERE ${where.join(' AND ')}`, params
    );
    res.json({ success: true, data: rows, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 手动入库（小批量无QR） ====================
router.post('/manual-inbound', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { material_id, quantity, batch_no, duty_personnel, storage_area,
            location_code, confirmed_by } = req.body;

    // 1. 写入手动入库日志
    const [logResult] = await conn.query(
      `INSERT INTO manual_inbound_log (material_id, location_code, quantity, batch_no, duty_personnel, storage_area, confirmed_by, remark)
       VALUES (?,?,?,?,?,?,?,?)`,
      [material_id, location_code || null, quantity, batch_no || null,
       duty_personnel || null, storage_area || null, confirmed_by || null, '手动入库']
    );

    // 2. 若指定了库位，存入
    if (location_code) {
      const ctx = [`当值:${duty_personnel || '-'}`, `区域:${storage_area || '-'}`, `确认:${confirmed_by || '-'}`, '手动入库(无QR)'];
      await storeToLocation(conn, material_id, location_code, quantity, batch_no, confirmed_by, 'manual_inbound', ctx.join(' | '));
    }

    await conn.commit();
    res.json({ success: true, data: { id: logResult.insertId } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ==================== 回库（剩余物料扫原码，免质检） ====================
router.post('/restock', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { material_id, quantity, original_record_no, location_code, confirmed_by, remark } = req.body;

    // 1. 验证原入库单存在
    if (original_record_no) {
      const [[origRecord]] = await conn.query(
        'SELECT * FROM inbound_records WHERE record_no = ?', [original_record_no]
      );
      if (!origRecord) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: '原入库单不存在' });
      }
    }

    // 2. 写入回库日志
    await conn.query(
      `INSERT INTO manual_inbound_log (material_id, location_code, quantity, original_record_no, is_restock, confirmed_by, remark)
       VALUES (?,?,?,?,1,?,?)`,
      [material_id, location_code || null, quantity, original_record_no || null, confirmed_by || null, remark || '剩余物料回库']
    );

    // 3. 存入库位（同类合并：推荐已有同物料的库位）
    if (location_code) {
      const ctx = [`原单:${original_record_no || '无'}`, `确认:${confirmed_by || '-'}`, '剩余回库免质检'];
      await storeToLocation(conn, material_id, location_code, quantity, null, confirmed_by, 'restock', ctx.join(' | '));
    }

    // 4. 写操作日志
    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, remark)
       VALUES ('restock', ?, (SELECT id FROM storage_locations WHERE code=?), ?, ?, ?)`,
      [material_id, location_code, quantity, confirmed_by || 'system', `回库-原单${original_record_no || '无'} | ${remark || ''}`]
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

// ==================== 蹭码入库（极小量扫同类码） ====================
router.post('/piggyback', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { material_id, quantity, piggyback_record_no, location_code, confirmed_by, identity_verified } = req.body;

    // 蹭码需要强制确认人身份
    if (!confirmed_by || !identity_verified) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: '蹭码入库需确认操作人身份' });
    }

    // 验证蹭的入库单存在
    const [[piggyRecord]] = await conn.query(
      'SELECT * FROM inbound_records WHERE record_no = ?', [piggyback_record_no]
    );
    if (!piggyRecord) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: '所蹭入库单不存在' });
    }

    // 写入蹭码日志
    await conn.query(
      `INSERT INTO manual_inbound_log (material_id, location_code, quantity, piggyback_record_no, is_piggyback, confirmed_by, remark)
       VALUES (?,?,?,?,1,?,?)`,
      [material_id, location_code || null, quantity, piggyback_record_no, confirmed_by, `蹭码入库-操作人已确认身份`]
    );

    // 存入库位
    if (location_code) {
      const ctx = [`蹭单:${piggyback_record_no}`, `确认:${confirmed_by}`, '身份已验证', '极小量蹭码'];
      await storeToLocation(conn, material_id, location_code, quantity, null, confirmed_by, 'restock', ctx.join(' | '));
    }

    await conn.query(
      `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, remark)
       VALUES ('restock', ?, (SELECT id FROM storage_locations WHERE code=?), ?, ?, ?)`,
      [material_id, location_code, quantity, confirmed_by, `蹭码-蹭单${piggyback_record_no} | 身份已验证`]
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

// ==================== 共用：存入库位 ====================
async function storeToLocation(conn, material_id, location_code, quantity, batch_no, operator_name, source_type, extraRemark) {
  const [[location]] = await conn.query('SELECT * FROM storage_locations WHERE code = ?', [location_code]);
  if (!location) throw new Error('库位不存在');

  // 同类合并：该库位已有同物料同批次则累加
  const [existRows] = await conn.query(
    `SELECT * FROM location_inventory WHERE location_id = ? AND material_id = ? AND COALESCE(batch_no,'') = ?`,
    [location.id, material_id, batch_no || '']
  );
  const merged = existRows.length > 0;
  if (merged) {
    await conn.query('UPDATE location_inventory SET quantity = quantity + ? WHERE id = ?',
      [quantity, existRows[0].id]);
  } else {
    await conn.query(
      'INSERT INTO location_inventory (location_id, material_id, quantity, batch_no) VALUES (?,?,?,?)',
      [location.id, material_id, quantity, batch_no || null]
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
  await conn.query('UPDATE storage_locations SET used_capacity = ?, status = ? WHERE id = ?',
    [totalStored, locStatus, location.id]);

  // 更新物料总库存
  await conn.query('UPDATE materials SET current_stock = current_stock + ? WHERE id = ?',
    [quantity, material_id]);

  // 操作日志 — 含完整上下文
  const parts = [`库位:${location_code}`, `数量:${quantity}`];
  if (batch_no) parts.push(`批次:${batch_no}`);
  if (operator_name) parts.push(`操作人:${operator_name}`);
  if (merged) parts.push('已合并到同物料现有记录');
  if (extraRemark) parts.push(extraRemark);

  await conn.query(
    `INSERT INTO operation_log (type, material_id, location_id, quantity, operator_name, source_type, remark)
     VALUES (?,?,?,?,?,?,?)`,
    [source_type || 'inbound', material_id, location.id, quantity, operator_name || 'system', 'web',
     parts.join(' | ')]
  );
}

// ==================== AI 智能查询 ====================
router.get('/query', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: '请输入查询内容' });

    const query = q.trim();
    const result = { query, intent: [], detected: {}, data: [], analysis: '' };

    // ── 1. 检测库位编码 ──
    // 匹配: A1, A1-01, A1-01排, A1-01-2, A1-01-2-3, C2-01架 等
    const locPatterns = [];
    const locRegex = /([A-D]\d*)(?:[-–](\d+))?(?:[-–]?(排|柜|架))?(?:[-–](\d+))?(?:[-–](\d+))?/g;
    let m;
    while ((m = locRegex.exec(query)) !== null) {
      let code = m[1]; // e.g. A1
      if (m[2]) code += '-' + m[2].padStart(2, '0'); // e.g. A1-01
      if (m[3]) code += `%`; // 有排/柜/架字 → 用LIKE匹配
      if (m[4]) code += '-' + m[4]; // 层
      if (m[5]) code += '-' + m[5]; // 位
      locPatterns.push(code);
    }
    if (locPatterns.length > 0) {
      let allLocs = [];
      for (const pattern of locPatterns) {
        const likePattern = pattern.includes('%') ? pattern : `${pattern}%`;
        const [locRows] = await pool.query(
          `SELECT code FROM storage_locations WHERE code LIKE ? LIMIT 50`,
          [likePattern]
        );
        allLocs.push(...locRows);
      }
      if (allLocs.length > 0) {
        result.detected.location_codes = [...new Set(allLocs.map(r => r.code))];
        result.intent.push('location_query');
      }
    }

    // ── 2. 检测物料名称/编码 ──
    const [matRows] = await pool.query(
      `SELECT id, code, name FROM materials WHERE name LIKE ? OR code LIKE ?`,
      [`%${query}%`, `%${query}%`]
    );
    if (matRows.length === 0) {
      // 尝试提取关键词
      const keywords = query.replace(/[的了吗是什么有没有多少哪些异常操作日志库位货架天周月今日昨]/g, ' ').trim().split(/\s+/);
      for (const kw of keywords) {
        if (kw.length >= 2) {
          const [m] = await pool.query(
            `SELECT id, code, name FROM materials WHERE name LIKE ? OR code LIKE ? LIMIT 5`,
            [`%${kw}%`, `%${kw}%`]
          );
          if (m.length > 0) matRows.push(...m);
        }
      }
    }
    if (matRows.length > 0 && matRows.length <= 10) {
      result.detected.materials = [...new Map(matRows.map(m => [m.id, m])).values()];
      result.intent.push('material_query');
    }

    // ── 3. 检测时间范围 ──
    let startDate = null, endDate = null;
    const now = new Date();
    if (/今天|今日/.test(query)) { startDate = formatDate(now); endDate = formatDate(now); result.detected.timeRange = '今天'; }
    else if (/昨天|昨日/.test(query)) { const d = new Date(now); d.setDate(d.getDate()-1); startDate = formatDate(d); endDate = formatDate(d); result.detected.timeRange = '昨天'; }
    else if (/本周/.test(query)) { const d = new Date(now); d.setDate(d.getDate()-d.getDay()+1); startDate = formatDate(d); endDate = formatDate(now); result.detected.timeRange = '本周'; }
    else if (/本月/.test(query)) { startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1)); endDate = formatDate(now); result.detected.timeRange = '本月'; }
    else {
      const daysMatch = query.match(/最近?(\d+)天/);
      if (daysMatch) {
        const d = new Date(now); d.setDate(d.getDate() - parseInt(daysMatch[1]));
        startDate = formatDate(d); endDate = formatDate(now);
        result.detected.timeRange = `最近${daysMatch[1]}天`;
      } else {
        // 默认最近3天
        const d = new Date(now); d.setDate(d.getDate() - 3);
        startDate = formatDate(d); endDate = formatDate(now);
        result.detected.timeRange = '最近3天(默认)';
      }
    }

    // ── 4. 检测意图 ──
    if (/异常|多了|少了|不对|差异|偏差|问题/.test(query)) result.intent.push('anomaly');
    if (/操作|日志|记录|出入/.test(query)) result.intent.push('logs');
    if (/入库|存入|上架/.test(query)) result.intent.push('inbound');
    if (/出库|取出|领料|拿走/.test(query)) result.intent.push('outbound');
    if (/库存|还有多少|剩/.test(query)) result.intent.push('stock');

    // ── 5. 查询数据 ──
    let whereConditions = [];
    let whereParams = [];

    if (result.detected.location_codes && result.detected.location_codes.length > 0) {
      whereConditions.push('sl.code IN (?)');
      whereParams.push(result.detected.location_codes);
    }
    if (result.detected.materials && result.detected.materials.length > 0) {
      whereConditions.push('ol.material_id IN (?)');
      whereParams.push(result.detected.materials.map(m => m.id));
    }
    if (startDate) {
      whereConditions.push('DATE(ol.created_at) >= ?');
      whereParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push('DATE(ol.created_at) <= ?');
      whereParams.push(endDate);
    }

    const whereStr = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // 获取操作日志
    if (result.intent.some(i => ['logs', 'inbound', 'outbound', 'anomaly'].includes(i))) {
      let typeFilter = '';
      if (result.intent.includes('inbound') && !result.intent.includes('outbound')) typeFilter = "AND ol.type IN ('inbound','manual_inbound','restock')";
      else if (result.intent.includes('outbound') && !result.intent.includes('inbound')) typeFilter = "AND ol.type = 'outbound'";

      const [logs] = await pool.query(
        `SELECT ol.*, m.code AS material_code, m.name AS material_name, sl.code AS location_code
         FROM operation_log ol
         LEFT JOIN materials m ON ol.material_id = m.id
         LEFT JOIN storage_locations sl ON ol.location_id = sl.id
         ${whereStr} ${typeFilter}
         ORDER BY ol.created_at DESC LIMIT 100`,
        whereParams.flat()
      );
      result.data = logs;
    }

    // ── 6. 异常分析 ──
    if (result.intent.includes('anomaly') && result.data.length > 0) {
      const analysis = [];
      // 按物料+库位分组统计进出
      const groups = {};
      for (const log of result.data) {
        const key = `${log.material_id || '?'}_${log.location_id || '?'}`;
        if (!groups[key]) groups[key] = { name: log.material_name || '未知', location: log.location_code || '未知', inbound: 0, outbound: 0, items: [] };
        groups[key].items.push(log);
        if (['inbound','manual_inbound','restock'].includes(log.type)) groups[key].inbound += parseFloat(log.quantity||0);
        else if (log.type === 'outbound') groups[key].outbound += parseFloat(log.quantity||0);
      }

      for (const g of Object.values(groups)) {
        if (g.outbound > g.inbound) {
          analysis.push(`⚠️ 【${g.name}@${g.location}】出库(${g.outbound})>入库(${g.inbound})，差额${g.outbound-g.inbound}，可能存在未经记录的入库或盘点误差`);
        }
        // 检测单次大额操作
        for (const item of g.items) {
          if (parseFloat(item.quantity) > 100) {
            analysis.push(`📌 【${item.material_name}】单次${item.type==='outbound'?'出库':'入库'}${item.quantity}（大额操作，请核实）— ${new Date(item.created_at).toLocaleString('zh-CN')}`);
          }
        }
      }

      if (analysis.length === 0) {
        analysis.push(`✅ 在${result.detected.timeRange}内未发现明显异常。入库/出库数量匹配正常。`);
      }
      result.analysis = analysis;
    } else if (result.intent.includes('anomaly') && result.data.length === 0) {
      result.analysis = [`🤔 在${result.detected.timeRange}内没有找到相关操作记录。`];
    }

    // ── 7. 库存快照 ──
    if (result.intent.includes('stock') && result.detected.materials) {
      const [stocks] = await pool.query(
        `SELECT code, name, current_stock, safety_stock, unit FROM materials WHERE id IN (?)`,
        [result.detected.materials.map(m => m.id)]
      );
      result.stockData = stocks;
    }

    // ── 8. 自然语言摘要 ──
    result.summary = generateSummary(result);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function formatDate(d) { return d.toISOString().slice(0, 10); }

function generateSummary(r) {
  const parts = [];
  if (r.detected.materials) parts.push(`涉及物料：${r.detected.materials.map(m=>m.name).join('、')}`);
  if (r.detected.location_codes) parts.push(`涉及库位：${r.detected.location_codes.join('、')}`);
  parts.push(`时间范围：${r.detected.timeRange}`);
  parts.push(`共查到 ${r.data.length} 条操作记录`);
  if (r.analysis && r.analysis.length > 0) parts.push(`异常项：${r.analysis.filter(a=>a.startsWith('⚠️')).length}个`);
  return parts.join(' | ');
}

module.exports = router;
