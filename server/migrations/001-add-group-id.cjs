/**
 * 数据库迁移：多业务组（多租户）支持
 *
 * 运行：
 *   node server/migrations/001-add-group-id.cjs
 *
 * 幂等 — 可重复执行，已存在的列/表会被跳过
 *
 * 共享表（不加 group_id）：
 *   warehouse_zones, storage_locations — 物理设施，全组共用
 *
 * 业务组隔离表（加 group_id）：
 *   其余 18 张表
 */

const pool = require('../db.cjs');

// ── groups 表：业务组主数据 ──
const CREATE_GROUPS_TABLE = `
CREATE TABLE IF NOT EXISTS \`groups\` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(50) NOT NULL COMMENT '组名（展示用）',
  group_code VARCHAR(20) NOT NULL COMMENT '组编码（系统标识）',
  description VARCHAR(200) DEFAULT NULL COMMENT '描述',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_group_code (group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='业务组'
`;

// ── 演示种子数据 ──
const SEED_GROUPS = `
INSERT INTO \`groups\` (group_name, group_code, description) VALUES
  ('A组（广东业务群）', 'group_a', 'Demo — 广东区域业务组'),
  ('B组（香港业务群）', 'group_b', 'Demo — 香港区域业务组')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name)
`;

// ── 需要加 group_id 的表（18 张） ──
// warehouse_zones, storage_locations 不加（共享物理设施）
const GROUP_SCOPED_TABLES = [
  'employees',
  'inbound_records',
  'inbound_standards',
  'inspection_details',
  'inventory_check_details',
  'inventory_check_tasks',
  'inventory_transfers',
  'location_inventory',
  'manual_inbound_log',
  'material_categories',
  'materials',
  'operation_log',
  'production_bom',
  'production_orders',
  'production_reports',
  'purchase_orders',
  'staging_records',
  'suppliers',
];

// ── 执行 ──
(async () => {
  const conn = await pool.getConnection();
  console.log('[migration] 开始数据库迁移...\n');

  try {
    // 1. 创建 groups 表
    console.log('[1/3] 创建 groups 表...');
    await conn.query(CREATE_GROUPS_TABLE);
    console.log('  ✓ groups 表就绪');

    // 2. 种子数据
    console.log('[2/3] 写入种子数据...');
    await conn.query(SEED_GROUPS);
    const [groups] = await conn.query('SELECT id, group_name, group_code FROM `groups`');
    groups.forEach(g => console.log(`  ✓ ${g.group_code} → ${g.group_name}`));

    // 3. 给每张业务表加 group_id
    console.log(`\n[3/3] 给 ${GROUP_SCOPED_TABLES.length} 张表添加 group_id...`);
    let success = 0;
    let skipped = 0;

    for (const table of GROUP_SCOPED_TABLES) {
      const sql = `ALTER TABLE \`${table}\` ADD COLUMN group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码' AFTER id`;
      try {
        await conn.query(sql);
        console.log(`  ✓ ${table}`);
        success++;
      } catch (err) {
        // 1060 = Duplicate column name — 列已存在，幂等跳过
        if (err.errno === 1060) {
          console.log(`  - ${table} (列已存在，跳过)`);
          skipped++;
        } else {
          console.error(`  ✗ ${table} 失败:`, err.message);
        }
      }
    }

    console.log(`\n[migration] 完成！成功: ${success}, 跳过: ${skipped}, 失败: ${GROUP_SCOPED_TABLES.length - success - skipped}`);
    console.log('[migration] 共享表 warehouse_zones, storage_locations 无需修改');
  } catch (err) {
    console.error('[migration] 迁移失败:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
