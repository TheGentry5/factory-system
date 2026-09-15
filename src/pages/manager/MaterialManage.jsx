import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal, Form, message,
  Tabs, Descriptions, Badge, Tooltip, Popconfirm, Row, Col, Statistic, Alert,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
  ExclamationCircleOutlined, CheckCircleOutlined, ClockCircleOutlined,
  InboxOutlined, TeamOutlined, ExperimentOutlined, EnvironmentOutlined,
} from '@ant-design/icons';

// ==================== API 工具 ====================
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

// ==================== 常量 ====================
const STOCK_WARN_THRESHOLD = 1.3; // 库存低于安全库存的130%时预警

// ==================== 组件 ====================
export default function MaterialManage() {
  const [activeTab, setActiveTab] = useState('materials');

  const tabItems = [
    { key: 'materials', label: '物料主数据', icon: <InboxOutlined /> },
    { key: 'suppliers', label: '供应商管理', icon: <TeamOutlined /> },
    { key: 'inbound', label: '入库审核', icon: <SafetyCertificateOutlined /> },
  ];

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      {activeTab === 'materials' && <MaterialList />}
      {activeTab === 'suppliers' && <SupplierList />}
      {activeTab === 'inbound' && <InboundApproval />}
    </div>
  );
}

// ==================== 1. 物料主数据 ====================
function MaterialList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/materials', {
        page, pageSize: 15, keyword, category_id: categoryFilter,
      });
      if (res.success) { setData(res.data); setTotal(res.total); }
    } catch (e) { message.error('加载失败'); }
    setLoading(false);
  }, [page, keyword, categoryFilter]);

  const fetchCategories = async () => {
    const res = await api.get('/categories');
    if (res.success) setCategories(res.data);
  };
  const fetchSuppliers = async () => {
    const res = await api.get('/suppliers');
    if (res.success) setSuppliers(res.data);
  };

  useEffect(() => { fetchData(); fetchCategories(); fetchSuppliers(); }, [fetchData]);

  // 查看详情（含入库标准）
  const handleView = async (record) => {
    const res = await api.get(`/materials/${record.id}`);
    if (res.success) { setSelectedMaterial(res.data); setDetailOpen(true); }
  };

  // 编辑/新增
  const handleEdit = (record) => {
    setEditingId(record?.id || null);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      let res;
      if (editingId) {
        res = await api.put(`/materials/${editingId}`, values);
      } else {
        res = await api.post('/materials', values);
      }
      if (res.success) {
        message.success(editingId ? '更新成功' : `新增成功，编码：${res.data.code}`);
        setEditOpen(false);
        fetchData();
      } else {
        message.error(res.message);
      }
    } catch (e) { /* validation error */ }
  };

  const handleDelete = async (id) => {
    const res = await api.del(`/materials/${id}`);
    if (res.success) { message.success('已删除'); fetchData(); }
  };

  // 库存预警判断
  const getStockStatus = (record) => {
    if (!record.safety_stock || record.safety_stock <= 0) return null;
    const ratio = record.current_stock / record.safety_stock;
    if (ratio <= 1) return { color: 'red', label: '库存不足', icon: <ExclamationCircleOutlined /> };
    if (ratio <= STOCK_WARN_THRESHOLD) return { color: 'orange', label: '库存偏低', icon: <ExclamationCircleOutlined /> };
    return null;
  };

  const columns = [
    { title: '物料编码', dataIndex: 'code', width: 110 },
    { title: '物料名称', dataIndex: 'name', width: 130,
      render: (text, r) => (
        <Space>
          <a onClick={() => handleView(r)}>{text}</a>
          {r.dual_inspection === 1 && (
            <Tag color="orange" style={{ fontSize: 11 }}>双检</Tag>
          )}
        </Space>
      ),
    },
    { title: '规格型号', dataIndex: 'spec', width: 130 },
    { title: '分类', dataIndex: 'category_name', width: 80 },
    { title: '供应商', dataIndex: 'supplier_name', width: 130, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '参考单价', dataIndex: 'unit_price', width: 90, align: 'right',
      render: v => v ? `¥${Number(v).toFixed(2)}` : '-',
    },
    { title: '安全库存', dataIndex: 'safety_stock', width: 85, align: 'right',
      render: v => Number(v).toFixed(0),
    },
    { title: '当前库存', dataIndex: 'current_stock', width: 90, align: 'right',
      render: (v, r) => {
        const status = getStockStatus(r);
        return (
          <Space size={4}>
            <span>{Number(v).toFixed(0)}</span>
            {status && <Tooltip title={status.label}>{status.icon}</Tooltip>}
          </Space>
        );
      },
    },
    {
      title: '库存状态', width: 90,
      render: (_, r) => {
        const status = getStockStatus(r);
        if (!status) return <Tag color="green">正常</Tag>;
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    { title: '检验制度', dataIndex: 'dual_inspection', width: 80,
      render: v => v === 1
        ? <Tag color="orange" icon={<SafetyCertificateOutlined />}>双检</Tag>
        : <Tag>单检</Tag>,
    },
    { title: '备注', dataIndex: 'remark', width: 160, ellipsis: true },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(r)}>详情</Button>
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
      {/* 库存预警统计 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="物料总数" value={total} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid #ff4d4f' }}>
            <Statistic
              title="库存不足"
              value={data.filter(r => r.safety_stock > 0 && Number(r.current_stock) <= Number(r.safety_stock)).length}
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid #faad14' }}>
            <Statistic
              title="库存偏低"
              value={data.filter(r => {
                const sr = Number(r.safety_stock), cs = Number(r.current_stock);
                return sr > 0 && cs > sr && cs <= sr * STOCK_WARN_THRESHOLD;
              }).length}
              prefix={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid #ff7a00' }}>
            <Statistic
              title="双检物料"
              value={data.filter(r => r.dual_inspection === 1).length}
              prefix={<SafetyCertificateOutlined style={{ color: '#ff7a00' }} />}
              valueStyle={{ color: '#ff7a00' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索编码/名称/规格…"
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            onSearch={fetchData}
            style={{ width: 260 }}
            allowClear
          />
          <Select
            placeholder="物料分类"
            value={categoryFilter}
            onChange={v => { setCategoryFilter(v || ''); setPage(1); }}
            allowClear
            style={{ width: 140 }}
            options={categories.map(c => ({ label: c.name, value: c.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>
            新增物料
          </Button>
        </Space>
      </Card>

      {/* 物料表格 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1480 }}
        pagination={{
          current: page, total, pageSize: 15, showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p),
        }}
      />

      {/* 详情弹窗 */}
      <Modal
        title={`物料详情 — ${selectedMaterial?.name || ''}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={720}
      >
        {selectedMaterial && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物料编码">{selectedMaterial.code}</Descriptions.Item>
              <Descriptions.Item label="物料名称">{selectedMaterial.name}</Descriptions.Item>
              <Descriptions.Item label="规格型号">{selectedMaterial.spec}</Descriptions.Item>
              <Descriptions.Item label="分类">{selectedMaterial.category_name}</Descriptions.Item>
              <Descriptions.Item label="单位">{selectedMaterial.unit}</Descriptions.Item>
              <Descriptions.Item label="参考单价">¥{Number(selectedMaterial.unit_price).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="安全库存">{Number(selectedMaterial.safety_stock).toFixed(0)}</Descriptions.Item>
              <Descriptions.Item label="当前库存">{Number(selectedMaterial.current_stock).toFixed(0)}</Descriptions.Item>
              <Descriptions.Item label="纸张类型">{selectedMaterial.paper_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="克重">{selectedMaterial.gram_weight ? `${selectedMaterial.gram_weight} g/m²` : '-'}</Descriptions.Item>
              <Descriptions.Item label="默认供应商">{selectedMaterial.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="检验制度">
                {selectedMaterial.dual_inspection === 1
                  ? <Tag color="orange">双检制度（需两名检验人核验）</Tag>
                  : <Tag>单检制度</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{selectedMaterial.remark || '-'}</Descriptions.Item>
            </Descriptions>

            {/* 入库标准 */}
            <Card title={<Space><ExperimentOutlined />入库检验标准</Space>} size="small">
              <Table
                rowKey="id"
                dataSource={selectedMaterial.standards || []}
                pagination={false}
                size="small"
                columns={[
                  { title: '序号', width: 50, render: (_, __, i) => i + 1 },
                  { title: '检验项目', dataIndex: 'inspection_item' },
                  { title: '标准值', dataIndex: 'standard_value' },
                  { title: '上限', dataIndex: 'tolerance_upper', render: v => v || '-' },
                  { title: '下限', dataIndex: 'tolerance_lower', render: v => v || '-' },
                  { title: '检验方法', dataIndex: 'test_method' },
                  {
                    title: '是否必检', dataIndex: 'is_required', width: 70,
                    render: v => v === 1 ? <Tag color="blue">必检</Tag> : <Tag>抽检</Tag>,
                  },
                ]}
              />
            </Card>
          </>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title={editingId ? `编辑物料 — ${form.getFieldValue('code') || ''}` : '新增物料（编码自动生成）'}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          {editingId && (
            <Form.Item label="物料编码">
              <Input value={form.getFieldValue('code')} disabled style={{ color: '#999' }} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={editingId ? 12 : 12}>
              <Form.Item name="name" label="物料名称" rules={[{ required: true }]}>
                <Input placeholder="如：铜版纸" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="spec" label="规格型号" rules={[{ required: true }]}>
                <Input placeholder="如：889×1194mm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category_id" label="物料分类" rules={[{ required: true, message: '请选择分类（决定编码前缀）' }]}>
                <Select placeholder="选择分类（决定编码前缀）" options={categories.map(c => {
                  const prefixMap = { 4: 'MAT-ZZ', 5: 'MAT-YM', 6: 'MAT-BC', 2: 'MAT-FL', 3: 'MAT-BCP', 1: 'MAT-YL' };
                  const pfx = prefixMap[c.id];
                  return { label: pfx ? `${c.name}（编码前缀: ${pfx}）` : c.name, value: c.id };
                })} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                <Input placeholder="如：令、罐、张、卷" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safety_stock" label="安全库存">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="current_stock" label="当前库存">
                <Input type="number" disabled style={{ color: '#999' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_price" label="参考单价">
                <Input type="number" prefix="¥" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplier_id" label="默认供应商">
                <Select allowClear placeholder="选择供应商" options={suppliers.map(s => ({ label: `${s.code} ${s.name}`, value: s.id }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]} />
              </Form.Item>
            </Col>
            {editingId && (
              <Col span={12}>
                <Form.Item name="dual_inspection" label="检验制度">
                  <Select options={[{ label: '单检', value: 0 }, { label: '双检', value: 1 }]} />
                </Form.Item>
              </Col>
            )}
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="物料补充说明…" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ==================== 2. 供应商管理 ====================
function SupplierList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    const res = await api.get('/suppliers');
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    api.get('/categories').then(r => r.success && setCategories(r.data));
  }, []);

  const handleEdit = (record) => {
    setEditingId(record?.id || null);
    if (record) form.setFieldsValue(record);
    else form.resetFields();
    setEditOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    let res;
    if (editingId) {
      res = await api.put(`/suppliers/${editingId}`, values);
    } else {
      res = await api.post('/suppliers', values);
    }
    if (res.success) {
      message.success(editingId ? '更新成功' : `新增成功，编码：${res.data.code}`);
      setEditOpen(false);
      fetchData();
    }
  };

  const handleDelete = async (id) => {
    await api.del(`/suppliers/${id}`);
    message.success('已删除');
    fetchData();
  };

  const ratingColors = { A: 'green', B: 'blue', C: 'orange', D: 'red' };

  const columns = [
    {
      title: '供应商编码', dataIndex: 'code', width: 120,
      render: v => <Tag color="blue">{v}</Tag>,
    },
    { title: '供应商名称', dataIndex: 'name', width: 180 },
    {
      title: '供货类别', dataIndex: 'supply_category_name', width: 90,
      render: v => v ? <Tag>{v}</Tag> : '-',
    },
    { title: '联系人', dataIndex: 'contact_person', width: 90 },
    { title: '电话', dataIndex: 'contact_phone', width: 130 },
    { title: '地址', dataIndex: 'address', width: 200, ellipsis: true },
    {
      title: '评级', dataIndex: 'rating', width: 60,
      render: v => <Tag color={ratingColors[v]}>{v}级</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 65,
      render: v => v === 1 ? <Badge status="success" text="正常" /> : <Badge status="default" text="停用" />,
    },
    {
      title: '操作', width: 140,
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
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>
          新增供应商
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1100 }} />

      <Modal
        title={editingId ? `编辑供应商 — ${form.getFieldValue('code') || ''}` : '新增供应商（编码自动生成）'}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        width={560}
      >
        <Form form={form} layout="vertical">
          {editingId && (
            <Form.Item label="供应商编码">
              <Input value={form.getFieldValue('code')} disabled style={{ color: '#999' }} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}>
                <Input placeholder="供应商全称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supply_category_id" label="供货类别" rules={[{ required: true, message: '选择供货类别以自动生成编码' }]}>
                <Select
                  placeholder="选择供货类别（决定编码前缀）"
                  options={categories.map(c => ({
                    label: `${c.name}（编码前缀: SUP-${c.name === '纸张类' ? 'ZZ' : c.name === '油墨类' ? 'YM' : c.name === '版材类' ? 'BC' : c.name === '辅料' ? 'FL' : 'QT'}）`,
                    value: c.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_person" label="联系人">
                <Input placeholder="主要联系人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_phone" label="联系电话">
                <Input placeholder="手机/座机" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rating" label="评级">
                <Select options={['A','B','C','D'].map(v => ({ label: `${v}级`, value: v }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[{ label: '正常', value: 1 }, { label: '停用', value: 0 }]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="address" label="地址">
                <Input placeholder="详细地址" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="补充说明…" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ==================== 3. 入库审核 ====================
function InboundApproval() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [inspectOpen, setInspectOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [createForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inbound-records', { page, pageSize: 15, status: statusFilter });
      if (res.success) { setData(res.data); setTotal(res.total); }
    } catch (e) { message.error('加载失败'); }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 加载物料和供应商下拉
  useEffect(() => {
    api.get('/materials', { pageSize: 100 }).then(r => r.success && setMaterials(r.data));
    api.get('/suppliers').then(r => r.success && setSuppliers(r.data));
  }, []);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const res = await api.post('/inbound-records', values);
      if (res.success) {
        message.success(`入库单 ${res.data.record_no} 已创建`);
        setCreateOpen(false);
        createForm.resetFields();
        fetchData();
      }
    } catch (e) { /* validation */ }
  };

  const columns = [
    { title: '入库单号', dataIndex: 'record_no', width: 145 },
    { title: '物料编码', dataIndex: 'material_code', width: 100 },
    { title: '物料名称', dataIndex: 'material_name', width: 110 },
    { title: '供应商', dataIndex: 'supplier_name', width: 130, ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: 65, align: 'right' },
    { title: '批次号', dataIndex: 'batch_no', width: 110 },
    {
      title: '当值人员', dataIndex: 'duty_personnel', width: 90,
      render: v => v || '-',
    },
    {
      title: '归类区域', dataIndex: 'storage_area', width: 130, ellipsis: true,
      render: v => v || '-',
    },
    {
      title: '检验制度', width: 70,
      render: (_, r) => r.dual_inspection === 1
        ? <Tag color="orange">双检</Tag> : <Tag>单检</Tag>,
    },
    {
      title: '检验①', width: 80,
      render: (_, r) => {
        if (r.inspect_result === 'pass') return <Tag color="green">✓ 通过</Tag>;
        if (r.inspect_result === 'reject') return <Tag color="red">✗ 退回</Tag>;
        return <Tag color="default">待检</Tag>;
      },
    },
    {
      title: '检验②', width: 80,
      render: (_, r) => {
        if (r.dual_inspection !== 1) return <span style={{ color: '#ccc' }}>—</span>;
        if (r.inspect2_result === 'pass') return <Tag color="green">✓ 通过</Tag>;
        if (r.inspect2_result === 'reject') return <Tag color="red">✗ 退回</Tag>;
        return <Tag color="default">待检</Tag>;
      },
    },
    {
      title: '入库时间', dataIndex: 'inbound_date', width: 100,
      render: (v, r) => v || (r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : '-'),
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: v => {
        const map = {
          submitted: { color: 'processing', label: '待审核' },
          approved: { color: 'green', label: '已放行' },
          rejected: { color: 'red', label: '已退回' },
        };
        const m = map[v] || { color: 'default', label: v };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button
          size="small"
          type="primary"
          icon={<SafetyCertificateOutlined />}
          disabled={r.status === 'approved' || r.status === 'rejected'}
          onClick={() => { setCurrentRecord(r); setInspectOpen(true); }}
        >
          检验
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={statusFilter}
            onChange={v => { setStatusFilter(v || ''); setPage(1); }}
            style={{ width: 140 }}
            options={[
              { label: '全部', value: '' },
              { label: '待审核', value: 'submitted' },
              { label: '已放行', value: 'approved' },
              { label: '已退回', value: 'rejected' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建入库单
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1550 }}
        pagination={{
          current: page, total, pageSize: 15, showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p),
        }}
      />

      {/* 新建入库单弹窗 */}
      <Modal
        title="新建入库单"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        width={520}
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="material_id" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
                <Select
                  showSearch
                  placeholder="搜索/选择物料"
                  optionFilterProp="label"
                  options={materials.map(m => ({
                    label: `${m.code} ${m.name}`,
                    value: m.id,
                  }))}
                  onChange={(val) => {
                    const mat = materials.find(m => m.id === val);
                    if (mat) {
                      createForm.setFieldsValue({ supplier_id: mat.supplier_id });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplier_id" label="供应商">
                <Select
                  allowClear
                  placeholder="选择供应商"
                  options={suppliers.map(s => ({ label: s.name, value: s.id }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="quantity" label="入库数量" rules={[{ required: true }]}>
                <Input type="number" placeholder="数量" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batch_no" label="批次号">
                <Input placeholder="批次号" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="created_by" label="创建人">
                <Input placeholder="创建人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="duty_personnel" label="当值人员" rules={[{ required: true, message: '请输入当值人员' }]}>
                <Input placeholder="当班负责人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="storage_area" label="归类区域" rules={[{ required: true, message: '请填写归类区域/库位' }]}>
                <Input placeholder="如：A1-纸张库-01排" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 检验弹窗 */}
      <InspectModal
        open={inspectOpen}
        record={currentRecord}
        onClose={() => { setInspectOpen(false); setCurrentRecord(null); }}
        onDone={(needsStore, material) => {
          setInspectOpen(false);
          if (needsStore && material) {
            setCurrentRecord({ ...currentRecord, ...material, _needsStore: true });
            setInspectOpen(true); // re-open with store mode
          } else {
            setCurrentRecord(null);
          }
          fetchData();
        }}
        storeRecord={currentRecord?._needsStore ? currentRecord : null}
      />
    </>
  );
}

// 检验弹窗组件
function InspectModal({ open, record, onClose, onDone }) {
  const [result, setResult] = useState('pass');
  const [inspector, setInspector] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 库位推荐状态
  const [showStore, setShowStore] = useState(false);
  const [storeMaterial, setStoreMaterial] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loadingRec, setLoadingRec] = useState(false);

  if (!record) return null;

  const isDual = record.dual_inspection === 1;
  const isSecond = isDual && record.inspect_result !== 'pending' && record.inspect2_result === 'pending';
  const firstDone = record.inspect_result !== 'pending';

  const handleSubmit = async () => {
    if (!inspector.trim()) { message.warning('请输入检验人姓名'); return; }
    setSubmitting(true);
    try {
      const res = await api.put(`/inbound-records/${record.id}/inspect`, {
        inspector: inspector.trim(),
        result,
        remark,
        isSecond,
      });
      if (res.success) {
        if (res.needsStore && res.material) {
          message.success('✅ 检验通过！请选择库位上架');
          setStoreMaterial(res.material);
          // 加载推荐库位
          setLoadingRec(true);
          const recRes = await api.get('/warehouse/recommend', { material_id: res.material.id, quantity: res.material.quantity });
          if (recRes.success) setRecommendations(recRes.data.recommendations);
          setLoadingRec(false);
          setShowStore(true);
        } else {
          message.success(res.finalStatus === 'rejected' ? '❌ 检验退回' : '检验结果已提交');
          onDone(false);
        }
      }
    } catch (e) {
      message.error('提交失败');
    }
    setSubmitting(false);
  };

  // 确认存入
  const handleStore = async () => {
    if (!selectedLocation) { message.warning('请选择库位'); return; }
    setSubmitting(true);
    const storeRes = await api.post('/warehouse/store', {
      material_id: storeMaterial.id,
      location_code: selectedLocation,
      quantity: storeMaterial.quantity,
      batch_no: storeMaterial.batch_no,
      inbound_record_id: storeMaterial.record_id,
      operator_name: inspector,
    });
    if (storeRes.success) {
      message.success(`✅ 已存入 ${selectedLocation}，库存+${storeMaterial.quantity}${storeMaterial.unit}`);
      onDone(false);
    } else {
      message.error(storeRes.message);
    }
    setSubmitting(false);
  };

  // ====== 库位选择视图 ======
  if (showStore && storeMaterial) {
    return (
      <Modal
        title={<Space><EnvironmentOutlined />选择存放库位 — {storeMaterial.name}</Space>}
        open={open}
        onOk={handleStore}
        onCancel={() => { setShowStore(false); onClose(); }}
        confirmLoading={submitting}
        okText="确认存入此库位"
        width={650}
      >
        <Alert message={`${storeMaterial.code} ${storeMaterial.name} × ${storeMaterial.quantity}${storeMaterial.unit} | 批次: ${storeMaterial.batch_no || '-'}`} type="info" style={{ marginBottom: 16 }} />

        {loadingRec ? <p>正在分析最佳库位…</p> : (
          <Table
            rowKey="code"
            size="small"
            dataSource={recommendations}
            pagination={false}
            rowSelection={{ type: 'radio', selectedRowKeys: selectedLocation ? [selectedLocation] : [], onChange: keys => setSelectedLocation(keys[0]) }}
            columns={[
              { title: '推荐', width: 55, render: (_, __, i) => i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉' },
              { title: '库位编码', dataIndex: 'code', width: 120, render: v => <Tag color="blue">{v}</Tag> },
              { title: '区域', dataIndex: 'zone_name', width: 100 },
              { title: '容量', width: 90, render: (_, r) => `${r.used_capacity || 0}/${r.capacity}` },
              { title: '推荐理由', dataIndex: 'reason', ellipsis: true },
            ]}
          />
        )}
      </Modal>
    );
  }

  // ====== 检验视图 ======
  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined />
          <span>入库检验 — {record.material_name}（{record.record_no}）</span>
          {isDual && <Tag color="orange">双检制度</Tag>}
        </Space>
      }
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      okText="提交检验结果"
      width={600}
    >
      {isDual && (
        <Alert
          message="双检制度说明"
          description={
            <div>
              <p>该物料采用<strong>双人双检</strong>制度，需要两位检验人先后核验并都判定通过后方可入库。</p>
              {firstDone && !isSecond && (
                <p style={{ color: '#1890ff', margin: 0 }}>
                  ✅ 第一检验人 <strong>{record.inspector}</strong> 已判定：
                  {record.inspect_result === 'pass' ? <Tag color="green">通过</Tag> : <Tag color="red">退回</Tag>}
                  ，当前需要 <strong>第二检验人</strong> 核验。
                </p>
              )}
              {!firstDone && (
                <p style={{ color: '#faad14', margin: 0 }}>
                  ⚠️ 等待<strong>第一检验人</strong>核验。
                </p>
              )}
            </div>
          }
          type="warning" showIcon style={{ marginBottom: 20 }}
        />
      )}
      <Descriptions bordered size="small" column={2} style={{ marginBottom: 20 }}>
        <Descriptions.Item label="物料">{record.material_name}</Descriptions.Item>
        <Descriptions.Item label="编码">{record.material_code}</Descriptions.Item>
        <Descriptions.Item label="供应商">{record.supplier_name}</Descriptions.Item>
        <Descriptions.Item label="数量">{record.quantity}</Descriptions.Item>
        <Descriptions.Item label="批次">{record.batch_no || '-'}</Descriptions.Item>
        <Descriptions.Item label="当值人员">{record.duty_personnel || '-'}</Descriptions.Item>
        <Descriptions.Item label="归类区域">{record.storage_area || '-'}</Descriptions.Item>
        <Descriptions.Item label="入库时间">{record.inbound_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="检验制度">{isDual ? <Tag color="orange">双检</Tag> : <Tag>单检</Tag>}</Descriptions.Item>
        <Descriptions.Item label="创建人">{record.created_by || '-'}</Descriptions.Item>
      </Descriptions>

      <Form layout="vertical">
        <Form.Item label={isSecond ? '第二检验人姓名' : '检验人姓名'} required>
          <Input placeholder="请输入检验人姓名" value={inspector} onChange={e => setInspector(e.target.value)} />
        </Form.Item>
        <Form.Item label="检验判定" required>
          <Select value={result} onChange={setResult}>
            <Select.Option value="pass"><Space><CheckCircleOutlined style={{ color: '#52c41a' }} />通过 — 准予入库</Space></Select.Option>
            <Select.Option value="reject"><Space><ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />退回 — 不符合标准</Space></Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="检验备注">
          <Input.TextArea rows={2} placeholder="检验意见…" value={remark} onChange={e => setRemark(e.target.value)} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
