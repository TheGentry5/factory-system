/**
 * 凭证服务：借贷平衡校验 / 凭证生成(幂等) / 过账 / 红冲
 *
 * 全部函数要求传入「事务连接 conn」，由路由层负责 beginTransaction/commit/rollback。
 * 红冲约定：原凭证保持 status='posted'，另生成一张 status='reversed' 的冲销凭证，
 *   其分录 = 原分录方向互换、金额为正。报表口径为 status IN ('posted','reversed')，
 *   两笔同存互相抵消 → 账簿净额正确（草稿永不入账）。
 */

const { nextDocNo } = require('./doc-no.cjs');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 汇总 `SUM(debit) == SUM(credit)`（容差 0.01），返回 { balanced, debit, credit, diff } */
function checkBalance(entries) {
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    const amt = round2(e.amount);
    if (amt <= 0) throw new Error('金额必须大于 0，禁止零/负金额凭证');
    if (e.direction === 'debit') debit += amt;
    else if (e.direction === 'credit') credit += amt;
    else throw new Error('分录方向非法');
  }
  debit = round2(debit);
  credit = round2(credit);
  const diff = round2(Math.abs(debit - credit));
  if (diff > 0.01) {
    throw new Error(`借贷不平衡：借方 ${debit.toFixed(2)} ≠ 贷方 ${credit.toFixed(2)}（尾差 ${diff.toFixed(2)}）`);
  }
  return { balanced: true, debit, credit, diff };
}

/** 校验期间开放（status != 'closed'），否则抛出中文错误 */
async function assertPeriodOpen(conn, groupId, periodNo) {
  const [rows] = await conn.query(
    'SELECT status FROM fin_periods WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, periodNo]
  );
  if (rows.length === 0) {
    throw new Error(`期间 ${periodNo} 未初始化，请先执行 node server/seed-finance.cjs 或 POST /close/periods 初始化`);
  }
  if (rows[0].status === 'closed') {
    throw new Error(`期间 ${periodNo} 已结账，禁止再写入财务单据`);
  }
  // 期间序号校验：不允许回填早于已结账期间的凭证（反结账守则）
  const [[{ maxClosed }]] = await conn.query(
    "SELECT MAX(period_no) AS maxClosed FROM fin_periods WHERE group_id <=> ? AND status = 'closed'",
    [groupId ?? null]
  );
  if (maxClosed && String(maxClosed) > periodNo) {
    throw new Error(`已存在晚于本期间的结账记录(${maxClosed})，禁止回填，请先反结账`);
  }
  return rows[0].status;
}

async function fetchSubject(conn, codeOrId, field) {
  const col = field === 'id' ? 'id' : 'code';
  const [rows] = await conn.query(
    `SELECT id, code, name, direction, type, is_cash, is_cost FROM fin_subjects WHERE ${col} = ?`,
    [codeOrId]
  );
  if (rows.length === 0) throw new Error(`科目 ${codeOrId} 不存在，请检查科目编码`);
  return rows[0];
}

/** 按来源查已有凭证（幂等），返回凭证行或 null */
async function findVoucherBySource(conn, groupId, sourceType, sourceId) {
  if (!sourceType || sourceId === undefined || sourceId === null) return null;
  const [rows] = await conn.query(
    `SELECT * FROM fin_vouchers WHERE group_id <=> ? AND source_type = ? AND source_id = ?`,
    [groupId ?? null, sourceType, sourceId]
  );
  return rows[0] || null;
}

/**
 * 创建凭证（可在事务内与单据状态更新一起调用）。
 * entries: [{ subject_code, direction, amount, summary, material_id, dept }]
 * @returns {Promise<{duplicate:boolean, id:number, voucher_no:string, entry_count:number, total_debit:number, total_credit:number}>}
 */
async function createVoucher(conn, {
  groupId, voucherDate, periodNo, voucherType = 'generic',
  sourceType, sourceId, remark, createdBy, entries, status = 'posted',
}) {
  if (!voucherDate || !periodNo) throw new Error('缺少记账日期/会计期间');
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('凭证至少需要一条分录');
  await assertPeriodOpen(conn, groupId, periodNo);

  // 幂等防重：同一来源单据只生成一次
  const existing = await findVoucherBySource(conn, groupId, sourceType, sourceId);
  if (existing) {
    return { duplicate: true, id: existing.id, voucher_no: existing.voucher_no, entry_count: existing.entry_count, total_debit: existing.total_debit, total_credit: existing.total_credit };
  }

  const balance = checkBalance(entries);

  // 科目校验 & 补 subject_id
  const lines = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const subj = await fetchSubject(conn, e.subject_code, 'code');
    lines.push({
      line_no: i + 1,
      subject_id: subj.id,
      subject_code: subj.code,
      direction: e.direction,
      amount: round2(e.amount),
      summary: e.summary || null,
      material_id: e.material_id || null,
      dept: e.dept || null,
    });
  }

  const voucherNo = await nextDocNo(conn, { prefix: 'VCH', display: periodNo, pad: 4 });
  const [r] = await conn.query(
    `INSERT INTO fin_vouchers
       (group_id, voucher_no, period_no, voucher_date, voucher_type,
        source_type, source_id, entry_count, total_debit, total_credit,
        status, remark, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [groupId ?? null, voucherNo, periodNo, voucherDate, voucherType,
      sourceType || null, sourceId ?? null, lines.length, balance.debit, balance.credit,
      status, remark || null, createdBy || null]
  );
  const voucherId = r.insertId;

  for (const l of lines) {
    await conn.query(
      `INSERT INTO fin_voucher_entries
         (group_id, voucher_id, line_no, subject_code, subject_id, direction, amount, summary, material_id, dept)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [groupId ?? null, voucherId, l.line_no, l.subject_code, l.subject_id, l.direction, l.amount, l.summary, l.material_id, l.dept]
    );
  }

  return { duplicate: false, id: voucherId, voucher_no: voucherNo, entry_count: lines.length, total_debit: balance.debit, total_credit: balance.credit };
}

