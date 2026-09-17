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
    machineCostManage: true,  // 机时费管理（设备单价维护 + 机时费统计）

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
      {
        key: 'materials',
        icon: 'InboxOutlined',
        label: '物料管理',
        feature: 'materialManage',
        children: [
          { key: '/manager/materials', icon: 'InboxOutlined', label: '物料主数据' },
          { key: '/manager/materials/suppliers', icon: 'TeamOutlined', label: '供应商管理' },
          { key: '/manager/materials/inbound', icon: 'SafetyCertificateOutlined', label: '入库审核' },
        ],
      },
      {
        key: 'quality',
        icon: 'CheckCircleOutlined',
        label: '质检管理',
        feature: 'qualityManage',
        children: [
          { key: '/manager/quality', icon: 'EnvironmentOutlined', label: '暂存区管理' },
          { key: '/manager/quality/standards', icon: 'ExperimentOutlined', label: '质检标准' },
          { key: '/manager/quality/disposition', icon: 'ExclamationCircleOutlined', label: '不合格处置' },
          { key: '/manager/quality/history', icon: 'CheckCircleOutlined', label: '检验历史' },
        ],
      },
      {
        key: 'production',
        icon: 'SettingOutlined',
        label: '生产管理',
        feature: 'productionManage',
        children: [
          { key: '/manager/production', icon: 'DashboardOutlined', label: '生产总览' },
          { key: '/manager/production/orders', icon: 'OrderedListOutlined', label: '工单管理' },
          { key: '/manager/production/review', icon: 'CheckCircleOutlined', label: '报工审核' },
          { key: '/manager/production/daily', icon: 'BarChartOutlined', label: '生产日报' },
          { key: '/manager/production/bom', icon: 'ExperimentOutlined', label: 'BOM管理' },
        ],
      },
      { key: '/manager/production-monitor', icon: 'DashboardOutlined', label: '实时监控' },
      { key: '/manager/weekly-report', icon: 'BarChartOutlined', label: 'AI周报' },
      { key: '/manager/ai-assistant', icon: 'RobotOutlined', label: 'AI助手' },
      { key: '/manager/ai-scheduling', icon: 'ThunderboltOutlined', label: 'AI排产' },
      { key: '/manager/machine-cost', icon: 'MoneyCollectOutlined', label: '机时费管理', feature: 'machineCostManage' },
      {
        key: 'inventory',
        icon: 'AppstoreOutlined',
        label: '库存管理',
        feature: 'inventoryManage',
        children: [
          { key: '/manager/inventory', icon: 'DashboardOutlined', label: '库存总览' },
          { key: '/manager/inventory/map', icon: 'EnvironmentOutlined', label: '仓库地图' },
          { key: '/manager/inventory/inbound', icon: 'ArrowDownOutlined', label: '入库操作' },
          { key: '/manager/inventory/outbound', icon: 'ArrowUpOutlined', label: '出库操作' },
          { key: '/manager/inventory/transfer', icon: 'SwapOutlined', label: '调拨管理' },
          { key: '/manager/inventory/check', icon: 'CheckCircleOutlined', label: '盘点管理' },
          { key: '/manager/inventory/ai-query', icon: 'SearchOutlined', label: 'AI查询 & 日志' },
        ],
      },
      // 财务模块 ↓
      {
        key: 'finance',
        icon: 'PayCircleOutlined',
        label: '财务管理',
        feature: 'finance',
        children: [
          { key: '/manager/finance-ap', icon: 'PayCircleOutlined', label: '应付管理' },
          { key: '/manager/finance-ar', icon: 'AccountBookOutlined', label: '应收管理' },
          { key: '/manager/finance-expenses', icon: 'FileTextOutlined', label: '费用报销' },
          { key: '/manager/finance-vouchers', icon: 'ProfileOutlined', label: '记账凭证' },
          { key: '/manager/finance-reports', icon: 'BarChartOutlined', label: '财务报表' },
        ],
      },
      // 无版辊管理、配色配方 — 通用制造业不需要
      {
        key: 'reports',
        icon: 'BarChartOutlined',
        label: '数据报表',
        feature: 'reports',
        children: [
          { key: '/manager/reports', icon: 'BarChartOutlined', label: '生产报表' },
          { key: '/manager/reports/inventory', icon: 'InboxOutlined', label: '库存报表' },
          { key: '/manager/reports/quality', icon: 'CheckCircleOutlined', label: '质检报表' },
          { key: '/manager/reports/finance', icon: 'BarChartOutlined', label: '财务统计', feature: 'finance' },
        ],
      },
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
      {
        key: 'finance',
        icon: 'PayCircleOutlined',
        label: '财务管理',
        feature: 'finance',
        children: [
          { key: '/employee/finance-ap', icon: 'PayCircleOutlined', label: '应付管理', feature: 'finance', permKey: 'finance' },
          { key: '/employee/finance-ar', icon: 'AccountBookOutlined', label: '应收管理', feature: 'finance', permKey: 'finance' },
          { key: '/employee/finance-expenses', icon: 'FileTextOutlined', label: '费用报销', feature: 'finance', permKey: 'finance' },
          { key: '/employee/finance-vouchers', icon: 'ProfileOutlined', label: '记账凭证', feature: 'finance', permKey: 'finance' },
          { key: '/employee/finance-reports', icon: 'BarChartOutlined', label: '财务报表', feature: 'finance', permKey: 'finance' },
        ],
      },
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
