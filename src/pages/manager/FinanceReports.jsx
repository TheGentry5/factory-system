import { useState, useEffect, useRef } from 'react';
import { Card, Table, Tabs, Tag, Space, Typography, DatePicker, Empty } from 'antd';
import { AccountBookOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../utils/api';

const { Title, Text } = Typography;

const money = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '-' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function useFetch(fn, deps) {
  const key = (deps || []).join('|');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef.current().then(res => { if (alive) setData(res && res.success ? res.data : null); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key]);
  return { data, loading };
}

// 月份中文名（antd 月选择面板取 locale.lang.shortMonths，默认 zh_CN 未内置，回退到 dayjs 会显示英文）
const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const MONTH_PICKER_LOCALE = { lang: { shortMonths: MONTHS_CN } };

const TYPE_TAG = { asset: 'green', liability: 'orange', equity: 'blue', revenue: 'purple', expense: 'red', cost: 'volcano' };
const typeName = { asset: '资产', liability: '负债', equity: '权益', revenue: '收入', expense: '费用', cost: '成本' };

function periodOf() { return dayjs().format('YYYY-MM'); }

// ── 试算平衡 ──
function TrialTab({ period }) {
  const { data, loading } = useFetch(() => api.get('/finance/reports/trial-balance', { period_no: period }), [period]);
  return (
    <Table size="small" loading={loading} rowKey="subject_code" pagination={false}
      dataSource={data?.rows || []} scroll={{ x: 700 }}
      columns={[
        { title: '科目编码', dataIndex: 'subject_code', width: 120 },
        { title: '科目名称', dataIndex: 'subject_name' },
        { title: '类型', dataIndex: 'subject_type', width: 80, render: v => <Tag color={TYPE_TAG[v]}>{typeName[v] || v}</Tag> },
        { title: '本期借方', dataIndex: 'debit', align: 'right', render: money },
        { title: '本期贷方', dataIndex: 'credit', align: 'right', render: money },
      ]}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={3}><Text strong>合计（{data?.balanced ? '平衡' : `差额 ${num(data?.diff)}`}）</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right"><Text strong>{money(data?.total_debit)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={2} align="right"><Text strong>{money(data?.total_credit)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )} />
  );
}

// ── 科目余额表 ──
function SubjectTab({ period }) {
  const { data, loading } = useFetch(() => api.get('/finance/reports/subject-balances', { period_no: period }), [period]);
  const cols = [
    { title: '科目编码', dataIndex: 'subject_code', width: 110 },
    { title: '科目名称', dataIndex: 'subject_name' },
    { title: '期初借方', dataIndex: 'opening_debit', align: 'right', render: money },
    { title: '期初贷方', dataIndex: 'opening_credit', align: 'right', render: money },
    { title: '本期借方', dataIndex: 'period_debit', align: 'right', render: money },
    { title: '本期贷方', dataIndex: 'period_credit', align: 'right', render: money },
    { title: '期末借方', dataIndex: 'ending_debit', align: 'right', render: money },
    { title: '期末贷方', dataIndex: 'ending_credit', align: 'right', render: money },
  ];
  const summary = (t) => (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0} colSpan={2}><Text strong>合计</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={1} align="right"><Text strong>{money(t.opening_debit)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right"><Text strong>{money(t.opening_credit)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={3} align="right"><Text strong>{money(t.period_debit)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={4} align="right"><Text strong>{money(t.period_credit)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={5} align="right"><Text strong>{money(t.ending_debit)}</Text></Table.Summary.Cell>
      <Table.Summary.Cell index={6} align="right"><Text strong>{money(t.ending_credit)}</Text></Table.Summary.Cell>
    </Table.Summary.Row>
  );
  return <Table size="small" loading={loading} rowKey="subject_code" pagination={{ pageSize: 20 }} dataSource={data?.rows || []} columns={cols} scroll={{ x: 1000 }} summary={() => summary(data?.totals || {})} />;
}

// ── 利润表 ──
function ProfitTab({ period }) {
  const { data, loading } = useFetch(() => api.get('/finance/reports/profit', { period_no: period }), [period]);
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {data && (
        <Space size={24}>
          <Text>营业收入：<Text strong>{money(data.revenue.cur)}</Text></Text>
          <Text>成本费用：<Text strong>{money(data.cost.cur)}</Text></Text>
          <Text>本期净利润：<Text strong type={data.profit.cur >= 0 ? 'success' : 'danger'}>{money(data.profit.cur)}</Text></Text>
          <Text type="secondary">本年累计净利润：{money(data.profit.ytd)}</Text>
        </Space>
      )}
      <Table size="small" loading={loading} rowKey="subject_code" pagination={false} dataSource={data?.rows || []} scroll={{ x: 900 }}
        columns={[
          { title: '科目', dataIndex: 'subject_name', render: (n, r) => `${r.subject_code} ${n}` },
          { title: '类型', dataIndex: 'subject_type', width: 70, render: v => <Tag color={TYPE_TAG[v]}>{typeName[v]}</Tag> },
          { title: '本期发生(借贷方向净额)', dataIndex: 'cur_net', align: 'right', render: money },
          { title: '本年累计净额', dataIndex: 'ytd_net', align: 'right', render: money },
        ]} />
    </Space>
  );
}

