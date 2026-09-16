import { useState, useEffect, useRef, Component } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Badge, Progress, Table, Typography,
  Space, Divider, Tooltip, Spin, Button,
} from 'antd';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div style={{padding:40,textAlign:'center'}}><Typography.Title level={4} type="danger">页面渲染出错</Typography.Title><Button onClick={()=>this.setState({hasError:false})}>重试</Button></div>;
    return this.props.children;
  }
}
import {
  PrinterOutlined, ClockCircleOutlined, ThunderboltOutlined,
  DollarOutlined, ReloadOutlined, WifiOutlined, AimOutlined,
  PlayCircleOutlined, PauseCircleOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

// ==================== 内联 API ====================
import api from '../../utils/api';

// ==================== 工具函数 ====================

function formatEstimate(minutesLeft) {
  if (minutesLeft <= 0) return '即将完成';
  const now = new Date();
  const target = new Date(now.getTime() + minutesLeft * 60000);
  const isTomorrow = target.getDate() !== now.getDate();
  const timeStr = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
  return isTomorrow ? `明早 ${timeStr}` : `今天 ${timeStr}`;
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('zh-CN');
}

function statusColor(status) {
  switch (status) {
    case 'running': return '#52c41a';
    case 'idle': return '#faad14';
    case 'stopped': return '#ff4d4f';
    default: return '#999';
  }
}

function statusLabel(status) {
  switch (status) {
    case 'running': return '运行中';
    case 'idle': return '空闲';
    case 'stopped': return '停机';
    default: return status;
  }
}

function machineIcon(type) {
  switch (type) {
    case 'printing': return <PrinterOutlined />;
    case 'folding': return <AimOutlined />;
    case 'gluing': return <ThunderboltOutlined />;
    default: return <PlayCircleOutlined />;
  }
}

// ==================== 页面主体 ====================

export default function ProductionMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdateMs, setLastUpdateMs] = useState(0);
  const [error, setError] = useState(null);
  const tickRef = useRef(null);
  const { currentGroup } = useAuth();  // 当前登录用户所属业务组

  const fetchData = async () => {
    try {
      const res = await api.get('/demo/production-state');
      if (res.success) {
        setData(res.data);
        setLastUpdateMs(Date.now() - res.data.lastTick);
        setError(null);
      }
    } catch (e) {
      setError('无法连接演示数据服务');
    } finally {
      setLoading(false);
    }
  };

  // 轮询 + 每秒刷新"更新于X秒前"
  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 2000);
    tickRef.current = setInterval(() => setLastUpdateMs(prev => prev + 1000), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tickRef.current);
    };
  }, []);

  const machines = data?.machines || [];
  const monthlySummary = data?.monthlySummary || [];

  // ==================== 月度汇总表格列 ====================

  const summaryColumns = [
    { title: '业务组', dataIndex: 'bossName', key: 'bossName', width: 80,
      render: v => <Text strong>{v}</Text>,
    },
    { title: '总印量', dataIndex: 'totalImpressions', key: 'totalImpressions', align: 'right',
      render: v => formatNumber(v),
    },
    { title: '总费用', dataIndex: 'totalCost', key: 'totalCost', align: 'right',
      render: v => <Text style={{ color: '#cf1322' }}>¥{formatNumber(v)}</Text>,
    },
    { title: '印刷', dataIndex: 'printing', key: 'printing', align: 'right',
      render: v => formatNumber(v),
    },
    { title: '折页', dataIndex: 'folding', key: 'folding', align: 'right',
      render: v => formatNumber(v),
    },
    { title: '糊盒', dataIndex: 'gluing', key: 'gluing', align: 'right',
      render: v => formatNumber(v),
    },
  ];

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#999' }}>正在连接生产数据...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Text type="danger">{error}</Text>
        <br />
        <a onClick={() => { setLoading(true); setError(null); fetchData(); }}
           style={{ marginTop: 12, display: 'inline-block' }}>
          <ReloadOutlined /> 重试
        </a>
      </div>
    );
  }

  const secondsAgo = Math.round(Math.max(0, lastUpdateMs) / 1000);

  return (
    <ErrorBoundary>
    <div>
      {/* ========== 页头 ========== */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 16, justifyContent: 'space-between',
      }}>
        <Space wrap size={12}>
          <Title level={4} style={{ margin: 0 }}>
            📡 实时生产监控
          </Title>
          <Tag color="orange" style={{ fontSize: 12 }}>模拟演示模式</Tag>
        </Space>
        <Space size={4}>
          <WifiOutlined style={{ color: secondsAgo < 5 ? '#52c41a' : '#faad14' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            更新于 {secondsAgo < 3 ? '刚刚' : `${secondsAgo}秒前`}
          </Text>
        </Space>
      </div>

      {/* ========== 机器状态卡片 ========== */}
      <Row gutter={[12, 12]}>
        {machines.map(m => {
          const isRunning = m.status === 'running';
          const ownerName = m.currentJob?.ownerGroup || '';
          const myGroup = (currentGroup || '').replace('组', '');
          const isMyJob = ownerName && myGroup && ownerName.includes(myGroup);
          // 边框色：我的工单用蓝色，运行用绿色
          const borderColor = isMyJob ? '#1890ff'
            : isRunning ? '#52c41a'
            : m.status === 'idle' ? '#faad14' : '#d9d9d9';
          // 进度条：运行中始终绿色，空闲黄色，停机灰色
          const progressColor = isRunning ? '#52c41a'
            : m.status === 'idle' ? '#faad14' : '#d9d9d9';

          return (
            <Col xs={24} sm={12} md={8} lg={6} key={m.id}>
              <Card
                size="small"
                hoverable
                style={{
                  borderLeft: `3px solid ${borderColor}`,
                  height: '100%',
                  background: isMyJob ? '#f6ffed' : undefined,
                }}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: statusColor(m.status), marginRight: 2 }}>
                      {machineIcon(m.type)}
                    </span>
                    <Text strong style={{ fontSize: 14 }}>{m.name}</Text>
                    <Tag color="cyan" style={{ fontSize: 11, marginLeft: 4 }}>共享设备</Tag>
                    {isMyJob && <Tag color="blue" style={{ fontSize: 11 }}><UserOutlined /> 我的工单</Tag>}
                    <Badge status={isRunning ? 'processing' : 'default'}
                           text={<Text style={{ fontSize: 11 }}>{statusLabel(m.status)}</Text>} />
                  </div>
                }
              >
                {m.currentJob ? (
                  <>
                    {/* 工单信息 */}
                    <div style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        {m.currentJob.ownerGroup} — {m.currentJob.jobName}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {m.currentJob.orderNo}
                      </Text>
                    </div>

                    {/* 进度条 */}
                    <Progress
                      percent={m.progress}
                      size="small"
                      strokeColor={progressColor}
                      format={p => `${p}%`}
                      style={{ marginBottom: 8 }}
                    />

                    {/* 核心数据 */}
                    <Row gutter={[8, 4]}>
                      <Col span={12}>
                        <Statistic
                          title="已完成 / 总量"
                          value={`${formatNumber(m.currentJob.completedCount)} / ${formatNumber(m.currentJob.totalCount)}`}
                          valueStyle={{ fontSize: 13, fontWeight: 600 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="速度"
                          value={formatNumber(m.speedPerHour)}
                          suffix="印/时"
                          valueStyle={{ fontSize: 13 }}
                        />
                      </Col>
                    </Row>

                    <Row gutter={[8, 4]} style={{ marginTop: 4 }}>
                      <Col span={12}>
                        <Statistic
                          title={
                            <Space size={2}>
                              <ClockCircleOutlined style={{ fontSize: 10 }} />
                              <span>预计完成</span>
                            </Space>
                          }
                          value={formatEstimate(m.estimatedMinutesLeft)}
                          valueStyle={{ fontSize: 13, color: m.estimatedMinutesLeft > 120 ? '#1890ff' : '#faad14' }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title={
                            <Space size={2}>
                              <DollarOutlined style={{ fontSize: 10 }} />
                              <span>当前费用</span>
                            </Space>
                          }
                          value={`¥${(m.currentCost ?? 0).toFixed(0)}`}
                          valueStyle={{ fontSize: 13, color: '#cf1322', fontWeight: 600 }}
                        />
                      </Col>
                    </Row>

                    {/* 排队信息 */}
                    {m.queue && m.queue.length > 0 && (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ background: '#fafafa', borderRadius: 6, padding: '6px 10px' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>📋 排队：</Text>
                          {m.queue.slice(0, 2).map((q, i) => (
                            <Tag key={i} style={{ fontSize: 11, marginTop: 4 }}>
                              {q.ownerGroup} — {q.jobName} ({formatNumber(q.totalCount)})
                            </Tag>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    <PauseCircleOutlined style={{ fontSize: 28 }} />
                    <div style={{ marginTop: 8 }}>暂无工单</div>
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* ========== 月度汇总 ========== */}
      <Card
        title="📊 本月各组汇总（系统自动统计）"
        size="small"
        style={{ marginTop: 16 }}
      >
        <Table
          columns={summaryColumns}
          dataSource={monthlySummary}
          rowKey="bossName"
          pagination={false}
          size="small"
          scroll={{ x: 480 }}
          summary={() => {
            const totals = monthlySummary.reduce((acc, r) => ({
              totalImpressions: acc.totalImpressions + (r.totalImpressions || 0),
              totalCost: acc.totalCost + (r.totalCost || 0),
              printing: acc.printing + (r.printing || 0),
              folding: acc.folding + (r.folding || 0),
              gluing: acc.gluing + (r.gluing || 0),
            }), { totalImpressions: 0, totalCost: 0, printing: 0, folding: 0, gluing: 0 });
            return (
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{formatNumber(totals.totalImpressions)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text style={{ color: '#cf1322' }}>¥{formatNumber(totals.totalCost)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">{formatNumber(totals.printing)}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">{formatNumber(totals.folding)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">{formatNumber(totals.gluing)}</Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            💡 以上数据由机器传感器自动采集，非人工填报。每张纸、每个盒子都有据可查。
          </Text>
        </div>
      </Card>

      {/* 底部提示 */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Space split={<Divider type="vertical" />} size={16}>
          <Tooltip title="本页面数据来自服务端模拟，实际部署后由机台传感器实时上报">
            <Tag color="orange">模拟演示</Tag>
          </Tooltip>
          <Text type="secondary" style={{ fontSize: 11 }}>
            💻 桌面端 &nbsp;|&nbsp; 📱 移动端 — 同一数据源，实时同步
          </Text>
          <Tooltip title="数据每2秒自动刷新">
            <WifiOutlined style={{ color: secondsAgo < 5 ? '#52c41a' : '#faad14' }} />
          </Tooltip>
        </Space>
      </div>
    </div>
    </ErrorBoundary>
  );
}
