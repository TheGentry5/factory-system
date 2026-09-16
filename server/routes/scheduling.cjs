/**
 * AI 排产路由（工序级周排产表）
 *
 * GET /api/production/schedule-suggestion  → 触发生成周排产表
 * GET /api/production/schedule-table       → 查询最近一次排产表
 * GET /api/production/ai-history           → 历史记录
 */

const express = require('express');
const router = express.Router();
const pool = require('../db.cjs');
const { chat: deepseekChat, chatStream } = require('../lib/deepseek.cjs');

// 排产需一次生成长 JSON（上万 token），放宽超时避免默认 30s 中断
const AI_SCHEDULING_TIMEOUT_MS = 180000;
const { createJob, updateJob, getJob } = require('../lib/job-manager.cjs');
const { groupFilter } = require('../middleware/group-context.cjs');

// ==================== 建表（幂等） ====================

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        suggestion_type VARCHAR(50) NOT NULL DEFAULT 'weekly_schedule',
        input_summary TEXT,
        result_json JSON,
        risk_warnings JSON,
        reasoning TEXT,
        triggered_by VARCHAR(50),
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        group_id VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type_time (suggestion_type, generated_at DESC),
        INDEX idx_group (group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL COMMENT '关联 ai_suggestions.id',
        order_no VARCHAR(50) NOT NULL,
        product_name VARCHAR(200),
        step_order INT,
        step_name VARCHAR(100),
        machine_name VARCHAR(200),
        machine_owner VARCHAR(50) COMMENT '设备归属组',
        scheduled_date DATE,
        day_label VARCHAR(20) COMMENT '周一/周二...',
        shift VARCHAR(20) COMMENT '早班/中班/晚班',
        start_time VARCHAR(10) COMMENT 'HH:MM',
        end_time VARCHAR(10) COMMENT 'HH:MM',
        duration_hours DECIMAL(5,1),
        setup_hours DECIMAL(5,1) DEFAULT 0,
        production_qty INT,
        hourly_cost DECIMAL(10,2) DEFAULT 0,
        subtotal_cost DECIMAL(10,2) DEFAULT 0 COMMENT '机时费=时长×小时费率',
        INDEX idx_schedule (schedule_id),
        INDEX idx_order (order_no),
        INDEX idx_machine (machine_name),
        INDEX idx_date (scheduled_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='工序级周排产表明细';
    `);
    // 工序模板表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS process_routing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_type VARCHAR(100) NOT NULL COMMENT '产品类型',
        step_order INT NOT NULL COMMENT '工序顺序',
        step_name VARCHAR(100) NOT NULL COMMENT '工序名称',
        machine_type VARCHAR(100) COMMENT '所需设备类型',
        setup_minutes INT DEFAULT 30 COMMENT '换线/调试时间(分钟)',
        speed_per_hour INT DEFAULT 5000 COMMENT '标准产能/时',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_type_step (product_type, step_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 设备注册表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS production_machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(200) NOT NULL,
        machine_type VARCHAR(100) COMMENT '印刷/折页/糊盒/切纸',
        owner_group_id VARCHAR(50) COMMENT '归属业务组',
        hourly_cost DECIMAL(10,2) DEFAULT 150 COMMENT '机时费(元/时)',
        daily_available_hours INT DEFAULT 16 COMMENT '每日可用工时',
        status TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_name (machine_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 种子数据：工序模板（幂等）
    const [routingCount] = await pool.query('SELECT COUNT(*) AS c FROM process_routing');
    if (routingCount[0].c === 0) {
      await pool.query(`
        INSERT INTO process_routing (product_type, step_order, step_name, machine_type, setup_minutes, speed_per_hour) VALUES
        ('四色三折说明书',1,'四色印刷','印刷机',30,9000),
        ('四色三折说明书',2,'折页','折页机',15,3600),
        ('四色三折说明书',3,'裁切','切纸机',10,5000),
        ('卡纸包装盒',1,'四色印刷','印刷机',45,8000),
        ('卡纸包装盒',2,'表面处理(覆膜/上光)','覆膜机',20,3000),
        ('卡纸包装盒',3,'模切','模切机',30,2500),
        ('卡纸包装盒',4,'糊盒','糊盒机',20,2880)
      `);
    }

    // 种子数据：设备注册（幂等）
    const [machineCount] = await pool.query('SELECT COUNT(*) AS c FROM production_machines');
    if (machineCount[0].c === 0) {
      await pool.query(`
        INSERT INTO production_machines (machine_name, machine_type, owner_group_id, hourly_cost, daily_available_hours) VALUES
        ('印刷机1号','印刷机','周总',150,16),
        ('印刷机2号','印刷机','李总',140,16),
        ('印刷机3号','印刷机','王总',130,16),
        ('折页机','折页机',NULL,80,16),
        ('糊盒机','糊盒机',NULL,100,16),
        ('切纸机','切纸机',NULL,60,16),
        ('覆膜机','覆膜机',NULL,90,16),
        ('模切机','模切机',NULL,110,16)
      `);
    }

    console.log('[ai-scheduling] 4张表已就绪 (含种子数据)');
  } catch (err) {
    console.error('[ai-scheduling] 建表失败:', err.message);
  }
})();

// ==================== 工具函数 ====================

const round2 = v => Math.round((v || 0) * 100) / 100;

function priorityWeight(p) {
  const map = { urgent: 4, high: 3, normal: 2, low: 1 };
  return map[p] || 2;
}

function extractJson(text) {
  // 先尝试直接解析
  try { return JSON.parse(text); } catch (_) {}

  // 去掉 markdown 代码块标记
  let cleaned = text
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();

  // 尝试解析清理后的文本
  try { return JSON.parse(cleaned); } catch (_) {}

  // 提取第一个 { 到最后一个 } 之间的内容
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  // 最后尝试：正则匹配
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }

  return null;
}

function getThisWeekRange() {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = d => d.toISOString().split('T')[0];
  return { monday: fmt(monday), friday: fmt(friday), dates: [] };
}

/** 匹配产品类型 → 工序路由 */
function matchProductType(productName) {
  const lower = (productName || '').toLowerCase();
  if (lower.includes('包装盒') || lower.includes('礼盒') || lower.includes('卡盒') || lower.includes('彩盒')) return '卡纸包装盒';
  if (lower.includes('说明书') || lower.includes('手册') || lower.includes('画册') || lower.includes('宣传册') || lower.includes('折页')) return '四色三折说明书';
  // 默认用说明书路线（大多数印刷品可套用）
  return '四色三折说明书';
}

// ==================== 核心端点 ====================

/**
 * GET /schedule-suggestion
 * 触发生成工序级周排产表
 */
router.get('/schedule-suggestion', async (req, res) => {
  const { triggeredBy = '系统管理者', prioritize } = req.query;
  const isUrgentInsert = !!prioritize;
  const orderFilter = groupFilter(req, 'po');
  const reportFilter = groupFilter(req, 'pr');

  try {
    // ── 1. 查询未完工单 ──
    const [orders] = await pool.query(`
      SELECT po.order_no, po.product_name, po.customer_name,
             po.quantity, po.completed_quantity,
             (po.quantity - po.completed_quantity) AS remaining,
             po.priority, po.delivery_date, po.assigned_to, po.status
      FROM production_orders po
      WHERE po.status IN ('draft', 'pending', 'in_progress')
        ${orderFilter.sql}
      ORDER BY FIELD(po.priority, 'urgent', 'high', 'normal', 'low'),
               po.delivery_date ASC, po.planned_end ASC
    `, orderFilter.params);

    if (orders.length === 0) {
      return res.status(400).json({ success: false, message: '当前没有需要排产的工单' });
    }

    // 限制排产数量：一周产能有限，只排前 8 个最紧急工单
    const topOrders = orders.slice(0, 10);

    // ── 2. 读取工序模板 ──
    const [allRoutings] = await pool.query(
      `SELECT * FROM process_routing ORDER BY product_type, step_order`
    );
    const routingByProduct = {};
    allRoutings.forEach(r => {
      if (!routingByProduct[r.product_type]) routingByProduct[r.product_type] = [];
      routingByProduct[r.product_type].push(r);
    });

    // ── 3. 读取设备注册表 ──
    const [machines] = await pool.query(
      `SELECT * FROM production_machines WHERE status = 1 ORDER BY owner_group_id, machine_type`
    );

    // ── 4. 查询近 60 天历史产能 ──
    const [history] = await pool.query(`
      SELECT pr.machine_name AS machine, pr.shift,
             COUNT(DISTINCT pr.report_date) AS work_days,
             ROUND(SUM(pr.output_quantity)/NULLIF(COUNT(DISTINCT pr.report_date),0),0) AS avg_daily
      FROM production_reports pr
      WHERE pr.report_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
        AND pr.status != 'rejected' ${reportFilter.sql}
      GROUP BY pr.machine_name, pr.shift
      ORDER BY avg_daily DESC LIMIT 10
    `, reportFilter.params);

    // ── 5. 构建 Prompt ──
    const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayName = dayNames[today.getDay()];

    // 本周日期列表（周一至周五）
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay()===0?6:today.getDay()-1));
    const weekDates = [];
    const dayLabels = ['周一','周二','周三','周四','周五'];
    for (let i=0; i<5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate()+i);
      weekDates.push({ label: dayLabels[i], date: d.toISOString().split('T')[0] });
    }

    // 工单表（含工序路线）
    const orderLines = topOrders.map((o,i) => {
      const productType = matchProductType(o.product_name);
      const routing = routingByProduct[productType] || [];
      const steps = routing.map(r =>
        `${r.step_order}.${r.step_name}(${r.machine_type},装换${r.setup_min}min,产能${r.speed_per_hour}/时)`
      ).join(' → ');
      return `| ${i+1} | ${o.order_no} | ${o.product_name}(${productType}) | ${o.remaining} | ${o.priority} | ${o.delivery_date||'-'} | ${steps} |`;
    }).join('\n');

    // 设备表
    const machineLines = machines.map(m =>
      `| ${m.machine_name} | ${m.machine_type} | ${m.owner_group_id} | ¥${m.hourly_cost}/时 | ${m.daily_available_hours}h/天 |`
    ).join('\n');

    // 产能参考
    const historyLines = history.map(h =>
      `| ${h.machine} | ${h.shift} | ${h.work_days}天 | 日均${h.avg_daily} |`
    ).join('\n');

    const systemPrompt = `你是一个印刷工厂的高级排产工程师，负责生成周生产排产表。

## 核心约束（违反任何一条排产表即无效）

### 1. 工序顺序（硬约束）
每个工单的工序必须按模板顺序执行（stepOrder 1→2→3→...），不可跳过或颠倒。
同一工单的下一道工序的开始时间 >= 上一道工序的结束时间。

### 2. 设备互斥（硬约束）★★★ 最重要
**同一台机器在同一时间只能做一个工单的一道工序。**
输出前必须逐台检查：该机器的所有排产时间段是否有重叠，有重叠则重新排。
例如：海德堡SM74在周三08:00-12:00做了WO-001，就不能同时在08:00-10:00做WO-002。

### 3. 工时计算（精确公式）
生产时间 = productionQty / speed_per_hour
换线时间 = setup_minutes / 60（换产品时需要，同产品连续做免换线）
durationHours = 生产时间 + 换线时间
- productionQty 必须等于该工单的剩余数量
- 同一机器上切换不同产品时：必须加 30-60 分钟换线/调试时间（换物料+校机+调色）
- durationHours 四舍五入到0.5小时

### 4. 工时约束
每台机器每天的总 durationHours 之和 <= daily_available_hours
如果超了，把工单延后到下一天或加晚班。

### 5. 产能缓冲（重要）
每天每台机器的总排产时间不超过 daily_available_hours × 80%。
剩余 20% 产能作为"加急缓冲带"，预留给可能临时插入的 urgent 订单。
如果某天某机器已经排到 80%，新工单应延后到下一天。

### 6. 可用排产日（强制执行）
只能从今天及之后的日期开始排产。
**关键规则：必须将工单均匀分布到所有可用排产日，禁止全挤在第一天。**
例如有3个可用日(周三/四/五)和8个工单→每天排2-3个工单，分散开。
单日某个机器上超过3个工单即为不合理，必须延后到次日。

### 7. 优先级规则
urgent > high > normal > low，同优先级按交期早>晚。
但也要考虑工序间的等待——前序工序完成后才能开始后续工序。

### 8. 跨组设备
工序的设备类型决定了可用哪些机器。如果设备归属另一个组，照常排上，
machineOwner 写实际归属组，月底按此分摊机时费。

## 输出格式 — 只返回纯 JSON（不要任何 markdown 标记）
{
  "scheduleEntries": [
    {
      "orderNo": "工单号",
      "productName": "产品名",
      "stepOrder": 1,
      "stepName": "工序名",
      "machineName": "具体设备名",
      "machineOwner": "设备归属group",
      "dayLabel": "周X",
      "date": "YYYY-MM-DD",
      "shift": "早班/中班/晚班",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "durationHours": 数字(含生产+换线),
      "setupHours": 换线小时数,
      "productionQty": 生产数量,
      "hourlyCost": 机时费率,
      "subtotalCost": 数字(最多2位小数)
    }
  ],
  "machineTimeSummary": [
    { "ownerGroup": "group_a", "machineName": "设备名", "totalHours": 占用总时长, "totalCost": 总费用 }
  ],
  "riskWarnings": [
    { "orderNo": "工单号", "severity": "high/medium/low", "message": "必须说明具体风险和产能计算依据" }
  ],
  "reasoning": "300字以内",
  "summary": "总工单数X，工序总数X，跨组协作X次，高风险X个，产能利用率约X%"
}

## 自检清单（输出 JSON 前逐项确认）
□ 每台机器的时间段无重叠？
□ 同一工单的工序顺序正确？
□ 每个工单每道工序都分配了？
□ durationHours = 数量/产能 + 换线？
□ 没有排在过去的日期？
□ 跨组设备标记了正确的 machineOwner？
□ 每台机器每天排产不超过 80% 容量（留20%给加急单）？
□ **工单已均匀分布到所有可用日期，没有全挤在第一天**？`;

    // 只保留今天及之后的可用排产日
    const availableDays = weekDates.filter(d => d.date >= todayStr);
    const availableDaysStr = availableDays.map(d => `${d.label}(${d.date})`).join('、');

    const userPrompt = `## 排产任务
今天是 ${todayStr} ${todayName}。可用排产日：${availableDaysStr}（共 ${availableDays.length} 天）。
过去的日期不能排产。

## 工单及工序路线
| # | 工单号 | 产品 | 剩余 | 优先级 | 交期 | 工序路线(step.工序(设备,装换min,产能/时)) |
|---|--------|------|------|--------|------|------------------------------------------|
${orderLines}

## 设备资源（每台每天最多可用时长见 可用工时）
| 设备名称 | 类型 | 归属 | 机时费 | 可用工时/天 |
|----------|------|------|--------|------------|
${machineLines}

## 历史日均产能参考
${history.length > 0 ? history.map(h=>`- ${h.machine}(${h.shift}): 日均${h.avg_daily}`).join('\n') : '暂无历史数据，用工单剩余量和设备标准产能计算'}

## 排产要求
1. 对每个工单的每道工序，指定具体机器、日期、时段
2. **每台机器同一时间只能做一件事**——输出前逐台检查时段是否重叠
3. 工序耗时 = 剩余数量÷产能 + 换线时间，精确到0.5小时
4. 充分利用所有可用排产日，不要把全部工单挤在同一天
5. **每台机器每天排产不超过其可用工时的 80%，留 20% 应对临时加急单**
6. 跨组设备直接使用，标记实际 machineOwner
${isUrgentInsert ? `\n## ⚠️ 加急插单模式\n工单 **${prioritize}** 是临时加急订单，必须排到本周最优位置。\n可以延后其他工单、使用缓冲带的20%产能、或建议加班。\n其他工单的交期尽量保证，但 ${prioritize} 优先级最高。` : ''}`;

    // ── 6. 调用 DeepSeek ──
    const aiResult = await deepseekChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 12288, temperature: 0.3, timeout: AI_SCHEDULING_TIMEOUT_MS });

    if (!aiResult.success) {
      return res.status(502).json({ success: false, message: aiResult.error });
    }

    // ── 7. 解析 ──
    const rawContent = aiResult.content;
    const parsed = extractJson(rawContent);
    if (parsed) {
      // 注入工单优先级到每个条目（AI 不输出 priority）
      const orderPriorityMap = {};
      orders.forEach(o => { orderPriorityMap[o.order_no] = o.priority; });
      (parsed.scheduleEntries || []).forEach(e => {
        if (!e.priority && orderPriorityMap[e.orderNo]) {
          e.priority = orderPriorityMap[e.orderNo];
        }
      });
      // 所有金额字段强制2位小数
      (parsed.scheduleEntries || []).forEach(e => {
        e.hourlyCost = round2(e.hourlyCost);
        e.subtotalCost = round2(e.subtotalCost);
        e.durationHours = round2(e.durationHours);
      });
      (parsed.machineTimeSummary || []).forEach(m => {
        m.totalHours = round2(m.totalHours);
        m.totalCost = round2(m.totalCost);
      });
    }
    if (!parsed || !parsed.scheduleEntries) {
      console.error('[ai-scheduling] Parse failed. First 300:', rawContent.substring(0, 300));
      console.error('[ai-scheduling] Last 300:', rawContent.substring(Math.max(0, rawContent.length - 300)));
      return res.status(500).json({
        success: false,
        message: 'AI 返回格式异常，请重试',
        hint: rawContent.substring(0, 500),
      });
    }

    // ── 8. 保存 ──
    let scheduleId = null;
    try {
      const inputSummary = `${topOrders.length}工单(共${orders.length}个未完工), ${machines.length}设备`;
      const [ins] = await pool.query(
        `INSERT INTO ai_suggestions (suggestion_type, input_summary, result_json, risk_warnings, reasoning, triggered_by, group_id)
         VALUES (?,?,?,?,?,?,?)`,
        [
          'weekly_schedule', inputSummary,
          JSON.stringify(parsed), JSON.stringify(parsed.riskWarnings||[]),
          parsed.reasoning||'', triggeredBy,
          req.isCrossGroup ? '__all__' : (req.groupId||null),
        ]
      );
      scheduleId = ins.insertId;

      // 保存排产明细
      const entries = parsed.scheduleEntries || [];
      for (const e of entries) {
        await pool.query(
          `INSERT INTO schedule_entries
           (schedule_id, order_no, product_name, step_order, step_name,
            machine_name, machine_owner, scheduled_date, day_label, shift,
            start_time, end_time, duration_hours, setup_hours,
            production_qty, hourly_cost, subtotal_cost)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            scheduleId, e.orderNo, e.productName, e.stepOrder, e.stepName,
            e.machineName, e.machineOwner, e.date||null, e.dayLabel, e.shift||'',
            e.startTime, e.endTime, round2(e.durationHours), round2(e.setupHours),
            e.productionQty||0, round2(e.hourlyCost), round2(e.subtotalCost),
          ]
        );
      }
    } catch (dbErr) {
      console.error('[ai-scheduling] 保存失败:', dbErr.message);
    }

    // ── 9. 返回 ──
    res.json({
      success: true,
      data: {
        id: scheduleId,
        scheduleEntries: parsed.scheduleEntries || [],
        machineTimeSummary: parsed.machineTimeSummary || [],
        riskWarnings: parsed.riskWarnings || [],
        reasoning: parsed.reasoning || '',
        summary: parsed.summary || '',
        weekDates,
        generatedAt: new Date().toISOString(),
        usage: aiResult.usage || null,
      },
    });

  } catch (err) {
    console.error('[ai-scheduling] 未知错误:', err);
    res.status(500).json({ success: false, message: 'AI 排产异常: '+err.message });
  }
});

