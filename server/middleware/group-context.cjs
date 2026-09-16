/**
 * 多业务组（多租户）中间件
 *
 * 用法：
 *   1. 前端 API 请求带 header: X-Group-Code: group_a
 *   2. 中间件解析 header → req.groupId
 *   3. 路由调用 groupFilter(req, 'alias') → { sql, params }
 *      拼接到 WHERE 子句中实现数据隔离
 *
 * 特殊值：
 *   X-Group-Code: __all__  → 跨组视图（生产排产用）
 *   header 不存在          → 不过滤（兼容旧 preset）
 */

/**
 * Express 中间件 — 解析 X-Group-Code header
 */
function groupContext(req, res, next) {
  const groupCode = req.headers['x-group-code'];

  if (!groupCode) {
    // 未传 header → 不过滤（multiGroup 关闭或管理员全局视图）
    req.groupId = null;
    req.isCrossGroup = false;
  } else if (groupCode === '__all__') {
    // 特殊值 → 跨组视图（生产排产）
    req.groupId = null;
    req.isCrossGroup = true;
  } else {
    // 正常模式 → 只查当前组数据
    req.groupId = groupCode;
    req.isCrossGroup = false;
  }

  next();
}

/**
 * 生成 group 过滤 SQL 片段
 *
 * @param {object} req     Express request 对象
 * @param {string} alias   表别名，如 'm', 'po'，为空则不拼别名前缀
 * @returns {{ sql: string, params: any[] }}
 *
 * 用法：
 *   const gf = groupFilter(req, 'po');
 *   const [rows] = await pool.query(
 *     `SELECT * FROM purchase_orders po WHERE 1=1 ${gf.sql}`,
 *     [...otherParams, ...gf.params]
 *   );
 */
function groupFilter(req, alias) {
  if (!req.groupId) return { sql: '', params: [] };
  const col = alias ? `${alias}.group_id` : 'group_id';
  // group_id 为 NULL 视为「未分组/共享」，对所有组可见（兼容历史数据与共享主数据）；
  // 显式归属某组的数据仍严格隔离。
  return { sql: ` AND (${col} = ? OR ${col} IS NULL)`, params: [req.groupId] };
}

module.exports = { groupContext, groupFilter };
