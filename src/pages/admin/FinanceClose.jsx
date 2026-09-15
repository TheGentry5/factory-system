import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Tabs, message, Popconfirm, DatePicker, Descriptions,
} from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, LockOutlined, RollbackOutlined, PlusOutlined, HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const P_STATUS = {
  open: { color: 'success', label: '开启' },
  closing: { color: 'processing', label: '结账中' },
  closed: { color: 'default', label: '已结账' },
  reopened: { color: 'warning', label: '反结账(已重开)' },
};
const CHK_LEVEL = {
  pass: 'success', warn: 'warning', block: 'error',
};
const money = (v) => (v === null || v === undefined ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function FinanceClose() {
  const { currentUser } = useAuth();
  const operator = currentUser?.name || 'system';
  const [periods, setPeriods] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openPeriod, setOpenPeriod] = useState(dayjs());
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkData, setCheckData] = useState(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialData, setTrialData] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([api.get('/finance/close/periods'), api.get('/finance/close/logs')]);
      if (p.success) setPeriods(p.data || []);
      if (l.success) setLogs(l.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const call = async (url, payload, okMsg) => {
    setBusy(true);
    try {
      const res = await api.post(url, payload || {});
      if (res.success) {
        if (okMsg) message.success(okMsg);
        fetchAll();
        return res.data;
      }
      message.error(res.message || '操作失败');
      return null;
    } finally { setBusy(false); }
  };

  const ensurePeriod = async () => {
    await call('/finance/close/periods', { period_no: openPeriod.format('YYYY-MM') }, `期间 ${openPeriod.format('YYYY-MM')} 已开启`);
  };

  const openPrecheck = async (p) => {
    const d = await call(`/finance/close/${p}/precheck`, {});
    if (d) { setCheckData(d); setCheckOpen(true); }
  };

  const openTrial = async (p) => {
    const d = await call(`/finance/close/${p}/trial-balance`, {});
    if (d) { setTrialData(d); setTrialOpen(true); }
  };

  const closeProfit = async (p) => {
    const d = await call(`/finance/close/${p}/close-profit`, { operator_name: operator }, '损益结转完成（已生成结转凭证或提示无需结转）');
    if (d && !d.skipped) message.success(`结转凭证 ${d.voucher_no}`);
  };

  const doClose = async (p) => {
    const d = await call(`/finance/close/${p}/close`, { operator_name: operator }, '期间已结账锁定');
    if (d) fetchAll();
  };

  const doReopen = async (p) => {
    const d = await call(`/finance/close/${p}/reopen`, { operator_name: operator }, '已反结账（结转凭证已清空）');
    if (d) fetchAll();
  };

  const periodCols = [
    { title: '期间', dataIndex: 'period_no', width: 120 },
    {
      title: '状态', dataIndex: 'status', width: 120,
      render: v => <Tag color={P_STATUS[v]?.color}>{P_STATUS[v]?.label}</Tag>,
    },
    { title: '已过账凭证', dataIndex: 'posted_count', width: 110, align: 'right' },
    { title: '草稿凭证', dataIndex: 'draft_count', width: 100, align: 'right' },
    { title: '结账人', dataIndex: 'closed_by', width: 110, render: v => v || '-' },
    { title: '结账时间', dataIndex: 'closed_at', width: 170, render: v => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
    {
      title: '操作', width: 380, render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<EyeOutlined />} loading={busy} onClick={() => openPrecheck(r.period_no)}>预检</Button>
          <Button size="small" type="link" icon={<CheckCircleOutlined />} loading={busy} onClick={() => openTrial(r.period_no)}>试算</Button>
          {['open', 'reopened'].includes(r.status) && (
            <>
              <Popconfirm title="执行损益结转？幂等可重复执行" onConfirm={() => closeProfit(r.period_no)}>
                <Button size="small" type="link" loading={busy}>损益结转</Button>
              </Popconfirm>
              <Popconfirm title={`确认结账期间 ${r.period_no}？结账后将锁定本期数据`} onConfirm={() => doClose(r.period_no)}>
                <Button size="small" type="primary" danger icon={<LockOutlined />} loading={busy}>结账</Button>
              </Popconfirm>
            </>
          )}
          {r.status === 'closed' && (
            <Popconfirm title={`反结账 ${r.period_no} 属高风险操作，将清空结转凭证，确认？`} onConfirm={() => doReopen(r.period_no)}>
              <Button size="small" type="link" danger icon={<RollbackOutlined />} loading={busy}>反结账</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const logCols = [
    { title: '时间', dataIndex: 'created_at', width: 170, render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '期间', dataIndex: 'period_no', width: 100 },
    { title: '操作', dataIndex: 'action', width: 130, render: v => <Tag color={v === 'reopen' ? 'error' : 'blue'}>{v}</Tag> },
    { title: '操作人', dataIndex: 'operator', width: 110 },
    { title: '说明', dataIndex: 'detail' },
  ];

  return (
    <Card
      title="期末结账"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={ensurePeriod} loading={busy}>开启期间</Button>}
    >
      <Space style={{ marginBottom: 12 }}>
        <DatePicker picker="month" value={openPeriod} onChange={d => d && setOpenPeriod(d)} allowClear={false} />
        <Button onClick={fetchAll} icon={<HistoryOutlined />}>刷新</Button>
      </Space>
      <Tabs items={[
        {
          key: 'periods', label: '期间管理',
          children: <Table rowKey="id" loading={loading} size="small" dataSource={periods} columns={periodCols}
            pagination={{ pageSize: 15 }} scroll={{ x: 1000 }} />,
        },
        {
          key: 'logs', label: '结账日志',
          children: <Table rowKey="id" loading={loading} size="small" dataSource={logs} columns={logCols}
            pagination={{ pageSize: 15 }} />,
        },
      ]} />

      <Modal title={`结账预检（${checkData?.period?.period_no || ''}）`} open={checkOpen} footer={null} onCancel={() => setCheckOpen(false)} width={560}>
        {checkData && (
          <>
            {checkData.checks.map(c => (
              <div key={c.key} style={{ padding: '6px 0' }}>
                <Tag color={CHK_LEVEL[c.level]}>{c.level === 'block' ? '阻断' : c.level === 'warn' ? '提示' : '通过'}</Tag>
                {c.label}
                {c.level === 'block' && <Tag color="error" style={{ marginLeft: 8 }}>未通过</Tag>}
              </div>
            ))}
            <Descriptions style={{ marginTop: 12 }} column={1}>
              <Descriptions.Item label="期间状态">{P_STATUS[checkData.period?.status]?.label || checkData.period?.status}</Descriptions.Item>
              <Descriptions.Item label="是否可结账">{checkData.pass ? '是（无阻断项）' : '否（存在阻断项）'}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>

      <Modal title="试算平衡表" open={trialOpen} footer={null} onCancel={() => setTrialOpen(false)} width={720}>
        {trialData && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Tag color={trialData.balanced ? 'success' : 'error'}>{trialData.balanced ? '借贷平衡' : `差额 ${trialData.diff}`}</Tag>
              <span style={{ marginLeft: 12 }}>借方合计 <b>{money(trialData.total_debit)}</b>　贷方合计 <b>{money(trialData.total_credit)}</b></span>
            </div>
            <Table size="small" rowKey="subject_code" pagination={false} dataSource={trialData.rows || []}
              columns={[
                { title: '科目', dataIndex: 'subject_code', width: 90 },
                { title: '名称', dataIndex: 'subject_name' },
                { title: '本期借方', dataIndex: 'debit', align: 'right', render: money },
                { title: '本期贷方', dataIndex: 'credit', align: 'right', render: money },
              ]} />
          </>
        )}
      </Modal>
    </Card>
  );
}
