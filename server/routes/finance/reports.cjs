/**
 * 财务模块 - 报表 API（挂载在 /api/finance）
 * 口径：一律取 status IN ('posted','reversed') 凭证（草稿不参与报表）。
 * GET /reports/trial-balance      试算平衡表
 * GET /reports/subject-balances   科目余额表（期初+本期+期末）
 * GET /reports/profit             利润表（本期 + 本年累计）
 * GET /reports/balance-sheet      资产负债表（期末数）
 * GET /reports/cash-flow          现金流量表（收付实现制简化版）
 * GET /reports/ap-aging           应付账款账龄
 * GET /reports/ar-aging           应收账款账龄
 * GET /reports/expenses           费用明细报表
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db.cjs');
const closeService = require('../../services/finance/close-service.cjs');
const { localDateStr } = require('../../services/finance/doc-no.cjs');

const gid = (req) => req.groupId ?? null;
const r2 = closeService.round2;

function fail(res, err) {
  const tech = /(ER_|connect|pool|ECONN|query)/i.test(String(err.message || err));
  res.status(tech ? 500 : 400).json({ success: false, message: err.message || '操作失败' });
}

function currentPeriod() {
  return localDateStr().slice(0, 7);
}

function prevOf(periodNo) {
  const [y, m] = periodNo.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// 把某一科目借/贷发生额折算成「借方侧/贷方侧」余额（按科目默认方向归边）
function toSides(row) {
  const net = closeService.netOf(row);
  if (row.def_direction === 'debit') {
    return { debit: Math.max(net, 0), credit: Math.max(-net, 0) };
  }
  return { debit: Math.max(-net, 0), credit: Math.max(net, 0) };
}

// GET /reports/trial-balance
router.get('/reports/trial-balance', async (req, res) => {
  try {
    const periodNo = req.query.period_no || currentPeriod();
    const data = await closeService.runTrial(pool, gid(req), periodNo);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// GET /reports/subject-balances
router.get('/reports/subject-balances', async (req, res) => {
  try {
    const periodNo = req.query.period_no || currentPeriod();
    const groupId = gid(req);
    const prev = prevOf(periodNo);
    const [open, cur, all] = await Promise.all([
      closeService.subjectMovements(pool, { groupId, toPeriod: prev }),
      closeService.subjectMovements(pool, { groupId, fromPeriod: periodNo, toPeriod: periodNo }),
      closeService.subjectMovements(pool, { groupId, toPeriod: periodNo }),
    ]);
    const map = new Map();
    for (const r of open) map.set(r.subject_code, { open: r, cur: null, all: null });
    for (const r of cur) {
      const o = map.get(r.subject_code) || { open: null, cur: null, all: null };
      o.cur = r;
      map.set(r.subject_code, o);
    }
    for (const r of all) {
      const o = map.get(r.subject_code) || { open: null, cur: null, all: null };
      o.all = r;
      map.set(r.subject_code, o);
    }
    const rows = [];
    for (const [code, o] of map) {
      if (!o.open && !o.cur && !o.all) continue;
      const base = o.open || o.cur || o.all;
      const info = { subject_code: code, subject_name: base.subject_name, subject_type: base.subject_type };
      const zero = { ...base, debit: 0, credit: 0 };
      const opening = toSides(o.open || zero);
      const periodSide = toSides(o.cur || zero);
      const ending = toSides(o.all || zero);
      rows.push({
        ...info,
        opening_debit: r2(opening.debit), opening_credit: r2(opening.credit),
        period_debit: r2(periodSide.debit), period_credit: r2(periodSide.credit),
        ending_debit: r2(ending.debit), ending_credit: r2(ending.credit),
      });
    }
    rows.sort((a, b) => a.subject_code.localeCompare(b.subject_code));
    const sum = (k) => r2(rows.reduce((s, r) => s + (r[k] || 0), 0));
    const totals = {
      opening_debit: sum('opening_debit'), opening_credit: sum('opening_credit'),
      period_debit: sum('period_debit'), period_credit: sum('period_credit'),
      ending_debit: sum('ending_debit'), ending_credit: sum('ending_credit'),
    };
    res.json({ success: true, data: { period_no: periodNo, rows, totals } });
  } catch (err) { fail(res, err); }
});

// GET /reports/profit
router.get('/reports/profit', async (req, res) => {
  try {
    const periodNo = req.query.period_no || currentPeriod();
    const groupId = gid(req);
    const y = periodNo.split('-')[0];
    const from = `${y}-01`;
    const types = ['revenue', 'expense', 'cost'];
    const [cur, ytd] = await Promise.all([
      closeService.subjectMovements(pool, { groupId, fromPeriod: periodNo, toPeriod: periodNo, types }),
      closeService.subjectMovements(pool, { groupId, fromPeriod: from, toPeriod: periodNo, types }),
    ]);
    const map = new Map();
    for (const r of cur) map.set(r.subject_code, { cur: r, ytd: null });
    for (const r of ytd) {
      const o = map.get(r.subject_code) || { cur: null, ytd: null };
      o.ytd = r;
      map.set(r.subject_code, o);
    }
    const rows = [];
    let revenueCur = 0; let costCur = 0; let revenueYtd = 0; let costYtd = 0;
    for (const [code, o] of map) {
      const curRow = o.cur;
      const ytdRow = o.ytd;
      const info = { subject_code: code, subject_name: (curRow || ytdRow).subject_name, subject_type: (curRow || ytdRow).subject_type };
      const curNet = curRow ? closeService.netOf(curRow) : 0;
      const ytdNet = ytdRow ? closeService.netOf(ytdRow) : 0;
      if (info.subject_type === 'revenue') {
        revenueCur += curNet; revenueYtd += ytdNet;
      } else {
        costCur += curNet; costYtd += ytdNet;
      }
      rows.push({
        ...info,
        cur_debit: r2(curRow?.debit || 0), cur_credit: r2(curRow?.credit || 0), cur_net: r2(curNet),
        ytd_debit: r2(ytdRow?.debit || 0), ytd_credit: r2(ytdRow?.credit || 0), ytd_net: r2(ytdNet),
      });
    }
    rows.sort((a, b) => a.subject_code.localeCompare(b.subject_code));
    res.json({
      success: true,
      data: {
        period_no: periodNo,
        year_from: from,
        rows,
        revenue: { cur: r2(revenueCur), ytd: r2(revenueYtd) },
        cost: { cur: r2(costCur), ytd: r2(costYtd) },
        profit: { cur: r2(revenueCur - costCur), ytd: r2(revenueYtd - costYtd) },
      },
    });
  } catch (err) { fail(res, err); }
});

// GET /reports/balance-sheet
router.get('/reports/balance-sheet', async (req, res) => {
  try {
    const groupId = gid(req);
    const [latestRows] = await pool.query(
      'SELECT MAX(period_no) AS m FROM fin_vouchers WHERE group_id <=> ? AND status IN (?, ?)',
      [groupId, 'posted', 'reversed']
    );
    const asOf = req.query.period_no || latestRows[0].m || currentPeriod();
    const mov = await closeService.subjectMovements(pool, {
      groupId, toPeriod: asOf, types: ['asset', 'liability', 'equity'],
    });
    const sections = [
      { key: 'asset', name: '资产', rows: [], net: 0 },
      { key: 'liability', name: '负债', rows: [], net: 0 },
      { key: 'equity', name: '所有者权益', rows: [], net: 0 },
    ];
    for (const m of mov) {
      const sec = sections.find(s => s.key === m.subject_type);
      if (!sec) continue;
      const side = toSides(m);
      sec.rows.push({ subject_code: m.subject_code, subject_name: m.subject_name, debit: r2(side.debit), credit: r2(side.credit) });
      sec.net += closeService.netOf(m);
    }
    const norm = (n) => r2(Math.abs(n));
    const assetTotal = norm(sections[0].net);
    const liabTotal = norm(sections[1].net);
    const equityTotal = norm(sections[2].net);
    res.json({
      success: true,
      data: {
        as_of: asOf, sections: sections.map(s => ({ ...s, rows: s.rows, total: r2(s.net) })),
        asset_total: assetTotal, liability_total: liabTotal, equity_total: equityTotal,
        balanced: Math.abs(assetTotal - liabTotal - equityTotal) <= 0.01,
      },
    });
  } catch (err) { fail(res, err); }
});

// GET /reports/cash-flow（收付实现制简化：资金类科目 流入=借方发生、流出=贷方发生）
router.get('/reports/cash-flow', async (req, res) => {
  try {
    const periodNo = req.query.period_no || currentPeriod();
    const [rows] = await pool.query(
      `SELECT s.code AS subject_code, s.name AS subject_name,
         COALESCE(SUM(CASE WHEN e.direction='debit' THEN e.amount ELSE 0 END),0) AS inflow,
         COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount ELSE 0 END),0) AS outflow
       FROM fin_voucher_entries e
       JOIN fin_vouchers v ON e.voucher_id = v.id
       JOIN fin_subjects s ON e.subject_id = s.id
       WHERE s.is_cash = 1 AND v.status IN ('posted','reversed') AND v.period_no = ? AND v.group_id <=> ?
       GROUP BY s.code, s.name ORDER BY s.code`,
      [periodNo, gid(req)]
    );
    const total_inflow = r2(rows.reduce((s, r) => s + Number(r.inflow), 0));
    const total_outflow = r2(rows.reduce((s, r) => s + Number(r.outflow), 0));
    res.json({
      success: true,
      data: {
        period_no: periodNo,
        rows: rows.map(r => ({ ...r, inflow: r2(r.inflow), outflow: r2(r.outflow), net: r2(r.inflow - r.outflow) })),
        total_inflow, total_outflow, net: r2(total_inflow - total_outflow),
      },
    });
  } catch (err) { fail(res, err); }
});

// GET /reports/ap-aging（供应商维度账龄）
router.get('/reports/ap-aging', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(a.supplier_name,'未命名供应商') AS supplier_name,
         SUM(a.amount - a.paid_amount) AS remaining,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) <= 0 THEN (a.amount - a.paid_amount) ELSE 0 END) AS b0,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 1 AND 30 THEN (a.amount - a.paid_amount) ELSE 0 END) AS b30,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 31 AND 60 THEN (a.amount - a.paid_amount) ELSE 0 END) AS b60,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 61 AND 90 THEN (a.amount - a.paid_amount) ELSE 0 END) AS b90,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) > 90 THEN (a.amount - a.paid_amount) ELSE 0 END) AS bm
       FROM fin_ap_docs a
       WHERE a.group_id <=> ? AND a.status IN ('open','matched','partial_paid')
       GROUP BY a.supplier_name
       HAVING remaining > 0
       ORDER BY remaining DESC`,
      [gid(req)]
    );
    const sum = (k) => r2(rows.reduce((s, r) => s + Number(r[k]), 0));
    res.json({
      success: true,
      data: {
        rows: rows.map(r => ({ ...r, remaining: r2(r.remaining), b0: r2(r.b0), b30: r2(r.b30), b60: r2(r.b60), b90: r2(r.b90), bm: r2(r.bm) })),
        totals: { remaining: sum('remaining'), b0: sum('b0'), b30: sum('b30'), b60: sum('b60'), b90: sum('b90'), bm: sum('bm') },
      },
    });
  } catch (err) { fail(res, err); }
});

// GET /reports/ar-aging（客户维度账龄）
router.get('/reports/ar-aging', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(c.name,'未命名客户') AS customer_name,
         SUM(a.amount - a.received_amount) AS remaining,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) <= 0 THEN (a.amount - a.received_amount) ELSE 0 END) AS b0,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 1 AND 30 THEN (a.amount - a.received_amount) ELSE 0 END) AS b30,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 31 AND 60 THEN (a.amount - a.received_amount) ELSE 0 END) AS b60,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) BETWEEN 61 AND 90 THEN (a.amount - a.received_amount) ELSE 0 END) AS b90,
         SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(a.due_date, CURDATE())) > 90 THEN (a.amount - a.received_amount) ELSE 0 END) AS bm
       FROM fin_ar_docs a
       JOIN fin_customers c ON a.customer_id = c.id
       WHERE a.group_id <=> ? AND a.status IN ('open','matched','partial_paid')
       GROUP BY c.name
       HAVING remaining > 0
       ORDER BY remaining DESC`,
      [gid(req)]
    );
    const sum = (k) => r2(rows.reduce((s, r) => s + Number(r[k]), 0));
    res.json({
      success: true,
      data: {
        rows: rows.map(r => ({ ...r, remaining: r2(r.remaining), b0: r2(r.b0), b30: r2(r.b30), b60: r2(r.b60), b90: r2(r.b90), bm: r2(r.bm) })),
        totals: { remaining: sum('remaining'), b0: sum('b0'), b30: sum('b30'), b60: sum('b60'), b90: sum('b90'), bm: sum('bm') },
      },
    });
  } catch (err) { fail(res, err); }
});

// GET /reports/expenses（部门 × 费用类型）
router.get('/reports/expenses', async (req, res) => {
  try {
    const where = ['e.group_id <=> ?'];
    const params = [gid(req)];
    if (req.query.department) { where.push('e.department = ?'); params.push(req.query.department); }
    if (req.query.expense_type) { where.push('e.expense_type = ?'); params.push(req.query.expense_type); }
    if (req.query.period_no) { where.push("DATE_FORMAT(e.exp_date, '%Y-%m') = ?"); params.push(req.query.period_no); }
    const whereSql = where.join(' AND ');
    const [rows] = await pool.query(
      `SELECT COALESCE(e.department, '未分配部门') AS department,
              e.expense_type,
              COUNT(*) AS doc_count,
              COALESCE(SUM(e.amount),0) AS amount,
              COALESCE(SUM(e.amount + e.tax_amount),0) AS total_amount
       FROM fin_expenses e
       WHERE ${whereSql}
       GROUP BY e.department, e.expense_type
       ORDER BY e.department, e.expense_type`,
      params
    );
    const data = rows.map(r => ({ ...r, amount: r2(r.amount), total_amount: r2(r.total_amount) }));
    res.json({
      success: true,
      data: {
        rows: data,
        totals: {
          doc_count: rows.reduce((s, r) => s + Number(r.doc_count), 0),
          amount: r2(rows.reduce((s, r) => s + Number(r.amount), 0)),
          total_amount: r2(rows.reduce((s, r) => s + Number(r.total_amount), 0)),
        },
      },
    });
  } catch (err) { fail(res, err); }
});

module.exports = router;
