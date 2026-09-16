/**
 * 主数据建表 + 种子脚本
 *
 * 运行：
 *   node server/seed-master-data.cjs
 *
 * 作用：补齐物资/仓库/出入库链路的缺失表（这些表全仓库没有任何 CREATE TABLE，
 *       只能按各路由的查询反推），并灌入最小可用种子数据。
 *
 * 幂等：全部 CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE，可重复执行。
 *
 * 表清单：
 *   共享（无 group_id）：warehouse_zones, storage_locations
 *   按组隔离（带 group_id）：material_categories, materials, suppliers, purchase_orders,
 *     inbound_standards, inbound_records, staging_records, inspection_details,
 *     location_inventory, operation_log, manual_inbound_log
 */

const pool = require('./db.cjs');

// ── 参考组编码（与 migrations/001-add-group-id.cjs 一致） ──
const GROUPS = [
  ['group_a', 'A组（广东业务群）', 'Demo — 广东区域业务组'],
  ['group_b', 'B组（香港业务群）', 'Demo — 香港区域业务组'],
];

// ── 物料分类：id 与 materials.cjs / suppliers.cjs 的 CATEGORY_PREFIX 映射一致 ──
const CATEGORIES = [
  // id, group, 名称, 排序
  [1, 'group_a', '原材料', 1],
  [2, 'group_a', '辅料', 2],
  [3, 'group_a', '半成品', 3],
  [4, 'group_a', '纸张类', 4],
  [5, 'group_a', '油墨类', 5],
  [6, 'group_a', '版材类', 6],
  [7, 'group_b', '原材料', 1],
  [8, 'group_b', '辅料', 2],
  [9, 'group_b', '半成品', 3],
  [10, 'group_b', '纸张类', 4],
  [11, 'group_b', '油墨类', 5],
  [12, 'group_b', '版材类', 6],
];

// ── 仓库区域：大区（parent_id NULL） + 小分区 ──
const ZONES = [
  // id, parent_id, code, name, category_id, sort_order, env_note
  [1, null, 'A', '原料仓', 4, 1, '常温干燥'],
  [2, null, 'B', '成品仓', null, 2, null],
  [3, null, 'C', '化学品区', 5, 3, '防爆通风'],
  [4, null, 'D', '版材辅料区', 6, 4, null],
  [5, 1, 'A1', '纸张存放区', 4, 1, null],
  [6, 1, 'A2', '原纸区', 4, 2, null],
  [7, 3, 'C1', '油墨存放区', 5, 1, null],
  [8, 4, 'D1', '版材存放区', 6, 1, null],
];

