import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, message, Modal, Select, Input, InputNumber,
         Row, Col, Statistic, Empty, Form, DatePicker, Popconfirm } from 'antd';
import {
  OrderedListOutlined, CheckCircleOutlined,
  ExperimentOutlined, PlusOutlined, ReloadOutlined,
  DeleteOutlined, PlayCircleOutlined, EyeOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import api from '../../utils/api';

// 规格单位选项
const SPEC_UNITS = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
  { label: 'm', value: 'm' },
  { label: '英寸', value: '英寸' },
  { label: '开', value: '开' },
];

// 解析已有规格字符串 → { length, width, unit }
function parseSpec(str) {
  if (!str) return { length: null, width: null, unit: 'mm' };
  // 210×285mm  /  889×1194mm  /  400×300×100mm 等
  const m = str.match(/^(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|英寸)?$/);
  if (m) return { length: parseFloat(m[1]), width: parseFloat(m[2]), unit: m[3] || 'mm' };
  // 正度8开 → unit=开
  if (/开$/.test(str)) return { length: null, width: null, unit: '开' };
  return { length: null, width: null, unit: 'mm' };
}

// 组合规格
function composeSpec(length, width, unit) {
  if (!length && !width) return '';
  if (unit === '开') return `${length || ''}${width || ''}开`;
  return `${length || ''}×${width || ''}${unit}`;
}

// 格式化 dayjs → 'YYYY-MM-DD' 字符串，否则保持原值
function fmtDate(v) {
  return v && typeof v === 'object' && v.format ? v.format('YYYY-MM-DD') : v;
}

// 展示用：后端 DATE 字段经 JSON 序列化为 UTC ISO，转回 'YYYY-MM-DD'
function fmtDateDisplay(v) {
  if (!v) return '-';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD') : v;
}

// ==================== 生产管理主页 ====================
// 子模块由路由参数决定，顶部子导航由 BaseLayout 按菜单分组渲染
const PRODUCTION_PANELS = {
  overview: OverviewPanel,
  orders: OrdersPanel,
  review: ReviewPanel,
  daily: DailyPanel,
  bom: BOMPanel,
};

export default function ProductionManage() {
  const { tab } = useParams();
  const Panel = PRODUCTION_PANELS[tab] || OverviewPanel;
  return <Panel />;
}

// ==================== 1. 生产总览 ====================
function OverviewPanel() {
  const [data, setData] = useState(null);

  const fetch = async () => {
    const res = await api.get('/production/overview');
    if (res.success) setData(res.data);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}><Card><Statistic title="总工单" value={data?.totalOrders || 0} prefix={<OrderedListOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="在产工单" value={data?.inProgress || 0} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="今日完成" value={data?.completedToday || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="本月产量" value={data?.monthOutput || 0} /></Card></Col>
        <Col span={4}><Card><Statistic title="本月不良" value={data?.monthDefective || 0} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="不良率" value={data?.defectRate || '0'} suffix="%"
          valueStyle={{ color: parseFloat(data?.defectRate) > 5 ? '#ff4d4f' : '#52c41a' }} /></Card></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}><Card size="small"><Statistic title="待审核报工" value={data?.pendingReview || 0}
          valueStyle={{ color: data?.pendingReview > 0 ? '#faad14' : '#52c41a' }} suffix="条" /></Card></Col>
        <Col span={12}><Card size="small"><Statistic title="今日报工" value={data?.todayReports || 0} suffix="条" /></Card></Col>
      </Row>
    </div>
  );
}