// ── 资产负债表 ──
function BalanceTab({ period }) {
  const { data, loading } = useFetch(() => api.get('/finance/reports/balance-sheet', { period_no: period }), [period]);
  if (!data) return <Card loading={loading}><Empty /></Card>;
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Text type="secondary">截至期间：{data.as_of}　{data.balanced ? <Text type="success">资产 = 负债 + 权益（平衡）</Text> : <Text type="danger">不平衡！资产 {money(data.asset_total)} ≠ 负债 {money(data.liability_total)} + 权益 {money(data.equity_total)}</Text>}</Text>
      {data.sections.map(sec => (
        <Card key={sec.key} size="small" title={`${sec.name}（${money(sec.rows.reduce((s, r) => s + r.debit + r.credit, 0))}）`}>
          <Table size="small" rowKey="subject_code" pagination={false} dataSource={sec.rows}
            columns={[
              { title: '科目', dataIndex: 'subject_name', render: (n, r) => `${r.subject_code} ${n}` },
              { title: '借方余额', dataIndex: 'debit', align: 'right', render: money },
              { title: '贷方余额', dataIndex: 'credit', align: 'right', render: money },
            ]} />
        </Card>
      ))}
      <Space size={24}>
        <Text>资产总计 <Text strong>{money(data.asset_total)}</Text></Text>
        <Text>负债总计 <Text strong>{money(data.liability_total)}</Text></Text>
        <Text>所有者权益总计 <Text strong>{money(data.equity_total)}</Text></Text>
      </Space>
    </Space>
  );
}

// ── 现金流量表（简化） ──
function CashTab({ period }) {
  const { data, loading } = useFetch(() => api.get('/finance/reports/cash-flow', { period_no: period }), [period]);
  return (
    <Table size="small" loading={loading} rowKey="subject_code" pagination={false} dataSource={data?.rows || []} scroll={{ x: 600 }}
      columns={[
        { title: '资金科目', dataIndex: 'subject_name', render: (n, r) => `${r.subject_code} ${n}` },
        { title: '流入(收现)', dataIndex: 'inflow', align: 'right', render: money },
        { title: '流出(付现)', dataIndex: 'outflow', align: 'right', render: money },
        { title: '净流量', dataIndex: 'net', align: 'right', render: v => <Text type={Number(v) >= 0 ? 'success' : 'danger'}>{money(v)}</Text> },
      ]}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}><Text strong>合计（收付实现制简化）</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right"><Text strong>{money(data?.total_inflow)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={2} align="right"><Text strong>{money(data?.total_outflow)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={3} align="right"><Text strong>{money(data?.net)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )} />
  );
}

