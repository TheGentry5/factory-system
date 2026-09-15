import { Card, Col, Row, Typography, Tag, Table, Space, Badge } from 'antd';
import { useAuth, allPermissions, employeePermissions } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

export default function EmployeeDashboard() {
  const { currentUser } = useAuth();
  const myPerms = currentUser ? employeePermissions[currentUser.id] || [] : [];

  const columns = [
    { title: '物料名称', dataIndex: 'material', key: 'material' },
    { title: '批次号', dataIndex: 'batch', key: 'batch' },
    { title: '操作', dataIndex: 'action', key: 'action' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s) => <Badge status={s === '待处理' ? 'processing' : 'success'} text={s} /> },
    { title: '时间', dataIndex: 'time', key: 'time' },
  ];

  const taskData = [
    { material: '钢材 Q235', batch: 'B20260715001', action: '质量检验', status: '待处理', time: '14:30' },
    { material: '铝板 6061', batch: 'B20260715003', action: '物料入库', status: '待处理', time: '15:00' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 8 }}>工作台</Title>
      <Text type="secondary">欢迎，{currentUser?.name}。以下是您当前的工作概览。</Text>

      {/* 我的权限 */}
      <Card title="我的权限" style={{ marginTop: 20 }}>
        <Space wrap>
          {allPermissions.map((p) => {
            const granted = myPerms.includes(p.key);
            return (
              <Tag key={p.key} color={granted ? 'green' : 'default'}>
                {p.label} {granted ? '✓' : '✗'}
              </Tag>
            );
          })}
        </Space>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ✓ 表示已授权可使用；✗ 表示暂无权限（点击菜单时将提示"暂无权限"）
          </Text>
        </div>
      </Card>

      {/* 我的待办 */}
      <Card title="待办任务" style={{ marginTop: 20 }}>
        <Table columns={columns} dataSource={taskData} rowKey="batch" pagination={false} size="middle" />
        <div style={{ marginTop: 12 }}>
          <Tag color="processing">后续将接入真实待办数据</Tag>
        </div>
      </Card>
    </div>
  );
}