/**
 * GET /schedule-suggestion-stream
 * 流式版本——SSE 推送，前端可逐条看到排产结果
 */
router.get('/schedule-suggestion-stream', async (req, res) => {
  const { triggeredBy = '系统管理者', prioritize } = req.query;
  const isUrgentInsert = !!prioritize;
  const orderFilter = groupFilter(req, 'po');
  const reportFilter = groupFilter(req, 'pr');

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── 数据准备（复用非流式逻辑）──
    const [orders] = await pool.query(`
      SELECT po.order_no, po.product_name, po.customer_name,
             po.quantity, po.completed_quantity,
             (po.quantity-po.completed_quantity) AS remaining,
             po.priority, po.delivery_date, po.assigned_to, po.status
      FROM production_orders po
      WHERE po.status IN ('draft','pending','in_progress') ${orderFilter.sql}
      ORDER BY FIELD(po.priority,'urgent','high','normal','low'), po.delivery_date
    `, orderFilter.params);

    if (orders.length === 0) {
      send('error', { message: '没有需要排产的工单' });
      res.end();
      return;
    }

    const topOrders = orders.slice(0, 10);
    const [allRoutings] = await pool.query('SELECT * FROM process_routing ORDER BY product_type, step_order');
    const routingByProduct = {};
    allRoutings.forEach(r => {
      if (!routingByProduct[r.product_type]) routingByProduct[r.product_type] = [];
      routingByProduct[r.product_type].push(r);
    });

    const [machines] = await pool.query('SELECT * FROM production_machines WHERE status=1 ORDER BY owner_group_id');

    const [history] = await pool.query(`
      SELECT pr.machine_name AS machine, pr.shift,
             COUNT(DISTINCT pr.report_date) AS work_days,
             ROUND(SUM(pr.output_quantity)/NULLIF(COUNT(DISTINCT pr.report_date),0),0) AS avg_daily
      FROM production_reports pr
      WHERE pr.report_date>=DATE_SUB(CURDATE(),INTERVAL 60 DAY) AND pr.status!='rejected' ${reportFilter.sql}
      GROUP BY pr.machine_name, pr.shift ORDER BY avg_daily DESC LIMIT 10
    `, reportFilter.params);

    // 构建 prompt（与 schedule-suggestion 相同逻辑）
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
    const monday = new Date(today);
    monday.setDate(today.getDate()-(today.getDay()===0?6:today.getDay()-1));
    const weekDates = [];
    ['周一','周二','周三','周四','周五'].forEach((l,i)=>{
      const d=new Date(monday);d.setDate(monday.getDate()+i);
      weekDates.push({label:l,date:d.toISOString().split('T')[0]});
    });
    const availableDays = weekDates.filter(d=>d.date>=todayStr);

    const matchProductType = (name) => {
      const l=(name||'').toLowerCase();
      if(l.includes('包装盒')||l.includes('礼盒')||l.includes('卡盒')) return '卡纸包装盒';
      return '四色三折说明书';
    };

    const orderLines = topOrders.map((o,i)=>{
      const pt=matchProductType(o.product_name);
      const r=routingByProduct[pt]||[];
      const steps=r.map(s=>`${s.step_order}.${s.step_name}(${s.machine_type},${s.setup_minutes}min,${s.speed_per_hour}/h)`).join('→');
      return `|${i+1}|${o.order_no}|${o.product_name}(${pt})|${o.remaining}|${o.priority}|${o.delivery_date||'-'}|${steps}|`;
    }).join('\n');

    const machineLines = machines.map(m=>`|${m.machine_name}|${m.machine_type}|${m.owner_group_id}|¥${m.hourly_cost}/h|${m.daily_available_hours}h/d|`).join('\n');

    const historyLines = history.map(h=>`- ${h.machine}(${h.shift}): 日均${h.avg_daily}`).join('\n');

    const systemPrompt = `你是印刷工厂高级排产工程师。根据工单工序路线、设备资源和交期生成周排产表。

## 核心约束
1. 工序顺序不可逆（stepOrder 1→2→3...）
2. 设备互斥：一台机器同时只能做一个工序
3. 工时 = 数量÷产能 + 换线(分钟/60)，精度0.5h
4. 每台机器每天排产≤可用工时×80%，留20%给加急
5. 必须均匀分布到所有可用日期，禁止挤在第一天
6. 换产品时加30-60min换线调试
${isUrgentInsert?`\n## ⚠️ 加急：${prioritize} 必须排到本周最优位置\n`:''
}## 输出 — 纯 JSON
{"scheduleEntries":[{"orderNo":"","productName":"","stepOrder":1,"stepName":"","machineName":"","machineOwner":"group_a","dayLabel":"周三","date":"2026-07-22","shift":"早班","startTime":"08:00","endTime":"08:30","durationHours":0.5,"setupHours":0.5,"productionQty":1000,"hourlyCost":150,"subtotalCost":75}],"machineTimeSummary":[{"ownerGroup":"","machineName":"","totalHours":0,"totalCost":0}],"riskWarnings":[{"orderNo":"","severity":"high","message":""}],"reasoning":"","summary":""}`;

    const userPrompt = `今天是${todayStr}${dayNames[today.getDay()]}。可用日：${availableDays.map(d=>d.label+'('+d.date+')').join('、')}（${availableDays.length}天）。

## 工单|#|工单号|产品(类型)|剩余|优先级|交期|工序路线
${orderLines}

## 设备|名称|类型|归属|机时费|可用工时/d
${machineLines}

## 历史产能
${historyLines||'无'}

要求：均匀分布到${availableDays.length}天，每台机器每天≤80%，换产品加换线时间。`;

    // ── 流式调用 ──
    const stages = [
      { key: 'preparing', label: '读取工单和工序数据', pct: 5 },
      { key: 'analyzing', label: 'AI 分析产能与交期约束', pct: 15 },
      { key: 'generating', label: '生成工序级排产表', pct: 30 },
      { key: 'parsing', label: '解析排产结果并保存', pct: 95 },
    ];

    // 逐阶段发送
    for (const stage of stages) {
      send('stage', stage);
      await new Promise(r => setTimeout(r, 200)); // 让前端有时间渲染
    }

    let fullContent = '';
    let usage = null;
    const startTime = Date.now();
    const EXPECTED_CHARS = 11000; // 粗略预期总字符数

    for await (const chunk of chatStream([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 12288, temperature: 0.3, timeout: AI_SCHEDULING_TIMEOUT_MS })) {
      if (chunk.error) {
        send('error', { message: chunk.error });
        res.end();
        return;
      }

      if (chunk.done) {
        fullContent = chunk.content || '';
        usage = chunk.usage || null;
        break;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const charCount = chunk.accumulated.length;
      const pct = Math.min(95, 30 + Math.floor((charCount / EXPECTED_CHARS) * 65));

      send('token', {
        delta: chunk.delta,
        accumulated: chunk.accumulated,
        charCount,
        elapsed,
        progressPct: pct,
      });
    }

    // ── 解析与保存 ──
    const parsed = extractJson(fullContent);
    if (!parsed || !parsed.scheduleEntries) {
      send('error', { message: 'AI 返回格式异常，请重试' });
      res.end();
      return;
    }

    // 保存到 DB
    let scheduleId = null;
    try {
      const summary = `${topOrders.length}工单(共${orders.length}个)`;
      const [ins] = await pool.query(
        `INSERT INTO ai_suggestions (suggestion_type,input_summary,result_json,risk_warnings,reasoning,triggered_by,group_id)
         VALUES (?,?,?,?,?,?,?)`,
        ['weekly_schedule',summary,JSON.stringify(parsed),JSON.stringify(parsed.riskWarnings||[]),parsed.reasoning||'',triggeredBy,req.isCrossGroup?'__all__':(req.groupId||null)]
      );
      scheduleId = ins.insertId;
      for (const e of (parsed.scheduleEntries||[])) {
        await pool.query(
          `INSERT INTO schedule_entries (schedule_id,order_no,product_name,step_order,step_name,machine_name,machine_owner,scheduled_date,day_label,shift,start_time,end_time,duration_hours,setup_hours,production_qty,hourly_cost,subtotal_cost)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [scheduleId,e.orderNo,e.productName,e.stepOrder,e.stepName,e.machineName,e.machineOwner,e.date||null,e.dayLabel,e.shift||'',e.startTime,e.endTime,round2(e.durationHours),round2(e.setupHours),e.productionQty||0,round2(e.hourlyCost),round2(e.subtotalCost)]
        );
      }
    } catch(dbErr) { console.error('[ai-scheduling] 流式保存失败:',dbErr.message); }

      // 注入优先级 + 强制2位小数
      const orderPM={}; orders.forEach(o=>{orderPM[o.order_no]=o.priority});
      (parsed.scheduleEntries||[]).forEach(e=>{
        if(!e.priority&&orderPM[e.orderNo]) e.priority=orderPM[e.orderNo];
        e.hourlyCost=round2(e.hourlyCost); e.subtotalCost=round2(e.subtotalCost); e.durationHours=round2(e.durationHours);
      });
      (parsed.machineTimeSummary||[]).forEach(m=>{m.totalHours=round2(m.totalHours); m.totalCost=round2(m.totalCost);});


    send('done', {
      id: scheduleId,
      scheduleEntries: parsed.scheduleEntries || [],
      machineTimeSummary: parsed.machineTimeSummary || [],
      riskWarnings: parsed.riskWarnings || [],
      reasoning: parsed.reasoning || '',
      summary: parsed.summary || '',
      weekDates,
      generatedAt: new Date().toISOString(),
      usage: usage || null,
      elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
    });

    res.end();
  } catch (err) {
    console.error('[ai-scheduling] 流式异常:',err);
    send('error', { message: '异常: '+err.message });
    res.end();
  }
});

