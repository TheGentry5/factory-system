/**
 * AI 周报生成端点
 *
 * GET /api/reports/weekly?date=2026-08-05
 * → 返回产能分析/瓶颈诊断/急单追踪/决策建议
 */

const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');

// ==================== 工厂配置 ====================
const PRINTERS = [
  { name: '印刷机1号', speed: 10800, type: 'printing' },
  { name: '印刷机2号', speed: 9000,  type: 'printing' },
  { name: '印刷机3号', speed: 7200,  type: 'printing' },
];
const FOLDER = { name: '折页机', speed: 3600, type: 'folding' };
const GLUER  = { name: '糊盒机', speed: 2880, type: 'gluing' };
const ALL_MACHINES = [...PRINTERS, FOLDER, GLUER];
const SHIFT_H = 16;
const WORK_DAYS = 7;

// ==================== 分析引擎 ====================

function analyzeWeek(orders, reports) {
  // --- 基础统计 ---
  const totalOrders = orders.length;
  const totalQty = orders.reduce((s, o) => s + parseFloat(o.quantity || 0), 0);
  const rushOrders = orders.filter(o => o.priority === 'urgent' || o.priority === 'high');
  const largeOrders = orders.filter(o => parseFloat(o.quantity || 0) >= 50000);
  const completedOrders = orders.filter(o => o.status === 'completed');
  const inProgressOrders = orders.filter(o => o.status === 'in_progress');
  const overdueOrders = orders.filter(o => {
    if (o.status === 'completed') return false;
    if (!o.delivery_date) return false;
    return new Date(o.delivery_date) < new Date();
  });

  const completedQty = completedOrders.reduce((s, o) => s + parseFloat(o.completed_quantity || 0), 0);
  const onTimeCount = completedOrders.filter(o => {
    if (!o.delivery_date || !o.actual_end) return true;
    return new Date(o.actual_end) <= new Date(o.delivery_date);
  }).length;
  const onTimeRate = completedOrders.length > 0
    ? Math.round(onTimeCount / completedOrders.length * 1000) / 10 : 0;

  // --- 估算机器工时 ---
  const machineHours = {};
  for (const m of ALL_MACHINES) {
    const machineReports = reports.filter(r =>
      (r.machine_name || '').includes(m.name) ||
      (r.machine_name || '').includes(m.name.slice(0, -1)) // fallback match
    );
    const productiveH = machineReports.reduce((s, r) => s + parseFloat(r.work_hours || 0), 0);
    // 如果报工数据不足，用订单量反推
    const estimatedH = machineReports.length > 0
      ? productiveH
      : (m.type === 'printing'
          ? orders.filter(o => o.status === 'in_progress' || o.status === 'completed')
              .reduce((s, o) => s + parseFloat(o.quantity || 0) / m.speed, 0) / PRINTERS.length
          : orders.filter(o => o.status === 'in_progress' || o.status === 'completed')
              .reduce((s, o) => s + parseFloat(o.quantity || 0) / m.speed, 0));

    const totalAvailable = SHIFT_H * WORK_DAYS;
    const util = Math.min(100, Math.round(estimatedH / totalAvailable * 1000) / 10);
    machineHours[m.name] = { productiveH: estimatedH, totalAvailable, util, type: m.type, speed: m.speed };
  }

  const avgUtil = Math.round(
    Object.values(machineHours).reduce((s, m) => s + m.util, 0) / Object.values(machineHours).length * 10
  ) / 10;

  // --- 瓶颈诊断 ---
  const sortedByUtil = Object.entries(machineHours)
    .sort((a, b) => b[1].util - a[1].util);
  const bottleneck = sortedByUtil[0];
  const printersAvgUtil = Math.round(
    PRINTERS.reduce((s, p) => s + (machineHours[p.name]?.util || 0), 0) / PRINTERS.length * 10
  ) / 10;
  const postProcessAvgUtil = Math.round(
    ((machineHours[FOLDER.name]?.util || 0) + (machineHours[GLUER.name]?.util || 0)) / 2 * 10
  ) / 10;

  // --- 各业务组统计 ---
  const ownerStats = {};
  for (const o of orders) {
    const owner = o.owner || o.assigned_to || '未分配';
    if (!ownerStats[owner]) ownerStats[owner] = { orders: 0, qty: 0, completed: 0, rush: 0 };
    ownerStats[owner].orders++;
    ownerStats[owner].qty += parseFloat(o.quantity || 0);
    if (o.status === 'completed') ownerStats[owner].completed++;
    if (o.priority === 'urgent' || o.priority === 'high') ownerStats[owner].rush++;
  }

  // --- 决策建议 ---
  const recommendations = [];
  if (bottleneck[1].util > 85) {
    recommendations.push({
      level: 'critical',
      title: `⚠️ ${bottleneck[0]} 已成瓶颈`,
      detail: `利用率 ${bottleneck[1].util}%，超出安全线 85%。建议：安排加班/加一台设备/外包部分订单。`,
    });
  }
  if (overdueOrders.length > 0) {
    recommendations.push({
      level: 'warning',
      title: `🔴 ${overdueOrders.length} 单已逾期`,
      detail: `逾期订单：${overdueOrders.map(o => o.order_no || o.id).join('、')}。建议立即联系客户沟通延后交期。`,
    });
  }
  if (rushOrders.length > 0) {
    const rushCompleted = rushOrders.filter(o => o.status === 'completed').length;
    const rushRate = Math.round(rushCompleted / rushOrders.length * 100);
    recommendations.push({
      level: rushRate >= 90 ? 'info' : 'warning',
      title: `📋 急单进度：${rushCompleted}/${rushOrders.length} (${rushRate}%)`,
      detail: rushRate >= 90
        ? '急单执行良好，继续保持。'
        : `还有 ${rushOrders.length - rushCompleted} 单急单未完成，建议优先排入下周计划。`,
    });
  }
  if (printersAvgUtil < 40 && postProcessAvgUtil > 80) {
    recommendations.push({
      level: 'info',
      title: '💡 产能结构建议',
      detail: `印刷机平均利用率仅 ${printersAvgUtil}%，但后道设备 ${postProcessAvgUtil}%。可考虑接更多印刷-only订单填补印刷机闲置。`,
    });
  }
  if (totalOrders < 30) {
    recommendations.push({
      level: 'info',
      title: '📈 订单量偏低',
      detail: `本周仅 ${totalOrders} 单，设备整体利用率不足。建议加大接单力度或考虑设备租赁。`,
    });
  }
  recommendations.push({
    level: 'info',
    title: '✅ AI排产建议',
    detail: '下周排产时，同类产品集中排入减少换线；大批量订单优先分配印刷机1号(10800印/时)；急单预留前3天产能余量。',
  });

  return {
    summary: {
      totalOrders, totalQty, completedOrders: completedOrders.length,
      inProgress: inProgressOrders.length, overdue: overdueOrders.length,
      onTimeRate, completedQty,
      rushCount: rushOrders.length, largeCount: largeOrders.length,
    },
    machineUtilization: Object.entries(machineHours).map(([name, data]) => ({
      name, ...data, productiveH: Math.round(data.productiveH * 10) / 10,
    })),
    bottleneck: {
      machine: bottleneck[0],
      utilization: bottleneck[1].util,
      printersAvgUtil,
      postProcessAvgUtil,
      avgUtil,
    },
    ownerBreakdown: Object.entries(ownerStats).map(([owner, data]) => ({
      owner, ...data, qty: Math.round(data.qty),
    })),
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

// ==================== 端点 ====================

router.get('/weekly', async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().slice(0, 10);
    // 本周一
    const d = new Date(targetDate);
    const dayOfWeek = d.getDay() || 7; // 周日=7
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek + 1);
    const weekStart = monday.toISOString().slice(0, 10);
    const weekEnd = targetDate;

    // 尝试从数据库拉数据
    let orders = [];
    let reports = [];
    let fromDB = false;

    try {
      const [orderRows] = await pool.query(
        `SELECT * FROM production_orders
         WHERE DATE(created_at) BETWEEN ? AND ?
         ORDER BY priority, delivery_date`,
        [weekStart, weekEnd]
      );
      if (orderRows.length > 0) {
        orders = orderRows;
        fromDB = true;
      }
    } catch (e) { /* 表不存在或数据库未连接 */ }

    try {
      const [reportRows] = await pool.query(
        `SELECT * FROM production_reports
         WHERE DATE(report_date) BETWEEN ? AND ?`,
        [weekStart, weekEnd]
      );
      reports = reportRows;
    } catch (e) { /* ignore */ }

    // 如果数据库无数据，使用演示数据
    if (!fromDB) {
      orders = generateDemoOrders(weekStart);
    }

    const analysis = analyzeWeek(orders, reports);
    analysis.weekStart = weekStart;
    analysis.weekEnd = weekEnd;
    analysis.dataSource = fromDB ? '数据库' : '演示数据';

    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 演示数据生成 ====================
function generateDemoOrders(weekStart) {
  const products = ['画册封面','说明书','包装盒','宣传单页','名片','海报','标签','手提袋','药盒','信封'];
  const owners = ['周总','李总','王总'];
  const statuses = ['completed','completed','completed','completed','in_progress','in_progress','in_progress','pending','pending','draft'];

  const orders = [];
  for (let i = 0; i < 45; i++) {
    const product = products[i % products.length];
    const qty = [500, 2000, 5000, 8000, 12000, 15000, 25000, 40000, 60000, 80000][i % 10];
    const status = statuses[i % statuses.length];
    const priority = i < 8 ? 'urgent' : i < 20 ? 'high' : i < 35 ? 'normal' : 'low';
    const deliveryDate = new Date(weekStart);
    deliveryDate.setDate(deliveryDate.getDate() + [1,1,2,2,3,3,5,5,7,10][i % 10]);

    orders.push({
      id: i + 1,
      order_no: `WO-${weekStart.replace(/-/g,'')}-${String(i+1).padStart(3,'0')}`,
      product_name: product,
      customer_name: ['陈氏药业','华美出版社','星巴克','联合利华'][i % 4],
      quantity: qty,
      completed_quantity: status === 'completed' ? qty : Math.floor(qty * [0.3,0.5,0.7,0.9][i%4]),
      status,
      priority,
      delivery_date: deliveryDate.toISOString().slice(0, 10),
      actual_end: status === 'completed' ? deliveryDate.toISOString().slice(0, 10) : null,
      owner: owners[i % 3],
      assigned_to: owners[i % 3],
    });
  }
  return orders;
}

module.exports = router;