// ── 建表 DDL ──
const DDL = [
  ['groups', `
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(50) NOT NULL COMMENT '组名（展示用）',
      group_code VARCHAR(20) NOT NULL COMMENT '组编码（系统标识）',
      description VARCHAR(200) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_group_code (group_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='业务组'`],

  ['material_categories', `
    CREATE TABLE IF NOT EXISTS material_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
      name VARCHAR(50) NOT NULL COMMENT '分类名称',
      sort_order INT DEFAULT 0 COMMENT '排序',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料分类'`],

  ['suppliers', `
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      code VARCHAR(30) NOT NULL COMMENT '供应商编码',
      name VARCHAR(100) NOT NULL,
      supply_category_id INT DEFAULT NULL COMMENT '供货类别',
      contact_person VARCHAR(50) DEFAULT NULL,
      contact_phone VARCHAR(30) DEFAULT NULL,
      address VARCHAR(200) DEFAULT NULL,
      rating VARCHAR(10) DEFAULT 'B' COMMENT '评级 A/B/C',
      status TINYINT DEFAULT 1 COMMENT '1启用 0停用',
      remark VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商'`],

  ['materials', `
    CREATE TABLE IF NOT EXISTS materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      code VARCHAR(30) NOT NULL COMMENT '物料编码',
      name VARCHAR(100) NOT NULL,
      spec VARCHAR(100) DEFAULT NULL COMMENT '规格型号',
      category_id INT DEFAULT NULL,
      unit VARCHAR(20) DEFAULT '个',
      paper_type VARCHAR(50) DEFAULT NULL COMMENT '纸张类型',
      gram_weight DECIMAL(10,2) DEFAULT NULL COMMENT '克重(g/m²)',
      safety_stock DECIMAL(14,2) DEFAULT 0 COMMENT '安全库存',
      current_stock DECIMAL(14,2) DEFAULT 0 COMMENT '当前库存',
      unit_price DECIMAL(14,2) DEFAULT 0 COMMENT '参考单价',
      supplier_id INT DEFAULT NULL,
      status TINYINT DEFAULT 1 COMMENT '1启用 0停用',
      dual_inspection TINYINT DEFAULT 0 COMMENT '是否双检',
      remark VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_code (code),
      KEY idx_category (category_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料主数据'`],

  ['purchase_orders', `
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      order_no VARCHAR(30) NOT NULL COMMENT '采购单号',
      order_type VARCHAR(20) DEFAULT 'normal' COMMENT 'normal/supplemental',
      material_id INT DEFAULT NULL,
      supplier_id INT DEFAULT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      unit_price DECIMAL(14,2) DEFAULT 0,
      total_amount DECIMAL(16,2) DEFAULT 0,
      expected_date DATE DEFAULT NULL COMMENT '预计交期',
      actual_arrival_date DATE DEFAULT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'draft' COMMENT 'draft/approved/rejected/arrived/completed',
      supplemental_at DATETIME DEFAULT NULL,
      is_overdue TINYINT DEFAULT 0,
      overdue_hours DECIMAL(10,2) DEFAULT 0,
      created_by VARCHAR(50) DEFAULT NULL,
      reviewed_by VARCHAR(50) DEFAULT NULL,
      reviewed_at DATETIME DEFAULT NULL,
      review_comment VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_order_no (order_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购单'`],

  ['inbound_standards', `
    CREATE TABLE IF NOT EXISTS inbound_standards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      material_id INT NOT NULL,
      inspection_item VARCHAR(100) NOT NULL COMMENT '检验项目',
      standard_value VARCHAR(100) DEFAULT NULL COMMENT '标准值',
      tolerance_upper VARCHAR(50) DEFAULT NULL COMMENT '上公差',
      tolerance_lower VARCHAR(50) DEFAULT NULL COMMENT '下公差',
      test_method VARCHAR(100) DEFAULT NULL COMMENT '检验方法',
      is_required TINYINT DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库质检标准'`],

  ['inbound_records', `
    CREATE TABLE IF NOT EXISTS inbound_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      record_no VARCHAR(30) NOT NULL COMMENT '入库单号',
      purchase_order_id INT DEFAULT NULL,
      material_id INT DEFAULT NULL,
      supplier_id INT DEFAULT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      batch_no VARCHAR(50) DEFAULT NULL,
      inspector VARCHAR(50) DEFAULT NULL COMMENT '第一检验人',
      inspect_result VARCHAR(20) DEFAULT 'pending',
      inspect_remark VARCHAR(255) DEFAULT NULL,
      inspector2 VARCHAR(50) DEFAULT NULL COMMENT '第二检验人',
      inspect2_result VARCHAR(20) DEFAULT 'pending',
      inspect2_remark VARCHAR(255) DEFAULT NULL,
      inspect2_time DATETIME DEFAULT NULL,
      duty_personnel VARCHAR(50) DEFAULT NULL COMMENT '当值人员',
      storage_area VARCHAR(50) DEFAULT NULL COMMENT '归类区域',
      status VARCHAR(20) DEFAULT 'submitted' COMMENT 'submitted/approved/rejected/stored',
      inbound_date DATE DEFAULT NULL,
      created_by VARCHAR(50) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_record_no (record_no),
      KEY idx_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库记录'`],

  ['staging_records', `
    CREATE TABLE IF NOT EXISTS staging_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      staging_no VARCHAR(30) NOT NULL COMMENT '暂存单号',
      purchase_order_id INT DEFAULT NULL,
      material_id INT NOT NULL,
      supplier_id INT DEFAULT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      batch_no VARCHAR(50) DEFAULT NULL,
      duty_personnel VARCHAR(50) DEFAULT NULL,
      storage_area VARCHAR(50) DEFAULT NULL,
      arrival_date DATE DEFAULT NULL,
      status VARCHAR(30) DEFAULT 'pending_inspection' COMMENT 'pending_inspection/passed/failed/partial_accepted/returned/stored',
      inspect_result VARCHAR(20) DEFAULT NULL COMMENT 'pass/partial/reject',
      inspector VARCHAR(50) DEFAULT NULL,
      inspect_date DATETIME DEFAULT NULL,
      inspect_remark VARCHAR(255) DEFAULT NULL,
      qualified_quantity DECIMAL(14,2) DEFAULT NULL COMMENT '合格数量',
      disposition VARCHAR(30) DEFAULT NULL COMMENT 'return/accept_partial/full_inspect',
      disposition_by VARCHAR(50) DEFAULT NULL,
      disposition_date DATETIME DEFAULT NULL,
      disposition_remark VARCHAR(255) DEFAULT NULL,
      created_by VARCHAR(50) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_staging_no (staging_no),
      KEY idx_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='暂存区记录'`],

  ['inspection_details', `
    CREATE TABLE IF NOT EXISTS inspection_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      staging_id INT NOT NULL,
      standard_id INT DEFAULT NULL,
      inspection_item VARCHAR(100) DEFAULT NULL,
      standard_value VARCHAR(100) DEFAULT NULL,
      actual_value VARCHAR(100) DEFAULT NULL,
      result VARCHAR(20) DEFAULT 'na' COMMENT 'pass/fail/na',
      remark VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_staging (staging_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='质检明细'`],

  ['warehouse_zones', `
    CREATE TABLE IF NOT EXISTS warehouse_zones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      parent_id INT DEFAULT NULL COMMENT '父区域，NULL 为大区',
      code VARCHAR(20) NOT NULL COMMENT '区域编码',
      name VARCHAR(50) NOT NULL,
      category_id INT DEFAULT NULL COMMENT '对应物料分类',
      sort_order INT DEFAULT 0,
      env_note VARCHAR(100) DEFAULT NULL COMMENT '环境要求',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_parent (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='仓库区域（共享）'`],

  ['storage_locations', `
    CREATE TABLE IF NOT EXISTS storage_locations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      zone_id INT NOT NULL,
      code VARCHAR(30) NOT NULL COMMENT '库位编码',
      shelf_type VARCHAR(20) DEFAULT 'row' COMMENT 'row排/cabinet柜/rack架',
      capacity DECIMAL(14,2) DEFAULT 0,
      used_capacity DECIMAL(14,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'available' COMMENT 'available/partial/full/maintenance',
      priority INT DEFAULT 0 COMMENT '推荐优先级',
      distance_from_entrance INT DEFAULT 0 COMMENT '离入口距离',
      position_no INT DEFAULT 0 COMMENT '位号',
      level_no INT DEFAULT 0 COMMENT '层号',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_code (code),
      KEY idx_zone (zone_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库位（共享）'`],

  ['location_inventory', `
    CREATE TABLE IF NOT EXISTS location_inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      location_id INT NOT NULL,
      material_id INT NOT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      batch_no VARCHAR(50) DEFAULT NULL,
      inbound_record_id INT DEFAULT NULL,
      stored_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间（FIFO 依据）',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_location (location_id),
      KEY idx_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库位库存'`],

  ['operation_log', `
    CREATE TABLE IF NOT EXISTS operation_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      type VARCHAR(30) NOT NULL COMMENT 'inbound/outbound/manual_inbound/restock/move/check',
      material_id INT DEFAULT NULL,
      location_id INT DEFAULT NULL,
      inbound_record_id INT DEFAULT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      operator_name VARCHAR(50) DEFAULT NULL,
      source_type VARCHAR(20) DEFAULT 'web',
      remark VARCHAR(500) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_type (type),
      KEY idx_material (material_id),
      KEY idx_location (location_id),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出入库操作日志'`],

  ['manual_inbound_log', `
    CREATE TABLE IF NOT EXISTS manual_inbound_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(20) DEFAULT NULL,
      material_id INT DEFAULT NULL,
      location_code VARCHAR(30) DEFAULT NULL,
      quantity DECIMAL(14,2) DEFAULT 0,
      batch_no VARCHAR(50) DEFAULT NULL,
      duty_personnel VARCHAR(50) DEFAULT NULL,
      storage_area VARCHAR(50) DEFAULT NULL,
      original_record_no VARCHAR(30) DEFAULT NULL COMMENT '回库原单号',
      piggyback_record_no VARCHAR(30) DEFAULT NULL COMMENT '蹭码原单号',
      is_restock TINYINT DEFAULT 0,
      is_piggyback TINYINT DEFAULT 0,
      confirmed_by VARCHAR(50) DEFAULT NULL,
      remark VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_group (group_id),
      KEY idx_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='手动入库日志'`],
];

