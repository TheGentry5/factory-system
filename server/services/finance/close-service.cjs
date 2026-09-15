/**
 * 期末结账服务：预检 / 试算平衡 / 损益结转 / 结账 / 反结账
 *
 * 报表与结账口径统一：只统计 status IN ('posted','reversed') 的凭证（草稿不入账）。
 */

const { createVoucher, assertPeriodOpen } = require('./voucher-service.cjs');
const { lastDayOfPeriod } = require('./cost-service.cjs');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function periodNumber(periodNo) {
  return Number(periodNo.replace('-', ''));
}

function prevPeriod(periodNo) {
  const [y, m] = periodNo.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 期间列表（含当期凭证统计） */
async function listPeriods(db, groupId) {
  const [rows] = await db.query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM fin_vouchers v WHERE v.period_no = p.period_no AND v.group_id <=> p.group_id AND v.status IN ('posted','reversed')) AS posted_count,
       (SELECT COUNT(*) FROM fin_vouchers v WHERE v.period_no = p.period_no AND v.group_id <=> p.group_id AND v.status = 'draft') AS draft_count
     FROM fin_periods p
     WHERE p.group_id <=> ?
     ORDER BY p.period_no DESC`,
    [groupId ?? null]
  );
  return rows;
}

/** 科目发生额汇总（可区间/按类型过滤），供试算/报表共用 */
async function subjectMovements(db, { groupId, fromPeriod, toPeriod, types }) {
  let sql = `
    SELECT s.code AS subject_code, s.id AS subject_id, s.name AS subject_name,
           s.type AS subject_type, s.direction AS def_direction,
           COALESCE(SUM(CASE WHEN e.direction='debit' THEN e.amount ELSE 0 END), 0) AS debit,
           COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount ELSE 0 END), 0) AS credit
    FROM fin_voucher_entries e
    JOIN fin_vouchers v ON e.voucher_id = v.id
    JOIN fin_subjects s ON e.subject_id = s.id
    WHERE v.status IN ('posted','reversed') AND v.group_id <=> ?
  `;
  const params = [groupId ?? null];
  if (fromPeriod) { sql += ' AND v.period_no >= ?'; params.push(fromPeriod); }
  if (toPeriod) { sql += ' AND v.period_no <= ?'; params.push(toPeriod); }
  if (types && types.length) {
    sql += ` AND s.type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }
  sql += ' GROUP BY s.code, s.id, s.name, s.type, s.direction ORDER BY s.code';
  const [rows] = await db.query(sql, params);
  return rows;
}

/** 按科目默认方向折算净余额（正 = 科目方向余额，负 = 反向） */
function netOf(row) {
  const debit = Number(row.debit);
  const credit = Number(row.credit);
  return row.def_direction === 'debit' ? debit - credit : credit - debit;
}

async function logClose(conn, { groupId, periodNo, action, operator, detail }) {
  await conn.query(
    `INSERT INTO fin_close_log (group_id, period_no, action, operator, detail)
     VALUES (?,?,?,?,?)`,
    [groupId ?? null, periodNo, action, operator || null, detail || null]
  );
}

/**
 * ① 结账预检：返回检查项。ok=false 的项为阻断项，close 前必须通过。
 */
