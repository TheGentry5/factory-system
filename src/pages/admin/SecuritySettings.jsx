import Placeholder from '../../components/Placeholder';

const features = [
  { label: '密码策略', desc: '设置密码复杂度、有效期、重试次数限制', tag: '核心' },
  { label: 'IP 白名单', desc: '限制系统访问 IP 范围', tag: '基础' },
  { label: '会话管理', desc: '查看/强制下线在线用户', tag: '基础' },
  { label: '敏感操作确认', desc: '关键操作需二次验证', tag: '高级' },
];

export default function SecuritySettings() {
  return (
    <Placeholder
      title="安全设置"
      description="配置系统安全策略，保障系统安全运行"
      features={features}
    />
  );
}
