/**
 * 配置加载器
 *
 * 切换客户 = 改下面 PRESET 名称，或通过环境变量 VITE_CLIENT 指定
 *
 * 用法：
 *   开发时：修改 CLIENT 常量
 *   部署时：VITE_CLIENT=printing-factory npm run build
 *
 * 核心原则：换客户只动这一行，不动任何组件源码
 */

import printingFactory from './presets/printing-factory';
import generalMfg from './presets/general-mfg';
import partnershipFactory from './presets/partnership-factory';

// ── 所有预设注册表 ──
const presets = {
  'printing-factory': printingFactory,
  'general-mfg': generalMfg,
  'partnership-factory': partnershipFactory,
};

// ── 当前活跃客户（优先级：环境变量 > 硬编码默认值） ──
const CLIENT = import.meta.env.VITE_CLIENT || 'partnership-factory';

if (!presets[CLIENT]) {
  console.warn(`[config] 未知客户 "${CLIENT}"，回退到 printing-factory`);
}

const activeConfig = presets[CLIENT] || printingFactory;

// ── 便捷工具 ──
export function getMenu(role) {
  return activeConfig.menus[role] || [];
}

export function getFields(entity) {
  return activeConfig.fields[entity] || [];
}

export function isFeatureOn(featureKey) {
  return activeConfig.features[featureKey] === true;
}

export default activeConfig;
