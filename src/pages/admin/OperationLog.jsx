import Placeholder from '../../components/Placeholder';

const features = [
  { label: '操作日志', desc: '记录所有用户的关键操作（增删改查）', tag: '核心' },
  { label: '日志搜索', desc: '按时间/用户/操作类型多维度搜索', tag: '核心' },
  { label: '审计报表', desc: '生成合规审计所需的操作记录报表', tag: '高级' },
  { label: '异常检测', desc: '自动检测异常操作模式并告警', tag: '高级' },
];

export default function OperationLog() {
  return (
    <Placeholder
      title="操作日志"
      description="查看与审计系统所有用户的操作记录"
      features={features}
    />
  );
}
