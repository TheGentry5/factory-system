import { useState, Component } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Button, Spin, Space, Empty, Alert } from 'antd';
import { ThunderboltOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, RobotOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div style={{padding:40,textAlign:'center'}}><Title level={4} type="danger">渲染出错</Title><Button onClick={()=>this.setState({hasError:false})}>重试</Button></div>;
    return this.props.children;
  }
}

const api = {
  get: (url) => fetch('/api' + url).then(r => { if (!r.ok) throw new Error('网络错误'); return r.json(); }),
};

export default function AIScheduling() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runScheduling = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/scheduling/schedule-suggestion');
      if (res.success) setData(res.data);
      else setError(res.message || '排产失败');
    } catch (e) {
      // 如果后端AI端点不可用，尝试旧端点
      try {
        const fallback = await fetch('/api/scheduling/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
        if (fallback.success) setData(fallback.data);
        else setError(e.message);
      } catch (e2) {
        setError(e.message || '无法连接');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading && !error) {
    return (
      <ErrorBoundary>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <RobotOutlined style={{ fontSize: 48, color: '#722ed1', marginBottom: 16 }} />
          <Title level={4}>DeepSeek AI 智能排产</Title>
          <Paragraph type="secondary">
            3+1 多路并行架构：3路不同策略生成排产方案 → AI校验修复 → 输出最优排产表
          </Paragraph>
          <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={runScheduling} loading={loading}>
            开始 AI 排产
          </Button>
        </div>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /><div style={{ marginTop: 16, color: '#999' }}>DeepSeek AI 正在分析工单并生成最优排产方案...</div><Text type="secondary" style={{fontSize:12}}>3路并行生成 + 1路校验修复，约需40秒</Text></div>;
  }

  if (error) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Title level={5} type="danger">排产失败</Title><Paragraph type="secondary">{error}</Paragraph><Button icon={<ReloadOutlined />} onClick={runScheduling} type="primary">重试</Button></div>;
  }

  if (!data) return <Empty description="无数据" />;

  const entries = data.scheduleEntries || [];
  const risks = data.riskWarnings || [];
  const summary = data.summary || '';

  const cols = [
    { title: '#', key:'i', width:40, render:(_,r,i)=>i+1 },
    { title: '工单号', dataIndex:'orderNo', width:110 },
    { title: '产品', dataIndex:'productName', width:80 },
    { title: '工序', dataIndex:'stepName', width:70 },
    { title: '设备', dataIndex:'machineName', width:85 },
    { title: '归属', dataIndex:'machineOwner', width:55 },
    { title: '日期', dataIndex:'date', width:90 },
    { title: '时段', key:'time', width:100, render:(_,r)=>`${r.startTime||''}-${r.endTime||''}` },
    { title: '工时', dataIndex:'durationHours', width:50, align:'right', render:v=>(v||0).toFixed(1)+'h' },
    { title: '数量', dataIndex:'productionQty', width:65, align:'right', render:v=>(v||0).toLocaleString() },
    { title: '费用', dataIndex:'subtotalCost', width:65, align:'right', render:v=>'¥'+(v||0).toFixed(0) },
  ];

  return (
    <ErrorBoundary>
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'space-between' }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>⚡ DeepSeek AI 排产</Title>
            {data.id && <Tag color="purple">#{data.id}</Tag>}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={runScheduling}>重新排产</Button>
        </div>

        {/* AI 推理摘要 */}
        {(data.reasoning || summary) && (
          <Alert message={summary || '排产完成'} description={data.reasoning}
            type="info" showIcon style={{ marginBottom: 12 }} />
        )}

        {/* 风险警告 */}
        {risks.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {risks.map((r, i) => (
              <Alert key={i} message={r.orderNo} description={r.message}
                type={r.severity === 'high' ? 'error' : 'warning'} showIcon style={{ marginBottom: 4 }} />
            ))}
          </div>
        )}

        {/* 排产明细 */}
        <Card title={`📋 排产明细（${entries.length}条工序）`} size="small">
          <Table columns={cols} dataSource={entries} rowKey={(r,i)=>`${r.orderNo}-${r.stepOrder}-${i}`}
            pagination={entries.length > 20 ? { pageSize: 20 } : false} size="small" scroll={{ x: 900 }} />
        </Card>

        {/* 机器汇总 */}
        {(data.machineTimeSummary || []).length > 0 && (
          <Card title="💰 机器机时费汇总" size="small" style={{ marginTop: 12 }}>
            <Row gutter={[12, 12]}>
              {(data.machineTimeSummary || []).map((m, i) => (
                <Col xs={12} sm={8} md={6} key={i}>
                  <Card size="small" style={{ background: '#fafafa' }}>
                    <Text strong style={{ fontSize: 12 }}>{m.machineName}</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 11 }} type="secondary">{m.ownerGroup || '共享'}</Text>
                      <br />
                      <Text style={{ fontSize: 13 }}>{m.totalHours}h · ¥{m.totalCost}</Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