async function runPrecheck(db, groupId, periodNo) {
  const checks = [];
  const [periods] = await db.query(
    'SELECT * FROM fin_periods WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, periodNo]
  );
  const period = periods[0];
  if (!period) throw new Error(`期间 ${periodNo} 不存在`);

  const prev = prevPeriod(periodNo);
  const [[{ prevCount }]] = await db.query(
    'SELECT COUNT(*) AS prevCount FROM fin_periods WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, prev]
  );
  const [[{ prevClosed }]] = await db.query(
    "SELECT COUNT(*) AS prevClosed FROM fin_periods WHERE group_id <=> ? AND period_no = ? AND status != 'closed'",
    [groupId ?? null, prev]
  );
  if (prevCount > 0 && prevClosed > 0) {
    checks.push({ key: 'prev_closed', label: `前一期间 ${prev} 已结账`, ok: false, level: 'block' });
  } else {
    checks.push({ key: 'prev_closed', label: prevCount > 0 ? `前一期间 ${prev} 已结账` : '无前一期间', ok: true, level: 'pass' });
  }

  const [[{ draft }]] = await db.query(
    "SELECT COUNT(*) AS draft FROM fin_vouchers WHERE group_id <=> ? AND period_no = ? AND status = 'draft'",
    [groupId ?? null, periodNo]
  );
  checks.push({ key: 'no_draft', label: `无未过账(草稿)凭证`, ok: draft === 0, level: draft === 0 ? 'pass' : 'block' });

  const [[{ trialDiff }]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN e.direction='debit' THEN e.amount ELSE -e.amount END), 0) AS trialDiff
     FROM fin_voucher_entries e
     JOIN fin_vouchers v ON e.voucher_id = v.id
     WHERE v.status IN ('posted','reversed') AND v.period_no = ? AND v.group_id <=> ?`,
    [periodNo, groupId ?? null]
  );
  const balanced = Math.abs(Number(trialDiff)) <= 0.01;
  checks.push({ key: 'trial_balance', label: '试算平衡（借贷合计相等）', ok: balanced, level: balanced ? 'pass' : 'block' });

  const [[{ openAp }]] = await db.query(
    "SELECT COUNT(*) AS openAp FROM fin_ap_docs WHERE group_id <=> ? AND status IN ('open','matched')",
    [groupId ?? null]
  );
  const [[{ openAr }]] = await db.query(
    "SELECT COUNT(*) AS openAr FROM fin_ar_docs WHERE group_id <=> ? AND status IN ('open','matched')",
    [groupId ?? null]
  );
  checks.push({
    key: 'carry_docs', label: `跨期在途单据（应付 ${openAp} 张 / 应收 ${openAr} 张）`,
    ok: true, level: openAp + openAr > 0 ? 'warn' : 'pass',
  });

  const [[{ costSheet }]] = await db.query(
    "SELECT COUNT(*) AS costSheet FROM fin_cost_sheet WHERE group_id <=> ? AND period_no = ? AND status = 'posted'",
    [groupId ?? null, periodNo]
  );
  const [[{ prodBalance }]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN e.direction='debit' THEN e.amount ELSE -e.amount END), 0) AS prodBalance
     FROM fin_voucher_entries e
     JOIN fin_vouchers v ON e.voucher_id = v.id
     JOIN fin_subjects s ON e.subject_id = s.id
     WHERE v.status IN ('posted','reversed') AND v.period_no = ? AND v.group_id <=> ? AND s.code = '4101'`,
    [periodNo, groupId ?? null]
  );
  const costDone = costSheet > 0;
  checks.push({
    key: 'cost_carry', label: '成本结转完成（生产成本无未归集余额）',
    ok: costDone, level: costDone ? 'pass' : (Math.abs(Number(prodBalance)) > 0.01 ? 'block' : 'warn'),
  });

  const pass = checks.every(c => c.level !== 'block');
  return { period: { period_no: periodNo, status: period.status }, pass, checks };
}

/**
 * ⑤ 试算平衡表：当期全部科目借贷发生额，校验合计差额。
 */
async function runTrial(db, groupId, periodNo) {
  const rows = await subjectMovements(db, { groupId, fromPeriod: periodNo, toPeriod: periodNo });
  const map = rows.map(r => ({
    subject_code: r.subject_code, subject_name: r.subject_name, subject_type: r.subject_type,
    debit: round2(r.debit), credit: round2(r.credit),
  }));
  const totalDebit = round2(map.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(map.reduce((s, r) => s + r.credit, 0));
  return { rows: map, total_debit: totalDebit, total_credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) <= 0.01, diff: round2(Math.abs(totalDebit - totalCredit)) };
}

/**
 * ④ 损益结转：收入/费用/成本类科目 → 本年利润(4103)，生成 closing 凭证（幂等）。
 */
async function runCloseProfit(conn, groupId, periodNo, operator) {
  const status = await assertPeriodOpen(conn, groupId, periodNo);
  if (status === 'closed') throw new Error('期间已结账，禁止结转');
  if (status === 'closing') { /* 允许进行中重入 */ }

  const rows = await subjectMovements(conn, { groupId, fromPeriod: periodNo, toPeriod: periodNo, types: ['revenue', 'expense', 'cost'] });
  const revenue = rows.filter(r => r.subject_type === 'revenue').map(r => ({ code: r.subject_code, name: r.subject_name, net: round2(netOf(r)) })).filter(r => Math.abs(r.net) > 0.001);
  const costs = rows.filter(r => r.subject_type !== 'revenue').map(r => ({ code: r.subject_code, name: r.subject_name, net: round2(netOf(r)) })).filter(r => Math.abs(r.net) > 0.001);

  const revTotal = round2(revenue.reduce((s, r) => s + r.net, 0));
  const costTotal = round2(costs.reduce((s, r) => s + r.net, 0));
  if (Math.abs(revTotal) <= 0.001 && Math.abs(costTotal) <= 0.001) {
    return { skipped: true, reason: '本期无损益类科目发生额，无需结转', revenue: [], costs: [] };
  }

  // 幂等：已生成过结转凭证则直接返回
  const [exist] = await conn.query(
    "SELECT voucher_no FROM fin_vouchers WHERE group_id <=> ? AND source_type = 'close-profit' AND source_id = ?",
    [groupId ?? null, periodNumber(periodNo)]
  );
  if (exist.length > 0) {
    return { skipped: false, duplicate: true, voucher_no: exist[0].voucher_no, revenue, costs };
  }

  const entries = [];
  for (const r of revenue) {
    // 收入（贷方余额）→ 借 收入科目 / 贷 本年利润
    entries.push({ subject_code: r.code, direction: 'debit', amount: r.net, summary: `结转收入 ${r.name}(${periodNo})` });
    entries.push({ subject_code: '4103', direction: 'credit', amount: r.net, summary: `结转收入 ${r.name}(${periodNo})` });
  }
  for (const c of costs) {
    // 费用/成本（借方余额）→ 借 本年利润 / 贷 费用科目
    entries.push({ subject_code: '4103', direction: 'debit', amount: c.net, summary: `结转费用 ${c.name}(${periodNo})` });
    entries.push({ subject_code: c.code, direction: 'credit', amount: c.net, summary: `结转费用 ${c.name}(${periodNo})` });
  }

  const res = await createVoucher(conn, {
    groupId, voucherDate: lastDayOfPeriod(periodNo), periodNo,
    voucherType: 'closing', sourceType: 'close-profit', sourceId: periodNumber(periodNo),
    remark: `期间损益结转 ${periodNo}`, createdBy: operator, entries,
  });
  await logClose(conn, { groupId, periodNo, action: 'close_profit', operator, detail: `结转凭证 ${res.voucher_no}` });
  return { skipped: false, duplicate: false, voucher_no: res.voucher_no, revenue, costs };
}

