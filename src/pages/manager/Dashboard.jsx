import { Card, Col, Row, Statistic, Typography, Space, Tag, Table } from 'antd';
import {
  TeamOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

// 演示数据（后续接入真实 API）
const stats = [
  { title: '员工总数', value: 48, icon: <TeamOutlined />, color: '#667eea' },
  { title: '今日入库(批)', value: 12, icon: <InboxOutlined />, color: '#52c41a' },
  { title: '质检通过率', value: '98.5%', icon: <CheckCircleOutlined />, color: '#1890ff' },
  { title: '待处理异常', value: 3, icon: <WarningOutlined />, color: '#ff4d4f' },
];

const recentColumns = [
  { title: '物料名称', dataIndex: 'material', key: 'material' },
  { title: '批次号', dataIndex: 'batch', key: 'batch' },
  { title: '操作人', dataIndex: 'operator', key: 'operator' },
  { title: '状态', dataIndex: 'status', key: 'status', render: (s) => <Tag color={s === '已入库' ? 'green' : 'orange'}>{s}</Tag> },
  { title: '时间', dataIndex: 'time', key: 'time' },
];

const recentData = [
  { material: '钢材 Q235', batch: 'B20260715001', operator: '张三', status: '已入库', time: '2026-07-15 14:30' },
  { material: '铝板 6061', batch: 'B20260715002', operator: '李四', status: '质检中', time: '2026-07-15 13:15' },
  { material: '铜管 T2', batch: 'B20260714005', operator: '赵五', status: '已入库', time: '2026-07-14 16:00' },
];

export default function ManagerDashboard() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>工作台概览</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {stats.map((s, i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card hoverable>
              <Statistic
                title={s.title}
                value={s.value}
                prefix={<span style={{ color: s.color, marginRight: 8 }}>{s.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 最近入库记录 */}
      <Card title="最近物料入库记录" style={{ marginTop: 24 }}>
        <Table
          columns={recentColumns}
          dataSource={recentData}
          rowKey="batch"
          pagination={false}
          size="middle"
        />

        <div style={{ marginTop: 16 }}>
          <Tag color="processing">提示：后续将增加图表分析、趋势预警等功能</Tag>
        </div>
      </Card>
    </div>
  );
}
