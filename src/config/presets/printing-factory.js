/**
 * 客户预设：印刷厂 A
 *
 * 换客户时复制此文件按需修改即可，其余源码不动
 */

export default {
  // ==================== 品牌 & 公司 ====================
  brand: {
    systemName: '印智通 ERP',
    systemNameShort: '印智通',
    subtitle: '印刷行业智能管理系统',
    companyName: 'XX 印刷包装有限公司',
    logo: null,               // null = 用 Icon；传 '/logo.png' 则用图片
    primaryColor: '#1890ff',  // 主题色
    loginBg: 'linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)',
  },

  // ==================== 角色定义 ====================
  roles: {
    manager: { label: '公司管理者', iconColor: '#1890ff' },
    employee: { label: '公司员工', iconColor: '#52c41a' },
    admin: { label: '系统管理员', iconColor: '#faad14' },
  },

  // ==================== 功能模块开关 ====================
  // false 的模块：菜单不显示、路由不注册，但源码保留
  features: {
    materialInbound: true,    // 物料入库
    qualityCheck: true,       // 质量检验
    productionReport: true,   // 生产报工
    inventoryCheck: true,     // 库存盘点
    equipmentMaintenance: false,  // 设备维护（印刷厂暂不需要）
    viewReports: true,        // 报表查看

    // 管理者特有
    employeeManage: true,
    permissionManage: true,
    materialManage: true,
    qualityManage: true,
    productionManage: true,
    inventoryManage: true,
    reports: true,
    warehouse: false,
    productionMonitor: true,  // 实时生产监控
    weeklyReport: true,       // AI周报
    aiAssistant: true,        // AI知识助手
    aiScheduling: true,       // AI智能排产

    // 管理员特有
    userManage: true,
    systemConfig: true,
    operationLog: true,
    dataBackup: true,
    securitySettings: true,

    // ── 财务模块 ──
    finance: true,      // 财务（管理者/员工路由入口，含子模块开关）
  },

  // ==================== 菜单结构 ====================
  // 直接在这里增减/调整排序
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
      { key: '/manager/inventory', icon: 'GoldOutlined', label: '库存管理' },
      // 财务模块 ↓（feature 控制功能开关；路由在 App.jsx 用 isFeatureOn('finance') 注册）
      { key: '/manager/finance-ap', icon: 'AccountBookOutlined', label: '应付管理', feature: 'finance' },
      { key: '/manager/finance-ar', icon: 'AccountBookOutlined', label: '应收管理', feature: 'finance' },
      { key: '/manager/finance-expenses', icon: 'AccountBookOutlined', label: '费用报销', feature: 'finance' },
      { key: '/manager/finance-vouchers', icon: 'AccountBookOutlined', label: '记账凭证', feature: 'finance' },
      { key: '/manager/finance-reports', icon: 'AccountBookOutlined', label: '财务报表', feature: 'finance' },
      // 印刷厂特有菜单 ↓
      { key: '/manager/plate', icon: 'ToolOutlined', label: '版辊管理' },
      { key: '/manager/formula', icon: 'ExperimentOutlined', label: '配色配方' },
      { key: '/manager/reports', icon: 'BarChartOutlined', label: '数据报表' },
    ],
    employee: [
      { key: '/employee', icon: 'DashboardOutlined', label: '工作台', permKey: null },
      { key: '/employee/material-inbound', icon: 'InboxOutlined', label: '物料入库', permKey: 'material_inbound', feature: 'materialInbound' },
      { key: '/employee/quality-check', icon: 'CheckCircleOutlined', label: '质量检验', permKey: 'quality_check', feature: 'qualityCheck' },
      { key: '/employee/production-report', icon: 'FormOutlined', label: '生产报工', permKey: 'production_report', feature: 'productionReport' },
      { key: '/employee/inventory-check', icon: 'AuditOutlined', label: '库存盘点', permKey: 'inventory_check', feature: 'inventoryCheck' },
      { key: '/employee/view-reports', icon: 'BarChartOutlined', label: '报表查看', permKey: 'view_reports', feature: 'viewReports' },
      // 财务模块（feature 决定显示，permKey 决定授权；未授权进入显示「暂无权限」）
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

  // ==================== 自定义字段（示例） ====================
  fields: {
    // 物料表字段
    material: [
      { key: 'code', label: '物料编码', required: true },
      { key: 'name', label: '物料名称', required: true },
      { key: 'spec', label: '规格型号', required: true },
      { key: 'paperType', label: '纸张类型', required: false },      // ← 印刷厂特有
      { key: 'gramWeight', label: '克重(g/m²)', required: false },   // ← 印刷厂特有
      { key: 'supplier', label: '供应商', required: true },
      { key: 'unit', label: '单位', required: true },
      { key: 'safetyStock', label: '安全库存', required: false },
    ],
    // 质检表字段
    quality: [
      { key: 'batchNo', label: '批次号', required: true },
      { key: 'colorDeltaE', label: '色差 ΔE', required: false },     // ← 印刷厂特有
      { key: 'registration', label: '套印精度(mm)', required: false }, // ← 印刷厂特有
      { key: 'appearance', label: '外观检查', required: true },
      { key: 'result', label: '判定结果', required: true },
    ],
  },
};
