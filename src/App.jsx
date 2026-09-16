import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppConfigProvider, useAppConfig } from './contexts/AppConfigContext';
import PermissionGuard from './components/PermissionGuard';

// 登录
import Login from './pages/Login';

// 通用布局（一个文件替代三个角色布局）
import BaseLayout from './layouts/BaseLayout';

// ==================== 管理者页面 ====================
import ManagerDashboard from './pages/manager/Dashboard';
import EmployeeManage from './pages/manager/EmployeeManage';
import PermissionManage from './pages/manager/PermissionManage';
import MaterialManage from './pages/manager/MaterialManage';
import QualityManage from './pages/manager/QualityManage';
import ProductionManage from './pages/manager/ProductionManage';
import InventoryManage from './pages/manager/InventoryManage';
import Reports from './pages/manager/Reports';
import PurchaseOrderManage from './pages/manager/PurchaseOrderManage';
import ProductionMonitor from './pages/manager/ProductionMonitor';
import WeeklyReport from './pages/manager/WeeklyReport';
import AIAssistant from './pages/manager/AIAssistant';
import AIScheduling from './pages/manager/AIScheduling';

// 财务模块（管理者页面）
import FinanceAP from './pages/manager/FinanceAP';
import FinanceAR from './pages/manager/FinanceAR';
import FinanceExpenses from './pages/manager/FinanceExpenses';
import FinanceVouchers from './pages/manager/FinanceVouchers';
import FinanceReports from './pages/manager/FinanceReports';

// ==================== 员工页面 ====================
import EmployeeDashboard from './pages/employee/Dashboard';
import MaterialInbound from './pages/employee/MaterialInbound';
import QualityCheck from './pages/employee/QualityCheck';
import ProductionReport from './pages/employee/ProductionReport';
import InventoryCheck from './pages/employee/InventoryCheck';
import EquipmentMaintenance from './pages/employee/EquipmentMaintenance';
import ViewReports from './pages/employee/ViewReports';

// ==================== 管理员页面 ====================
import AdminDashboard from './pages/admin/Dashboard';
import UserManage from './pages/admin/UserManage';
import SystemConfig from './pages/admin/SystemConfig';
import OperationLog from './pages/admin/OperationLog';
import DataBackup from './pages/admin/DataBackup';
import SecuritySettings from './pages/admin/SecuritySettings';
import FinanceClose from './pages/admin/FinanceClose';

/**
 * 路由守卫
 */