/**
 * ⑥ 结账（锁期间）：校验通过后置 closed。
 */
async function runClose(conn, groupId, periodNo, operator) {
  const [periods] = await conn.query(
    'SELECT * FROM fin_periods WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, periodNo]
  );
  if (periods.length === 0) throw new Error(`期间 ${periodNo} 不存在`);
  if (periods[0].status === 'closed') return { duplicate: true, period_no: periodNo };

  await conn.query(
    "UPDATE fin_periods SET status = 'closed', closed_by = ?, closed_at = NOW() WHERE id = ?",
    [operator || null, periods[0].id]
  );
  await logClose(conn, { groupId, periodNo, action: 'close', operator, detail: '期间结账完成' });
  return { duplicate: false, period_no: periodNo };
}

/**
 * ⑧ 反结账：仅允许对「最近一个已结账期间」操作；清空该期间损益结转/成本结转凭证与成本单状态。
 */
async function runReopen(conn, groupId, periodNo, operator) {
  const [[{ latestClosed }]] = await conn.query(
    "SELECT MAX(period_no) AS latestClosed FROM fin_periods WHERE group_id <=> ? AND status = 'closed'",
    [groupId ?? null]
  );
  if (!latestClosed) throw new Error('当前没有已结账期间');
  if (latestClosed !== periodNo) {
    throw new Error(`只能反结账最近一个已结账期间 ${latestClosed}，不允许反结账更早期间`);
  }

  const [periods] = await conn.query(
    'SELECT * FROM fin_periods WHERE group_id <=> ? AND period_no = ?',
    [groupId ?? null, periodNo]
  );
  if (periods.length === 0) throw new Error(`期间 ${periodNo} 不存在`);
  if (periods[0].status !== 'closed') throw new Error(`期间 ${periodNo} 未结账，无需反结账`);

  // 删除本期间结转凭证（损益结转 + 成本归集结转），成本单回滚为草稿
  const [closing] = await conn.query(
    "SELECT id FROM fin_vouchers WHERE group_id <=> ? AND period_no = ? AND source_type IN ('close-profit','cost-material')",
    [groupId ?? null, periodNo]
  );
  for (const v of closing) {
    await conn.query('DELETE FROM fin_voucher_entries WHERE voucher_id = ?', [v.id]);
    await conn.query('DELETE FROM fin_vouchers WHERE id = ?', [v.id]);
  }
  const [costSheets] = await conn.query(
    "SELECT id FROM fin_cost_sheet WHERE group_id <=> ? AND period_no = ? AND status = 'posted'",
    [groupId ?? null, periodNo]
  );
  for (const s of costSheets) {
    await conn.query("UPDATE fin_cost_sheet SET status = 'draft', voucher_id = NULL WHERE id = ?", [s.id]);
  }

  await conn.query(
    "UPDATE fin_periods SET status = 'reopened', reopened_by = ?, remark = '反结账后需重新执行损益结转与结账' WHERE id = ?",
    [operator || null, periods[0].id]
  );
  await logClose(conn, {
    groupId, periodNo, action: 'reopen', operator,
    detail: `反结账：已清空结转凭证 ${closing.length} 张 / 成本单 ${costSheets.length} 张`,
  });
  return { duplicate: false, period_no: periodNo, cleaned_vouchers: closing.length, cleaned_sheets: costSheets.length };
}

module.exports = {
  periodNumber, prevPeriod, lastDayOfPeriod,
  listPeriods, subjectMovements, netOf, round2,
  runPrecheck, runTrial, runCloseProfit, runClose, runReopen,
};
