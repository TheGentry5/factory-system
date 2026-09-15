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

const AR_STATUS = {
  open: { color: 'warning', label: '未确认' },
  matched: { color: 'processing', label: '销售已确认' },
  partial_paid: { color: 'cyan', label: '部分收款' },
  paid: { color: 'success', label: '已收清' },
  written_off: { color: 'default', label: '已核销' },
};
const REC_STATUS = {
  draft: { color: 'default', label: '草稿' },
  approved: { color: 'processing', label: '已审批' },
  paid: { color: 'success', label: '已收款' },
  cancelled: { color: 'error', label: '已取消' },
};
const money = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dateFmt = (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-');

export default function FinanceAR() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';
  const [tab, setTab] = useState('ar');
  const [arData, setArData] = useState([]);
  const [arTotal, setArTotal] = useState(0);
  const [recData, setRecData] = useState([]);
  const [recTotal, setRecTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [recTarget, setRecTarget] = useState(null);
  const [createForm] = Form.useForm();
  const [recForm] = Form.useForm();
  const pageSize = 15;

  const fetchAr = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/ar', { page: 1, pageSize: 100 });
      if (res.success) { setArData(res.data || []); setArTotal(res.total || 0); }
    } finally { setLoading(false); }
  }, []);

  const fetchRecs = useCallback(async () => {
    const res = await api.get('/finance/ar/receipts/list', { page: 1, pageSize: 100 });
    if (res.success) { setRecData(res.data || []); setRecTotal(res.total || 0); }
  }, []);

  const fetchRefs = useCallback(async () => {
    const [c, a] = await Promise.all([
      api.get('/finance/ar/customers/list'), api.get('/finance/ap/accounts/list'),
    ]);
    if (c.success) setCustomers((c.data || []).map(x => ({ label: `${x.code || ''} ${x.name}`, value: x.id })));
    if (a.success) setAccounts(a.data || []);
  }, []);

  useEffect(() => { fetchAr(); fetchRefs(); }, [fetchAr, fetchRefs]);
  useEffect(() => { if (tab === 'rec') fetchRecs(); }, [tab, fetchRecs]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setConfirming(true);
      const res = await api.post('/finance/ar', {
        customer_id: values.customer_id,
        amount: values.amount,
        invoice_no: values.invoice_no,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : undefined,
        remark: values.remark,
        created_by: operator,
      });
      setConfirming(false);
      if (res.success) {
        message.success(`应收单 ${res.data.doc_no} 已登记`);
        setCreateOpen(false);
        createForm.resetFields();
        fetchAr();
      } else message.error(res.message || '创建失败');
    } catch { setConfirming(false); }
  };

  const handleConfirm = async (id) => {
    const res = await api.put(`/finance/ar/${id}/confirm`, { operator_name: operator });
    if (res.success) { message.success('已确认销售并生成应收凭证'); fetchAr(); }
    else message.error(res.message || '操作失败');
  };

  const openRec = (row) => {
    setRecTarget(row);
    recForm.setFieldsValue({ amount: row.remaining });
    setRecOpen(true);
  };

  const handleRec = async () => {
    try {
      const values = await recForm.validateFields();
      setConfirming(true);
      const res = await api.post(`/finance/ar/${recTarget.id}/receipt`, {
        amount: values.amount,
        receipt_type: values.receipt_type,
        bank_account_id: values.bank_account_id,
        operator_name: operator,
      });
      setConfirming(false);
      if (res.success) {
        message.success(`收款单 ${res.data.receipt_no} 已完成`);
        setRecOpen(false);
        fetchAr(); if (tab === 'rec') fetchRecs();
      } else message.error(res.message || '操作失败');
    } catch { setConfirming(false); }
  };

  const arColumns = [
    { title: '应收单号', dataIndex: 'doc_no', width: 160 },
    { title: '客户', dataIndex: 'customer_name', ellipsis: true },
    { title: '发票号', dataIndex: 'invoice_no', render: v => v || '-' },
    { title: '应收金额', dataIndex: 'amount', align: 'right', render: money },
    { title: '已收金额', dataIndex: 'received_amount', align: 'right', render: money },
    { title: '剩余', dataIndex: 'remaining', align: 'right', render: (v) => <Text strong type={Number(v) > 0 ? 'danger' : 'success'}>{money(v)}</Text> },
    { title: '到期日', dataIndex: 'due_date', render: dateFmt },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={AR_STATUS[v]?.color}>{AR_STATUS[v]?.label}</Tag> },
    {
      title: '操作', width: 180, render: (_, r) => (
        <Space>
          {r.status === 'open' && (
            <Popconfirm title="确认后生成「借:应收账款 贷:主营业务收入」凭证" onConfirm={() => handleConfirm(r.id)}>
              <Button size="small" type="link" icon={<CheckOutlined />}>确认</Button>
            </Popconfirm>
          )}
          {['open', 'matched', 'partial_paid'].includes(r.status) && Number(r.remaining) > 0 && (
            <Button size="small" type="link" icon={<PayCircleOutlined />} onClick={() => openRec(r)}>收款</Button>
          )}
        </Space>
      ),
    },
  ];

  const recColumns = [
    { title: '收款单号', dataIndex: 'receipt_no', width: 170 },
    { title: '收款方式', dataIndex: 'receipt_type', render: v => ({ bank: '银行转账', cash: '现金', alipay: '支付宝', wechat: '微信' })[v] || v },
    { title: '收款账户', dataIndex: 'account_name', render: v => v || '-' },
    { title: '金额', dataIndex: 'amount', align: 'right', render: money },
    { title: '收款日期', dataIndex: 'receipt_date', render: dateFmt },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={REC_STATUS[v]?.color}>{REC_STATUS[v]?.label}</Tag> },
    { title: '凭证', dataIndex: 'voucher_id', render: v => (v ? <Tag color="geekblue">已生成</Tag> : '-') },
    { title: '经办', dataIndex: 'operator', render: v => v || '-' },
  ];

  return (
    <Card title={<><AccountBookOutlined /> 应收管理</>}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>登记应收</Button>}>
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'ar', label: `应收单（${arTotal}）`,
          children: <Table rowKey="id" loading={loading} size="small" dataSource={arData} columns={arColumns}
            pagination={{ pageSize }} scroll={{ x: 1100 }} />,
        },
        {
          key: 'rec', label: `收款单（${recTotal}）`,
          children: <Table rowKey="id" loading={loading} size="small" dataSource={recData} columns={recColumns}
            pagination={{ pageSize }} scroll={{ x: 1000 }} />,
        },
      ]} />

      <Modal title="登记应收（销售开票）" open={createOpen} confirmLoading={confirming} onOk={handleCreate} onCancel={() => setCreateOpen(false)} width={520}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="customer_id" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select showSearch optionFilterProp="label" options={customers} placeholder="选择客户" />
          </Form.Item>
          <Form.Item name="amount" label="应收金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="invoice_no" label="发票号">
            <Input placeholder="可后补" />
          </Form.Item>
          <Form.Item name="due_date" label="到期日">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`收款核销（${recTarget?.doc_no || ''}）`} open={recOpen} confirmLoading={confirming}
        onOk={handleRec} onCancel={() => setRecOpen(false)} width={480}>
        <Form form={recForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="amount" label="收款金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="receipt_type" label="收款方式" rules={[{ required: true }]} initialValue="bank">
            <Select options={[{ value: 'bank', label: '银行转账' }, { value: 'cash', label: '现金' }, { value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信' }]} />
          </Form.Item>
          <Form.Item name="bank_account_id" label="收款账户" rules={[{ required: true, message: '请选择收款账户' }]}>
            <Select options={accounts.map(a => ({ label: `${a.name}（${a.code}）`, value: a.id }))} placeholder="选择资金账户" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
