import { Card, Col, Row, Statistic, Typography, Space, Progress } from 'antd';
import {
  UserSwitchOutlined,
  CloudServerOutlined,
  FileTextOutlined,
  SafetyOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

const stats = [
  { title: '系统用户数', value: 52, icon: <UserSwitchOutlined />, color: '#faad14' },
  { title: '今日操作日志', value: 218, icon: <FileTextOutlined />, color: '#1890ff' },
  { title: '磁盘使用率', value: '42%', icon: <CloudServerOutlined />, color: '#52c41a' },
  { title: '安全评分', value: '96', suffix: '分', icon: <SafetyOutlined />, color: '#667eea' },
];

export default function AdminDashboard() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统管理后台</Title>

      <Row gutter={[16, 16]}>
        {stats.map((s, i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card hoverable>
              <Statistic
                title={s.title}
                value={s.value}
                suffix={s.suffix}
                prefix={<span style={{ color: s.color, marginRight: 8 }}>{s.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="系统健康状态">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text>CPU 使用率</Text>
                <Progress percent={35} size="small" status="active" />
              </div>
              <div>
                <Text>内存使用率</Text>
                <Progress percent={61} size="small" status="active" />
              </div>
              <div>
                <Text>数据库连接池</Text>
                <Progress percent={28} size="small" status="active" />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="最近操作日志">
            <Space direction="vertical" style={{ width: '100%' }}>
              {[
                { action: '用户登录', user: 'admin', time: '17:20' },
                { action: '修改权限', user: 'manager', time: '16:45' },
                { action: '系统备份', user: 'system', time: '16:00' },
                { action: '用户创建', user: 'admin', time: '15:30' },
              ].map((log, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{log.action}</Text>
                  <Space>
                    <Text type="secondary">{log.user}</Text>
                    <Text type="secondary">{log.time}</Text>
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
