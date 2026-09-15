import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal, Form, message,
  Tabs, Descriptions, Popconfirm, Row, Col, DatePicker, Statistic, Badge,
  InputNumber, Divider,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, EyeOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  ExperimentOutlined, EnvironmentOutlined, InboxOutlined,
  RollbackOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const api = {
  get: (url, params) =>
    fetch(`/api${url}?` + new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
    )).then(r => r.json()),
  post: (url, data) =>
    fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  put: (url, data) =>
    fetch(`/api${url}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  del: (url) =>
    fetch(`/api${url}`, { method: 'DELETE' }).then(r => r.json()),
};

const STATUS_MAP = {
  pending_inspection: { label: '待检验', color: 'processing' },
  inspecting: { label: '检验中', color: 'warning' },
  passed: { label: '已合格', color: 'success' },
  failed: { label: '不合格', color: 'error' },
  returned: { label: '已退货', color: 'default' },
  partial_accepted: { label: '部分接收', color: 'warning' },
  stored: { label: '已入库', color: 'success' },
};

const DISPOSITION_MAP = {
  return: '退货',
  full_inspect: '全检',
  accept_partial: '部分接收',
};

export default function QualityManage() {
  const [activeTab, setActiveTab] = useState('staging');

  const tabs = [
    { key: 'staging', label: '暂存区管理', icon: <EnvironmentOutlined /> },
    { key: 'standards', label: '质检标准', icon: <ExperimentOutlined /> },
    { key: 'disposition', label: '不合格处置', icon: <ExclamationCircleOutlined /> },
    { key: 'history', label: '检验历史', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />质检管理
      </h3>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs.map(t => ({
        key: t.key,
        label: <span>{t.icon} {t.label}</span>,
        children:
          t.key === 'staging' ? <StagingTab /> :
          t.key === 'standards' ? <StandardsTab /> :
          t.key === 'disposition' ? <DispositionTab /> :
          <HistoryTab />,
      }))} />
    </div>
  );
}

// ==================== Tab 1: 暂存区管理 ====================
function StagingTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/staging', { page, pageSize: 15, ...filters });
    if (res.success) { setData(res.data); setTotal(res.total); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleViewDetail = async (id) => {
    const res = await api.get(`/staging/${id}`);
    if (res.success) { setDetail(res.data); setDetailOpen(true); }
  };

  const handleStore = async (record) => {
    setDetail(record);
    storeForm.resetFields();
    storeForm.setFieldsValue({ store_quantity: record.qualified_quantity || record.quantity });
    setStoreOpen(true);
  };

  const doStore = async () => {
    const values = await storeForm.validateFields();
    const res = await api.post(`/staging/${detail.id}/store`, values);
    if (res.success) {
      message.success(`已入库，入库单号: ${res.data.record_no}`);
      setStoreOpen(false);
      fetchData();
    } else {
      message.error(res.message);
    }
  };

  const handleDelete = async (id) => {
    const res = await api.del(`/staging/${id}`);
    if (res.success) { message.success('已删除'); fetchData(); }
    else message.error(res.message);
  };

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '采购单号', dataIndex: 'po_no', width: 150, render: v => v || '-' },
    { title: '物料', dataIndex: 'material_name', width: 120, ellipsis: true,
      render: (text, r) => <Space size={4}>{text}<Tag>{r.material_code}</Tag></Space>,
    },
    { title: '供应商', dataIndex: 'supplier_name', width: 100, ellipsis: true, render: v => v || '-' },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '批次', dataIndex: 'batch_no', width: 90, render: v => v || '-' },
    { title: '到货日期', dataIndex: 'arrival_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '状态', dataIndex: 'status', width: 100,
      render: v => <Badge status={STATUS_MAP[v]?.color || 'default'} text={STATUS_MAP[v]?.label || v} />,
    },
    { title: '质检员', dataIndex: 'inspector', width: 80, render: v => v || '-' },
    { title: '操作', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.id)}>详情</Button>
          {(r.status === 'passed' || r.status === 'partial_accepted') && (
            <Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => handleStore(r)}>入库</Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索单号/物料/批次…"
            value={filters.keyword}
            onChange={e => { setFilters(f => ({ ...f, keyword: e.target.value })); setPage(1); }}
            onSearch={fetchData}
            style={{ width: 260 }}
            allowClear
          />
          <Select
            placeholder="状态筛选"
            value={filters.status}
            onChange={v => { setFilters(f => ({ ...f, status: v || '' })); setPage(1); }}
            allowClear
            style={{ width: 140 }}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ label: v.label, value: k }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 1300 }}
        pagination={{ current: page, total, pageSize: 15, showTotal: t => `共 ${t} 条`, onChange: p => setPage(p) }}
      />

      {/* 详情弹窗 */}
      <Modal title="暂存记录详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={750}>
        {detail && (
          <>
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="暂存单号">{detail.staging_no}</Descriptions.Item>
              <Descriptions.Item label="采购单号">{detail.po_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Badge status={STATUS_MAP[detail.status]?.color} text={STATUS_MAP[detail.status]?.label} /></Descriptions.Item>
              <Descriptions.Item label="物料">{detail.material_name} ({detail.material_code})</Descriptions.Item>
              <Descriptions.Item label="供应商">{detail.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="到货数量">{detail.quantity} {detail.unit || ''}</Descriptions.Item>
              <Descriptions.Item label="批次号">{detail.batch_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="暂存区域">{detail.storage_area || '-'}</Descriptions.Item>
              <Descriptions.Item label="收货人员">{detail.duty_personnel || '-'}</Descriptions.Item>
              <Descriptions.Item label="质检员">{detail.inspector || '-'}</Descriptions.Item>
              <Descriptions.Item label="检验结论">{detail.inspect_result ? <Tag color={detail.inspect_result === 'pass' ? 'green' : 'red'}>{detail.inspect_result}</Tag> : '-'}</Descriptions.Item>
              <Descriptions.Item label="合格数量">{detail.qualified_quantity || '-'}</Descriptions.Item>
              <Descriptions.Item label="处置决定">{detail.disposition ? DISPOSITION_MAP[detail.disposition] : '-'}</Descriptions.Item>
              <Descriptions.Item label="处置人">{detail.disposition_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注" span={3}>{detail.inspect_remark || detail.disposition_remark || '-'}</Descriptions.Item>
            </Descriptions>

            {detail.inspection_details && detail.inspection_details.length > 0 && (
              <>
                <Divider>检验明细</Divider>
                <Table rowKey="id" dataSource={detail.inspection_details} size="small" pagination={false}
                  columns={[
                    { title: '检验项目', dataIndex: 'inspection_item' },
                    { title: '标准值', dataIndex: 'standard_value', render: v => v || '-' },
                    { title: '实测值', dataIndex: 'actual_value', render: v => v || '-' },
                    { title: '结果', dataIndex: 'result', width: 80,
                      render: v => v === 'pass' ? <Tag color="green">合格</Tag> : v === 'fail' ? <Tag color="red">不合格</Tag> : <Tag>N/A</Tag>,
                    },
                    { title: '备注', dataIndex: 'remark', ellipsis: true, render: v => v || '-' },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>

      {/* 入库上架弹窗 */}
      <Modal title="入库上架" open={storeOpen} onOk={doStore} onCancel={() => setStoreOpen(false)} width={400}>
        <Form form={storeForm} layout="vertical">
          <Form.Item name="location_code" label="存放库位编码" rules={[{ required: true, message: '请输入库位编码' }]}>
            <Input placeholder="如：A1-01-1-1" />
          </Form.Item>
          <Form.Item name="store_quantity" label="入库数量">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="operator_name" label="操作人">
            <Input placeholder="仓管员姓名" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ==================== Tab 2: 质检标准 ====================
function StandardsTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialFilter, setMaterialFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    if (!materialFilter) { setData([]); setLoading(false); return; }
    const res = await api.get('/inbound-standards', { material_id: materialFilter });
    if (res.success) setData(res.data);
    setLoading(false);
  }, [materialFilter]);

  useEffect(() => {
    api.get('/materials', { pageSize: 200 }).then(r => {
      if (r.success) setMaterials(r.data || []);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEdit = (record) => {
    setEditingId(record?.id || null);
    if (record) form.setFieldsValue(record);
    else form.resetFields();
    setEditOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = { ...values, material_id: parseInt(materialFilter) };
    let res;
    if (editingId) {
      res = await api.put(`/inbound-standards/${editingId}`, payload);
    } else {
      res = await api.post('/inbound-standards', payload);
    }
    if (res.success) { message.success(editingId ? '已更新' : '已添加'); setEditOpen(false); fetchData(); }
    else message.error(res.message);
  };

  const handleDelete = async (id) => {
    await api.del(`/inbound-standards/${id}`);
    message.success('已删除');
    fetchData();
  };

  const columns = [
    { title: '检验项目', dataIndex: 'inspection_item', width: 150 },
    { title: '标准值', dataIndex: 'standard_value', width: 120 },
    { title: '上限公差', dataIndex: 'tolerance_upper', width: 100, render: v => v || '-' },
    { title: '下限公差', dataIndex: 'tolerance_lower', width: 100, render: v => v || '-' },
    { title: '检验方法', dataIndex: 'test_method', width: 120, ellipsis: true, render: v => v || '-' },
    { title: '必检', dataIndex: 'is_required', width: 60, render: v => v ? <Tag color="red">必检</Tag> : <Tag>选检</Tag> },
    { title: '排序', dataIndex: 'sort_order', width: 60 },
    { title: '操作', width: 140,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            showSearch
            placeholder="选择物料"
            value={materialFilter || undefined}
            onChange={v => setMaterialFilter(v || '')}
            style={{ width: 280 }}
            filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
            options={materials.map(m => ({ label: `${m.code} ${m.name}`, value: String(m.id) }))}
          />
          {materialFilter && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>添加标准项</Button>
          )}
        </Space>
      </Card>

      {materialFilter ? (
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} />
      ) : (
        <Card><div style={{ textAlign: 'center', color: '#999', padding: 40 }}>请先选择物料查看其检验标准</div></Card>
      )}

      <Modal title={editingId ? '编辑检验标准' : '添加检验标准'} open={editOpen} onOk={handleSave} onCancel={() => setEditOpen(false)} width={500}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="inspection_item" label="检验项目" rules={[{ required: true }]}>
                <Input placeholder="如：尺寸、外观、硬度…" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="standard_value" label="标准值">
                <Input placeholder="如：100mm ±0.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tolerance_upper" label="上限公差">
                <Input placeholder="如：+0.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tolerance_lower" label="下限公差">
                <Input placeholder="如：-0.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="test_method" label="检验方法">
                <Input placeholder="如：游标卡尺测量" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_required" label="是否必检" initialValue={1}>
                <Select options={[{ label: '必检', value: 1 }, { label: '选检', value: 0 }]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sort_order" label="排序" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ==================== Tab 3: 不合格处置 ====================
function DispositionTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dispoOpen, setDispoOpen] = useState(false);
  const [dispoRecord, setDispoRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/staging', { status: 'failed', pageSize: 100 });
    if (res.success) setData(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDisposition = (record) => {
    setDispoRecord(record);
    form.resetFields();
    form.setFieldsValue({ qualified_quantity: record.quantity });
    setDispoOpen(true);
  };

  const doDisposition = async () => {
    const values = await form.validateFields();
    const res = await api.put(`/staging/${dispoRecord.id}/disposition`, {
      ...values,
      disposition_by: values.disposition_by || '采购经理',
    });
    if (res.success) {
      message.success(values.disposition === 'return' ? '已标记退货' : values.disposition === 'accept_partial' ? '已标记部分接收' : '已退回全检');
      setDispoOpen(false);
      fetchData();
    } else {
      message.error(res.message);
    }
  };

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '物料', dataIndex: 'material_name', width: 120 },
    { title: '供应商', dataIndex: 'supplier_name', width: 100, render: v => v || '-' },
    { title: '到货数量', dataIndex: 'quantity', width: 80 },
    { title: '批次', dataIndex: 'batch_no', width: 90 },
    { title: '质检员', dataIndex: 'inspector', width: 80 },
    { title: '检验备注', dataIndex: 'inspect_remark', width: 150, ellipsis: true, render: v => v || '-' },
    { title: '到货日期', dataIndex: 'arrival_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '操作', width: 160, fixed: 'right',
      render: (_, r) => (
        <Button size="small" type="primary" icon={<ExclamationCircleOutlined />} onClick={() => handleDisposition(r)}>
          处置
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Statistic title="待处置数量" value={data.length} suffix="条" valueStyle={{ color: '#cf1322' }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条不合格记录` }}
      />

      <Modal title="不合格物料处置" open={dispoOpen} onOk={doDisposition} onCancel={() => setDispoOpen(false)} width={500}>
        <Form form={form} layout="vertical">
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="暂存单号">{dispoRecord?.staging_no}</Descriptions.Item>
            <Descriptions.Item label="物料">{dispoRecord?.material_name}</Descriptions.Item>
            <Descriptions.Item label="数量">{dispoRecord?.quantity}</Descriptions.Item>
            <Descriptions.Item label="检验备注">{dispoRecord?.inspect_remark || '-'}</Descriptions.Item>
          </Descriptions>

          <Form.Item name="disposition" label="处置决定" rules={[{ required: true, message: '请选择处置方式' }]}>
            <Select placeholder="选择处置方式" options={[
              { label: '🚚 退货 — 全部退回供应商', value: 'return' },
              { label: '🔍 全检 — 退回质检员重新全检', value: 'full_inspect' },
              { label: '✅ 部分接收 — 接收合格部分，不合格退货', value: 'accept_partial' },
            ]} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.disposition !== cur.disposition}>
            {({ getFieldValue }) =>
              getFieldValue('disposition') === 'accept_partial' ? (
                <Form.Item name="qualified_quantity" label="合格数量（入库）" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item name="disposition_remark" label="处置备注">
            <Input.TextArea rows={2} placeholder="处置原因说明…" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ==================== Tab 4: 检验历史 ====================
function HistoryTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', start_date: '', end_date: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = { page, pageSize: 15 };
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    const res = await api.get('/staging', params);
    if (res.success) {
      // 仅显示已完成检验的
      const done = res.data.filter(r => ['passed','failed','partial_accepted','stored','returned'].includes(r.status));
      setData(done);
      setTotal(res.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '物料', dataIndex: 'material_name', width: 120 },
    { title: '供应商', dataIndex: 'supplier_name', width: 100, render: v => v || '-' },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '质检员', dataIndex: 'inspector', width: 80 },
    { title: '检验结果', dataIndex: 'inspect_result', width: 90,
      render: v => v === 'pass' ? <Tag color="green">合格</Tag> : v === 'fail' ? <Tag color="red">不合格</Tag> : v === 'partial' ? <Tag color="orange">部分合格</Tag> : '-',
    },
    { title: '状态', dataIndex: 'status', width: 90,
      render: v => <Badge status={STATUS_MAP[v]?.color || 'default'} text={STATUS_MAP[v]?.label || v} />,
    },
    { title: '检验日期', dataIndex: 'inspect_date', width: 160,
      render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    { title: '备注', dataIndex: 'inspect_remark', width: 130, ellipsis: true },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索单号/物料…"
            value={filters.keyword}
            onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))}
            onSearch={fetchData}
            style={{ width: 240 }}
            allowClear
          />
          <DatePicker placeholder="开始日期" onChange={d => setFilters(f => ({ ...f, start_date: d ? d.format('YYYY-MM-DD') : '' }))} />
          <DatePicker placeholder="结束日期" onChange={d => setFilters(f => ({ ...f, end_date: d ? d.format('YYYY-MM-DD') : '' }))} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 1000 }}
        pagination={{ current: page, total, pageSize: 15, showTotal: t => `共 ${t} 条`, onChange: p => setPage(p) }}
      />
    </>
  );
}
