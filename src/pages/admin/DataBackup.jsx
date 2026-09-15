import Placeholder from '../../components/Placeholder';

const features = [
  { label: '手动备份', desc: '一键备份数据库到指定位置', tag: '核心' },
  { label: '自动备份', desc: '设置定时备份策略（每日/每周）', tag: '核心' },
  { label: '备份历史', desc: '查看/下载历史备份文件', tag: '基础' },
  { label: '数据恢复', desc: '从备份文件恢复系统数据', tag: '核心' },
];

export default function DataBackup() {
  return (
    <Placeholder
      title="数据备份"
      description="数据库备份与恢复，保障数据安全"
      features={features}
    />
  );
}
