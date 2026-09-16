import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Tag, Row, Col, Statistic, DatePicker, Space, Button, Empty } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';

// 金额格式化
const money = (v) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? '-'
    : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 月份中文名（与 FinanceReports 保持一致）
const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const MONTH_PICKER_LOCALE = { lang: { shortMonths: MONTHS_CN } };

// ==================== 数据报表主页 ====================
// 子模块由路由参数决定，顶部子导航由 BaseLayout 按菜单分组渲染
const REPORT_PANELS = {
  production: ProductionReport,
  inventory: InventoryReport,
  quality: QualityReport,
  finance: FinanceReport,
};

export default function Reports() {
  const { tab } = useParams();
  const Panel = REPORT_PANELS[tab] || ProductionReport;
  return <Panel />;
}

function ProductionReport() {
  const [date, setDate] = useState(dayjs());
  const [dailyData, setDailyData] = useState(null);
  const [orders, setOrders] = useState({});

  const fetch = async (d) => {
    const target = d || date;
    const dateStr = target.format('YYYY-MM-DD');
    const [dailyRes, ordersRes] = await Promise.all([
      api.get('/production/daily-stats', { date: dateStr }),
      api.get('/production/orders', { pageSize: 200 }),
    ]);
    if (dailyRes.success) setDailyData(dailyRes.data);
    if (ordersRes.success) {
      const stats = { total: ordersRes.data.length };
      ordersRes.data.forEach(o => { stats[o.status] = (stats[o.status] || 0) + 1; });
      setOrders(stats);
    }
  };

  useEffect(() => { fetch(); }, []);

  const reports = dailyData?.reports || [];
  const totalOut = reports.reduce((s, r) => s + parseFloat(r.total_output || 0), 0);
  const totalDef = reports.reduce((s, r) => s + parseFloat(r.total_defective || 0), 0);
  const totalHours = reports.reduce((s, r) => s + parseFloat(r.total_hours || 0), 0);
  const defectRate = totalOut + totalDef > 0 ? ((totalDef / (totalOut + totalDef)) * 100).toFixed(1) : '0';

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker value={date} onChange={d => { setDate(d); fetch(d); }} />
        <Button icon={<ReloadOutlined />} onClick={() => fetch()}>刷新</Button>
      </Space>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="当日良品" value={totalOut} valueStyle={{ color: '#52c41a' }} prefix={<ArrowUpOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="当日不良" value={totalDef} valueStyle={{ color: '#ff4d4f' }} prefix={<ArrowDownOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="不良率" value={defectRate} suffix="%" /></Card></Col>
        <Col span={6}><Card><Statistic title="当日工时" value={totalHours} suffix="h" /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总工单" value={orders.total || 0} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="生产中" value={orders.in_progress || 0} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已完成" value={orders.completed || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已取消" value={orders.cancelled || 0} /></Card></Col>
      </Row>
      {reports.length > 0 ? (
        <Table rowKey={(r, i) => i} size="small" dataSource={reports} pagination={false}
          columns={[
            { title: '员工', dataIndex: 'employee_name', width: 80 },
            { title: '机台', dataIndex: 'machine_name', width: 120 },
            { title: '班次', dataIndex: 'shift', width: 60 },
            { title: '良品', dataIndex: 'total_output', width: 80, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
            { title: '不良', dataIndex: 'total_defective', width: 80, align: 'right', render: v => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '-' },
            { title: '工时(h)', dataIndex: 'total_hours', width: 80, align: 'right' },
            { title: '报工次数', dataIndex: 'report_count', width: 80, align: 'right' },
          ]}
        />
      ) : <Empty description="所选日期暂无报工数据" />}
    </div>
  );
}

function InventoryReport() {
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [slowMoving, setSlowMoving] = useState([]);

  const fetch = async () => {
    const [ovRes, alertRes, slowRes] = await Promise.all([
      api.get('/inventory/overview'),
      api.get('/inventory/alerts'),
      api.get('/inventory/slow-moving', { days: 90, pageSize: 50 }),
    ]);
    if (ovRes.success) setOverview(ovRes.data);
    if (alertRes.success) setAlerts(alertRes.data);
    if (slowRes.success) setSlowMoving(slowRes.data);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <Button icon={<ReloadOutlined />} onClick={fetch} style={{ marginBottom: 16 }}>刷新</Button>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="物料SKU" value={overview?.totalSku || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="总库存量" value={overview?.totalStock || 0} /></Card></Col>
        <Col span={6}><Card><Statistic title="库存金额" value={overview?.totalValue || 0} prefix="¥" precision={2} /></Card></Col>
        <Col span={6}><Card><Statistic title="低库存预警" value={overview?.lowStockCount || 0} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="低库存预警" size="small">
            {alerts?.lowStock?.length > 0 ? (
              <Table rowKey="id" size="small" dataSource={alerts.lowStock} pagination={false}
                columns={[
                  { title: '物料', dataIndex: 'code', width: 110 }, { title: '名称', dataIndex: 'name', width: 100 },
                  { title: '当前库存', dataIndex: 'current_stock', width: 80, align: 'right' },
                  { title: '安全库存', dataIndex: 'safety_stock', width: 80, align: 'right' },
                  { title: '缺口', dataIndex: 'shortage', width: 70, align: 'right', render: v => <Tag color="red">{v}</Tag> },
                ]}
              />
            ) : <Empty description="无低库存预警 ✅" />}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="呆滞料（超90天未动）" size="small">
            {slowMoving.length > 0 ? (
              <Table rowKey="id" size="small" dataSource={slowMoving} pagination={false}
                columns={[
                  { title: '物料', dataIndex: 'material_name', width: 100 },
                  { title: '库位', dataIndex: 'location_code', width: 100, render: v => <Tag>{v}</Tag> },
                  { title: '存量', dataIndex: 'quantity', width: 70, align: 'right' },
                  { title: '闲置天数', dataIndex: 'idle_days', width: 80, align: 'right', render: v => <Tag color="red">{v}天</Tag> },
                ]}
              />
            ) : <Empty description="无呆滞料 ✅" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function QualityReport() {
  const [stagingStats, setStagingStats] = useState(null);
  const [standards, setStandards] = useState([]);

  const fetch = async () => {
    const [statsRes, stdRes] = await Promise.all([
      api.get('/staging/stats/summary'),
      api.get('/inbound-standards', { pageSize: 200 }),
    ]);
    if (statsRes.success) setStagingStats(statsRes.data);
    if (stdRes.success) setStandards(stdRes.data);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <Button icon={<ReloadOutlined />} onClick={fetch} style={{ marginBottom: 16 }}>刷新</Button>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="待检验" value={stagingStats?.pending || 0} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="今日通过" value={stagingStats?.passed_today || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="不合格" value={stagingStats?.failed || 0} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="检验标准总数" value={standards.length} /></Card></Col>
      </Row>
      {standards.length > 0 ? (
        <Card title="检验标准概览" size="small">
          <Table rowKey="id" size="small" dataSource={standards} pagination={{ pageSize: 20 }}
            columns={[
              { title: '物料ID', dataIndex: 'material_id', width: 80 },
              { title: '检验项目', dataIndex: 'inspection_item', width: 150 },
              { title: '标准值', dataIndex: 'standard_value', width: 100 },
              { title: '公差上限', dataIndex: 'tolerance_upper', width: 100 },
              { title: '公差下限', dataIndex: 'tolerance_lower', width: 100 },
              { title: '检验方法', dataIndex: 'test_method', width: 100 },
              { title: '必检', dataIndex: 'is_required', width: 60, render: v => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
            ]}
          />
        </Card>
      ) : <Empty description="暂无检验标准" />}
    </div>
  );
}

// ==================== 4. 财务统计 ====================
// 汇总财务模块相关数据：利润表核心指标 + 资产负债 + 应收/应付账龄 + 费用
function FinanceReport() {
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const [profit, setProfit] = useState(null);
  const [balance, setBalance] = useState(null);
  const [apAging, setApAging] = useState(null);
  const [arAging, setArAging] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = async (p) => {
    const periodNo = p || period;
    setLoading(true);
    try {
      const [profitRes, balanceRes, apRes, arRes, expRes] = await Promise.all([
        api.get('/finance/reports/profit', { period_no: periodNo }),
        api.get('/finance/reports/balance-sheet', { period_no: periodNo }),
        api.get('/finance/reports/ap-aging'),
        api.get('/finance/reports/ar-aging'),
        api.get('/finance/reports/expenses', { period_no: periodNo }),
      ]);
      if (profitRes.success) setProfit(profitRes.data);
      if (balanceRes.success) setBalance(balanceRes.data);
      if (apRes.success) setApAging(apRes.data);
      if (arRes.success) setArAging(arRes.data);
      if (expRes.success) setExpenses(expRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const agingColumns = (nameTitle) => [
    { title: nameTitle, dataIndex: nameTitle === '供应商' ? 'supplier_name' : 'customer_name' },
    { title: '未到期', dataIndex: 'b0', align: 'right', render: money },
    { title: '逾期≤30天', dataIndex: 'b30', align: 'right', render: money },
    { title: '31-60天', dataIndex: 'b60', align: 'right', render: money },
    { title: '61-90天', dataIndex: 'b90', align: 'right', render: money },
    { title: '>90天', dataIndex: 'bm', align: 'right', render: v => <Tag color="red">{money(v)}</Tag> },
    { title: '剩余合计', dataIndex: 'remaining', align: 'right', render: v => <strong>{money(v)}</strong> },
  ];

  const agingSummary = (totals) => () => (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={1} align="right">{money(totals?.b0)}</Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right">{money(totals?.b30)}</Table.Summary.Cell>
      <Table.Summary.Cell index={3} align="right">{money(totals?.b60)}</Table.Summary.Cell>
      <Table.Summary.Cell index={4} align="right">{money(totals?.b90)}</Table.Summary.Cell>
      <Table.Summary.Cell index={5} align="right">{money(totals?.bm)}</Table.Summary.Cell>
      <Table.Summary.Cell index={6} align="right"><strong>{money(totals?.remaining)}</strong></Table.Summary.Cell>
    </Table.Summary.Row>
  );

  const netProfit = profit?.profit?.cur || 0;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <span>会计期间</span>
        <DatePicker picker="month" allowClear={false} value={dayjs(period)} locale={MONTH_PICKER_LOCALE}
          onChange={(d) => { if (d) { const p = d.format('YYYY-MM'); setPeriod(p); fetch(p); } }} />
        <Button icon={<ReloadOutlined />} onClick={() => fetch()}>刷新</Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card loading={loading}><Statistic title="营业收入（本期）" value={profit?.revenue?.cur || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card loading={loading}><Statistic title="成本费用（本期）" value={profit?.cost?.cur || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card loading={loading}><Statistic title="本期净利润" value={netProfit} precision={2} prefix="¥" valueStyle={{ color: netProfit >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card loading={loading}><Statistic title="本年累计净利润" value={profit?.profit?.ytd || 0} precision={2} prefix="¥" /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card loading={loading}><Statistic title="资产总计" value={balance?.asset_total || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card loading={loading}><Statistic title="负债总计" value={balance?.liability_total || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}><Card loading={loading}><Statistic title="所有者权益" value={balance?.equity_total || 0} precision={2} prefix="¥" /></Card></Col>
        <Col span={6}>
          <Card loading={loading}>
            <Row gutter={0}>
              <Col span={12}><Statistic title="应付余额" value={apAging?.totals?.remaining || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 20 }} /></Col>
              <Col span={12}><Statistic title="应收余额" value={arAging?.totals?.remaining || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 20, color: '#52c41a' }} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="应付账龄" size="small">
            {apAging?.rows?.length > 0 ? (
              <Table rowKey="supplier_name" size="small" dataSource={apAging.rows} pagination={false}
                scroll={{ x: 700 }} columns={agingColumns('供应商')} summary={agingSummary(apAging.totals)} />
            ) : <Empty description="暂无应付余额 ✅" />}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="应收账龄" size="small">
            {arAging?.rows?.length > 0 ? (
              <Table rowKey="customer_name" size="small" dataSource={arAging.rows} pagination={false}
                scroll={{ x: 700 }} columns={agingColumns('客户')} summary={agingSummary(arAging.totals)} />
            ) : <Empty description="暂无应收余额 ✅" />}
          </Card>
        </Col>
      </Row>

      <Card title="费用汇总（部门 × 类型）" size="small">
        {expenses?.rows?.length > 0 ? (
          <Table rowKey={(r, i) => i} size="small" dataSource={expenses.rows} pagination={false}
            columns={[
              { title: '部门', dataIndex: 'department' },
              { title: '费用类型', dataIndex: 'expense_type', width: 100, render: v => <Tag>{v}</Tag> },
              { title: '单据数', dataIndex: 'doc_count', width: 90, align: 'right' },
              { title: '报销金额', dataIndex: 'amount', align: 'right', render: money },
              { title: '含税金额', dataIndex: 'total_amount', align: 'right', render: money },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}><strong>合计（{expenses?.totals?.doc_count || 0} 张）</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} align="right"><strong>{money(expenses?.totals?.amount)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><strong>{money(expenses?.totals?.total_amount)}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )} />
        ) : <Empty description="暂无费用数据" />}
      </Card>
    </div>
  );
}