// ==================== 2. 工单管理 ====================
function OrdersPanel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const res = await api.get('/production/orders', { status: statusFilter, pageSize: 100 });
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const spec = composeSpec(values.spec_length, values.spec_width, values.spec_unit);
    const payload = {
      ...values,
      spec,
      planned_start: fmtDate(values.planned_start),
      planned_end: fmtDate(values.planned_end),
      delivery_date: fmtDate(values.delivery_date),
    };
    setSubmitting(true);
    const res = await api.post('/production/orders', payload);
    if (res.success) {
      message.success(`工单 ${res.data.order_no} 已创建`);
      setCreateOpen(false);
      form.resetFields();
      fetchData();
    } else message.error(res.message);
    setSubmitting(false);
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    const spec = composeSpec(values.spec_length, values.spec_width, values.spec_unit);
    const payload = {
      ...values,
      spec,
      planned_start: fmtDate(values.planned_start),
      planned_end: fmtDate(values.planned_end),
      delivery_date: fmtDate(values.delivery_date),
    };
    setSubmitting(true);
    const res = await api.put(`/production/orders/${selectedOrder.id}`, payload);
    if (res.success) { message.success('已更新'); setEditOpen(false); fetchData(); }
    else message.error(res.message);
    setSubmitting(false);
  };

  const openEdit = (order) => {
    setSelectedOrder(order);
    const parsed = parseSpec(order.spec);
    editForm.setFieldsValue({ ...order, ...parsed,
      spec_length: parsed.length, spec_width: parsed.width, spec_unit: parsed.unit,
      planned_start: order.planned_start ? dayjs(order.planned_start) : null,
      planned_end: order.planned_end ? dayjs(order.planned_end) : null,
      delivery_date: order.delivery_date ? dayjs(order.delivery_date) : null,
    });
    setEditOpen(true);
  };

  const handleStatus = async (id, status) => {
    const res = await api.put(`/production/orders/${id}/status`, { status });
    if (res.success) { message.success(status === 'in_progress' ? '已开工' : status === 'completed' ? '已完工' : '已取消'); fetchData(); }
    else message.error(res.message);
  };

  const statusMap = {
    draft: { color: 'default', label: '草稿' }, pending: { color: 'blue', label: '待派发' },
    in_progress: { color: 'processing', label: '生产中' }, completed: { color: 'green', label: '已完成' },
    cancelled: { color: 'default', label: '已取消' },
  };
  const priorityMap = {
    low: { color: 'default', label: '低' }, normal: { color: 'blue', label: '普通' },
    high: { color: 'orange', label: '高' }, urgent: { color: 'red', label: '紧急' },
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>创建工单</Button>
        <Select value={statusFilter} onChange={setStatusFilter} allowClear placeholder="状态筛选" style={{ width: 120 }}
          options={Object.entries(statusMap).map(([k, v]) => ({ label: v.label, value: k }))} />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </Space>

      <Table rowKey="id" size="small" dataSource={data} loading={loading} pagination={{ pageSize: 20 }}
        columns={[
          { title: '工单号', dataIndex: 'order_no', width: 140 },
          { title: '产品名称', dataIndex: 'product_name', width: 100 },
          { title: '客户', dataIndex: 'customer_name', width: 100, render: v => v || '-' },
          { title: '规格', dataIndex: 'spec', width: 120 },
          { title: '计划数量', dataIndex: 'quantity', width: 80, align: 'right' },
          { title: '已完成', dataIndex: 'completed_quantity', width: 80, align: 'right',
            render: (v, r) => <span style={{ color: v >= r.quantity ? '#52c41a' : '#1890ff' }}>{v || 0}</span> },
          { title: '单位', dataIndex: 'unit', width: 50 },
          { title: '优先', dataIndex: 'priority', width: 70, render: v => <Tag color={priorityMap[v]?.color}>{priorityMap[v]?.label}</Tag> },
          { title: '状态', dataIndex: 'status', width: 80, render: v => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
          { title: '负责人', dataIndex: 'assigned_to', width: 80 },
          { title: '业务组', dataIndex: 'group_id', width: 100, render: v => v ? <Tag>{v}</Tag> : '-' },
          { title: '计划开始', dataIndex: 'planned_start', width: 100, render: fmtDateDisplay },
          { title: '计划结束', dataIndex: 'planned_end', width: 100, render: fmtDateDisplay },
          { title: '交期', dataIndex: 'delivery_date', width: 100,
            render: v => v ? <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{fmtDateDisplay(v)}</span> : '-' },
          {
            title: '操作', width: 220,
            render: (_, r) => (
              <Space size={4}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                {r.status === 'draft' || r.status === 'pending' ? (
                  <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => handleStatus(r.id, 'in_progress')}>开工</Button>
                ) : r.status === 'in_progress' ? (
                  <Button size="small" style={{ color: '#52c41a' }} icon={<CheckCircleOutlined />} onClick={() => handleStatus(r.id, 'completed')}>完工</Button>
                ) : null}
                {(r.status === 'draft' || r.status === 'pending') && (
                  <Popconfirm title="确认取消?" onConfirm={() => handleStatus(r.id, 'cancelled')}>
                    <Button size="small" danger icon={<CloseCircleOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* 创建工单弹窗 */}
      <Modal title="创建工单" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate} confirmLoading={submitting} width={600}>
        <Form form={form} layout="vertical" initialValues={{ spec_unit: 'mm', unit: '个', priority: 'normal' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_name" label="产品名称" rules={[{ required: true }]}><Input placeholder="如：画册封面" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_name" label="客户公司"><Input placeholder="如：XX印刷品有限公司" /></Form.Item>
            </Col>
          </Row>

          {/* 规格：长 × 宽 + 单位 */}
          <Form.Item label="规格">
            <Row gutter={8}>
              <Col span={9}>
                <Form.Item name="spec_length" noStyle><InputNumber min={0} placeholder="长" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col span={1} style={{ textAlign: 'center', lineHeight: '32px' }}>×</Col>
              <Col span={9}>
                <Form.Item name="spec_width" noStyle><InputNumber min={0} placeholder="宽" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="spec_unit" noStyle>
                  <Select options={SPEC_UNITS} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="quantity" label="计划数量" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="单位"><Input /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={Object.entries(priorityMap).map(([k, v]) => ({ label: v.label, value: k }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="planned_start" label="计划开始"><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_end" label="计划结束"><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="delivery_date" label="交期"><DatePicker style={{ width: '100%' }} placeholder="客户要求交付日期" /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="assigned_to" label="负责人/班组"><Input placeholder="如：印刷一班" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="created_by" label="创建人"><Input placeholder="操作人" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 编辑工单弹窗 */}
      <Modal title="编辑工单" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleEdit} confirmLoading={submitting} width={600}>
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_name" label="客户公司"><Input /></Form.Item>
            </Col>
          </Row>

          {/* 规格：长 × 宽 + 单位 */}
          <Form.Item label="规格">
            <Row gutter={8}>
              <Col span={9}>
                <Form.Item name="spec_length" noStyle><InputNumber min={0} placeholder="长" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col span={1} style={{ textAlign: 'center', lineHeight: '32px' }}>×</Col>
              <Col span={9}>
                <Form.Item name="spec_width" noStyle><InputNumber min={0} placeholder="宽" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="spec_unit" noStyle>
                  <Select options={SPEC_UNITS} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="quantity" label="计划数量" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="单位"><Input /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={Object.entries(priorityMap).map(([k, v]) => ({ label: v.label, value: k }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="planned_start" label="计划开始"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="planned_end" label="计划结束"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="delivery_date" label="交期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="assigned_to" label="负责人/班组"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="created_by" label="创建人"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ==================== 3. 报工审核 ====================
function ReviewPanel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('submitted');

  const fetchData = async () => {
    setLoading(true);
    const res = await api.get('/production/reports', { status: statusFilter, pageSize: 100 });
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleReview = async (id, status) => {
    const comment = status === 'rejected' ? prompt('请输入拒绝原因：') : '';
    const res = await api.put(`/production/reports/${id}/review`, {
      status, reviewed_by: '管理者', review_remark: comment || undefined,
    });
    if (res.success) { message.success(status === 'approved' ? '已通过' : '已拒绝'); fetchData(); }
    else message.error(res.message);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}
          options={[{ label: '待审核', value: 'submitted' }, { label: '已通过', value: 'approved' }, { label: '已拒绝', value: 'rejected' }]} />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        <Tag color="orange">{data.length} 条</Tag>
      </Space>
      <Table rowKey="id" size="small" dataSource={data} loading={loading} pagination={{ pageSize: 20 }}
        columns={[
          { title: '日期', dataIndex: 'report_date', width: 100, render: fmtDateDisplay },
          { title: '工单号', dataIndex: 'order_no', width: 130 },
          { title: '产品', dataIndex: 'product_name', width: 100 },
          { title: '报工人', dataIndex: 'employee_name', width: 80 },
          { title: '良品', dataIndex: 'output_quantity', width: 70, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
          { title: '不良', dataIndex: 'defective_quantity', width: 70, align: 'right', render: v => v > 0 ? <Tag color="red">{v}</Tag> : '-' },
          { title: '工时(h)', dataIndex: 'work_hours', width: 70, align: 'right' },
          { title: '机台', dataIndex: 'machine_name', width: 100 },
          { title: '班次', dataIndex: 'shift', width: 70 },
          { title: '备注', dataIndex: 'remark', ellipsis: true, width: 100 },
          { title: '状态', width: 80, render: (_, r) => {
            const m = { submitted: { color: 'orange', label: '待审' }, approved: { color: 'green', label: '已通过' }, rejected: { color: 'red', label: '已拒绝' } };
            return <Tag color={m[r.status]?.color}>{m[r.status]?.label}</Tag>;
          }},
          { title: '审核人', dataIndex: 'reviewed_by', width: 70 },
          { title: '操作', width: 140, render: (_, r) => r.status === 'submitted' ? (
            <Space size={4}>
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleReview(r.id, 'approved')}>通过</Button>
              <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleReview(r.id, 'rejected')}>拒绝</Button>
            </Space>
          ) : null },
        ]}
      />
    </>
  );
}

// ==================== 4. 生产日报 ====================
function DailyPanel() {
  const [date, setDate] = useState(dayjs());
  const [data, setData] = useState(null);

  const fetchData = async (d) => {
    const target = d || date;
    const res = await api.get('/production/daily-stats', { date: target.format('YYYY-MM-DD') });
    if (res.success) setData(res.data);
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker value={date} onChange={(d) => { setDate(d); fetchData(d); }} />
        <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>查询</Button>
      </Space>
      {data?.reports?.length > 0 ? (
        <Table rowKey={(r, i) => i} size="small" dataSource={data.reports} pagination={false}
          summary={() => {
            const totalOut = data.reports.reduce((s, r) => s + parseFloat(r.total_output || 0), 0);
            const totalDef = data.reports.reduce((s, r) => s + parseFloat(r.total_defective || 0), 0);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} /><Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3}><strong style={{ color: '#52c41a' }}>{totalOut}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={4}><strong style={{ color: '#ff4d4f' }}>{totalDef}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={5} /><Table.Summary.Cell index={6} />
              </Table.Summary.Row>
            );
          }}
          columns={[
            { title: '员工', dataIndex: 'employee_name', width: 80 },
            { title: '机台', dataIndex: 'machine_name', width: 100 },
            { title: '班次', dataIndex: 'shift', width: 70 },
            { title: '良品', dataIndex: 'total_output', width: 80, align: 'right', render: v => <span style={{ color: '#52c41a' }}>{v}</span> },
            { title: '不良', dataIndex: 'total_defective', width: 80, align: 'right', render: v => v > 0 ? <Tag color="red">{v}</Tag> : '-' },
            { title: '工时(h)', dataIndex: 'total_hours', width: 80, align: 'right' },
            { title: '报工次数', dataIndex: 'report_count', width: 80, align: 'right' },
          ]}
        />
      ) : <Empty description="所选日期暂无报工数据" />}
    </>
  );
}

// ==================== 5. BOM 管理 ====================
function BOMPanel() {
  const [data, setData] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const res = await api.get('/production/bom', { pageSize: 200 });
    if (res.success) { setData(res.data); setGrouped(res.grouped); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = async () => {
    form.resetFields();
    setCreateOpen(true);
    const res = await api.get('/materials', { pageSize: 200 });
    if (res.success) setMaterials(res.data);
  };

  const handleAdd = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    const res = await api.post('/production/bom', values);
    if (res.success) { message.success('BOM条目已添加'); setCreateOpen(false); fetchData(); }
    else message.error(res.message);
    setSubmitting(false);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加BOM条目</Button>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </Space>
      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([productName, items]) => (
          <Card key={productName} title={<><ExperimentOutlined /> {productName} <Tag>{items.length}种物料</Tag></>}
            size="small" style={{ marginBottom: 12 }}>
            <Table rowKey="id" size="small" dataSource={items} pagination={false}
              columns={[
                { title: '物料编码', dataIndex: 'material_code', width: 110 },
                { title: '物料名称', dataIndex: 'material_name', width: 120 },
                { title: '规格', dataIndex: 'material_spec', width: 100 },
                { title: '用量', dataIndex: 'quantity', width: 70, align: 'right' },
                { title: '单位', dataIndex: 'unit', width: 60 },
                { title: '工序', dataIndex: 'process_order', width: 60, align: 'right' },
                { title: '备注', dataIndex: 'remark', ellipsis: true },
                { title: '操作', width: 60, render: (_, r) => (
                  <Popconfirm title="删除?" onConfirm={async () => { await api.del(`/production/bom/${r.id}`); fetchData(); }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )},
              ]}
            />
          </Card>
        ))
      ) : <Empty description="暂无BOM数据" />}
      <Modal title="添加BOM条目" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleAdd} confirmLoading={submitting}>
        <Form form={form} layout="vertical">
          <Form.Item name="product_name" label="成品名称" rules={[{ required: true }]}><Input placeholder="如：画册封面" /></Form.Item>
          <Form.Item name="material_id" label="物料" rules={[{ required: true }]}>
            <Select showSearch placeholder="搜索物料" optionFilterProp="label"
              options={materials.map(m => ({ label: `${m.code} ${m.name} (${m.spec || '-'})`, value: m.id }))} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="quantity" label="用量" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="unit" label="单位"><Input placeholder="张/令/kg" /></Form.Item></Col>
          </Row>
          <Form.Item name="process_order" label="工序顺序"><InputNumber min={0} placeholder="0=首工序" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
