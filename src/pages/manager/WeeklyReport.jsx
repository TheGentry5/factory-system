import { useState, useEffect, Component } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography,
  Alert, Space, Divider, Spin, DatePicker, Button, Empty } from 'antd';
import {
  ReloadOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ThunderboltOutlined, BulbOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// ==================== 错误边界 ====================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Title level={4} type="danger">页面渲染出错</Title>
          <Paragraph type="secondary">{String(this.state.error)}</Paragraph>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>重试</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==================== 工具 ====================
function utilColor(v) {
  if (v >= 85) return '#ff4d4f';
  if (v >= 60) return '#faad14';
  if (v >= 30) return '#52c41a';
  return '#1890ff';
}

const api = {
  get: (url, params) => {
    const qs = new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return fetch(`/api${url}${qs ? '?' + qs : ''}`)
      .then(r => { if (!r.ok) throw new Error('网络错误'); return r.json(); });
  },
};

// ==================== 页面 ====================
export default function WeeklyReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(dayjs());
  const [error, setError] = useState(null);

  const fetchReport = async (d) => {
    setLoading(true);
    setError(null);
    try {
      const dateStr = (d || date).format('YYYY-MM-DD');
      const res = await api.get('/reports/weekly', { date: dateStr });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError((res && res.message) || '无数据');
      }
    } catch (e) {
      setError(e.message || '无法连接');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  // ====== 加载中 ======
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /><div style={{ marginTop: 16, color: '#999' }}>AI 正在分析本周数据...</div></div>;
  }

  // ====== 错误 ======
  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Title level={5} type="danger">加载失败</Title>
        <Paragraph type="secondary">{error}</Paragraph>
        <Button icon={<ReloadOutlined />} onClick={() => fetchReport()} type="primary">重试</Button>
      </div>
    );
  }

  // ====== 无数据 ======
  if (!data || !data.summary) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Empty description="暂无本周数据" /></div>;
  }

  // ====== 数据就绪 ======
  const s = data.summary || {};
  const machines = data.machineUtilization || [];
  const b = data.bottleneck || {};
  const owners = data.ownerBreakdown || [];
  const recs = data.recommendations || [];

  const utilCols = [
    { title: '设备', dataIndex: 'name', key: 'name', width: 100, render: v => <Text strong>{v}</Text> },
    { title: '利用率', dataIndex: 'util', key: 'util', width: 150,
      render: v => {
        const pct = Math.round(Number(v) || 0);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
              <div style={{ width: pct + '%', height: 6, background: utilColor(pct), borderRadius: 3 }} />
            </div>
            <Text style={{ fontSize: 12 }}>{pct}%</Text>
          </div>
        );
      },
    },
    { title: '有效工时', dataIndex: 'productiveH', key: 'h', align: 'right', width: 80, render: v => (Number(v)||0).toFixed(0) + 'h' },
    { title: '状态', key: 'status', width: 60,
      render: (_, r) => {
        const u = Number(r.util) || 0;
        return <Tag color={u >= 85 ? 'red' : u >= 60 ? 'orange' : u >= 30 ? 'green' : 'default'}>{u >= 85 ? '瓶颈' : u >= 60 ? '忙碌' : u >= 30 ? '正常' : '空闲'}</Tag>;
      },
    },
  ];

  const ownerCols = [
    { title: '业务组', dataIndex: 'owner', key: 'owner', render: v => <Text strong>{v}</Text> },
    { title: '订单', dataIndex: 'orders', key: 'o', align: 'right' },
    { title: '印量', dataIndex: 'qty', key: 'q', align: 'right', render: v => (Number(v)||0).toLocaleString() },
    { title: '完成', dataIndex: 'completed', key: 'c', align: 'right' },
  ];

  return (
    <ErrorBoundary>
      <div>
        {/* 页头 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'space-between' }}>
          <Space wrap>
            <Title level={4} style={{ margin: 0 }}>📊 AI 周报</Title>
            <Tag color={data.dataSource === '数据库' ? 'green' : 'orange'}>{data.dataSource || '演示数据'}</Tag>
          </Space>
          <Space>
            <DatePicker value={date} onChange={d => { setDate(d); fetchReport(d); }} size="small" allowClear={false} />
            <Text type="secondary" style={{ fontSize: 11 }}>{data.weekStart} ~ {data.weekEnd}</Text>
          </Space>
        </div>

        {/* 概览卡片 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card size="small"><Statistic title="订单总数" value={s.totalOrders || 0} suffix="单" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title="总印量" value={(s.totalQty || 0).toLocaleString()} suffix="印" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title="交期达成率" value={s.onTimeRate || 0} suffix="%" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title={<><WarningOutlined /> 已逾期</>} value={s.overdue || 0} suffix="单" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title={<><CheckCircleOutlined /> 已完成</>} value={s.completedOrders || 0} suffix="单" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title={<><ClockCircleOutlined /> 进行中</>} value={s.inProgress || 0} suffix="单" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title={<><ThunderboltOutlined /> 急单</>} value={s.rushCount || 0} suffix="单" /></Card></Col>
          <Col xs={12} sm={6}><Card size="small"><Statistic title="大批量" value={s.largeCount || 0} suffix="单" /></Card></Col>
        </Row>

        {/* 瓶颈诊断 */}
        <Card size="small" style={{ marginBottom: 16, borderLeft: `3px solid ${(b.utilization || 0) >= 85 ? '#ff4d4f' : '#faad14'}` }}>
          <Row gutter={[16, 8]} align="middle">
            <Col xs={24} md={12}>
              <Text strong style={{ fontSize: 15 }}>🚧 瓶颈诊断</Text>
              <div style={{ marginTop: 8 }}>
                <Text>瓶颈设备：<Text strong style={{ color: '#ff4d4f' }}>{b.machine || '—'}</Text> 利用率 {b.utilization || 0}%</Text>
                <br />
                <Text type="secondary">印刷组平均 {b.printersAvgUtil || 0}% | 后道平均 {b.postProcessAvgUtil || 0}% | 整体 {b.avgUtil || 0}%</Text>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ background: '#fafafa', borderRadius: 6, padding: 10 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(b.utilization || 0) >= 85
                    ? `⚠️ ${b.machine}已接近极限。印刷机闲置但在等后道——建议增加后道产能或安排加班。`
                    : (b.postProcessAvgUtil || 0) > (b.printersAvgUtil || 0) * 2
                      ? '💡 后道产能比印刷紧张——可接更多印刷-only订单填补印刷机闲置。'
                      : '✅ 产能分布较均衡。'}
                </Text>
              </div>
            </Col>
          </Row>
        </Card>

        {/* 设备利用率 + 业务组 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={14}>
            <Card title="📈 设备利用率" size="small">
              <Table columns={utilCols} dataSource={machines} rowKey="name" pagination={false} size="small" />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="👥 业务组分布" size="small">
              <Table columns={ownerCols} dataSource={owners} rowKey="owner" pagination={false} size="small" />
            </Card>
          </Col>
        </Row>

        {/* AI 决策建议 */}
        <Card title={<><BulbOutlined /> AI 决策建议</>} size="small" style={{ marginBottom: 16 }}>
          {recs.length > 0 ? recs.map((rec, i) => (
            <Alert key={i} message={rec.title} description={rec.detail}
              type={rec.level === 'critical' ? 'error' : rec.level === 'warning' ? 'warning' : 'info'}
              showIcon style={{ marginBottom: 8 }} />
          )) : <Empty description="本周运行良好" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>

        {/* 底部 */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Space split="|">
            <Text type="secondary" style={{ fontSize: 11 }}>📅 {data.weekStart} ~ {data.weekEnd}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>⚡ {data.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN') : '—'}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>📊 {data.dataSource || '—'}</Text>
          </Space>
        </div>
      </div>
    </ErrorBoundary>
  );
}
