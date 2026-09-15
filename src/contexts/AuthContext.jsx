import { createContext, useContext, useState, useCallback } from 'react';
import { users, allPermissions, employeePermissions } from '../data/mockData';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    // 从 sessionStorage 恢复
    const saved = sessionStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentGroup, setCurrentGroup] = useState(() => {
    const saved = sessionStorage.getItem('currentGroup');
    return saved || null;
  });

  // 登录：校验用户名密码 → 写入 state + sessionStorage
  const login = useCallback((username, password, groupCode) => {
    const user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (!user) return { success: false, message: '用户名或密码错误' };
    setCurrentUser(user);
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    if (groupCode) {
      setCurrentGroup(groupCode);
      sessionStorage.setItem('currentGroup', groupCode);
    }
    return { success: true, user };
  }, []);

  // 登出
  const logout = useCallback(() => {
    setCurrentUser(null);
    setCurrentGroup(null);
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentGroup');
  }, []);

  // 员工是否拥有某权限
  const hasPermission = useCallback(
    (permKey) => {
      if (!currentUser || currentUser.role !== 'employee') return true;
      const perms = employeePermissions[currentUser.id] || [];
      return perms.includes(permKey);
    },
    [currentUser]
  );

  return (
    <AuthContext.Provider value={{ currentUser, currentGroup, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { allPermissions, employeePermissions };