// ── 账龄（应收/应付通用） ──
function AgingTab({ type }) {
  const { data, loading } = useFetch(() => api.get(`/finance/reports/${type === 'ar' ? 'ar-aging' : 'ap-aging'}`), []);
  const firstCol = { ar: '客户', ap: '供应商' }[type];
  return (
    <Table size="small" loading={loading} rowKey="supplier_name" pagination={false} dataSource={data?.rows || []} scroll={{ x: 800 }}
      columns={[
        { title: firstCol, dataIndex: type === 'ar' ? 'customer_name' : 'supplier_name' },
        { title: '未到期/当期', dataIndex: 'b0', align: 'right', render: money },
        { title: '逾期≤30天', dataIndex: 'b30', align: 'right', render: money },
        { title: '31-60天', dataIndex: 'b60', align: 'right', render: money },
        { title: '61-90天', dataIndex: 'b90', align: 'right', render: money },
        { title: '>90天', dataIndex: 'bm', align: 'right', render: v => <Text type="danger">{money(v)}</Text> },
        { title: '剩余合计', dataIndex: 'remaining', align: 'right', render: v => <Text strong>{money(v)}</Text> },
      ]}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}><Text strong>合计</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right">{money(data?.totals?.b0)}</Table.Summary.Cell>
          <Table.Summary.Cell index={2} align="right">{money(data?.totals?.b30)}</Table.Summary.Cell>
          <Table.Summary.Cell index={3} align="right">{money(data?.totals?.b60)}</Table.Summary.Cell>
          <Table.Summary.Cell index={4} align="right">{money(data?.totals?.b90)}</Table.Summary.Cell>
          <Table.Summary.Cell index={5} align="right">{money(data?.totals?.bm)}</Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="right"><Text strong>{money(data?.totals?.remaining)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )} />
  );
}

// ── 费用报表 ──
function ExpenseTab() {
  const { data, loading } = useFetch(() => api.get('/finance/reports/expenses'), []);
  return (
    <Table size="small" loading={loading} rowKey="key" pagination={{ pageSize: 20 }} dataSource={(data?.rows || []).map((r, i) => ({ ...r, key: i }))}
      columns={[
        { title: '部门', dataIndex: 'department' },
        { title: '费用类型', dataIndex: 'expense_type', width: 100, render: v => <Tag>{v}</Tag> },
        { title: '单据数', dataIndex: 'doc_count', width: 90, align: 'right' },
        { title: '报销金额', dataIndex: 'amount', align: 'right', render: money },
        { title: '含税金额', dataIndex: 'total_amount', align: 'right', render: money },
      ]}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={2}><Text strong>合计（{data?.totals?.doc_count || 0} 张）</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={1} />
          <Table.Summary.Cell index={2} align="right"><Text strong>{money(data?.totals?.amount)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={3} align="right"><Text strong>{money(data?.totals?.total_amount)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )} />
  );
}

export default function FinanceReports() {
  const [period, setPeriod] = useState(periodOf());
  const [tab, setTab] = useState('trial');
  const tabs = [
    { key: 'trial', label: '试算平衡' },
    { key: 'subject', label: '科目余额' },
    { key: 'profit', label: '利润表' },
    { key: 'balance', label: '资产负债表' },
    { key: 'cash', label: '现金流量表' },
    { key: 'ar', label: '应收账龄' },
    { key: 'ap', label: '应付账龄' },
    { key: 'expense', label: '费用报表' },
  ];
  const renderPanel = () => {
    switch (tab) {
      case 'trial': return <TrialTab period={period} />;
      case 'subject': return <SubjectTab period={period} />;
      case 'profit': return <ProfitTab period={period} />;
      case 'balance': return <BalanceTab period={period} />;
      case 'cash': return <CashTab period={period} />;
      case 'ar': return <AgingTab type="ar" />;
      case 'ap': return <AgingTab type="ap" />;
      case 'expense': return <ExpenseTab />;
      default: return null;
    }
  };
  return (
    <Card title={<><AccountBookOutlined /> 财务报表</>}
      extra={
        <DatePicker picker="month" value={dayjs(period)} onChange={(d) => d && setPeriod(d.format('YYYY-MM'))} allowClear={false} locale={MONTH_PICKER_LOCALE} />
      }>
      <Title level={5} style={{ marginTop: 0 }}>会计期间：{period}（报表口径：已过账凭证）</Title>
      <Tabs activeKey={tab} onChange={setTab} items={tabs} />
      {renderPanel()}
    </Card>
  );
}
