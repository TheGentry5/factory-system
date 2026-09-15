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
 */

const BASE = '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const groupCode = sessionStorage.getItem('currentGroup');
  if (groupCode) h['X-Group-Code'] = groupCode;
  return h;
}

async function get(url, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE}/api${url}${qs}`, { headers: headers() });
  return res.json();
}

async function post(url, data) {
  const res = await fetch(`${BASE}/api${url}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return res.json();
}

async function put(url, data) {
  const res = await fetch(`${BASE}/api${url}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return res.json();
}

async function del(url) {
  const res = await fetch(`${BASE}/api${url}`, { method: 'DELETE', headers: headers() });
  return res.json();
}

export default { get, post, put, del };
