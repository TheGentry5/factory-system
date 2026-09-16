import { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Dropdown, theme, Tag } from 'antd';
import * as Icons from '@ant-design/icons';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../contexts/AppConfigContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * 通用布局 —— 管理者/员工/管理员共用
 *
 * 差异全部来自配置（品牌名、主题色、菜单项、角色标签等），
 * 不同客户 = 不同配置 = 不同界面，但此处代码一行不改。
 */
export default function BaseLayout({ role }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, currentGroup, logout } = useAuth();
  const { brand, roles, getMenu, isFeatureOn } = useAppConfig();
  const { token: themeToken } = theme.useToken();

  const roleInfo = roles[role] || { label: role, iconColor: '#999' };
  const menuItems = getMenu(role);

  // 动态解析图标（配置文件写字符串，这里映射为组件）
  const resolveIcon = (iconName) => {
    if (!iconName) return null;
    const Icon = Icons[iconName];
    return Icon ? <Icon /> : null;
  };

  // 子菜单展开项（受控）：悬停分组时在左侧导航栏内展开，移出即收起。
  // 折叠态下的浮层交由 antd 管理，因此切换折叠时重置，避免浮层默认驻留。
  const [openKeys, setOpenKeys] = useState([]);
  useEffect(() => {
    setOpenKeys([]);
  }, [collapsed]);

  // 过滤掉功能开关关闭的菜单项，并递归构建（含子菜单分组）。
  // 菜单项语义：feature = 功能开关 key（isFeatureOn 用）；permKey = 权限标识（PermissionGuard 用）。
  // feature 在父、子两层都过滤；子项全被过滤时整组隐藏，避免出现空分组。
  const visibleMenu = useMemo(() => {
    const build = (items) =>
      items
        .filter((item) => !item.feature || isFeatureOn(item.feature))
        .map((item) => {
          if (item.children?.length) {
            const children = build(item.children);
            if (!children.length) return null; // 子项全关 → 整组隐藏
            const group = {
              key: item.key,
              icon: resolveIcon(item.icon),
              label: item.label,
              children,
            };
            // 仅在展开态用悬停控制内联子菜单（折叠态由 antd 的弹出层处理）
            if (!collapsed) {
              group.onMouseEnter = () =>
                setOpenKeys((prev) => (prev.includes(item.key) ? prev : [...prev, item.key]));
              group.onMouseLeave = () =>
                setOpenKeys((prev) => prev.filter((k) => k !== item.key));
            }
            return group;
          }
          return { key: item.key, icon: resolveIcon(item.icon), label: item.label };
        })
        .filter(Boolean);
    return build(menuItems);
  }, [menuItems, isFeatureOn, collapsed]);

  // 当前所在的分组（用于内容区顶部子模块导航条）
  const activeGroup = visibleMenu.find(
    (item) =>
      item.children?.length && item.children.some((child) => child.key === location.pathname)
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userMenu = {
    items: [
      { key: 'name', label: `当前用户：${currentUser?.name}`, disabled: true },
      { key: 'role', label: `角色：${roleInfo.label}`, disabled: true },
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
        {/* Logo 区 —— 从配置读取 */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            padding: '0 12px',
            overflow: 'hidden',
          }}
        >
          {brand.logo ? (
            <img src={brand.logo} alt="logo" style={{ height: 32 }} />
          ) : (
            <AppstoreOutlined style={{ fontSize: 22, color: brand.primaryColor, marginRight: 8 }} />
          )}
          {!collapsed && (
            <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
              {brand.systemNameShort}
            </Text>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultSelectedKeys={[menuItems[0]?.key]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onClick={({ key }) => navigate(key)}
          items={visibleMenu}
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
          <div style={{ flex: 1 }} />
          {isFeatureOn('multiGroup') && currentGroup && (
            <Tag color="cyan" style={{ marginRight: 16, fontSize: 13 }}>{currentGroup}</Tag>
          )}
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: roleInfo.iconColor,
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
          {/* 分组子模块导航条：进入分组后统一显示全部子模块，点击可切换 */}
          {activeGroup && (
            <Menu
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={activeGroup.children}
              onClick={({ key }) => navigate(key)}
              style={{ marginBottom: 16, borderBottom: '1px solid #f0f0f0' }}
            />
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
