import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Select } from 'antd';
import { UserOutlined, LockOutlined, TeamOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../contexts/AppConfigContext';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const { login } = useAuth();
  const { brand, isFeatureOn } = useAppConfig();
  const navigate = useNavigate();

  const multiGroup = isFeatureOn('multiGroup');

  // 多业务组模式下加载组列表，若数据库为空则使用演示组
  useEffect(() => {
    if (multiGroup) {
      fetch('/api/groups')
        .then(r => r.json())
        .then(res => {
          if (res.success && res.data.length > 0) {
            setGroups(res.data);
          } else {
            // 数据库无数据时使用演示组兜底
            setGroups([
              { group_name: '周总组', group_code: '周总' },
              { group_name: '李总组', group_code: '李总' },
              { group_name: '王总组', group_code: '王总' },
            ]);
          }
        })
        .catch(() => {
          setGroups([
            { group_name: '周总组', group_code: '周总' },
            { group_name: '李总组', group_code: '李总' },
            { group_name: '王总组', group_code: '王总' },
          ]);
        });
    }
  }, [multiGroup]);

  const onFinish = async (values) => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const result = login(values.username, values.password, values.groupCode);
    setLoading(false);

    if (!result.success) {
      message.error(result.message);
      return;
    }

    message.success(`欢迎回来，${result.user.name}！`);
    const roleMap = {
      manager: '/manager',
      employee: '/employee',
      admin: '/admin',
    };
    navigate(roleMap[result.user.role], { replace: true });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: brand.loginBg,
      }}
    >
      <Card style={{ width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.18)' }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <TeamOutlined style={{ fontSize: 48, color: brand.primaryColor, marginBottom: 12 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            {brand.systemName}
          </Title>
          <Text type="secondary">{brand.subtitle}</Text>
        </div>

        <div
          style={{
            background: multiGroup ? '#e6fffb' : '#f6ffed',
            border: multiGroup ? '1px solid #87e8de' : '1px solid #b7eb8f',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 20,
            fontSize: 12,
          }}
        >
          <Text type="secondary">
            {multiGroup
              ? '演示账号：manager / zhangsan / lisi / admin  密码 123456  请选择业务组'
              : '演示账号：manager / zhangsan / lisi / admin  密码均为 123456'}
          </Text>
        </div>

        <Form size="large" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          {multiGroup && (
            <Form.Item name="groupCode" rules={[{ required: true, message: '请选择业务组' }]}>
              <Select
                prefix={<ApartmentOutlined />}
                placeholder="选择业务组"
                options={groups.map(g => ({ label: g.group_name, value: g.group_code }))}
              />
            </Form.Item>
          )}
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
