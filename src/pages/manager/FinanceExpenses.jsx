import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Select,
  DatePicker, Input, message, Popconfirm, Tabs, Typography,
} from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, PayCircleOutlined, AccountBookOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const { Text } = Typography;

const EXP_STATUS = {
  draft: { color: 'default', label: '草稿' },
  submitted: { color: 'processing', label: '待审批' },
  approved: { color: 'cyan', label: '已审批' },
  paid: { color: 'success', label: '已付款' },
  rejected: { color: 'error', label: '已驳回' },
};
const EXPENSE_TYPES = ['差旅', '办公', '招待', '维修', '运输', '其他'];
const money = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function FinanceExpenses() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';
  const [tab, setTab] = useState('all');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form] = Form.useForm();
  const pageSize = 15;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: 1, pageSize: 100 };
      if (tab !== 'all') params.status = tab;
      const res = await api.get('/finance/expenses', params);
      if (res.success) setData(res.data || []);
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => {
    fetchList();
    const load = async () => {
      const e = await api.get('/finance/expenses/employees/list');
      if (e.success) setEmployees(e.data || []);
    };
    load();
  }, [fetchList]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setConfirming(true);
      const emp = employees.find(x => x.id === values.employee_id);
      const res = await api.post('/finance/expenses', {
        employee_id: values.employee_id,
        employee_name: emp ? emp.name : undefined,
        department: emp ? emp.department : undefined,
        expense_type: values.expense_type,
        amount: values.amount,
        tax_amount: values.tax_amount,
        attachment_count: values.attachment_count,
        exp_date: values.exp_date ? values.exp_date.format('YYYY-MM-DD') : undefined,
        remark: values.remark,
        created_by: operator,
      });
      setConfirming(false);
      if (res.success) {
        message.success(`报销单 ${res.data.exp_no} 已提交`);
        setCreateOpen(false);
        form.resetFields();
        fetchList();
      } else message.error(res.message || '提交失败');
    } catch { setConfirming(false); }
  };

  const review = async (id, action) => {
    const res = await api.put(`/finance/expenses/${id}/review`, { action, approver: operator });
    if (res.success) { message.success(action === 'approve' ? '已审批通过' : '已驳回'); fetchList(); }
    else message.error(res.message || '操作失败');
  };

  const pay = async (id) => {
    const res = await api.put(`/finance/expenses/${id}/pay`, { payment_type: 'bank', operator_name: operator });
    if (res.success) { message.success('已付款并生成凭证'); fetchList(); }
    else message.error(res.message || '操作失败');
  };

  const columns = [
    { title: '报销单号', dataIndex: 'exp_no', width: 160 },
    { title: '报销人', dataIndex: 'employee_name', width: 90 },
    { title: '部门', dataIndex: 'department', width: 100 },
    { title: '费用类型', dataIndex: 'expense_type', width: 90, render: v => <Tag>{v}</Tag> },
    { title: '金额', dataIndex: 'amount', align: 'right', render: (v, r) => <Text>{money(v)}{Number(r.tax_amount) > 0 && <span style={{ color: '#999', marginLeft: 4 }}>+税{Number(r.tax_amount).toFixed(2)}</span>}</Text> },
    { title: '费用日期', dataIndex: 'exp_date', width: 110, render: v => (v ? dayjs(v).format('YYYY-MM-DD') : '-') },
    { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={EXP_STATUS[v]?.color}>{EXP_STATUS[v]?.label}</Tag> },
    { title: '审批/付款人', dataIndex: 'approver', width: 90, render: v => v || '-' },
    {
      title: '操作', width: 170, render: (_, r) => (
        <Space>
          {['submitted'].includes(r.status) && (
            <>
              <Popconfirm title="确认审批通过？（生成挂账凭证）" onConfirm={() => review(r.id, 'approve')}>
                <Button size="small" type="link" icon={<CheckOutlined />}>通过</Button>
              </Popconfirm>
              <Popconfirm title="确认驳回该报销单？" onConfirm={() => review(r.id, 'reject')}>
                <Button size="small" type="link" danger icon={<CloseOutlined />}>驳回</Button>
              </Popconfirm>
            </>
          )}
          {r.status === 'approved' && (
            <Popconfirm title="确认付款？将生成「借:其他应付款 贷:资金」凭证" onConfirm={() => pay(r.id)}>
              <Button size="small" type="link" icon={<PayCircleOutlined />}>付款</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<><AccountBookOutlined /> 费用报销</>}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>员工提单</Button>}
    >
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'all', label: '全部' },
        { key: 'submitted', label: '待审批' },
        { key: 'approved', label: '已审批待付款' },
        { key: 'paid', label: '已付款' },
        { key: 'rejected', label: '已驳回' },
      ]} />
      <Table rowKey="id" loading={loading} size="small" dataSource={data} columns={columns}
        pagination={{ pageSize, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1100 }} />

      <Modal title="费用报销提单" open={createOpen} confirmLoading={confirming} onOk={handleCreate} onCancel={() => setCreateOpen(false)} width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="employee_id" label="报销人" rules={[{ required: true, message: '请选择报销人' }]}>
            <Select showSearch optionFilterProp="label"
              options={employees.map(e => ({ label: `${e.emp_no} ${e.name}（${e.department || '-'}）`, value: e.id }))}
              placeholder="选择员工" />
          </Form.Item>
          <Form.Item name="expense_type" label="费用类型" rules={[{ required: true }]} initialValue="差旅">
            <Select options={EXPENSE_TYPES.map(t => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="amount" label="报销金额（元）" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="tax_amount" label="税额（元）">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="attachment_count" label="附件数">
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="exp_date" label="费用发生日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
