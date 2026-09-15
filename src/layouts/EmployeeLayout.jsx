import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Dropdown, theme } from 'antd';
import {
  DashboardOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  FormOutlined,
  AuditOutlined,
  ToolOutlined,
  BarChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import PermissionGuard from '../components/PermissionGuard';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// 菜单配置（key 与权限 key 一一对应）
const menuItems = [
  { key: '/employee', icon: <DashboardOutlined />, label: '工作台', permKey: null },
  { key: '/employee/material-inbound', icon: <InboxOutlined />, label: '物料入库', permKey: 'material_inbound' },
  { key: '/employee/quality-check', icon: <CheckCircleOutlined />, label: '质量检验', permKey: 'quality_check' },
  { key: '/employee/production-report', icon: <FormOutlined />, label: '生产报工', permKey: 'production_report' },
  { key: '/employee/inventory-check', icon: <AuditOutlined />, label: '库存盘点', permKey: 'inventory_check' },
  { key: '/employee/equipment-maintenance', icon: <ToolOutlined />, label: '设备维护', permKey: 'equipment_maintenance' },
  { key: '/employee/view-reports', icon: <BarChartOutlined />, label: '报表查看', permKey: 'view_reports' },
];

export default function EmployeeLayout() {
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
      { key: 'role', label: `角色：公司员工`, disabled: true },
      { type: 'divider' },
      { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
    ],
    onClick: (e) => {
      if (e.key === 'logout') handleLogout();
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <AppstoreOutlined style={{ fontSize: 22, color: '#52c41a', marginRight: 8 }} />
          {!collapsed && <Text strong style={{ fontSize: 15 }}>员工工作台</Text>}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultSelectedKeys={['/employee']}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout>
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
                  background: '#52c41a',
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