// ── 种子：供应商 ──
const SUPPLIERS = [
  // id, group, code, name, supply_category_id, contact, phone, address, rating, remark
  [1, 'group_a', 'SUP-ZZ-001', '广东华南纸张有限公司', 4, '张伟', '13800000001', '广东省广州市白云区', 'A', '纸张主供应商'],
  [2, 'group_a', 'SUP-YM-001', '珠江油墨科技有限公司', 5, '李静', '13800000002', '广东省佛山市顺德区', 'B', null],
  [3, 'group_a', 'SUP-BC-001', '华南印刷版材厂', 6, '王强', '13800000003', '广东省东莞市虎门镇', 'B', null],
  [4, 'group_b', 'SUP-ZZ-001', '香港联合纸业', 10, '陈生', '85200000001', '香港新界葵涌', 'A', null],
  [5, 'group_b', 'SUP-YM-001', '东方油墨（香港）', 11, '林太', '85200000002', '香港九龙观塘', 'B', null],
  [6, 'group_b', 'SUP-BC-001', '港龙版材有限公司', 12, '黄生', '85200000003', '香港新界沙田', 'B', null],
];

// ── 种子：物料 ──
const MATERIALS = [
  // id, group, code, name, spec, category_id, unit, paper_type, gram_weight, safety_stock, current_stock, unit_price, supplier_id, dual_inspection, remark
  [1, 'group_a', 'MAT-ZZ-001', '铜版纸 157g', '787×1092mm', 4, '令', '铜版纸', 157, 50, 200, 320, 1, 0, '常用封面纸'],
  [2, 'group_a', 'MAT-YM-001', '四色油墨-黑', '1kg/罐', 5, 'kg', '油墨', null, 20, 80, 45, 2, 1, '需双人检验'],
  [3, 'group_a', 'MAT-BC-001', 'PS 版', '1030×800mm', 6, '张', '版材', null, 30, 120, 28, 3, 0, null],
  [4, 'group_b', 'MAT-ZZ-001', '双胶纸 80g', '787×1092mm', 10, '令', '双胶纸', 80, 40, 150, 210, 4, 0, null],
  [5, 'group_b', 'MAT-YM-001', '四色油墨-青', '1kg/罐', 11, 'kg', '油墨', null, 15, 60, 48, 5, 1, '需双人检验'],
  [6, 'group_b', 'MAT-BC-001', 'CTP 版', '1030×800mm', 12, '张', '版材', null, 25, 90, 32, 6, 0, null],
];