function ProtectedRoute({ children, allowedRole }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (allowedRole && currentUser.role !== allowedRole) {
    return <Navigate to={`/${currentUser.role}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <AppConfigProvider>
      <AppContent />
    </AppConfigProvider>
  );
}

function AppContent() {
  const { brand, isFeatureOn } = useAppConfig();

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { colorPrimary: brand.primaryColor, borderRadius: 6 } }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* ========== 公司管理者 ========== */}
            <Route
              path="/manager"
              element={
                <ProtectedRoute allowedRole="manager">
                  <BaseLayout role="manager" />
                </ProtectedRoute>
              }
            >
              <Route index element={<ManagerDashboard />} />
              {isFeatureOn('employeeManage') && <Route path="employees" element={<EmployeeManage />} />}
              {isFeatureOn('permissionManage') && <Route path="permissions" element={<PermissionManage />} />}
              {isFeatureOn('materialManage') && <Route path="materials" element={<MaterialManage />} />}
              {isFeatureOn('materialManage') && <Route path="materials/:tab" element={<MaterialManage />} />}
              {isFeatureOn('qualityManage') && <Route path="quality" element={<QualityManage />} />}
              {isFeatureOn('qualityManage') && <Route path="quality/:tab" element={<QualityManage />} />}
              {isFeatureOn('productionManage') && <Route path="production" element={<ProductionManage />} />}
              {isFeatureOn('productionManage') && <Route path="production/:tab" element={<ProductionManage />} />}
              {isFeatureOn('inventoryManage') && <Route path="inventory" element={<InventoryManage />} />}
              {isFeatureOn('inventoryManage') && <Route path="inventory/:tab" element={<InventoryManage />} />}
              {isFeatureOn('reports') && <Route path="reports" element={<Reports />} />}
              {isFeatureOn('reports') && <Route path="reports/:tab" element={<Reports />} />}
              {isFeatureOn('purchaseOrderManage') && <Route path="purchase-orders" element={<PurchaseOrderManage />} />}
              {isFeatureOn('productionMonitor') && <Route path="production-monitor" element={<ProductionMonitor />} />}
              {isFeatureOn('weeklyReport') && <Route path="weekly-report" element={<WeeklyReport />} />}
              {isFeatureOn('aiAssistant') && <Route path="ai-assistant" element={<AIAssistant />} />}
              {isFeatureOn('aiScheduling') && <Route path="ai-scheduling" element={<AIScheduling />} />}
              {/* 财务模块 */}
              {isFeatureOn('finance') && <Route path="finance-ap" element={<FinanceAP />} />}
              {isFeatureOn('finance') && <Route path="finance-ar" element={<FinanceAR />} />}
              {isFeatureOn('finance') && <Route path="finance-expenses" element={<FinanceExpenses />} />}
              {isFeatureOn('finance') && <Route path="finance-vouchers" element={<FinanceVouchers />} />}
              {isFeatureOn('finance') && <Route path="finance-reports" element={<FinanceReports />} />}
              {/* 印刷厂特有：版辊管理、配色配方 — 没有对应 feature 开关就不渲染 */}
            </Route>

            {/* ========== 公司员工 ========== */}
            <Route
              path="/employee"
              element={
                <ProtectedRoute allowedRole="employee">
                  <BaseLayout role="employee" />
                </ProtectedRoute>
              }
            >
              <Route index element={<EmployeeDashboard />} />
              {isFeatureOn('materialInbound') && <Route path="material-inbound" element={<MaterialInbound />} />}
              {isFeatureOn('qualityCheck') && <Route path="quality-check" element={<QualityCheck />} />}
              {isFeatureOn('productionReport') && <Route path="production-report" element={<ProductionReport />} />}
              {isFeatureOn('inventoryCheck') && <Route path="inventory-check" element={<InventoryCheck />} />}
              {isFeatureOn('equipmentMaintenance') && <Route path="equipment-maintenance" element={<EquipmentMaintenance />} />}
              {isFeatureOn('viewReports') && <Route path="view-reports" element={<ViewReports />} />}
              {/* 财务模块（复用管理者组件，整体包 PermissionGuard permKey="finance"） */}
              {isFeatureOn('finance') && (
                <>
                  <Route path="finance-ap" element={<PermissionGuard permKey="finance"><FinanceAP /></PermissionGuard>} />
                  <Route path="finance-ar" element={<PermissionGuard permKey="finance"><FinanceAR /></PermissionGuard>} />
                  <Route path="finance-expenses" element={<PermissionGuard permKey="finance"><FinanceExpenses /></PermissionGuard>} />
                  <Route path="finance-vouchers" element={<PermissionGuard permKey="finance"><FinanceVouchers /></PermissionGuard>} />
                  <Route path="finance-reports" element={<PermissionGuard permKey="finance"><FinanceReports /></PermissionGuard>} />
                </>
              )}
            </Route>

            {/* ========== 管理员 ========== */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRole="admin">
                  <BaseLayout role="admin" />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              {isFeatureOn('userManage') && <Route path="users" element={<UserManage />} />}
              {isFeatureOn('systemConfig') && <Route path="config" element={<SystemConfig />} />}
              {isFeatureOn('operationLog') && <Route path="logs" element={<OperationLog />} />}
              {isFeatureOn('dataBackup') && <Route path="backup" element={<DataBackup />} />}
              {isFeatureOn('securitySettings') && <Route path="security" element={<SecuritySettings />} />}
              {isFeatureOn('finance') && <Route path="finance-close" element={<FinanceClose />} />}
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}
