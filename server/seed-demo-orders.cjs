/**
 * 演示工单种子数据（可直接导入）
 *
 * 运行：
 *   node server/seed-demo-orders.cjs
 *
 * 特点：
 *   - 幂等：先删除历史 WO-DEMO-* 工单再插入，可重复执行；
 *   - 状态均为可排产状态（draft / pending / in_progress），供 AI 排产使用；
 *   - 产品名匹配 process_routing 的两条工艺路线（卡纸包装盒 / 四色三折说明书）；
 *   - 覆盖 group_a / group_b / 未分组(NULL，按统一口径对所有组可见) 三种归属；
 *   - 日期用 CURDATE() 相对偏移，任何时候导入都在本周起可排产。
 *
 * 说明：不需要时可用
 *   DELETE FROM production_orders WHERE order_no LIKE 'WO-DEMO-%';
 * 清除。
 */

const pool = require('./db.cjs');

// 相对「今天」的日期偏移，plan_start / plan_end / delivery 均以天为单位
// { orderNo, product, customer, spec, quantity, completed, unit, status, priority,
//   planStart, planEnd, delivery, assignedTo, groupId, remark }
const ORDERS = [
  // ── A组（广东业务群） ──
  { orderNo: 'WO-DEMO-001', product: '彩色包装盒', customer: '华美出版社', spec: '350×250mm', quantity: 50000, completed: 0, unit: '个', status: 'pending', priority: 'urgent', planStart: 0, planEnd: 2, delivery: 2, assignedTo: '张三', groupId: 'group_a', remark: '加急彩盒彩印' },
  { orderNo: 'WO-DEMO-002', product: '产品说明书', customer: '联合利华', spec: '210×285mm', quantity: 40000, completed: 0, unit: '本', status: 'pending', priority: 'high', planStart: 0, planEnd: 1, delivery: 1, assignedTo: '李四', groupId: 'group_a', remark: '四色说明书' },
  { orderNo: 'WO-DEMO-003', product: '精装礼盒', customer: '广州酒家', spec: '300×300×80mm', quantity: 20000, completed: 5000, unit: '个', status: 'in_progress', priority: 'normal', planStart: 0, planEnd: 3, delivery: 3, assignedTo: '王五', groupId: 'group_a', remark: '已开印，剩 15000' },
  { orderNo: 'WO-DEMO-004', product: '宣传折页', customer: '美的集团', spec: '210×285mm', quantity: 60000, completed: 0, unit: '张', status: 'draft', priority: 'normal', planStart: 0, planEnd: 4, delivery: 4, assignedTo: '张三', groupId: 'group_a', remark: '待审批' },

  // ── B组（香港业务群） ──
  { orderNo: 'WO-DEMO-005', product: '卡盒', customer: '香港联合纸业', spec: '260×180mm', quantity: 35000, completed: 0, unit: '个', status: 'pending', priority: 'high', planStart: 0, planEnd: 1, delivery: 1, assignedTo: '陈生', groupId: 'group_b', remark: '单面覆膜' },
  { orderNo: 'WO-DEMO-006', product: '画册', customer: '东方出版社', spec: '210×285mm', quantity: 30000, completed: 0, unit: '本', status: 'pending', priority: 'normal', planStart: 0, planEnd: 2, delivery: 2, assignedTo: '林太', groupId: 'group_b', remark: '锁线胶装' },
  { orderNo: 'WO-DEMO-007', product: '彩盒', customer: '港龙贸易', spec: '200×150mm', quantity: 25000, completed: 10000, unit: '个', status: 'in_progress', priority: 'urgent', planStart: 0, planEnd: 1, delivery: 1, assignedTo: '黄生', groupId: 'group_b', remark: '加急，剩 15000' },
  { orderNo: 'WO-DEMO-008', product: '操作手册', customer: '新鸿基', spec: '148×210mm', quantity: 45000, completed: 0, unit: '本', status: 'draft', priority: 'normal', planStart: 0, planEnd: 3, delivery: 3, assignedTo: '陈生', groupId: 'group_b', remark: '含多语言' },

  // ── 未分组（共享产能，所有组可见） ──
  { orderNo: 'WO-DEMO-009', product: '说明书', customer: '共享客户A', spec: '210×285mm', quantity: 20000, completed: 0, unit: '本', status: 'pending', priority: 'normal', planStart: 0, planEnd: 2, delivery: 2, assignedTo: null, groupId: null, remark: '未分组-共用产能' },
  { orderNo: 'WO-DEMO-010', product: '包装盒', customer: '共享客户B', spec: '300×200mm', quantity: 15000, completed: 0, unit: '个', status: 'pending', priority: 'low', planStart: 0, planEnd: 4, delivery: 4, assignedTo: null, groupId: null, remark: '未分组-共用产能' },
];

const INSERT_SQL = `
  INSERT INTO production_orders
    (order_no, product_name, customer_name, spec, quantity, completed_quantity, unit,
     status, priority, planned_start, planned_end, delivery_date,
     assigned_to, created_by, remark, group_id)
  VALUES (?,?,?,?,?,?,?,?,?,
    DATE_ADD(CURDATE(), INTERVAL ? DAY),
    DATE_ADD(CURDATE(), INTERVAL ? DAY),
    DATE_ADD(CURDATE(), INTERVAL ? DAY),
    ?, 'seed-demo', ?, ?)`;

(async () => {
  const conn = await pool.getConnection();
  console.log('[seed-demo-orders] 开始导入演示工单...\n');
  try {
    await conn.beginTransaction();

    const [del] = await conn.query("DELETE FROM production_orders WHERE order_no LIKE 'WO-DEMO-%'");
    if (del.affectedRows) console.log(`  清除历史演示工单 ${del.affectedRows} 条`);

    for (const o of ORDERS) {
      await conn.query(INSERT_SQL, [
        o.orderNo, o.product, o.customer, o.spec, o.quantity, o.completed, o.unit,
        o.status, o.priority, o.planStart, o.planEnd, o.delivery,
        o.assignedTo, o.remark, o.groupId,
      ]);
      console.log(`  ✓ ${o.orderNo} | ${o.product} | ${o.status}/${o.priority} | ${o.groupId || '(未分组)'}`);
    }

    await conn.commit();
    console.log(`\n[seed-demo-orders] 完成，共导入 ${ORDERS.length} 条可排产工单。`);
    console.log('[seed-demo-orders] 现在可在「AI 排产」页点击开始排产。');
  } catch (err) {
    await conn.rollback();
    console.error('[seed-demo-orders] 失败:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