/** 过账：草稿 → 已过账（过账前强校验借贷平衡） */
async function postVoucher(conn, voucherId, groupId, operator) {
  const [rows] = await conn.query(
    'SELECT * FROM fin_vouchers WHERE id = ? AND group_id <=> ?',
    [voucherId, groupId ?? null]
  );
  if (rows.length === 0) throw new Error('凭证不存在');
  const v = rows[0];
  if (v.status === 'reversed') throw new Error('红冲凭证不可重复过账');
  if (v.status === 'posted') return { voucher_no: v.voucher_no, already_posted: true };

  const [entries] = await conn.query(
    'SELECT direction, amount FROM fin_voucher_entries WHERE voucher_id = ?',
    [voucherId]
  );
  checkBalance(entries.map(e => ({ direction: e.direction, amount: e.amount })));

  await conn.query(
    `UPDATE fin_vouchers SET status = 'posted', remark = IF(remark IS NULL, CONCAT('过账人: ', ?), CONCAT(remark, ' | 过账人: ', ?)) WHERE id = ?`,
    [operator || '-', operator || '-', voucherId]
  );
  return { voucher_no: v.voucher_no, already_posted: false };
}

/** 红冲：复制原凭证分录、方向互换，生成一张 status='reversed' 的冲销凭证 */
async function reverseVoucher(conn, { voucherId, groupId, operator, remark }) {
  const [rows] = await conn.query(
    'SELECT * FROM fin_vouchers WHERE id = ? AND group_id <=> ?',
    [voucherId, groupId ?? null]
  );
  if (rows.length === 0) throw new Error('凭证不存在');
  const v = rows[0];
  if (v.status !== 'posted') throw new Error('仅已过账凭证可红冲');
  const [dup] = await conn.query(
    'SELECT id FROM fin_vouchers WHERE reversed_of_id = ? AND status = ?',
    [voucherId, 'reversed']
  );
  if (dup.length > 0) throw new Error(`凭证 ${v.voucher_no} 已红冲，勿重复操作`);

  const [entries] = await conn.query(
    'SELECT subject_code, direction, amount, summary, material_id, dept FROM fin_voucher_entries WHERE voucher_id = ? ORDER BY line_no',
    [voucherId]
  );

  const reversed = await createVoucher(conn, {
    groupId,
    voucherDate: v.voucher_date,
    periodNo: v.period_no,
    voucherType: v.voucher_type,
    sourceType: 'reverse',
    sourceId: voucherId,
    remark: remark || `红冲 ${v.voucher_no}`,
    createdBy: operator,
    status: 'reversed',
    entries: entries.map(e => ({
      subject_code: e.subject_code,
      direction: e.direction === 'debit' ? 'credit' : 'debit',
      amount: e.amount,
      summary: `红冲 ${v.voucher_no}${e.summary ? ' | ' + e.summary : ''}`,
      material_id: e.material_id,
      dept: e.dept,
    })),
  });
  // reversed_of_id 指向被冲凭证
  await conn.query('UPDATE fin_vouchers SET reversed_of_id = ? WHERE id = ?', [voucherId, reversed.id]);

  return { original_no: v.voucher_no, reversal_no: reversed.voucher_no };
}

/** 凭证详情（含分录） */
async function getVoucherDetail(db, groupId, voucherId) {
  const [rows] = await db.query(
    'SELECT * FROM fin_vouchers WHERE id = ? AND group_id <=> ?',
    [voucherId, groupId ?? null]
  );
  if (rows.length === 0) return null;
  const [entries] = await db.query(
    `SELECT e.*, s.name AS subject_name, s.type AS subject_type
     FROM fin_voucher_entries e
     LEFT JOIN fin_subjects s ON e.subject_id = s.id
     WHERE e.voucher_id = ?
     ORDER BY e.line_no`,
    [voucherId]
  );
  return { ...rows[0], entries };
}

module.exports = {
  round2, checkBalance, assertPeriodOpen, fetchSubject, findVoucherBySource,
  createVoucher, postVoucher, reverseVoucher, getVoucherDetail,
};
