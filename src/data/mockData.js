/**
 * Mock 数据 —— 演示用，后续接入后端 API 时替换此文件即可
 */

// 预设用户（演示用密码均为 123456）
export const users = [
  {
    id: 'm001',
    username: 'manager',
    password: '123456',
    name: '张总',
    role: 'manager', // 公司管理者
  },
  {
    id: 'e001',
    username: 'zhangsan',
    password: '123456',
    name: '张三',
    role: 'employee', // 公司员工（质检员）
  },
  {
    id: 'e002',
    username: 'lisi',
    password: '123456',
    name: '李四',
    role: 'employee', // 公司员工（仓管员）
  },
  {
    id: 'a001',
    username: 'admin',
    password: '123456',
    name: '系统管理员',
    role: 'admin', // 管理员
  },
];

// 全部功能点（员工端可见的功能模块）
export const allPermissions = [
  { key: 'material_inbound', label: '物料入库' },
  { key: 'quality_check', label: '质量检验' },
  { key: 'production_report', label: '生产报工' },
  { key: 'inventory_check', label: '库存盘点' },
  { key: 'equipment_maintenance', label: '设备维护' },
  { key: 'view_reports', label: '报表查看' },
  { key: 'finance', label: '财务管理' }, // 管理者在权限分发页授权后，员工端财务菜单可用
];

// 员工权限映射（管理者分发，key 为员工 id，data 为全部权限模块）
// 后续替换为真正的权限分配界面操作
export const employeePermissions = {
  e001: ['quality_check', 'production_report', 'view_reports'], // 张三：质检员，可质检+报工+看报表
  e002: ['material_inbound', 'inventory_check', 'view_reports'], // 李四：仓管员，可入库+盘点+看报表
};
