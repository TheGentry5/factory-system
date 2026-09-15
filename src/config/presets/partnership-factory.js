/**
 * 客户预设：合伙制联合工厂
 *
 * 特点：多业务组共用生产设施，各自独立经营
 * 启用 multiGroup 功能 → 登录时选组 → 数据按组隔离 → 生产排产跨组可见
 */

export default {
  // ==================== 品牌 & 公司 ====================
  brand: {
    systemName: '联合工厂 ERP',
    systemNameShort: '联合工厂',
    subtitle: '多业务组协同制造管理系统',
    companyName: 'XX 联合制造厂',
    logo: null,
    primaryColor: '#13c2c2',   // 青色系，区别于印刷厂蓝、制造厂紫
    loginBg: 'linear-gradient(135deg, #13c2c2 0%, #006d75 100%)',
  },

  // ==================== 角色定义 ====================
  roles: {
    manager: { label: '业务组管理者', iconColor: '#13c2c2' },
    employee: { label: '业务组员工', iconColor: '#52c41a' },
    admin: { label: '系统管理员', iconColor: '#faad14' },
  },

  // ==================== 功能模块开关 ====================
  features: {
    // ── 核心开关：多业务组模式 ──
    multiGroup: true,
    purchaseOrderManage: true,  // 启用采购订单管理页面

    // ── 员工功能 ──
    materialInbound: true,
    qualityCheck: true,
    productionReport: true,
    inventoryCheck: true,
    equipmentMaintenance: false,
    viewReports: true,

    // ── 管理者功能 ──
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

    // ── 管理员功能 ──
    userManage: true,
    systemConfig: true,
    operationLog: false,
    dataBackup: false,
    securitySettings: false,

    // ── 财务模块 ──
    finance: true,      // 财务（管理者/员工路由入口）
  },

  // ==================== 菜单结构 ====================
  menus: {
    manager: [
      { key: '/manager', icon: 'DashboardOutlined', label: '工作台' },
      { key: '/manager/employees', icon: 'TeamOutlined', label: '员工管理' },
      { key: '/manager/permissions', icon: 'KeyOutlined', label: '权限分发' },
      { key: '/manager/purchase-orders', icon: 'ShoppingCartOutlined', label: '采购管理' },
      { key: '/manager/materials', icon: 'InboxOutlined', label: '物料管理' },
      { key: '/manager/quality', icon: 'CheckCircleOutlined', label: '质检管理' },
      { key: '/manager/production', icon: 'SettingOutlined', label: '生产管理' },
      { key: '/manager/production-monitor', icon: 'DashboardOutlined', label: '实时监控' },
      { key: '/manager/weekly-report', icon: 'BarChartOutlined', label: 'AI周报' },
      { key: '/manager/ai-assistant', icon: 'RobotOutlined', label: 'AI助手' },
      { key: '/manager/ai-scheduling', icon: 'ThunderboltOutlined', label: 'AI排产' },
      { key: '/manager/inventory', icon: 'GoldOutlined', label: '库存管理' },
      // 财务模块 ↓（默认启用 partnership-factory 也开财务）
      { key: '/manager/finance-ap', icon: 'AccountBookOutlined', label: '应付管理', feature: 'finance' },
      { key: '/manager/finance-ar', icon: 'AccountBookOutlined', label: '应收管理', feature: 'finance' },
      { key: '/manager/finance-expenses', icon: 'AccountBookOutlined', label: '费用报销', feature: 'finance' },
      { key: '/manager/finance-vouchers', icon: 'AccountBookOutlined', label: '记账凭证', feature: 'finance' },
      { key: '/manager/finance-reports', icon: 'AccountBookOutlined', label: '财务报表', feature: 'finance' },
      { key: '/manager/reports', icon: 'BarChartOutlined', label: '数据报表' },
    ],
    employee: [
      { key: '/employee', icon: 'DashboardOutlined', label: '工作台', permKey: null },
      { key: '/employee/material-inbound', icon: 'InboxOutlined', label: '物料入库', permKey: 'material_inbound', feature: 'materialInbound' },
      { key: '/employee/quality-check', icon: 'CheckCircleOutlined', label: '质量检验', permKey: 'quality_check', feature: 'qualityCheck' },
      { key: '/employee/production-report', icon: 'FormOutlined', label: '生产报工', permKey: 'production_report', feature: 'productionReport' },
      { key: '/employee/inventory-check', icon: 'AuditOutlined', label: '库存盘点', permKey: 'inventory_check', feature: 'inventoryCheck' },
      { key: '/employee/view-reports', icon: 'BarChartOutlined', label: '报表查看', permKey: 'view_reports', feature: 'viewReports' },
      // 财务模块（feature 控制显示，permKey 控制授权）
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
      { key: '/admin/finance-close', icon: 'LockOutlined', label: '期末结账', feature: 'finance' },
    ],
  },

  // ==================== 自定义字段 ====================
  fields: {
    material: [
      { key: 'code', label: '物料编码', required: true },
      { key: 'name', label: '物料名称', required: true },
      { key: 'spec', label: '规格型号', required: true },
      { key: 'supplier', label: '供应商', required: true },
      { key: 'unit', label: '单位', required: true },
      { key: 'safetyStock', label: '安全库存', required: false },
    ],
    quality: [
      { key: 'batchNo', label: '批次号', required: true },
      { key: 'dimension', label: '尺寸检测', required: true },
      { key: 'appearance', label: '外观检查', required: true },
      { key: 'result', label: '判定结果', required: true },
    ],
  },
};
