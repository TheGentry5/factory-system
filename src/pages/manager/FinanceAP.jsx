import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Select,
  DatePicker, Input, message, Tabs, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined, CheckOutlined, PayCircleOutlined, AccountBookOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const { Text } = Typography;

const AP_STATUS = {
  open: { color: 'warning', label: '未确认' },
  matched: { color: 'processing', label: '发票已匹配' },
  partial_paid: { color: 'cyan', label: '部分付款' },
  paid: { color: 'success', label: '已付清' },
  written_off: { color: 'default', label: '已核销' },
};
const PAY_STATUS = {
  draft: { color: 'default', label: '草稿' },
  approved: { color: 'processing', label: '已审批' },
  paid: { color: 'success', label: '已付款' },
  cancelled: { color: 'error', label: '已取消' },
};
const money = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dateFmt = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-');

export default function FinanceAP() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';
  const [tab, setTab] = useState('ap');
  const [apData, setApData] = useState([]);
  const [apTotal, setApTotal] = useState(0);
  const [payData, setPayData] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [createForm] = Form.useForm();
  const [payForm] = Form.useForm();
  const pageSize = 15;

  const fetchAp = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/ap', { page: 1, pageSize: 100 });
      if (res.success) { setApData(res.data || []); setApTotal(res.total || 0); }
    } finally { setLoading(false); }
  }, []);

  const fetchPays = useCallback(async () => {
    const res = await api.get('/finance/ap/payments/list', { page: 1, pageSize: 100 });
    if (res.success) { setPayData(res.data || []); setPayTotal(res.total || 0); }
  }, []);

  const fetchRefs = useCallback(async () => {
    const [s, a] = await Promise.all([
      api.get('/suppliers'), api.get('/finance/ap/accounts/list'),
    ]);
    if (s.success) setSuppliers((s.data || []).map(x => ({ label: `${x.code || ''} ${x.name}`, value: x.id })));
    if (a.success) setAccounts(a.data || []);
  }, []);

  useEffect(() => { fetchAp(); fetchRefs(); }, [fetchAp, fetchRefs]);
  useEffect(() => { if (tab === 'pay') fetchPays(); }, [tab, fetchPays]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setConfirming(true);
      const res = await api.post('/finance/ap', {
        supplier_id: values.supplier_id,
        amount: values.amount,
        invoice_no: values.invoice_no,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : undefined,
        remark: values.remark,
        created_by: operator,
      });
      setConfirming(false);
      if (res.success) {
        message.success(`应付单 ${res.data.doc_no} 已登记`);
        setCreateOpen(false);
        createForm.resetFields();
        fetchAp();
      } else message.error(res.message || '创建失败');
    } catch { setConfirming(false); }
  };

  const handleMatch = async (id) => {
    const res = await api.put(`/finance/ap/${id}/match`, { operator_name: operator });
    if (res.success) { message.success('已确认并生成应付凭证'); fetchAp(); }
    else message.error(res.message || '操作失败');
  };

  const openPay = (row) => {
    setPayTarget(row);
    payForm.setFieldsValue({ amount: row.remaining });
    setPayOpen(true);
  };

  const handlePay = async () => {
    try {
      const values = await payForm.validateFields();
      setConfirming(true);
      const res = await api.post(`/finance/ap/${payTarget.id}/pay`, {
        amount: values.amount,
        payment_type: values.payment_type,
        bank_account_id: values.bank_account_id,
        operator_name: operator,
      });
      setConfirming(false);
      if (res.success) {
        message.success(`付款单 ${res.data.pay_no} 已完成`);
        setPayOpen(false);
        fetchAp(); if (tab === 'pay') fetchPays();
      } else message.error(res.message || '操作失败');
    } catch { setConfirming(false); }
  };

  const apColumns = [
    { title: '应付单号', dataIndex: 'doc_no', width: 160 },
    { title: '供应商', dataIndex: 'supplier_name', ellipsis: true },
    { title: '发票号', dataIndex: 'invoice_no', render: v => v || '-' },
    { title: '应付金额', dataIndex: 'amount', align: 'right', render: money },
    { title: '已付金额', dataIndex: 'paid_amount', align: 'right', render: money },
    { title: '剩余', dataIndex: 'remaining', align: 'right', render: (v) => <Text strong type={Number(v) > 0 ? 'danger' : 'success'}>{money(v)}</Text> },
    { title: '到期日', dataIndex: 'due_date', render: dateFmt },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={AP_STATUS[v]?.color}>{AP_STATUS[v]?.label}</Tag> },
    {
      title: '操作', width: 180, render: (_, r) => (
        <Space>
          {(r.status === 'open') && (
            <Popconfirm title="确认后生成「借:原材料 贷:应付账款」凭证" onConfirm={() => handleMatch(r.id)}>
              <Button size="small" type="link" icon={<CheckOutlined />}>确认</Button>
            </Popconfirm>
          )}
          {['open', 'matched', 'partial_paid'].includes(r.status) && Number(r.remaining) > 0 && (
            <Button size="small" type="link" icon={<PayCircleOutlined />} onClick={() => openPay(r)}>付款</Button>
          )}
        </Space>
      ),
    },
  ];

  const payColumns = [
    { title: '付款单号', dataIndex: 'pay_no', width: 170 },
    { title: '付款方式', dataIndex: 'payment_type', render: v => ({ bank: '银行转账', cash: '现金', alipay: '支付宝', wechat: '微信' })[v] || v },
    { title: '付款账户', dataIndex: 'account_name', render: v => v || '-' },
    { title: '金额', dataIndex: 'amount', align: 'right', render: money },
    { title: '付款日期', dataIndex: 'pay_date', render: dateFmt },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={PAY_STATUS[v]?.color}>{PAY_STATUS[v]?.label}</Tag> },
    { title: '凭证', dataIndex: 'voucher_id', render: v => (v ? <Tag color="geekblue">已生成</Tag> : '-') },
    { title: '经办', dataIndex: 'operator', render: v => v || '-' },
  ];

  return (
    <Card
      title={<><AccountBookOutlined /> 应付管理</>}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>登记应付</Button>}
    >
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'ap', label: `应付单（${apTotal}）`,
          children: <Table rowKey="id" loading={loading} size="small" dataSource={apData} columns={apColumns}
            pagination={{ pageSize }} scroll={{ x: 1100 }} />,
        },
        {
          key: 'pay', label: `付款单（${payTotal}）`,
          children: <Table rowKey="id" loading={loading} size="small" dataSource={payData} columns={payColumns}
            pagination={{ pageSize }} scroll={{ x: 1000 }} />,
        },
      ]} />

      <Modal title="登记应付（采购挂账）" open={createOpen} confirmLoading={confirming} onOk={handleCreate} onCancel={() => setCreateOpen(false)} width={520}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="supplier_id" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
            <Select showSearch optionFilterProp="label" options={suppliers} placeholder="选择供应商" />
          </Form.Item>
          <Form.Item name="amount" label="应付金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="invoice_no" label="发票号">
            <Input placeholder="可后补，确认时匹配" />
          </Form.Item>
          <Form.Item name="due_date" label="到期日">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`付款核销（${payTarget?.doc_no || ''}）`} open={payOpen} confirmLoading={confirming}
        onOk={handlePay} onCancel={() => setPayOpen(false)} width={480}>
        <Form form={payForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="amount" label="付款金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_type" label="付款方式" rules={[{ required: true }]} initialValue="bank">
            <Select options={[{ value: 'bank', label: '银行转账' }, { value: 'cash', label: '现金' }, { value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信' }]} />
          </Form.Item>
          <Form.Item name="bank_account_id" label="付款账户" rules={[{ required: true, message: '请选择付款账户' }]}>
            <Select options={accounts.map(a => ({ label: `${a.name}（${a.code}）`, value: a.id }))} placeholder="选择资金账户" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
