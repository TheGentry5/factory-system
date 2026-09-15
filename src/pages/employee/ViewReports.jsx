import { useState, useEffect } from 'react';
import { Card, Table, Tag, Tabs, Statistic, Row, Col, DatePicker, Space, Button, Input, Empty } from 'antd';
import { BarChartOutlined, InboxOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons';
import PermissionGuard from '../../components/PermissionGuard';
import dayjs from 'dayjs';

const api = {
  get: (url, params) => fetch(`/api${url}?` + new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  )).then(r => r.json()),
};

export default function ViewReports() {
  const [activeTab, setActiveTab] = useState('production');

  return (
    <PermissionGuard permKey="view_reports">
      <div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'production', label: '📊 生产报表', icon: <BarChartOutlined /> },
          { key: 'inventory', label: '📦 库存概况', icon: <InboxOutlined /> },
          { key: 'personal', label: '👤 个人统计', icon: <UserOutlined /> },
        ]} />
        {activeTab === 'production' && <ProductionView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'personal' && <PersonalStats />}
      </div>
    </PermissionGuard>
  );
}

// ==================== 生产报表查看 ====================
function ProductionView() {
  const [date, setDate] = useState(dayjs());
  const [data, setData] = useState(null);

  const fetch = async (d) => {
    const target = d || date;
    const res = await api.get('/production/daily-stats', { date: target.format('YYYY-MM-DD') });
    if (res.success) setData(res.data);
  };

  useEffect(() => { fetch(); }, []);

  const reports = data?.reports || [];
  const totalOut = reports.reduce((s, r) => s + parseFloat(r.total_output || 0), 0);
  const totalDef = reports.reduce((s, r) => s + parseFloat(r.total_defective || 0), 0);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker value={date} onChange={d => { setDate(d); fetch(d); }} />
        <Button icon={<ReloadOutlined />} onClick={() => fetch()}>刷新</Button>
      </Space>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="当日总产量" value={totalOut} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="不良品" value={totalDef} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="报工人数" value={reports.length} /></Card></Col>
        <Col span={6}>
          <Card size="small"><Statistic title="不良率" value={totalOut + totalDef > 0 ? ((totalDef / (totalOut + totalDef)) * 100).toFixed(1) : '0'} suffix="%" /></Card>
        </Col>
      </Row>
      {reports.length > 0 ? (
        <Table rowKey={(r, i) => i} size="small" dataSource={reports} pagination={false}
          columns={[
            { title: '员工', dataIndex: 'employee_name' }, { title: '机台', dataIndex: 'machine_name' },
            { title: '班次', dataIndex: 'shift', width: 60 },
            { title: '良品', dataIndex: 'total_output', width: 80, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
            { title: '不良', dataIndex: 'total_defective', width: 80, align: 'right' },
            { title: '工时(h)', dataIndex: 'total_hours', width: 80, align: 'right' },
          ]}
        />
      ) : <Empty description="所选日期暂无数据" />}
    </div>
  );
}

// ==================== 库存概况查看 ====================
function InventoryView() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get('/inventory/overview').then(r => r.success && setOverview(r.data));
  }, []);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="物料SKU" value={overview?.totalSku || 0} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="总库存量" value={overview?.totalStock || 0} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="本月入库" value={overview?.monthInbound || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="本月出库" value={overview?.monthOutbound || 0} valueStyle={{ color: '#1890ff' }} /></Card></Col>
      </Row>
    </div>
  );
}

// ==================== 个人统计 ====================
function PersonalStats() {
  const [employeeName, setEmployeeName] = useState(localStorage.getItem('employee_name') || '');
  const [reports, setReports] = useState([]);

  const fetch = async () => {
    if (!employeeName.trim()) return;
    const res = await api.get('/production/reports', { employee_name: employeeName, pageSize: 200 });
    if (res.success) setReports(res.data);
  };

  useEffect(() => { if (employeeName) fetch(); }, []);

  const thisMonth = reports.filter(r => {
    const d = new Date(r.report_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalOut = thisMonth.reduce((s, r) => s + parseFloat(r.output_quantity || 0), 0);
  const totalDef = thisMonth.reduce((s, r) => s + parseFloat(r.defective_quantity || 0), 0);
  const totalHours = thisMonth.reduce((s, r) => s + parseFloat(r.work_hours || 0), 0);
  const approved = thisMonth.filter(r => r.status === 'approved').length;
  const rejected = thisMonth.filter(r => r.status === 'rejected').length;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="输入姓名查询" value={employeeName}
          onChange={e => setEmployeeName(e.target.value)} onSearch={fetch} style={{ width: 200 }} />
      </Space>
      {employeeName && reports.length > 0 ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card size="small"><Statistic title="本月产量" value={totalOut} valueStyle={{ color: '#52c41a' }} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="本月不良" value={totalDef} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="本月工时" value={totalHours} suffix="h" /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="通过/拒绝" value={`${approved}/${rejected}`} /></Card></Col>
          </Row>
          <Table rowKey="id" size="small" dataSource={thisMonth.slice(0, 30)} pagination={{ pageSize: 15 }}
            columns={[
              { title: '日期', dataIndex: 'report_date', width: 100 },
              { title: '工单', dataIndex: 'order_no', width: 130 },
              { title: '产品', dataIndex: 'product_name', width: 100 },
              { title: '良品', dataIndex: 'output_quantity', width: 70, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
              { title: '不良', dataIndex: 'defective_quantity', width: 70, align: 'right' },
              { title: '工时', dataIndex: 'work_hours', width: 60, align: 'right' },
              { title: '机台', dataIndex: 'machine_name', width: 100 },
              { title: '状态', width: 70, render: (_, r) => {
                const m = { submitted: { color: 'orange', label: '待审' }, approved: { color: 'green', label: '通过' }, rejected: { color: 'red', label: '拒绝' } };
                return <Tag color={m[r.status]?.color}>{m[r.status]?.label}</Tag>;
              }},
            ]}
          />
        </>
      ) : <Empty description="输入姓名查看个人统计" />}
    </div>
  );
}
