import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Select,
  DatePicker, Input, message, Tabs, Popconfirm, Typography, Alert, Row, Col, Statistic,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, PlayCircleOutlined,
  MoneyCollectOutlined, ReloadOutlined, WarningOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const money = (v) => `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rateText = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toFixed(2)}`);
const hoursText = (v) => `${(Number(v) || 0).toFixed(1)} h`;

const DIM_OPTIONS = [
  { value: 'machine', label: '按机器' },
  { value: 'order', label: '按工单' },
  { value: 'date', label: '按日期' },
  { value: 'group', label: '按业务组' },
];

export default function MachineCostManage() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';

  const [tab, setTab] = useState('rate');

  // ── 设备单价 ──
  const [machines, setMachines] = useState([]);
  const [machineLoading, setMachineLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // ── 机时费统计 ──
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [groupCode, setGroupCode] = useState(sessionStorage.getItem('currentGroup') || '__all__');
  const [groupBy, setGroupBy] = useState('machine');
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState({ rows: [], totals: { totalHours: 0, totalCost: 0, reportCount: 0 } });
  const [unmatched, setUnmatched] = useState([]);
  const [statLoading, setStatLoading] = useState(false);

  const fetchMachines = useCallback(async () => {
    setMachineLoading(true);
    try {
      const params = {};
      if (keyword) params.keyword = keyword;
      if (statusFilter !== undefined) params.status = statusFilter;
      const res = await api.get('/machines', params);
      if (res.success) setMachines(res.data || []);
      else message.error(res.message || '设备列表加载失败');
    } finally {
      setMachineLoading(false);
    }
  }, [keyword, statusFilter]);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  // 业务组下拉（用于统计口径过滤 / 组名展示）
  useEffect(() => {
    api.get('/groups')
      .then((res) => { if (res.success) setGroups(res.data || []); })
      .catch(() => { /* 业务组加载失败不影响统计 */ });
  }, []);

  const groupOptions = useMemo(() => ([
    { label: '全部业务组', value: '__all__' },
    ...groups.map((g) => ({ label: g.group_name, value: g.group_code })),
  ]), [groups]);

  const groupNameMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => { map[g.group_code] = g.group_name; });
    return map;
  }, [groups]);

  const rangeParams = useCallback(() => ({
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  }), [range]);

  const fetchStats = useCallback(async () => {
    setStatLoading(true);
    try {
      const { from, to } = rangeParams();
      const [s, u] = await Promise.all([
        api.get('/machines/costs/summary', { from, to, groupBy }, { groupCode }),
        api.get('/machines/costs/unmatched', { from, to }, { groupCode }),
      ]);
      if (s.success) setSummary(s.data || { rows: [], totals: {} });
      if (u.success) setUnmatched(u.data || []);
    } finally {
      setStatLoading(false);
    }
  }, [rangeParams, groupBy, groupCode]);

  useEffect(() => {
    if (tab === 'stat') fetchStats();
  }, [tab, fetchStats]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ hourly_cost: 150, daily_available_hours: 16 });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      machine_name: row.machine_name,
      machine_type: row.machine_type,
      owner_group_id: row.owner_group_id,
      hourly_cost: Number(row.hourly_cost),
      daily_available_hours: row.daily_available_hours,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const payload = { ...values, operator_name: operator };
      const res = editing
        ? await api.put(`/machines/${editing.id}`, payload)
        : await api.post('/machines', payload);
      if (res.success) {
        message.success(editing ? '设备已保存' : '设备已新增');
        setModalOpen(false);
        fetchMachines();
        if (tab === 'stat') fetchStats();
      } else {
        message.error(res.message || '操作失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    const res = await api.put(`/machines/${row.id}`, {
      status: row.status ? 0 : 1,
      operator_name: operator,
    });
    if (res.success) {
      message.success(row.status ? '设备已停用' : '设备已启用');
      fetchMachines();
      if (tab === 'stat') fetchStats();
    } else {
      message.error(res.message || '操作失败');
    }
  };

  const machineColumns = [
    { title: '设备名称', dataIndex: 'machine_name', width: 150 },
    { title: '类型', dataIndex: 'machine_type', width: 100, render: (v) => v || '-' },
    { title: '归属组', dataIndex: 'owner_group_id', width: 100, render: (v) => v || '共享' },
    { title: '小时单价', dataIndex: 'hourly_cost', width: 110, align: 'right', render: (v) => <Text strong>¥{Number(v).toFixed(2)}</Text> },
    { title: '每日可用工时', dataIndex: 'daily_available_hours', width: 120, align: 'right', render: (v) => `${v} h` },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => (v ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>) },
    { title: '最后修改人', dataIndex: 'updated_by', width: 110, render: (v) => v || '-' },
    { title: '最后修改时间', dataIndex: 'updated_at', width: 170, render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
    {
      title: '操作', key: 'action', fixed: 'right', width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm
            title={r.status ? '停用后不再允许新排产/报工选择，历史机时费仍保留，确认停用？' : '确认启用该设备？'}
            okText="确认"
            cancelText="取消"
            onConfirm={() => toggleStatus(r)}
          >
            <Button size="small" type="link" danger={!!r.status} icon={r.status ? <StopOutlined /> : <PlayCircleOutlined />}>
              {r.status ? '停用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const dimRender = useMemo(() => ({
    machine: (r) => r.label,
    order: (r) => (
      <>
        {r.label}
        {r.sublabel ? <Text type="secondary" style={{ fontSize: 12 }}> · {r.sublabel}</Text> : null}
      </>
    ),
    date: (r) => r.label,
    group: (r) => groupNameMap[r.key] || r.label,
  }), [groupNameMap]);

  const statColumns = [
    { title: DIM_OPTIONS.find((d) => d.value === groupBy)?.label.replace('按', '') || '维度', key: 'dim', render: (_, r) => dimRender[groupBy](r) },
    { title: groupBy === 'machine' ? '小时单价' : '平均单价', dataIndex: 'hourlyCost', width: 120, align: 'right', render: rateText },
    { title: '工时', dataIndex: 'totalHours', width: 120, align: 'right', render: hoursText },
    { title: '报工数', dataIndex: 'reportCount', width: 100, align: 'right' },
    { title: '机时费', dataIndex: 'totalCost', width: 150, align: 'right', render: (v) => <Text strong style={{ color: '#fa8c16' }}>{money(v)}</Text> },
  ];

  const totals = summary.totals || {};

  const unmatchedColumns = [
    { title: '报工日期', dataIndex: 'reportDate', width: 110 },
    { title: '报工人', dataIndex: 'employeeName', width: 100 },
    { title: '机台名称', dataIndex: 'machineName', width: 140, render: (v) => (v ? <Text type="warning">{v}</Text> : <Text type="danger">未填写</Text>) },
    { title: '工单号', dataIndex: 'orderNo', width: 130, render: (v) => v || '-' },
    { title: '产品', dataIndex: 'productName', ellipsis: true, render: (v) => v || '-' },
    { title: '工时', dataIndex: 'workHours', width: 100, align: 'right', render: (v) => (v === null ? <Text type="warning">缺工时</Text> : hoursText(v)) },
  ];

  return (
    <Card
      title={<><MoneyCollectOutlined /> 机时费管理</>}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>机时费 = 实际工时 × 小时单价</Text>}
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'rate',
            label: '设备单价',
            children: (
              <>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="搜索设备名称/类型/归属"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ width: 240 }}
                  />
                  <Select
                    allowClear
                    placeholder="状态"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 120 }}
                    options={[{ value: '1', label: '启用' }, { value: '0', label: '停用' }]}
                  />
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增设备</Button>
                  <Button icon={<ReloadOutlined />} onClick={fetchMachines}>刷新</Button>
                </Space>
                <Table
                  rowKey="id"
                  size="small"
                  loading={machineLoading}
                  dataSource={machines}
                  columns={machineColumns}
                  scroll={{ x: 1100 }}
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                />
              </>
            ),
          },
          {
            key: 'stat',
            label: '机时费统计',
            children: (
              <>
                <Space style={{ marginBottom: 16 }} wrap>
                  <RangePicker
                    value={range}
                    onChange={(v) => setRange(v)}
                    allowClear={false}
                  />
                  <Select
                    value={groupCode}
                    onChange={setGroupCode}
                    style={{ width: 180 }}
                    options={groupOptions}
                  />
                  <Select
                    value={groupBy}
                    onChange={setGroupBy}
                    style={{ width: 140 }}
                    options={DIM_OPTIONS}
                  />
                  <Button icon={<ReloadOutlined />} onClick={fetchStats}>刷新</Button>
                </Space>

                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={12} md={8}>
                    <Card size="small"><Statistic title="合计工时" value={totals.totalHours || 0} precision={1} suffix="h" /></Card>
                  </Col>
                  <Col xs={12} md={8}>
                    <Card size="small"><Statistic title="报工条数" value={totals.reportCount || 0} /></Card>
                  </Col>
                  <Col xs={12} md={8}>
                    <Card size="small">
                      <Statistic title="合计机时费" value={totals.totalCost || 0} precision={2} prefix="¥" valueStyle={{ color: '#fa8c16' }} />
                    </Card>
                  </Col>
                </Row>

                <Table
                  rowKey="key"
                  size="small"
                  loading={statLoading}
                  dataSource={summary.rows || []}
                  columns={statColumns}
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><Text strong>合计</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">-</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right"><Text strong>{hoursText(totals.totalHours)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right"><Text strong>{totals.reportCount || 0}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#fa8c16' }}>{money(totals.totalCost)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />

                {unmatched.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <Alert
                      type="warning"
                      showIcon
                      icon={<WarningOutlined />}
                      message={`未匹配设备的报工（${unmatched.length} 条）`}
                      description="以下报工的机台名称未在设备主数据中登记，机时费暂计为 0。请到「设备单价」页补录设备后，机时费将自动计入统计。"
                      style={{ marginBottom: 12 }}
                    />
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={unmatched}
                      columns={unmatchedColumns}
                      pagination={{ pageSize: 10, showSizeChanger: false }}
                    />
                  </div>
                )}
              </>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? `编辑设备（${editing.machine_name}）` : '新增设备'}
        open={modalOpen}
        confirmLoading={saving}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="machine_name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
            <Input placeholder="如：印刷机1号" maxLength={200} />
          </Form.Item>
          <Form.Item name="machine_type" label="设备类型">
            <Input placeholder="如：印刷机 / 折页机" maxLength={100} />
          </Form.Item>
          <Form.Item name="owner_group_id" label="归属组">
            <Input placeholder="共享设备可留空" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="hourly_cost"
            label="小时单价（元/时）"
            rules={[{ required: true, message: '请输入小时单价' }]}
          >
            <InputNumber min={0} precision={2} step={10} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="daily_available_hours" label="每日可用工时（小时）">
            <InputNumber min={0} max={24} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