/**
 * GET /schedule-table
 * 查询最近一次排产表明细
 */
router.get('/schedule-table', async (req, res) => {
  try {
    const [latest] = await pool.query(
      `SELECT id, generated_at, input_summary, reasoning, result_json
       FROM ai_suggestions WHERE suggestion_type='weekly_schedule'
       ORDER BY generated_at DESC LIMIT 1`
    );
    if (latest.length === 0) {
      return res.json({ success: true, data: null, message: '暂无排产记录' });
    }
    const scheduleId = latest[0].id;
    const [rows] = await pool.query(
      `SELECT se.id, se.schedule_id, se.order_no AS orderNo, se.product_name AS productName,
              se.step_order AS stepOrder, se.step_name AS stepName,
              se.machine_name AS machineName, se.machine_owner AS machineOwner,
              se.scheduled_date AS date, se.day_label AS dayLabel, se.shift,
              se.start_time AS startTime, se.end_time AS endTime,
              se.duration_hours AS durationHours, se.setup_hours AS setupHours,
              se.production_qty AS productionQty, se.hourly_cost AS hourlyCost,
              se.subtotal_cost AS subtotalCost,
              COALESCE(po.priority, 'normal') AS priority
       FROM schedule_entries se
       LEFT JOIN production_orders po ON se.order_no = po.order_no
       WHERE se.schedule_id=? ORDER BY se.scheduled_date, se.start_time`,
      [scheduleId]
    );
    const parsed = typeof latest[0].result_json === 'string'
      ? JSON.parse(latest[0].result_json) : latest[0].result_json;

    // 计算本周日期
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow===0?6:dow-1));
    const weekDates = [];
    const dayLabels = ['周一','周二','周三','周四','周五'];
    for (let i=0; i<5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate()+i);
      weekDates.push({ label: dayLabels[i], date: d.toISOString().split('T')[0] });
    }

    res.json({
      success: true,
      data: {
        id: scheduleId,
        generatedAt: latest[0].generated_at,
        reasoning: latest[0].reasoning,
        summary: parsed?.summary || '',
        scheduleEntries: rows,
        machineTimeSummary: parsed?.machineTimeSummary || [],
        riskWarnings: parsed?.riskWarnings || [],
        weekDates,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /ai-history
 */
router.get('/ai-history', async (req, res) => {
  try {
    const hf = groupFilter(req, 'a');
    const [rows] = await pool.query(
      `SELECT a.id, a.suggestion_type, a.input_summary, a.triggered_by,
              a.generated_at, a.group_id, a.reasoning
       FROM ai_suggestions a WHERE 1=1 ${hf.sql}
       ORDER BY a.generated_at DESC LIMIT 20`,
      hf.params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 异步多路排产（3路并行生成 + 1路校验） ====================

/**
 * POST /schedule-async
 * 提交异步排产任务，立即返回 jobId，后台执行 3+1 多路排产
 */
router.post('/schedule-async', async (req, res) => {
  const { triggeredBy = '系统管理者', prioritize } = req.body || {};

  const jobId = createJob();

  // 立即返回，不阻塞
  res.json({ success: true, jobId, status: 'processing' });

  // 后台启动排产流程
  setImmediate(() => {
    runMultiPassScheduling(jobId, { triggeredBy, prioritize, req });
  });
});

/**
 * GET /schedule-status/:jobId
 * 轮询异步排产任务的状态
 */
router.get('/schedule-status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: '任务不存在或已过期' });
  }
  res.json({
    success: true,
    jobId: req.params.jobId,
    status: job.status,
    progress: job.progress,
    data: job.result || null,
    error: job.error || null,
  });
});

/**
 * 后台多路排产核心函数
 *
 * Phase 1: 3路并行生成（temperature 0.3/0.5/0.7）
 * Phase 2: 选最优（riskWarnings 最少）
 * Phase 3: 1路校验修复
 * Phase 4: 保存入库
 */
async function runMultiPassScheduling(jobId, { triggeredBy, prioritize, req }) {
  const isUrgentInsert = !!prioritize;
  const orderFilter = groupFilter(req, 'po');
  const reportFilter = groupFilter(req, 'pr');

  try {
    updateJob(jobId, { status: 'generating', progress: 5 });

    // ── 数据准备（复用同步端点逻辑）──
    const [orders] = await pool.query(`
      SELECT po.order_no, po.product_name, po.customer_name,
             po.quantity, po.completed_quantity,
             (po.quantity - po.completed_quantity) AS remaining,
             po.priority, po.delivery_date, po.assigned_to, po.status
      FROM production_orders po
      WHERE po.status IN ('draft', 'pending', 'in_progress')
        ${orderFilter.sql}
      ORDER BY FIELD(po.priority, 'urgent', 'high', 'normal', 'low'),
               po.delivery_date ASC, po.planned_end ASC
    `, orderFilter.params);

    if (orders.length === 0) {
      updateJob(jobId, { status: 'failed', error: '当前没有需要排产的工单' });
      return;
    }

    const topOrders = orders.slice(0, 10);

    const [allRoutings] = await pool.query(
      `SELECT * FROM process_routing ORDER BY product_type, step_order`
    );
    const routingByProduct = {};
    allRoutings.forEach(r => {
      if (!routingByProduct[r.product_type]) routingByProduct[r.product_type] = [];
      routingByProduct[r.product_type].push(r);
    });

    const [machines] = await pool.query(
      `SELECT * FROM production_machines WHERE status = 1 ORDER BY owner_group_id, machine_type`
    );

    const [history] = await pool.query(`
      SELECT pr.machine_name AS machine, pr.shift,
             COUNT(DISTINCT pr.report_date) AS work_days,
             ROUND(SUM(pr.output_quantity)/NULLIF(COUNT(DISTINCT pr.report_date),0),0) AS avg_daily
      FROM production_reports pr
      WHERE pr.report_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
        AND pr.status != 'rejected' ${reportFilter.sql}
      GROUP BY pr.machine_name, pr.shift
      ORDER BY avg_daily DESC LIMIT 10
    `, reportFilter.params);

    // ── 构建 Prompt ──
    const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayName = dayNames[today.getDay()];

    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay()===0?6:today.getDay()-1));
    const weekDates = [];
    const dayLabels = ['周一','周二','周三','周四','周五'];
    for (let i=0; i<5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate()+i);
      weekDates.push({ label: dayLabels[i], date: d.toISOString().split('T')[0] });
    }
    const availableDays = weekDates.filter(d => d.date >= todayStr);
    const availableDaysStr = availableDays.map(d => `${d.label}(${d.date})`).join('、');

    const orderLines = topOrders.map((o,i) => {
      const productType = matchProductType(o.product_name);
      const routing = routingByProduct[productType] || [];
      const steps = routing.map(r =>
        `${r.step_order}.${r.step_name}(${r.machine_type},装换${r.setup_min}min,产能${r.speed_per_hour}/时)`
      ).join(' → ');
      return `| ${i+1} | ${o.order_no} | ${o.product_name}(${productType}) | ${o.remaining} | ${o.priority} | ${o.delivery_date||'-'} | ${steps} |`;
    }).join('\n');

    const machineLines = machines.map(m =>
      `| ${m.machine_name} | ${m.machine_type} | ${m.owner_group_id} | ¥${m.hourly_cost}/时 | ${m.daily_available_hours}h/天 |`
    ).join('\n');

    const historyLines = history.map(h =>
      `| ${h.machine} | ${h.shift} | ${h.work_days}天 | 日均${h.avg_daily} |`
    ).join('\n');

    const systemPrompt = `你是一个印刷工厂的高级排产工程师，负责生成周生产排产表。

## 核心约束（违反任何一条排产表即无效）

### 1. 工序顺序（硬约束）
每个工单的工序必须按模板顺序执行（stepOrder 1→2→3→...），不可跳过或颠倒。
同一工单的下一道工序的开始时间 >= 上一道工序的结束时间。

### 2. 设备互斥（硬约束）★★★ 最重要
**同一台机器在同一时间只能做一个工单的一道工序。**
输出前必须逐台检查：该机器的所有排产时间段是否有重叠，有重叠则重新排。

### 3. 工时计算（精确公式）
生产时间 = productionQty / speed_per_hour
换线时间 = setup_minutes / 60（换产品时需要，同产品连续做免换线）
durationHours = 生产时间 + 换线时间
- productionQty 必须等于该工单的剩余数量
- 同一机器上切换不同产品时：必须加 30-60 分钟换线/调试时间
- durationHours 四舍五入到0.5小时

### 4. 工时约束
每台机器每天的总 durationHours 之和 <= daily_available_hours

### 5. 产能缓冲（重要）
每天每台机器的总排产时间不超过 daily_available_hours × 80%。
剩余 20% 产能作为"加急缓冲带"。

### 6. 可用排产日（强制执行）
只能从今天及之后的日期开始排产。
工单必须均匀分布到所有可用排产日，禁止全挤在第一天。

### 7. 优先级规则
urgent > high > normal > low，同优先级按交期早>晚。

### 8. 跨组设备
工序的设备类型决定了可用哪些机器。如果设备归属另一个组，照常排上，
machineOwner 写实际归属组，月底按此分摊机时费。

## 输出格式 — 只返回纯 JSON（不要任何 markdown 标记）
{
  "scheduleEntries": [
    {
      "orderNo": "工单号",
      "productName": "产品名",
      "stepOrder": 1,
      "stepName": "工序名",
      "machineName": "具体设备名",
      "machineOwner": "设备归属group",
      "dayLabel": "周X",
      "date": "YYYY-MM-DD",
      "shift": "早班/中班/晚班",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "durationHours": 数字,
      "setupHours": 换线小时数,
      "productionQty": 生产数量,
      "hourlyCost": 机时费率,
      "subtotalCost": 数字(最多2位小数)
    }
  ],
  "machineTimeSummary": [
    { "ownerGroup": "group_a", "machineName": "设备名", "totalHours": 占用总时长, "totalCost": 总费用 }
  ],
  "riskWarnings": [
    { "orderNo": "工单号", "severity": "high/medium/low", "message": "具体风险说明" }
  ],
  "reasoning": "300字以内",
  "summary": "总工单数X，工序总数X，跨组协作X次，高风险X个，产能利用率约X%"
}

## 自检清单（输出 JSON 前逐项确认）
□ 每台机器的时间段无重叠？
□ 同一工单的工序顺序正确？
□ 每个工单每道工序都分配了？
□ durationHours = 数量/产能 + 换线？
□ 没有排在过去的日期？
□ 跨组设备标记了正确的 machineOwner？
□ 每台机器每天排产不超过 80% 容量？
□ 工单已均匀分布到所有可用日期？`;

    const userPrompt = `## 排产任务
今天是 ${todayStr} ${todayName}。可用排产日：${availableDaysStr}（共 ${availableDays.length} 天）。
过去的日期不能排产。

## 工单及工序路线
| # | 工单号 | 产品 | 剩余 | 优先级 | 交期 | 工序路线(step.工序(设备,装换min,产能/时)) |
|---|--------|------|------|--------|------|------------------------------------------|
${orderLines}

## 设备资源
| 设备名称 | 类型 | 归属 | 机时费 | 可用工时/天 |
|----------|------|------|--------|------------|
${machineLines}

## 历史日均产能参考
${history.length > 0 ? history.map(h=>`- ${h.machine}(${h.shift}): 日均${h.avg_daily}`).join('\n') : '暂无历史数据'}

## 排产要求
1. 对每个工单的每道工序，指定具体机器、日期、时段
2. **每台机器同一时间只能做一件事**
3. 工序耗时 = 剩余数量÷产能 + 换线时间，精确到0.5小时
4. 充分利用所有可用排产日
5. **每台机器每天排产不超过其可用工时的 80%**
6. 跨组设备直接使用，标记实际 machineOwner
${isUrgentInsert ? `\n## ⚠️ 加急插单模式\n工单 **${prioritize}** 是临时加急订单，必须排到本周最优位置。` : ''}`;

    // ================================================================
    // Phase 1: 3路并行生成
    // ================================================================
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const [r1, r2, r3] = await Promise.all([
      deepseekChat(messages, { maxTokens: 12288, temperature: 0.3, timeout: AI_SCHEDULING_TIMEOUT_MS }).catch(e => ({ success: false, error: e.message })),
      deepseekChat(messages, { maxTokens: 12288, temperature: 0.5, timeout: AI_SCHEDULING_TIMEOUT_MS }).catch(e => ({ success: false, error: e.message })),
      deepseekChat(messages, { maxTokens: 12288, temperature: 0.7, timeout: AI_SCHEDULING_TIMEOUT_MS }).catch(e => ({ success: false, error: e.message })),
    ]);

    updateJob(jobId, { status: 'generating', progress: 25 });

    // 解析成功的生成结果
    const parsedResults = [r1, r2, r3]
      .filter(r => r.success)
      .map(r => extractJson(r.content))
      .filter(p => p && p.scheduleEntries && p.scheduleEntries.length > 0);

    if (parsedResults.length === 0) {
      // 全部失败
      const errors = [r1, r2, r3].filter(r => !r.success).map(r => r.error).join('; ');
      updateJob(jobId, { status: 'failed', error: `3路生成均失败: ${errors || 'JSON解析错误'}` });
      return;
    }

    // 选最优：riskWarnings 最少的
    parsedResults.sort((a, b) => (a.riskWarnings?.length || 0) - (b.riskWarnings?.length || 0));
    let bestResult = parsedResults[0];

    // ================================================================
    // Phase 2: 校验修复
    // ================================================================
    updateJob(jobId, { status: 'verifying', progress: 50 });

    const bestJson = JSON.stringify(bestResult, null, 2);
    const verifySystemPrompt = `你是印刷排产的质检员，负责逐项审核排产表并修复错误。

## 必须逐项检查
1. **设备互斥**：逐台机器、逐个日期，检查同一台机器的所有条目的 startTime-endTime 是否有重叠
2. **工序顺序**：每个工单的工序 stepOrder 必须是 1,2,3... 连续递进
3. **工时约束**：每台机器每天 totalHours <= 可用工时×80%
4. **日期有效性**：不能排在过去日期
5. **数量一致性**：每个 entry 的 productionQty 应等于该工单的剩余数量

## 输出
返回修复后的完整 JSON。只修复确实有错的部分，正确的部分保持原样。
如果有无法修复的冲突（如产能确实不够），在 riskWarnings 中标注。
格式和原 JSON 一致，只返回纯 JSON。`;

    const verifyMessages = [
      { role: 'system', content: verifySystemPrompt },
      { role: 'user', content: `请审核并修复以下排产表：\n\n${bestJson}` },
    ];

    const verifyResult = await deepseekChat(verifyMessages, { maxTokens: 12288, temperature: 0.1, timeout: AI_SCHEDULING_TIMEOUT_MS });
    if (verifyResult.success) {
      const verified = extractJson(verifyResult.content);
      if (verified && verified.scheduleEntries && verified.scheduleEntries.length > 0) {
        bestResult = verified;
      }
      // 校验失败 → 沿用原最优结果
    }

    updateJob(jobId, { status: 'verifying', progress: 90 });

    // ================================================================
    // Phase 3: 后处理 + 保存
    // ================================================================
    // 注入工单优先级
    const orderPriorityMap = {};
    orders.forEach(o => { orderPriorityMap[o.order_no] = o.priority; });
    (bestResult.scheduleEntries || []).forEach(e => {
      if (!e.priority && orderPriorityMap[e.orderNo]) {
        e.priority = orderPriorityMap[e.orderNo];
      }
      e.hourlyCost = round2(e.hourlyCost);
      e.subtotalCost = round2(e.subtotalCost);
      e.durationHours = round2(e.durationHours);
    });
    (bestResult.machineTimeSummary || []).forEach(m => {
      m.totalHours = round2(m.totalHours);
      m.totalCost = round2(m.totalCost);
    });

    // 保存
    let scheduleId = null;
    try {
      const inputSummary = `${topOrders.length}工单(共${orders.length}个未完工), ${machines.length}设备, 3+1多路校验`;
      const [ins] = await pool.query(
        `INSERT INTO ai_suggestions (suggestion_type, input_summary, result_json, risk_warnings, reasoning, triggered_by, group_id)
         VALUES (?,?,?,?,?,?,?)`,
        [
          'weekly_schedule', inputSummary,
          JSON.stringify(bestResult), JSON.stringify(bestResult.riskWarnings||[]),
          bestResult.reasoning||'', triggeredBy,
          req.isCrossGroup ? '__all__' : (req.groupId||null),
        ]
      );
      scheduleId = ins.insertId;

      const entries = bestResult.scheduleEntries || [];
      for (const e of entries) {
        await pool.query(
          `INSERT INTO schedule_entries
           (schedule_id, order_no, product_name, step_order, step_name,
            machine_name, machine_owner, scheduled_date, day_label, shift,
            start_time, end_time, duration_hours, setup_hours,
            production_qty, hourly_cost, subtotal_cost)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            scheduleId, e.orderNo, e.productName, e.stepOrder, e.stepName,
            e.machineName, e.machineOwner, e.date||null, e.dayLabel, e.shift||'',
            e.startTime, e.endTime, round2(e.durationHours), round2(e.setupHours),
            e.productionQty||0, round2(e.hourlyCost), round2(e.subtotalCost),
          ]
        );
      }
    } catch (dbErr) {
      console.error('[ai-scheduling] 异步排产保存失败:', dbErr.message);
    }

    // ================================================================
    // 完成
    // ================================================================
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: {
        id: scheduleId,
        scheduleEntries: bestResult.scheduleEntries || [],
        machineTimeSummary: bestResult.machineTimeSummary || [],
        riskWarnings: bestResult.riskWarnings || [],
        reasoning: bestResult.reasoning || '',
        summary: bestResult.summary || '',
        weekDates,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error('[ai-scheduling] 异步排产异常:', err);
    updateJob(jobId, { status: 'failed', error: err.message });
  }
}

module.exports = router;
