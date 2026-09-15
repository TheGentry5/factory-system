import Placeholder from '../../components/Placeholder';

const features = [
  { label: '用户列表', desc: '查看系统全部注册用户（含管理者、员工、管理员）', tag: '基础' },
  { label: '新增用户', desc: '创建新用户账号，分配角色', tag: '核心' },
  { label: '角色管理', desc: '维护角色定义与角色-权限映射', tag: '核心' },
  { label: '密码重置', desc: '为用户重置登录密码', tag: '基础' },
  { label: '登录日志', desc: '查看用户登录历史与异常登录告警', tag: '高级' },
];

export default function UserManage() {
  return (
    <Placeholder
      title="用户管理"
      description="管理系统所有用户账号，包括创建、禁用、密码重置等"
      features={features}
    />
  );
}
