/**
 * 演示模拟数据端点
 *
 * 服务端内存维护 5 台机器的模拟生产状态，每秒自动更新。
 * 客户端轮询 GET /api/demo/production-state 获取最新数据。
 * 电脑和手机同时轮询 → 双端看到完全相同的实时数字。
 */

const express = require('express');
const router = express.Router();

// ==================== 常量 ====================

const COST_RATES = {
  printing: 0.08,   // 印刷 8分/印
  folding: 0.03,    // 折页 3分/张
  gluing: 0.05,     // 糊盒 5分/个
};

// ==================== 模拟工单模板 ====================

function makeJob(orderNo, jobName, ownerGroup, totalCount, estimatedHours, completedSeed) {
  return {
    orderNo,
    jobName,
    ownerGroup,
    totalCount,
    completedCount: completedSeed || 0,
    startTime: new Date(Date.now() - (estimatedHours || 4) * 3600000 * (completedSeed / totalCount)).toISOString(),
    estimatedHours: estimatedHours || 6,
  };
}

// ==================== 初始机器状态 ====================

function buildInitialState() {
  return [
    {
      id: 'machine-1',
      name: '印刷机1号',
      type: 'printing',
      isShared: true,
      status: 'running',
      speedPerTick: 3,        // 每秒+3印 (模拟10800印/时)
      costRate: COST_RATES.printing,
      currentJob: makeJob('WO-0805-001', '画册封面印刷', '周总', 50000, 7, 12450),
      queue: [
        makeJob('WO-0805-005', '包装盒印刷', '李总', 30000, 5, 0),
      ],
    },
    {
      id: 'machine-2',
      name: '印刷机2号',
      type: 'printing',
      isShared: true,
      status: 'running',
      speedPerTick: 2.5,      // 每秒+2.5印 (模拟9000印/时)
      costRate: COST_RATES.printing,
      currentJob: makeJob('WO-0805-002', '包装盒印刷', '李总', 30000, 5, 5200),
      queue: [
        makeJob('WO-0805-006', '宣传单页印刷', '王总', 20000, 3.5, 0),
      ],
    },
    {
      id: 'machine-3',
      name: '印刷机3号',
      type: 'printing',
      isShared: true,
      status: 'running',
      speedPerTick: 2,        // 每秒+2印 (模拟7200印/时)
      costRate: COST_RATES.printing,
      currentJob: makeJob('WO-0805-003', '宣传单页印刷', '王总', 20000, 4, 3100),
      queue: [
        makeJob('WO-0805-007', '说明书印刷', '周总', 40000, 6, 0),
      ],
    },
    {
      id: 'machine-4',
      name: '折页机',
      type: 'folding',
      isShared: true,
      status: 'running',
      speedPerTick: 1,        // 每秒+1张
      costRate: COST_RATES.folding,
      currentJob: makeJob('WO-0805-004', '画册封面折页', '李总', 30000, 10, 12000),
      queue: [
        makeJob('WO-0805-008', '说明书折页', '周总', 50000, 12, 0),
        makeJob('WO-0805-010', '宣传单页折页', '王总', 15000, 4, 0),
      ],
    },
    {
      id: 'machine-5',
      name: '糊盒机',
      type: 'gluing',
      isShared: true,
      status: 'running',
      speedPerTick: 0.8,      // 每秒+0.8个
      costRate: COST_RATES.gluing,
      currentJob: makeJob('WO-0805-009', '药盒糊盒', '王总', 15000, 8, 4500),
      queue: [
        makeJob('WO-0805-011', '包装盒糊盒', '李总', 20000, 9, 0),
      ],
    },
  ];
}

// ==================== 月度汇总种子 ====================

function buildMonthlySummary() {
  return {
    '周总': { totalImpressions: 238000, totalCost: 19040, printing: 200000, folding: 28000, gluing: 10000 },
    '李总': { totalImpressions: 180000, totalCost: 14400, printing: 150000, folding: 22000, gluing: 8000 },
    '王总': { totalImpressions: 95000, totalCost: 7600, printing: 80000, folding: 10000, gluing: 5000 },
  };
}

// ==================== 全局状态 ====================

let machines = buildInitialState();
let monthlySummary = buildMonthlySummary();
let lastTick = Date.now();
let tickCount = 0;

// ==================== 每秒更新逻辑 ====================

