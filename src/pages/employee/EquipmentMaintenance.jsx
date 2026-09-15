import PermissionGuard from '../../components/PermissionGuard';
import Placeholder from '../../components/Placeholder';

const features = [
  { label: '设备台账', desc: '查看负责设备的基本信息与维护记录', tag: '基础' },
  { label: '点检打卡', desc: '每日/每班设备点检确认', tag: '核心' },
  { label: '故障报修', desc: '发现故障后提交报修申请', tag: '核心' },
  { label: '保养提醒', desc: '保养到期前自动提醒', tag: '高级' },
];

export default function EquipmentMaintenance() {
  return (
    <PermissionGuard permKey="equipment_maintenance">
      <Placeholder
        title="设备维护"
        description="负责设备的日常点检与故障报修"
        features={features}
      />
    </PermissionGuard>
  );
}
