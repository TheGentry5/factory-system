import { useState, useEffect } from 'react';
import { Card, Table, Tag, Tabs, Row, Col, Statistic, DatePicker, Space, Button, Empty } from 'antd';
import {
  BarChartOutlined, InboxOutlined, CheckCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const api = {
  get: (url, params) => fetch(`/api${url}?` + new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  )).then(r => r.json()),
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('production');

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'production', label: '📊 生产报表', icon: <BarChartOutlined /> },
        { key: 'inventory', label: '📦 库存报表', icon: <InboxOutlined /> },
        { key: 'quality', label: '✅ 质检报表', icon: <CheckCircleOutlined /> },
      ]} />
      {activeTab === 'production' && <ProductionReport />}
      {activeTab === 'inventory' && <InventoryReport />}
      {activeTab === 'quality' && <QualityReport />}
    </div>
  );
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
