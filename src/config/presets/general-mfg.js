/**
 * 客户预设：通用制造 B
 *
 * 与印刷厂配置对比即可看出"轻定制"范围：
 *   - 品牌名/主题色不同
 *   - 关了版辊管理、配色配方
 *   - 开了设备维护
 *   - 物料字段无纸张类型/克重
 */

export default {
  brand: {
    systemName: '智造云 MES',
    systemNameShort: '智造云',
    subtitle: '通用制造执行系统',
    companyName: 'XX 制造有限公司',
    logo: null,
    primaryColor: '#667eea',
    loginBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },

  roles: {
    manager: { label: '公司管理者', iconColor: '#667eea' },
    employee: { label: '公司员工', iconColor: '#52c41a' },
    admin: { label: '系统管理员', iconColor: '#faad14' },
  },

  features: {
    materialInbound: true,
    qualityCheck: true,
    productionReport: true,
    inventoryCheck: true,
    equipmentMaintenance: true,    // ← 通用制造需要设备维护
    viewReports: true,

    employeeManage: true,
    permissionManage: true,
    materialManage: true,
    qualityManage: true,
    productionManage: true,
    inventoryManage: true,
    reports: true,
    productionMonitor: true,  // 实时生产监控
    weeklyReport: true,       // AI周报
    aiAssistant: true,        // AI知识助手
    aiScheduling: true,       // AI智能排产

    userManage: true,
    systemConfig: true,
    operationLog: true,
    dataBackup: true,
    securitySettings: true,

    // 印刷厂特有模块在此客户中不存在 ↓
    // plateManage: false   ← 不带这个 key 就是不展示
    // formulaManage: false

    // ── 财务模块 ──
    finance: true,      // 财务（管理者/员工路由入口）
  },

  menus: {
    manager: [
      { key: '/manager', icon: 'DashboardOutlined', label: '工作台' },
      { key: '/manager/employees', icon: 'TeamOutlined', label: '员工管理' },
      { key: '/manager/permissions', icon: 'KeyOutlined', label: '权限分发' },
      { key: '/manager/materials', icon: 'InboxOutlined', label: '物料管理' },
      { key: '/manager/quality', icon: 'CheckCircleOutlined', label: '质检管理' },
      { key: '/manager/production', icon: 'SettingOutlined', label: '生产管理' },
      { key: '/manager/production-monitor', icon: 'DashboardOutlined', label: '实时监控' },
      { key: '/manager/weekly-report', icon: 'BarChartOutlined', label: 'AI周报' },
      { key: '/manager/ai-assistant', icon: 'RobotOutlined', label: 'AI助手' },
      { key: '/manager/ai-scheduling', icon: 'ThunderboltOutlined', label: 'AI排产' },
      { key: '/manager/inventory', icon: 'AppstoreOutlined', label: '库存管理' },
      // 财务模块 ↓
      { key: '/manager/finance-ap', icon: 'AccountBookOutlined', label: '应付管理', feature: 'finance' },
      { key: '/manager/finance-ar', icon: 'AccountBookOutlined', label: '应收管理', feature: 'finance' },
      { key: '/manager/finance-expenses', icon: 'AccountBookOutlined', label: '费用报销', feature: 'finance' },
      { key: '/manager/finance-vouchers', icon: 'AccountBookOutlined', label: '记账凭证', feature: 'finance' },
      { key: '/manager/finance-reports', icon: 'AccountBookOutlined', label: '财务报表', feature: 'finance' },
      // 无版辊管理、配色配方 — 通用制造业不需要
      { key: '/manager/reports', icon: 'BarChartOutlined', label: '数据报表' },
    ],
    employee: [
      { key: '/employee', icon: 'DashboardOutlined', label: '工作台', permKey: null },
      { key: '/employee/material-inbound', icon: 'InboxOutlined', label: '物料入库', permKey: 'material_inbound', feature: 'materialInbound' },
      { key: '/employee/quality-check', icon: 'CheckCircleOutlined', label: '质量检验', permKey: 'quality_check', feature: 'qualityCheck' },
      { key: '/employee/production-report', icon: 'FormOutlined', label: '生产报工', permKey: 'production_report', feature: 'productionReport' },
      { key: '/employee/inventory-check', icon: 'AuditOutlined', label: '库存盘点', permKey: 'inventory_check', feature: 'inventoryCheck' },
      { key: '/employee/equipment-maintenance', icon: 'ToolOutlined', label: '设备维护', permKey: 'equipment_maintenance', feature: 'equipmentMaintenance' },
      { key: '/employee/view-reports', icon: 'BarChartOutlined', label: '报表查看', permKey: 'view_reports', feature: 'viewReports' },
      // 财务模块
      { key: '/employee/finance-ap', icon: 'AccountBookOutlined', label: '应付管理', permKey: 'finance', feature: 'finance' },
      { key: '/employee/finance-ar', icon: 'AccountBookOutlined', label: '应收管理', permKey: 'finance', feature: 'finance' },
      { key: '/employee/finance-expenses', icon: 'AccountBookOutlined', label: '费用报销', permKey: 'finance', feature: 'finance' },
      { key: '/employee/finance-vouchers', icon: 'AccountBookOutlined', label: '记账凭证', permKey: 'finance', feature: 'finance' },
      { key: '/employee/finance-reports', icon: 'AccountBookOutlined', label: '财务报表', permKey: 'finance', feature: 'finance' },
    ],
    admin: [
      { key: '/admin', icon: 'DashboardOutlined', label: '工作台' },
      { key: '/admin/users', icon: 'UserSwitchOutlined', label: '用户管理' },
      { key: '/admin/config', icon: 'SettingOutlined', label: '系统配置' },
      { key: '/admin/logs', icon: 'FileTextOutlined', label: '操作日志' },
      { key: '/admin/backup', icon: 'CloudServerOutlined', label: '数据备份' },
      { key: '/admin/security', icon: 'SafetyOutlined', label: '安全设置' },
      { key: '/admin/finance-close', icon: 'LockOutlined', label: '期末结账', feature: 'finance' },
    ],
  },

  fields: {
    material: [
      { key: 'code', label: '物料编码', required: true },
      { key: 'name', label: '物料名称', required: true },
      { key: 'spec', label: '规格型号', required: true },
      // 无纸张类型/克重 — 通用制造业不需要
      { key: 'supplier', label: '供应商', required: true },
      { key: 'unit', label: '单位', required: true },
      { key: 'safetyStock', label: '安全库存', required: false },
    ],
    quality: [
      { key: 'batchNo', label: '批次号', required: true },
      { key: 'dimension', label: '尺寸检测', required: true },       // ← 通用制造
      { key: 'hardness', label: '硬度检测', required: false },       // ← 通用制造
      { key: 'appearance', label: '外观检查', required: true },
      { key: 'result', label: '判定结果', required: true },
    ],
  },
};
