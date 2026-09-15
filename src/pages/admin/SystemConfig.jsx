import Placeholder from '../../components/Placeholder';

const features = [
  { label: '基础设置', desc: '公司名称、Logo、时区、语言等基础参数', tag: '基础' },
  { label: '审批流程', desc: '自定义审批流（入库审批/报工审批等）', tag: '核心' },
  { label: '通知设置', desc: '短信/邮件/站内信通知模板与触发条件', tag: '基础' },
  { label: '字典管理', desc: '系统字典（部门/岗位/物料类型等）维护', tag: '基础' },
  { label: 'API 配置', desc: '第三方系统 API 对接配置', tag: '高级' },
];

export default function SystemConfig() {
  return (
    <Placeholder
      title="系统配置"
      description="配置系统运行参数，包括基础设置、审批流程、通知等"
      features={features}
    />
  );
}