async function main() {
  const conn = await pool.getConnection();
  console.log('[seed-master] 开始建表...\n');
  try {
    for (const [name, sql] of DDL) {
      await conn.query(sql);
      console.log(`  ✓ ${name}`);
    }

    console.log('\n[seed-master] 写入种子数据...');

    await conn.query(
      'INSERT INTO `groups` (group_code, group_name, description) VALUES ? ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description)',
      [GROUPS]
    );
    console.log(`  ✓ groups (${GROUPS.length})`);

    await conn.query(
      'INSERT INTO material_categories (id, group_id, name, sort_order) VALUES ? ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), name = VALUES(name), sort_order = VALUES(sort_order)',
      [CATEGORIES]
    );
    console.log(`  ✓ material_categories (${CATEGORIES.length})`);

    await conn.query(
      `INSERT INTO suppliers (id, group_id, code, name, supply_category_id, contact_person, contact_phone, address, rating, remark)
       VALUES ? ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), code = VALUES(code), name = VALUES(name),
         supply_category_id = VALUES(supply_category_id), contact_person = VALUES(contact_person),
         contact_phone = VALUES(contact_phone), address = VALUES(address), rating = VALUES(rating), remark = VALUES(remark)`,
      [SUPPLIERS]
    );
    console.log(`  ✓ suppliers (${SUPPLIERS.length})`);

    await conn.query(
      `INSERT INTO materials (id, group_id, code, name, spec, category_id, unit, paper_type, gram_weight,
         safety_stock, current_stock, unit_price, supplier_id, dual_inspection, remark)
       VALUES ? ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), code = VALUES(code), name = VALUES(name),
         spec = VALUES(spec), category_id = VALUES(category_id), unit = VALUES(unit), paper_type = VALUES(paper_type),
         gram_weight = VALUES(gram_weight), safety_stock = VALUES(safety_stock), current_stock = VALUES(current_stock),
         unit_price = VALUES(unit_price), supplier_id = VALUES(supplier_id), dual_inspection = VALUES(dual_inspection),
         remark = VALUES(remark)`,
      [MATERIALS]
    );
    console.log(`  ✓ materials (${MATERIALS.length})`);

    await conn.query(
      `INSERT INTO warehouse_zones (id, parent_id, code, name, category_id, sort_order, env_note)
       VALUES ? ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), code = VALUES(code), name = VALUES(name),
         category_id = VALUES(category_id), sort_order = VALUES(sort_order), env_note = VALUES(env_note)`,
      [ZONES]
    );
    console.log(`  ✓ warehouse_zones (${ZONES.length})`);

    // 库位：每个小分区生成 2 排 × 2 层 × 2 位
    const shelfTypeByZone = { A1: 'row', A2: 'row', C1: 'cabinet', D1: 'rack' };
    const locations = [];
    for (const zone of ZONES) {
      const zoneCode = zone[2];
      if (!shelfTypeByZone[zoneCode]) continue; // 只给子分区建库位
      for (let shelf = 1; shelf <= 2; shelf++) {
        for (let level = 1; level <= 2; level++) {
          for (let pos = 1; pos <= 2; pos++) {
            const shelfNo = String(shelf).padStart(2, '0');
            locations.push([
              zone[0],
              `${zoneCode}-${shelfNo}-${level}-${pos}`,
              shelfTypeByZone[zoneCode],
              1000,
              0,
              'available',
              shelf === 1 ? 10 : 5,
              10 + pos,
              pos,
              level,
            ]);
          }
        }
      }
    }
    await conn.query(
      `INSERT INTO storage_locations (zone_id, code, shelf_type, capacity, used_capacity, status, priority, distance_from_entrance, position_no, level_no)
       VALUES ? ON DUPLICATE KEY UPDATE zone_id = VALUES(zone_id), shelf_type = VALUES(shelf_type),
         capacity = VALUES(capacity), priority = VALUES(priority), distance_from_entrance = VALUES(distance_from_entrance),
         position_no = VALUES(position_no), level_no = VALUES(level_no)`,
      [locations]
    );
    console.log(`  ✓ storage_locations (${locations.length})`);

    console.log('\n[seed-master] 完成！');
    console.log('[seed-master] 提示：多业务组列（group_id）由 migrations/001-add-group-id.cjs 统一补，本脚本建表时已内置。');
  } catch (err) {
    console.error('\n[seed-master] 失败:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
