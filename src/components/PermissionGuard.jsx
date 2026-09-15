import { Result, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

/**
 * 权限守卫 —— 包裹员工端页面，无权限时展示"暂无权限"
 * 管理者和管理员直接放行
 */
export default function PermissionGuard({ permKey, children }) {
  const { currentUser, hasPermission } = useAuth();

  // 非员工或已授权 → 正常渲染
  if (currentUser?.role !== 'employee' || hasPermission(permKey)) {
    return children;
  }

  return (
    <Result
      icon={<LockOutlined style={{ color: '#faad14' }} />}
      title="暂无权限"
      subTitle="您没有该功能的操作权限，请联系公司管理者开通"
      extra={
        <Button type="primary" onClick={() => window.history.back()}>
          返回上一页
        </Button>
      }
    />
  );
}
