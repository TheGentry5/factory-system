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
      {
        key: 'inventory',
        icon: 'GoldOutlined',
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
      // 财务模块 ↓（feature 控制功能开关；路由在 App.jsx 用 isFeatureOn('finance') 注册）
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
      // 印刷厂特有菜单 ↓
      { key: '/manager/plate', icon: 'ToolOutlined', label: '版辊管理' },
      { key: '/manager/formula', icon: 'ExperimentOutlined', label: '配色配方' },
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
      { key: '/employee/view-reports', icon: 'BarChartOutlined', label: '报表查看', permKey: 'view_reports', feature: 'viewReports' },
      // 财务模块（feature 决定显示，permKey 决定授权；未授权进入显示「暂无权限」）
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
