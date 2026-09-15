import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Dropdown, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  KeyOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  BarChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// 菜单配置（将来增加页面只需在此数组中追加即可）
const menuItems = [
  { key: '/manager', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/manager/employees', icon: <TeamOutlined />, label: '员工管理' },
  { key: '/manager/permissions', icon: <KeyOutlined />, label: '权限分发' },
  { key: '/manager/materials', icon: <InboxOutlined />, label: '物料管理' },
  { key: '/manager/quality', icon: <CheckCircleOutlined />, label: '质检管理' },
  { key: '/manager/production', icon: <SettingOutlined />, label: '生产管理' },
  { key: '/manager/inventory', icon: <AppstoreOutlined />, label: '库存管理' },
  { key: '/manager/reports', icon: <BarChartOutlined />, label: '数据报表' },
];

export default function ManagerLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { token: themeToken } = theme.useToken();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userMenu = {
    items: [
      { key: 'name', label: `当前用户：${currentUser?.name}`, disabled: true },
      { key: 'role', label: `角色：公司管理者`, disabled: true },
      { type: 'divider' },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
    ],
    onClick: (e) => {
      if (e.key === 'logout') handleLogout();
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          borderRight: '1px solid #f0f0f0',
          background: themeToken.colorBgContainer,
        }}
      >
        {/* Logo 区 */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <AppstoreOutlined style={{ fontSize: 22, color: '#667eea', marginRight: 8 }} />
          {!collapsed && (
            <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
              智能制造管理系统
            </Text>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultSelectedKeys={['/manager']}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout>
        {/* 顶栏 */}
        <Header
          style={{
            padding: '0 24px',
            background: themeToken.colorBgContainer,
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />

          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#667eea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserOutlined style={{ color: '#fff' }} />
              </div>
              <Text>{currentUser?.name}</Text>
            </div>
          </Dropdown>
        </Header>

        {/* 内容区 */}
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: themeToken.colorBgContainer,
            borderRadius: themeToken.borderRadiusLG,
            minHeight: 280,
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
