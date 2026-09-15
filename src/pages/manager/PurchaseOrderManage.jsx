import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Select,
  DatePicker, Input, message, Tabs, Popconfirm,
} from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';

// 状态映射
const STATUS_MAP = {
  draft: { color: 'default', label: '草稿' },
  approved: { color: 'processing', label: '已审批' },
  arrived: { color: 'cyan', label: '已到货' },
  completed: { color: 'success', label: '已完成' },
  rejected: { color: 'error', label: '已驳回' },
};

export default function PurchaseOrderManage() {
  // ── state ──
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [form] = Form.useForm();

  const pageSize = 15;

  // ── fetch ──
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/purchase-orders', params);
      if (res.success) {
        setData(res.data);
        setTotal(res.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── fetch materials & suppliers for modal ──
  const fetchMeta = useCallback(async () => {
    const [matRes, supRes] = await Promise.all([
      api.get('/materials', { pageSize: 200 }),
      api.get('/suppliers'),
    ]);
    if (matRes.success) setMaterials(matRes.data);
    if (supRes.success) setSuppliers(supRes.data);
  }, []);

  const openCreateModal = () => {
    fetchMeta();
    form.resetFields();
    setModalOpen(true);
  };

  // ── create PO ──
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);
      const payload = {
        ...values,
        order_type: 'normal',
        expected_date: values.expected_date ? values.expected_date.format('YYYY-MM-DD') : undefined,
        created_by: 'manager',
      };
      const res = await api.post('/purchase-orders', payload);
      setConfirmLoading(false);
      if (res.success) {
        message.success(`采购单 ${res.data.order_no} 已创建`);
        setModalOpen(false);
        fetchOrders();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (e) {
      setConfirmLoading(false);
    }
  };

  // ── review ──
  const handleReview = async (id, action) => {
    const res = await api.put(`/purchase-orders/${id}/review`, {
      action,
      reviewed_by: 'manager',
    });
    if (res.success) {
      message.success(action === 'approve' ? '已审批通过' : '已驳回');
      fetchOrders();
    } else {
      message.error(res.message || '操作失败');
    }
  };

  // ── columns ──
  const columns = [
    { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 160 },
    {
      title: '物料', key: 'material', width: 140,
      render: (_, r) => r.material_name ? `${r.material_name} (${r.material_code})` : '-',
    },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier', width: 120 },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80 },
    { title: '金额', dataIndex: 'total_amount', key: 'amount', width: 90, render: v => v ? `¥${v}` : '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: s => {
        const m = STATUS_MAP[s] || { color: 'default', label: s };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '预计交期', dataIndex: 'expected_date', key: 'date', width: 110,
      render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作', key: 'action', width: 160,
      render: (_, r) => (
        <Space>
          {r.status === 'draft' && (
            <>
              <Popconfirm title="确认审批通过？" onConfirm={() => handleReview(r.id, 'approve')}>
                <Button type="link" size="small" icon={<CheckOutlined />}>通过</Button>
              </Popconfirm>
              <Popconfirm title="确认驳回？" onConfirm={() => handleReview(r.id, 'reject')}>
                <Button type="link" size="small" danger icon={<CloseOutlined />}>驳回</Button>
              </Popconfirm>
            </>
          )}
          {r.status === 'approved' && (
            <Tag color="cyan">等待到货</Tag>
          )}
          {r.status === 'completed' && (
            <Tag color="success">已完成</Tag>
          )}
        </Space>
      ),
    },
  ];

  // ── tab items ──
  const tabItems = [
    { key: '', label: '全部' },
    { key: 'draft', label: '草稿' },
    { key: 'approved', label: '已审批' },
    { key: 'arrived', label: '已到货' },
    { key: 'completed', label: '已完成' },
  ];

  return (
    <Card
      title="采购管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建采购单
        </Button>
      }
    >
      <Tabs
        activeKey={statusFilter}
        onChange={k => { setStatusFilter(k); setPage(1); }}
        items={tabItems.map(t => ({ key: t.key, label: t.label }))}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{ current: page, pageSize, total, onChange: setPage, showTotal: t => `共 ${t} 条` }}
      />

      {/* ── 新建采购单 Modal ── */}
      <Modal
        title="新建采购单"
        open={modalOpen}
        onOk={handleCreate}
        confirmLoading={confirmLoading}
        onCancel={() => setModalOpen(false)}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="material_id" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
            <Select
              showSearch
              placeholder="搜索并选择物料"
              filterOption={(input, option) => (option?.label || '').includes(input)}
              options={materials.map(m => ({ label: `${m.name} (${m.code})`, value: m.id }))}
            />
          </Form.Item>
          <Form.Item name="supplier_id" label="供应商">
            <Select
              showSearch
              allowClear
              placeholder="选择供应商（可选）"
              filterOption={(input, option) => (option?.label || '').includes(input)}
              options={suppliers.map(s => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Space size="middle">
            <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={1} style={{ width: 160 }} placeholder="数量" />
            </Form.Item>
            <Form.Item name="unit_price" label="单价（元）">
              <InputNumber min={0} step={0.01} style={{ width: 160 }} placeholder="单价" />
            </Form.Item>
          </Space>
          <Form.Item name="expected_date" label="预计交期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="备注">
            <Input.TextArea rows={2} placeholder="采购原因或备注" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