function tick() {
  tickCount++;
  lastTick = Date.now();

  machines = machines.map(m => {
    if (m.status !== 'running') return m;
    if (!m.currentJob) return m;

    const job = { ...m.currentJob };
    const increment = m.speedPerTick + (Math.random() - 0.5) * 0.4; // 加随机抖动
    job.completedCount = Math.min(job.totalCount, job.completedCount + Math.max(0, increment));

    // 月度汇总微增（跨机型）
    const bossName = job.ownerGroup;
    if (monthlySummary[bossName]) {
      monthlySummary = { ...monthlySummary };
      monthlySummary[bossName] = { ...monthlySummary[bossName] };
      monthlySummary[bossName].totalImpressions += Math.round(increment);
      monthlySummary[bossName].totalCost += Math.round(increment * m.costRate);
      if (m.type === 'printing') monthlySummary[bossName].printing += Math.round(increment);
      if (m.type === 'folding') monthlySummary[bossName].folding += Math.round(increment);
      if (m.type === 'gluing') monthlySummary[bossName].gluing += Math.round(increment);
    }

    // 检查工单是否完成
    if (job.completedCount >= job.totalCount) {
      const finishedJob = job;
      // 取出队列第一个
      const nextQueue = [...(m.queue || [])];
      const nextJob = nextQueue.shift();
      if (nextJob) {
        nextJob.startTime = new Date().toISOString();
        nextJob.completedCount = 0;
      }
      return {
        ...m,
        currentJob: nextJob || null,
        queue: nextQueue,
        status: nextJob ? 'running' : 'idle',
        finishedJob, // 保留刚完成的工单供展示
      };
    }

    return { ...m, currentJob: job };
  });
}

// 启动定时器
const tickInterval = setInterval(tick, 1000);

// ==================== API 端点 ====================

/**
 * GET /api/demo/production-state
 * 返回全部机器当前状态 + 月度汇总 + 元数据
 */
router.get('/production-state', (req, res) => {
  // 构建机器快照（去掉内部字段）
  const snapshot = machines.map(m => ({
    id: m.id,
    name: m.name,
    type: m.type,
    isShared: m.isShared,
    status: m.status,
    speedPerTick: m.speedPerTick,
    costRate: m.costRate,
    currentJob: m.currentJob ? {
      orderNo: m.currentJob.orderNo,
      jobName: m.currentJob.jobName,
      ownerGroup: m.currentJob.ownerGroup,
      totalCount: m.currentJob.totalCount,
      completedCount: Math.round(m.currentJob.completedCount),
      startTime: m.currentJob.startTime,
      estimatedHours: m.currentJob.estimatedHours,
    } : null,
    queue: (m.queue || []).map(q => ({
      orderNo: q.orderNo,
      jobName: q.jobName,
      ownerGroup: q.ownerGroup,
      totalCount: q.totalCount,
    })),
    // 计算派生字段
    progress: m.currentJob
      ? Math.round((m.currentJob.completedCount / m.currentJob.totalCount) * 1000) / 10
      : 0,
    remainingCount: m.currentJob
      ? Math.max(0, m.currentJob.totalCount - Math.round(m.currentJob.completedCount))
      : 0,
    estimatedMinutesLeft: m.currentJob && m.speedPerTick > 0
      ? Math.round((m.currentJob.totalCount - m.currentJob.completedCount) / m.speedPerTick / 60)
      : 0,
    currentCost: m.currentJob
      ? Math.round(m.currentJob.completedCount * m.costRate * 100) / 100
      : 0,
    speedPerHour: Math.round(m.speedPerTick * 3600),
  }));

  // 月度汇总快照
  const summarySnapshot = Object.entries(monthlySummary).map(([boss, data]) => ({
    bossName: boss,
    totalImpressions: data.totalImpressions,
    totalCost: data.totalCost,
    printing: data.printing,
    folding: data.folding,
    gluing: data.gluing,
  }));

  res.json({
    success: true,
    data: {
      machines: snapshot,
      monthlySummary: summarySnapshot,
      tickCount,
      lastTick,
    },
  });
});

/**
 * GET /api/demo/reset
 * 重置模拟数据到初始状态
 */
router.post('/reset', (req, res) => {
  machines = buildInitialState();
  monthlySummary = buildMonthlySummary();
  tickCount = 0;
  lastTick = Date.now();
  res.json({ success: true, message: '模拟数据已重置' });
});

// 清理（进程退出时）
process.on('SIGTERM', () => clearInterval(tickInterval));
process.on('SIGINT', () => clearInterval(tickInterval));

module.exports = router;
