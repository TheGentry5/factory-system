/**
 * 成本服务：领料成本归集（料工费中的「料」）
 *
 * 数据源：operation_log 中 type='outbound' 的出库记录（warehouse.cjs /retrieve 写入），
 *   数量 × 物料参考单价(materials.unit_price) → 生产成本-直接材料。
 * 单据 → 成本计算单(fin_cost_sheet) → 可选生成结转凭证
 *   借：4101 生产成本　贷：1403 原材料
 */

const { nextDocNo } = require('./doc-no.cjs');
const { createVoucher } = require('./voucher-service.cjs');

const round4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 取某月最后一天 YYYY-MM-DD */
function lastDayOfPeriod(periodNo) {
  const [y, m] = periodNo.split('-').map(Number);
  const day = new Date(y, m, 0).getDate();
  return `${periodNo}-${String(day).padStart(2, '0')}`;
}

/**
 * 归集某期间领料成本。
 * @param {object} conn 事务连接
 * @param {object} p { groupId, periodNo, operator, withVoucher=true, remark }
 * @returns 成本计算单 + 明细 + 可选凭证号
 */
async function buildMaterialCost(conn, { groupId, periodNo, operator, withVoucher = true, remark }) {
  const gf = groupId ? ' AND ol.group_id = ?' : ' AND ol.group_id IS NULL';
  const params = groupId ? [periodNo, groupId] : [periodNo];

  const [rows] = await conn.query(
    `SELECT ol.material_id AS material_id,
            m.code AS material_code, m.name AS material_name, m.unit,
            COALESCE(m.unit_price, 0) AS unit_price,
            COALESCE(SUM(ol.quantity), 0) AS total_qty
     FROM operation_log ol
     JOIN materials m ON ol.material_id = m.id
     WHERE ol.type = 'outbound'
       AND DATE_FORMAT(ol.created_at, '%Y-%m') = ?${gf}
     GROUP BY ol.material_id, m.code, m.name, m.unit, m.unit_price
     HAVING total_qty > 0
     ORDER BY m.code`,
    params
  );

  const lines = rows.map(r => ({
    material_id: r.material_id,
    material_code: r.material_code,
    material_name: r.material_name,
    unit: r.unit,
    unit_price: Number(r.unit_price),
    total_qty: Number(r.total_qty),
    amount: round4(Number(r.total_qty) * Number(r.unit_price)),
  }));
  const materialTotal = round4(lines.reduce((s, l) => s + l.amount, 0));

  // 幂等：本期间已存在成本单
  const [sheets] = await conn.query(
    'SELECT * FROM fin_cost_sheet WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, periodNo]
  );
  const sheetNo = await nextDocNo(conn, { prefix: 'CS', display: periodNo, pad: 3 });

  let sheetId;
  let sheetStatus = 'draft';
  let voucherNo = null;

  if (sheets.length > 0 && sheets[0].status === 'posted') {
    // 已结转，不再覆盖
    const s = sheets[0];
    const [oldLines] = await conn.query(
      `SELECT l.*, m.code AS material_code, m.name AS material_name, m.unit
       FROM fin_cost_sheet_lines l
       LEFT JOIN materials m ON l.material_id = m.id
       WHERE l.sheet_id = ? ORDER BY l.id`,
      [s.id]
    );
    return { duplicate: true, sheet: s, lines: oldLines, voucher_no: s.voucher_no };
  }

  if (sheets.length > 0) {
    sheetId = sheets[0].id;
    await conn.query('DELETE FROM fin_cost_sheet_lines WHERE sheet_id = ?', [sheetId]);
  } else {
    const [r] = await conn.query(
      `INSERT INTO fin_cost_sheet (group_id, sheet_no, period_no, material_cost, labor_cost, overhead_cost, total_cost, status, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [groupId ?? null, sheetNo, periodNo, 0, 0, 0, 0, 'draft', remark || null, operator || null]
    );
    sheetId = r.insertId;
  }

  for (const l of lines) {
    await conn.query(
      `INSERT INTO fin_cost_sheet_lines (group_id, sheet_id, cost_type, source_type, material_id, quantity, amount, remark)
       VALUES (?,?,?,?,?,?,?,?)`,
      [groupId ?? null, sheetId, 'material', 'outbound', l.material_id, l.total_qty, l.amount,
        `${l.material_code} ${l.material_name} × ${l.total_qty}${l.unit || ''} @ ${l.unit_price}`]
    );
  }

  // 生成结转凭证：借 生产成本 贷 原材料（材料总量拆成多条贷方）
  if (withVoucher && materialTotal > 0) {
    const entries = [{ subject_code: '4101', direction: 'debit', amount: round2(materialTotal), summary: `领料归集成本(${periodNo})` }];
    for (const l of lines) {
      entries.push({ subject_code: '1403', direction: 'credit', amount: round2(l.amount), summary: `领料 ${l.material_code} ${l.material_name}`, material_id: l.material_id });
    }
    const res = await createVoucher(conn, {
      groupId, voucherDate: lastDayOfPeriod(periodNo), periodNo,
      voucherType: 'transfer', sourceType: 'cost-material', sourceId: Number(periodNo.replace('-', '')),
      remark: `成本归集结转（领料）${periodNo}`, createdBy: operator,
      entries,
    });
    voucherNo = res.voucher_no;
    sheetStatus = 'posted';
  }

  const laborCost = sheets.length > 0 ? Number(sheets[0].labor_cost) : 0;
  const overheadCost = sheets.length > 0 ? Number(sheets[0].overhead_cost) : 0;
  const totalCost = round4(materialTotal + laborCost + overheadCost);
  await conn.query(
    `UPDATE fin_cost_sheet
     SET material_cost = ?, labor_cost = ?, overhead_cost = ?, total_cost = ?, status = ?,
         voucher_id = (SELECT id FROM fin_vouchers WHERE voucher_no = ?)
     WHERE id = ?`,
    [materialTotal, laborCost, overheadCost, totalCost, sheetStatus,
      voucherNo || '__none__', sheetId]
  );

  const [[sheet]] = await conn.query('SELECT * FROM fin_cost_sheet WHERE id = ?', [sheetId]);
  const [finalLines] = await conn.query(
    `SELECT l.*, m.code AS material_code, m.name AS material_name, m.unit
     FROM fin_cost_sheet_lines l
     LEFT JOIN materials m ON l.material_id = m.id
     WHERE l.sheet_id = ? ORDER BY l.id`,
    [sheetId]
  );
  return { duplicate: false, sheet, lines: finalLines, voucher_no: voucherNo };
}

module.exports = { buildMaterialCost, lastDayOfPeriod };
