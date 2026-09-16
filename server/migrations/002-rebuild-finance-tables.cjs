/**
 * 数据库迁移：重建财务模块表（旧版结构不兼容）
 *
 * 运行：
 *   node server/migrations/002-rebuild-finance-tables.cjs
 *   node server/seed-finance.cjs
 *
 * 背景：早期版本的 fin_* 表结构与当前代码不兼容（列名不同、且无 group_id），
 *       而 seed-finance.cjs 只做 CREATE TABLE IF NOT EXISTS，无法修复已存在的旧表。
 *       因此本迁移删除全部 fin_* 表，再由 seed-finance.cjs 按当前结构重建 + 灌种子。
 *
 * 注意：会丢失旧版财务演示数据。
 */

const pool = require('../db.cjs');

(async () => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'fin\\_%'"
    );
    const tables = rows.map(r => r.TABLE_NAME || r.table_name);

    if (tables.length === 0) {
      console.log('[migration 002] 未发现 fin_* 表，无需处理');
    } else {
      console.log(`[migration 002] 删除 ${tables.length} 张旧财务表...`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of tables) {
        await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
        console.log(`  ✗ ${t}`);
      }
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('[migration 002] 完成，请执行 node server/seed-finance.cjs 重建表结构');
    }
  } catch (err) {
    console.error('[migration 002] 失败:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
