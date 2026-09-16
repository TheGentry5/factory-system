import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Select,
  DatePicker, Input, message, Popconfirm, Switch, Typography,
} from 'antd';
import {
  PlusOutlined, MinusCircleOutlined, EyeOutlined, CheckOutlined, RollbackOutlined, AccountBookOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const { Text } = Typography;

const V_TYPE = {
  generic: '记账凭证', ap: '应付', ar: '应收', expense: '费用',
  transfer: '结转', closing: '期末结转', opening: '期初',
};
const V_STATUS = {
  draft: { color: 'default', label: '草稿' },
  posted: { color: 'success', label: '已过账' },
  reversed: { color: 'error', label: '已红冲' },
};
const money = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function FinanceVouchers() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [periodNo, setPeriodNo] = useState(dayjs().format('YYYY-MM'));
  const [subjects, setSubjects] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [form] = Form.useForm();
  const pageSize = 15;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/vouchers', { page: 1, pageSize: 100, period_no: periodNo || undefined });
      if (res.success) setData(res.data || []);
    } finally { setLoading(false); }
  }, [periodNo]);

  useEffect(() => {
    fetchList();
    const loadSubjects = async () => {
      const s = await api.get('/finance/vouchers/subjects/list');
      if (s.success) setSubjects(s.data || []);
    };
    loadSubjects();
  }, [fetchList]);

  const subjectOptions = subjects.map(x => ({ label: `${x.code} ${x.name}`, value: x.code }));

  const updateTotals = () => {
    const entries = form.getFieldValue('entries') || [];
    let debit = 0; let credit = 0;
    for (const e of entries) {
      const amt = Number(e?.amount) || 0;
      if (e?.direction === 'debit') debit += amt;
      else if (e?.direction === 'credit') credit += amt;
    }
    setTotals({ debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 });
  };

  const openCreate = () => {
    form.setFieldsValue({
      voucher_date: dayjs(),
      direct: true,
      entries: [{ direction: 'debit' }, { direction: 'credit' }],
    });
    setTotals({ debit: 0, credit: 0 });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setConfirming(true);
      const res = await api.post('/finance/vouchers', {
        voucher_date: values.voucher_date.format('YYYY-MM-DD'),
        period_no: values.voucher_date.format('YYYY-MM'),
        remark: values.remark,
        created_by: operator,
        status: values.direct ? 'posted' : 'draft',
        entries: (values.entries || []).filter(e => e.subject_code && e.amount).map(e => ({
          subject_code: e.subject_code,
          direction: e.direction,
          amount: e.amount,
          summary: e.summary,
        })),
      });
      setConfirming(false);
      if (res.success) {
        message.success(`凭证 ${res.data.voucher_no} 已保存`);
        setCreateOpen(false);
        fetchList();
      } else message.error(res.message || '保存失败');
    } catch { setConfirming(false); }
  };

  const handlePost = async (id) => {
    const res = await api.put(`/finance/vouchers/${id}/post`, { operator_name: operator });
    if (res.success) { message.success('已过账'); fetchList(); }
    else message.error(res.message || '操作失败');
  };

  const handleReverse = async (id) => {
    const res = await api.put(`/finance/vouchers/${id}/reverse`, { operator_name: operator });
    if (res.success) { message.success('已生成红冲凭证'); fetchList(); }
    else message.error(res.message || '操作失败');
  };

  const openView = async (id) => {
    const res = await api.get(`/finance/vouchers/${id}`);
    if (res.success) { setViewData(res.data); setViewOpen(true); }
    else message.error(res.message || '加载失败');
  };

  const unbalanced = Math.abs(totals.debit - totals.credit) > 0.01;

  const columns = [
    { title: '凭证号', dataIndex: 'voucher_no', width: 160 },
    { title: '期间', dataIndex: 'period_no', width: 90 },
    { title: '记账日期', dataIndex: 'voucher_date', width: 110, render: v => dayjs(v).format('YYYY-MM-DD') },
    { title: '类型', dataIndex: 'voucher_type', width: 100, render: v => <Tag color="blue">{V_TYPE[v] || v}</Tag> },
    { title: '借方合计', dataIndex: 'total_debit', align: 'right', width: 120, render: money },
    { title: '贷方合计', dataIndex: 'total_credit', align: 'right', width: 120, render: money },
    { title: '摘要', dataIndex: 'remark', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 90, render: v => <Tag color={V_STATUS[v]?.color}>{V_STATUS[v]?.label}</Tag> },
    { title: '制单人', dataIndex: 'created_by', width: 90, render: v => v || '-' },
    {
      title: '操作', width: 180, render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openView(r.id)}>查看</Button>
          {r.status === 'draft' && (
            <Popconfirm title="过账后不可再编辑，确认过账？" onConfirm={() => handlePost(r.id)}>
              <Button size="small" type="link" icon={<CheckOutlined />}>过账</Button>
            </Popconfirm>
          )}
          {r.status === 'posted' && (
            <Popconfirm title="红冲将生成一张方向互换的冲销凭证，确认？" onConfirm={() => handleReverse(r.id)}>
              <Button size="small" type="link" danger icon={<RollbackOutlined />}>红冲</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><AccountBookOutlined /> 记账凭证</>}
      extra={<Space><Input value={periodNo} onChange={e => setPeriodNo(e.target.value)} placeholder="YYYY-MM" style={{ width: 180 }} addonBefore="期间" />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增凭证</Button></Space>}>
      <Table rowKey="id" loading={loading} size="small" dataSource={data} columns={columns}
        pagination={{ pageSize, showTotal: t => `共 ${t} 条` }} scroll={{ x: 1200 }} />

      <Modal title="新增记账凭证（借贷必须平衡）" open={createOpen} confirmLoading={confirming}
        onOk={handleCreate} onCancel={() => setCreateOpen(false)} width={760}>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Space>
            <Form.Item name="voucher_date" label="记账日期" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="direct" label="保存即过账" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="凭证摘要">
            <Input placeholder="如：××公司货款" />
          </Form.Item>
          <Form.List name="entries">
            {(fields, { add, remove }) => (
              <>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                      <Form.Item name={[field.name, 'subject_code']} rules={[{ required: true, message: '科目' }]}>
                        <Select showSearch optionFilterProp="label" options={subjectOptions} placeholder="会计科目" style={{ width: 220 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'direction']} rules={[{ required: true, message: '方向' }]}>
                        <Select style={{ width: 100 }} options={[{ value: 'debit', label: '借' }, { value: 'credit', label: '贷' }]} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'amount']} rules={[{ required: true, message: '金额' }]}>
                        <InputNumber min={0.01} precision={2} placeholder="0.00" style={{ width: 130 }} onChange={updateTotals} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'summary']} style={{ width: 220 }}>
                        <Input placeholder="分录摘要（可选）" />
                      </Form.Item>
                      {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(field.name)} />}
                    </Space>
                  ))}
                </Space>
                <Button type="dashed" block onClick={() => add({ direction: 'debit' })} icon={<PlusOutlined />}>添加分录</Button>
              </>
            )}
          </Form.List>
          <div style={{ marginTop: 8 }}>
            <Text>借方合计：<Text strong>{totals.debit.toFixed(2)}</Text>　贷方合计：<Text strong>{totals.credit.toFixed(2)}</Text>　</Text>
            {unbalanced
              ? <Text type="danger">　差额 {(totals.debit - totals.credit).toFixed(2)}，借贷不平衡禁止保存</Text>
              : <Text type="success">　已平衡</Text>}
          </div>
        </Form>
      </Modal>

      <Modal title={`凭证详情 ${viewData?.voucher_no || ''}`} open={viewOpen} footer={null}
        onCancel={() => setViewOpen(false)} width={780}>
        {viewData && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag color="blue">{V_TYPE[viewData.voucher_type] || viewData.voucher_type}</Tag>
              <Tag color={V_STATUS[viewData.status]?.color}>{V_STATUS[viewData.status]?.label}</Tag>
              <Text>期间 {viewData.period_no}　日期 {dayjs(viewData.voucher_date).format('YYYY-MM-DD')}　制单 {viewData.created_by}</Text>
            </Space>
            <Table rowKey="id" size="small" pagination={false}
              dataSource={(viewData.entries || []).map((e, i) => ({ ...e, seq: i + 1 }))}
              columns={[
                { title: '#', dataIndex: 'seq', width: 40 },
                { title: '科目', dataIndex: 'subject_name', width: 180, render: (n, r) => `${r.subject_code} ${n || ''}` },
                { title: '方向', dataIndex: 'direction', width: 60, render: v => (v === 'debit' ? '借' : '贷') },
                { title: '金额', dataIndex: 'amount', align: 'right', render: money },
                { title: '摘要', dataIndex: 'summary' },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Text>借方合计 <Text strong>{money(viewData.total_debit)}</Text>　贷方合计 <Text strong>{money(viewData.total_credit)}</Text></Text>
              {viewData.remark && <div style={{ marginTop: 4 }}><Text type="secondary">摘要：{viewData.remark}</Text></div>}
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
