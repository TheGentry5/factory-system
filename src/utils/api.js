/**
 * 统一 API 请求工具
 *
 * 自动从 sessionStorage 读取 currentGroup 注入 X-Group-Code header
 * 当 multiGroup 未启用时，sessionStorage 无 currentGroup → header 为空 → 后端不过滤
 *
 * 用法：
 *   import api from '../utils/api';
 *   api.get('/materials', { page: 1 })
 *   api.post('/purchase-orders', { material_id: 1, quantity: 100 })
 *   api.get('/scheduling/schedule-suggestion', undefined, { groupCode: '__all__' })  // 跨组视图
 */

const BASE = '';

function headers(options) {
  const h = { 'Content-Type': 'application/json' };
  // 允许调用方覆盖业务组头：传 groupCode（如排产跨组视图 '__all__'）则用该值；
  // 显式传 null 表示不带 header（等价于旧版不过滤）。
  if (options && Object.prototype.hasOwnProperty.call(options, 'groupCode')) {
    if (options.groupCode) h['X-Group-Code'] = options.groupCode;
    return h;
  }
  const groupCode = sessionStorage.getItem('currentGroup');
  if (groupCode) h['X-Group-Code'] = groupCode;
  return h;
}

async function get(url, params, options) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE}/api${url}${qs}`, { headers: headers(options) });
  return res.json();
}

async function post(url, data, options) {
  const res = await fetch(`${BASE}/api${url}`, {
    method: 'POST',
    headers: headers(options),
    body: JSON.stringify(data),
  });
  return res.json();
}

async function put(url, data, options) {
  const res = await fetch(`${BASE}/api${url}`, {
    method: 'PUT',
    headers: headers(options),
    body: JSON.stringify(data),
  });
  return res.json();
}

async function del(url, options) {
  const res = await fetch(`${BASE}/api${url}`, { method: 'DELETE', headers: headers(options) });
  return res.json();
}

export default { get, post, put, del };
