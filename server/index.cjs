/**
 * Express API 服务器
 * 启动: node server/index.js
 */
const express = require('express');
const cors = require('cors');

const { groupContext } = require('./middleware/group-context.cjs');

const materialsRouter = require('./routes/materials.cjs');
const suppliersRouter = require('./routes/suppliers.cjs');
const categoriesRouter = require('./routes/categories.cjs');
const inboundStandardsRouter = require('./routes/inbound-standards.cjs');
const inboundRecordsRouter = require('./routes/inbound-records.cjs');
const warehouseRouter = require('./routes/warehouse.cjs');
const purchaseOrdersRouter = require('./routes/purchase-orders.cjs');
const employeesRouter = require('./routes/employees.cjs');
const stagingRouter = require('./routes/staging.cjs');
const inventoryRouter = require('./routes/inventory.cjs');
const productionRouter = require('./routes/production.cjs');
const groupsRouter = require('./routes/groups.cjs');
const demoRouter = require('./routes/demo.cjs');
const reportsRouter = require('./routes/reports.cjs');
const assistantRouter = require('./routes/assistant.cjs');
const schedulingRouter = require('./routes/scheduling.cjs');
const machinesRouter = require('./routes/machines.cjs');

// 财务模块（挂载点均为 /api/finance，各文件以子路径注册）
const financeVouchersRouter = require('./routes/finance/vouchers.cjs');
const financeApRouter = require('./routes/finance/ap.cjs');
const financeArRouter = require('./routes/finance/ar.cjs');
const financeExpensesRouter = require('./routes/finance/expenses.cjs');
const financeCostRouter = require('./routes/finance/cost.cjs');
const financeCloseRouter = require('./routes/finance/close.cjs');
const financeReportsRouter = require('./routes/finance/reports.cjs');

const app = express();
const PORT = process.env.API_PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(groupContext);  // 解析 X-Group-Code header → req.groupId

// 路由
app.use('/api/groups', groupsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/inbound-standards', inboundStandardsRouter);
app.use('/api/inbound-records', inboundRecordsRouter);
app.use('/api/warehouse', warehouseRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/staging', stagingRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/production', productionRouter);
app.use('/api/demo', demoRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/scheduling', schedulingRouter);
app.use('/api/machines', machinesRouter);

// 财务模块
app.use('/api/finance', financeVouchersRouter);
app.use('/api/finance', financeApRouter);
app.use('/api/finance', financeArRouter);
app.use('/api/finance', financeExpensesRouter);
app.use('/api/finance', financeCostRouter);
app.use('/api/finance', financeCloseRouter);
app.use('/api/finance', financeReportsRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[server] API server running on http://localhost:${PORT}`);
});
