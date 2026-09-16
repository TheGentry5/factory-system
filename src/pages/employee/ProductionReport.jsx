import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Tabs, message, Modal, Select, Input, InputNumber,
         Form, DatePicker, Statistic, Row, Col, Empty } from 'antd';
import {
  FormOutlined, HistoryOutlined, DashboardOutlined, CheckCircleOutlined,
  CloseCircleOutlined, PlusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import PermissionGuard from '../../components/PermissionGuard';
import dayjs from 'dayjs';

import api from '../../utils/api';

// ==================== 生产报工主页 ====================
export default function ProductionReport() {
  const [activeTab, setActiveTab] = useState('report');

  return (
    <PermissionGuard permKey="production_report">
      <div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'report', label: '📝 生产报工', icon: <FormOutlined /> },
          { key: 'my_reports', label: '📋 我的报工记录', icon: <HistoryOutlined /> },
          { key: 'summary', label: '📊 个人产量统计', icon: <DashboardOutlined /> },
        ]} />

        {activeTab === 'report' && <ReportForm />}
        {activeTab === 'my_reports' && <MyReports />}
        {activeTab === 'summary' && <MySummary />}
      </div>
    </PermissionGuard>
  );
}

// ==================== 报工表单 ====================
function ReportForm() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [employeeName, setEmployeeName] = useState(localStorage.getItem('employee_name') || '');

  useEffect(() => {
    // 加载进行中的工单
    api.get('/production/orders', { status: 'in_progress', pageSize: 100 })
      .then(r => r.success && setOrders(r.data));
    // 加载启用中的机台（报工机台下拉）
    api.get('/production/machines')
      .then(r => r.success && setMachines(r.data));
  }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);

    localStorage.setItem('employee_name', values.employee_name);
    setEmployeeName(values.employee_name);

    const payload = {
      ...values,
      report_date: values.report_date ? values.report_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    };

    const res = await api.post('/production/reports', payload);
    if (res.success) {
      message.success(`报工成功！良品 ${values.output_quantity}，已提交审核`);
      form.resetFields();
      form.setFieldsValue({ employee_name: values.employee_name, report_date: dayjs(), shift: values.shift });
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Card title="生产报工" size="small">
          <Form form={form} layout="vertical"
            initialValues={{ report_date: dayjs(), shift: '早班' }}>
            <Form.Item name="employee_name" label="报工人" rules={[{ required: true, message: '请输入姓名' }]} initialValue={employeeName}>
              <Input placeholder="您的姓名" />
            </Form.Item>
            <Form.Item name="report_date" label="报工日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="order_id" label="关联工单">
              <Select allowClear showSearch placeholder="选择生产工单（可选）" optionFilterProp="label"
                options={orders.map(o => ({ label: `${o.order_no} ${o.product_name} (剩余${Math.max(0, (o.quantity||0) - (o.completed_quantity||0))}${o.unit})`, value: o.id }))} />
            </Form.Item>
            <Form.Item name="machine_name" label="机台/设备">
              <Select allowClear showSearch placeholder="选择机台/设备" optionFilterProp="label"
                options={machines.map(m => ({
                  label: m.owner_group_id ? `${m.machine_name} · ${m.owner_group_id}` : m.machine_name,
                  value: m.machine_name,
                }))} />
            </Form.Item>
            <Form.Item name="shift" label="班次">
              <Select options={[
                { label: '早班 08:00-16:00', value: '早班' },
                { label: '中班 16:00-00:00', value: '中班' },
                { label: '晚班 00:00-08:00', value: '晚班' },
              ]} />
            </Form.Item>
          </Form>
        </Card>
      </Col>

      <Col span={12}>
        <Card title="产量数据" size="small">
          <Form form={form} layout="vertical">
            <Form.Item name="output_quantity" label="良品产量" rules={[{ required: true, message: '请输入良品产量' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="当日合格品数量" />
            </Form.Item>
            <Form.Item name="defective_quantity" label="不良品数" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="次品/废品数量" />
            </Form.Item>
            <Form.Item name="work_hours" label="工时（小时）">
              <InputNumber min={0} max={24} step={0.5} style={{ width: '100%' }} placeholder="当日实际工作小时数" />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="其他需要说明的情况..." />
            </Form.Item>
            <Button type="primary" size="large" block icon={<FormOutlined />}
              loading={submitting} onClick={handleSubmit}>
              提交报工
            </Button>
          </Form>
        </Card>
      </Col>
    </Row>
  );
}

// ==================== 我的报工记录 ====================
function MyReports() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState(localStorage.getItem('employee_name') || '');

  const fetchData = async () => {
    if (!employeeName.trim()) { message.warning('请先在报工页面输入姓名'); return; }
    setLoading(true);
    const res = await api.get('/production/reports', { employee_name: employeeName, pageSize: 100 });
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { if (employeeName) fetchData(); }, []);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="输入姓名查询" value={employeeName}
          onChange={e => setEmployeeName(e.target.value)}
          onSearch={fetchData} style={{ width: 200 }} />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>查询</Button>
      </Space>
      {data.length > 0 ? (
        <Table rowKey="id" size="small" dataSource={data} loading={loading} pagination={{ pageSize: 20 }}
          columns={[
            { title: '日期', dataIndex: 'report_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
            { title: '工单', dataIndex: 'order_no', width: 130 },
            { title: '产品', dataIndex: 'product_name', width: 100 },
            { title: '良品', dataIndex: 'output_quantity', width: 70, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
            { title: '不良', dataIndex: 'defective_quantity', width: 70, align: 'right', render: v => v > 0 ? <Tag color="red">{v}</Tag> : '-' },
            { title: '工时', dataIndex: 'work_hours', width: 60, align: 'right' },
            { title: '机台', dataIndex: 'machine_name', width: 100 },
            { title: '班次', dataIndex: 'shift', width: 60 },
            { title: '状态', width: 80,
              render: (_, r) => {
                const m = { submitted: { color: 'orange', label: '待审' }, approved: { color: 'green', label: '已通过' }, rejected: { color: 'red', label: '已拒绝' } };
                return <Tag color={m[r.status]?.color}>{m[r.status]?.label}</Tag>;
              },
            },
            { title: '审核备注', dataIndex: 'review_remark', ellipsis: true },
            { title: '提交时间', dataIndex: 'created_at', width: 140, render: v => new Date(v).toLocaleString('zh-CN') },
          ]}
        />
      ) : (
        <Empty description="暂无报工记录，请输入姓名查询或先提交报工" />
      )}
    </>
  );
}

// ==================== 个人产量统计 ====================
function MySummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState(localStorage.getItem('employee_name') || '');

  const fetchStats = async () => {
    if (!employeeName.trim()) { message.warning('请输入姓名'); return; }
    setLoading(true);
    const res = await api.get('/production/daily-stats', { date: dayjs().format('YYYY-MM-DD') });
    if (res.success && res.data) {
      // 过滤当前员工
      const mine = (res.data.reports || []).filter(r => r.employee_name === employeeName);
      setData({ ...res.data, mine, totalOut: mine.reduce((s, r) => s + parseFloat(r.total_output || 0), 0),
        totalDef: mine.reduce((s, r) => s + parseFloat(r.total_defective || 0), 0),
      });
    }
    setLoading(false);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="输入姓名" value={employeeName}
          onChange={e => setEmployeeName(e.target.value)} onSearch={fetchStats} style={{ width: 200 }} />
        <Button onClick={fetchStats} icon={<ReloadOutlined />}>统计</Button>
      </Space>

      {data ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card><Statistic title="今日良品" value={data.totalOut} valueStyle={{ color: '#52c41a' }} /></Card></Col>
            <Col span={6}><Card><Statistic title="今日不良" value={data.totalDef} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
            <Col span={6}>
              <Card><Statistic title="不良率" value={data.totalOut + data.totalDef > 0 ? ((data.totalDef / (data.totalOut + data.totalDef)) * 100).toFixed(1) : '0'} suffix="%" /></Card>
            </Col>
            <Col span={6}><Card><Statistic title="报工次数" value={data.mine.length} /></Card></Col>
          </Row>

          {data.mine.length > 0 && (
            <Table rowKey="id" size="small" dataSource={data.mine} pagination={false}
              columns={[
                { title: '机台', dataIndex: 'machine_name', width: 120 },
                { title: '班次', dataIndex: 'shift', width: 60 },
                { title: '良品', dataIndex: 'total_output', width: 80, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
                { title: '不良', dataIndex: 'total_defective', width: 80, align: 'right' },
                { title: '工时(h)', dataIndex: 'total_hours', width: 80, align: 'right' },
              ]}
            />
          )}
        </>
      ) : (
        <Empty description="输入姓名后点击统计查看今日产量" />
      )}
    </>
  );
}
