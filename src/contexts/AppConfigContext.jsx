import { createContext, useContext } from 'react';
import appConfig, { getMenu, getFields, isFeatureOn } from '../config/index';

const AppConfigContext = createContext(null);

/**
 * 提供当前客户配置给全部子组件
 * 用法：const { brand, features, getMenu } = useAppConfig();
 */
export function AppConfigProvider({ children }) {
  return (
    <AppConfigContext.Provider
      value={{
        ...appConfig,
        getMenu,
        getFields,
        isFeatureOn,
      }}
    >
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}
