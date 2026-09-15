/**
 * 财务模块 建表 + 种子数据脚本
 * 运行: node server/seed-finance.cjs
 *
 * 幂等 — 可重复执行。全部财务表加 fin_ 前缀，业务表均带 group_id（多租户隔离）。
 * 例外：fin_subjects（会计科目）跨业务组共享一套，无 group_id。
 */
const pool = require('./db.cjs');

const CREATE_TABLES = `
-- 单据号原子自增计数器
CREATE TABLE IF NOT EXISTS fin_doc_seq (
  seq_key VARCHAR(50) NOT NULL COMMENT '序列键，如 VCH-2026-09 / AP-20260902',
  seq INT NOT NULL DEFAULT 0,
  PRIMARY KEY (seq_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='财务单据号序列';

-- 会计期间（结账唯一入口）
CREATE TABLE IF NOT EXISTS fin_periods (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  period_no VARCHAR(7) NOT NULL COMMENT '期间 YYYY-MM',
  status ENUM('open','closing','closed','reopened') NOT NULL DEFAULT 'open' COMMENT '状态',
  closed_by VARCHAR(50) DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  reopened_by VARCHAR(50) DEFAULT NULL,
  remark VARCHAR(200) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_period_group (group_id, period_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会计期间';

-- 会计科目（共享，不分组）
CREATE TABLE IF NOT EXISTS fin_subjects (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL COMMENT '科目编码',
  name VARCHAR(50) NOT NULL COMMENT '科目名称',
  parent_id INT DEFAULT NULL COMMENT '上级科目',
  direction ENUM('debit','credit') NOT NULL DEFAULT 'debit' COMMENT '余额方向',
  type ENUM('asset','liability','equity','revenue','expense','cost') NOT NULL DEFAULT 'asset',
  is_cash TINYINT(1) NOT NULL DEFAULT 0 COMMENT '资金类科目',
  is_cost TINYINT(1) NOT NULL DEFAULT 0 COMMENT '成本归集类',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='会计科目';

-- 资金账户（付款/收款）
CREATE TABLE IF NOT EXISTS fin_bank_accounts (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  code VARCHAR(30) NOT NULL COMMENT '账户编码',
  name VARCHAR(50) NOT NULL COMMENT '账户名称',
  account_type ENUM('bank','cash','alipay','wechat') NOT NULL DEFAULT 'bank',
  subject_code VARCHAR(20) DEFAULT NULL COMMENT '对应资金科目',
  initial_balance DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '期初余额',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_account_group (group_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资金账户';

-- 客户（应收侧，供应商复用 suppliers 表）
CREATE TABLE IF NOT EXISTS fin_customers (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  code VARCHAR(30) NOT NULL,
  name VARCHAR(50) NOT NULL,
  contact_person VARCHAR(50) DEFAULT NULL,
  contact_phone VARCHAR(20) DEFAULT NULL,
  address VARCHAR(200) DEFAULT NULL,
  remark VARCHAR(200) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_group (group_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户';

-- 记账凭证主表
CREATE TABLE IF NOT EXISTS fin_vouchers (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  voucher_no VARCHAR(30) NOT NULL COMMENT '凭证号 VCH-YYYY-MM-####',
  period_no VARCHAR(7) NOT NULL,
  voucher_date DATE NOT NULL COMMENT '记账日期',
  voucher_type ENUM('generic','ap','ar','expense','transfer','closing','opening') NOT NULL DEFAULT 'generic',
  source_type VARCHAR(30) DEFAULT NULL COMMENT '来源单据类型',
  source_id INT DEFAULT NULL COMMENT '来源单据ID（幂等键）',
  entry_count INT NOT NULL DEFAULT 0,
  total_debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
  reversed_of_id INT DEFAULT NULL COMMENT '若为红冲凭证，指向被冲凭证ID',
  remark VARCHAR(300) DEFAULT NULL,
  created_by VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_voucher_no (voucher_no),
  UNIQUE KEY uk_source (group_id, source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='记账凭证';

-- 凭证分录
CREATE TABLE IF NOT EXISTS fin_voucher_entries (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  voucher_id INT NOT NULL,
  line_no INT NOT NULL DEFAULT 0,
  subject_code VARCHAR(20) NOT NULL,
  subject_id INT DEFAULT NULL,
  direction ENUM('debit','credit') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  summary VARCHAR(200) DEFAULT NULL,
  cost_center_id INT DEFAULT NULL,
  material_id INT DEFAULT NULL,
  dept VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_voucher (voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='凭证分录';

-- 应付单
CREATE TABLE IF NOT EXISTS fin_ap_docs (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  doc_no VARCHAR(30) NOT NULL COMMENT '应付单号 AP-YYYYMMDD-###',
  source_type ENUM('purchase_order','inbound','manual') NOT NULL DEFAULT 'manual',
  source_id INT DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  supplier_name VARCHAR(100) DEFAULT NULL COMMENT '冗余快照',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应付金额',
  paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '已付金额',
  invoice_no VARCHAR(50) DEFAULT NULL COMMENT '发票号（发票匹配）',
  due_date DATE DEFAULT NULL COMMENT '到期日',
  voucher_id INT DEFAULT NULL COMMENT '确认凭证ID',
  status ENUM('open','matched','paid','partial_paid','written_off') NOT NULL DEFAULT 'open',
  remark VARCHAR(300) DEFAULT NULL,
  created_by VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_no (doc_no),
  UNIQUE KEY uk_ap_source (group_id, source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应付单';

-- 付款单
CREATE TABLE IF NOT EXISTS fin_payments (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  pay_no VARCHAR(30) NOT NULL COMMENT '付款单号 PAY-YYYYMMDD-###',
  payment_type ENUM('bank','cash','alipay','wechat') NOT NULL DEFAULT 'bank',
  bank_account_id INT DEFAULT NULL COMMENT '付款账户',
  supplier_id INT DEFAULT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  pay_date DATE DEFAULT NULL,
  operator VARCHAR(50) DEFAULT NULL,
  status ENUM('draft','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
  voucher_id INT DEFAULT NULL COMMENT '付款凭证ID',
  remark VARCHAR(300) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pay_no (pay_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='付款单';

-- 付款分配明细（一张付款单可核销多张应付单）
CREATE TABLE IF NOT EXISTS fin_payment_allocations (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  payment_id INT NOT NULL,
  ap_doc_id INT NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='付款分配';

-- 应收单
CREATE TABLE IF NOT EXISTS fin_ar_docs (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  doc_no VARCHAR(30) NOT NULL COMMENT '应收单号 AR-YYYYMMDD-###',
  source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  source_id INT DEFAULT NULL,
  customer_id INT NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应收金额',
  received_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '已收金额',
  invoice_no VARCHAR(50) DEFAULT NULL,
  due_date DATE DEFAULT NULL COMMENT '到期日',
  voucher_id INT DEFAULT NULL COMMENT '确认凭证ID',
  status ENUM('open','matched','paid','partial_paid','written_off') NOT NULL DEFAULT 'open',
  remark VARCHAR(300) DEFAULT NULL,
  created_by VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ar_doc_no (doc_no),
  UNIQUE KEY uk_ar_source (group_id, source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应收单';

-- 收款单
CREATE TABLE IF NOT EXISTS fin_receipts (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  receipt_no VARCHAR(30) NOT NULL COMMENT '收款单号 REC-YYYYMMDD-###',
  receipt_type ENUM('bank','cash','alipay','wechat') NOT NULL DEFAULT 'bank',
  bank_account_id INT DEFAULT NULL COMMENT '收款账户',
  customer_id INT NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  receipt_date DATE DEFAULT NULL,
  operator VARCHAR(50) DEFAULT NULL,
  status ENUM('draft','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
  voucher_id INT DEFAULT NULL COMMENT '收款凭证ID',
  remark VARCHAR(300) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_receipt_no (receipt_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收款单';

-- 费用报销单
CREATE TABLE IF NOT EXISTS fin_expenses (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  exp_no VARCHAR(30) NOT NULL COMMENT '报销单号 EXP-YYYYMMDD-###',
  employee_id INT DEFAULT NULL,
  employee_name VARCHAR(50) DEFAULT NULL,
  department VARCHAR(50) DEFAULT NULL COMMENT '费用归集部门',
  expense_type ENUM('差旅','办公','招待','维修','运输','其他') NOT NULL DEFAULT '其他',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  attachment_count INT NOT NULL DEFAULT 0,
  exp_date DATE DEFAULT NULL COMMENT '费用发生日期',
  approver VARCHAR(50) DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  paid_via VARCHAR(20) DEFAULT NULL,
  status ENUM('draft','submitted','approved','paid','rejected') NOT NULL DEFAULT 'draft',
  voucher_id INT DEFAULT NULL COMMENT '付款凭证ID',
  remark VARCHAR(300) DEFAULT NULL,
  created_by VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_exp_no (exp_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='费用报销';

-- 成本计算单
CREATE TABLE IF NOT EXISTS fin_cost_sheet (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  sheet_no VARCHAR(30) NOT NULL COMMENT '成本单号 CS-YYYY-MM-###',
  period_no VARCHAR(7) NOT NULL,
  material_cost DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '直接材料',
  labor_cost DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '直接人工',
  overhead_cost DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '制造费用',
  total_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  status ENUM('draft','posted') NOT NULL DEFAULT 'draft',
  voucher_id INT DEFAULT NULL,
  remark VARCHAR(300) DEFAULT NULL,
  created_by VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sheet_group (group_id, period_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成本计算单';

-- 成本计算单明细行
CREATE TABLE IF NOT EXISTS fin_cost_sheet_lines (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  sheet_id INT NOT NULL,
  cost_type ENUM('material','labor','overhead') NOT NULL DEFAULT 'material',
  source_type VARCHAR(30) DEFAULT NULL,
  source_id INT DEFAULT NULL,
  material_id INT DEFAULT NULL,
  quantity DECIMAL(18,4) DEFAULT 0,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  remark VARCHAR(300) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sheet (sheet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成本明细';

-- 结账日志
CREATE TABLE IF NOT EXISTS fin_close_log (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  period_no VARCHAR(7) NOT NULL,
  action VARCHAR(30) NOT NULL COMMENT '操作: precheck/trial_balance/close_profit/close/reopen',
  operator VARCHAR(50) DEFAULT NULL,
  detail VARCHAR(500) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='结账日志';

-- 报表快照缓存（预留）
CREATE TABLE IF NOT EXISTS fin_report_cache (
  id INT NOT NULL AUTO_INCREMENT,
  group_id VARCHAR(20) DEFAULT NULL COMMENT '业务组编码',
  period_no VARCHAR(7) NOT NULL,
  report_code VARCHAR(30) NOT NULL,
  data_json MEDIUMTEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cache (group_id, period_no, report_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报表快照';
`;

// 会计科目种子：(code, name, parent_code, direction, type, is_cash, is_cost)
const SUBJECTS = [
  ['1001', '库存现金', null, 'debit', 'asset', 1, 0],
  ['1002', '银行存款', null, 'debit', 'asset', 1, 0],
  ['1122', '应收账款', null, 'debit', 'asset', 0, 0],
  ['1403', '原材料', null, 'debit', 'asset', 0, 0],
  ['1405', '库存商品', null, 'debit', 'asset', 0, 0],
  ['4101', '生产成本', null, 'debit', 'cost', 0, 1],
  ['2202', '应付账款', null, 'credit', 'liability', 0, 0],
  ['2211', '其他应付款', null, 'credit', 'liability', 0, 0],
  ['2221', '应交税费', null, 'credit', 'liability', 0, 0],
  ['4001', '实收资本', null, 'credit', 'equity', 0, 0],
  ['4103', '本年利润', null, 'credit', 'equity', 0, 0],
  ['4104', '利润分配', null, 'credit', 'equity', 0, 0],
  ['6001', '主营业务收入', null, 'credit', 'revenue', 0, 0],
  ['6051', '其他业务收入', null, 'credit', 'revenue', 0, 0],
  ['6301', '营业外收入', null, 'credit', 'revenue', 0, 0],
  ['6401', '主营业务成本', null, 'debit', 'expense', 0, 0],
  ['6403', '税金及附加', null, 'debit', 'expense', 0, 0],
  ['6601', '销售费用', null, 'debit', 'expense', 0, 0],
  ['6602', '管理费用', null, 'debit', 'expense', 0, 0],
  ['6603', '财务费用', null, 'debit', 'expense', 0, 0],
  ['6711', '营业外支出', null, 'debit', 'expense', 0, 0],
];

function todayPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

(async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 建全部表（先剔除语句前的 -- 注释行，避免影响按 CREATE 开头的切分）
    const statements = CREATE_TABLES
      .replace(/^\s*--.*$/gm, '')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.startsWith('CREATE'));
    for (const sql of statements) {
      await conn.query(sql);
    }
    console.log(`[seed] fin_* 全部表已就绪（${statements.length} 张）`);

    // 2. 科目（共享，无分组）
    for (const s of SUBJECTS) {
      await conn.query(
        `INSERT INTO fin_subjects (code, name, direction, type, is_cash, is_cost, enabled)
         VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), direction=VALUES(direction),
           type=VALUES(type), is_cash=VALUES(is_cash), is_cost=VALUES(is_cost), enabled=1`,
        [s[0], s[1], s[3], s[4], s[5], s[6]]
      );
    }
    // 补 parent_id（树形）
    for (const s of SUBJECTS) {
      if (!s[2]) continue;
      const [[child]] = await conn.query('SELECT id FROM fin_subjects WHERE code = ?', [s[0]]);
      const [[parent]] = await conn.query('SELECT id FROM fin_subjects WHERE code = ?', [s[2]]);
      if (child && parent) await conn.query('UPDATE fin_subjects SET parent_id = ? WHERE id = ?', [parent.id, child.id]);
    }
    console.log(`[seed] 会计科目 ${SUBJECTS.length} 条已就绪`);

    // 3. 业务组列表（客户/账户/期间按组播种）
    const [groups] = await conn.query('SELECT group_code FROM `groups` ORDER BY id');
    const groupCodes = groups.map(g => g.group_code);
    if (groupCodes.length === 0) groupCodes.push(null);
    const period = todayPeriod();

    for (const gid of groupCodes) {
      // 资金账户
      const accounts = [
        ['BANK-ICBC-01', '工商银行基本户', 'bank', '1002', 1000000.00],
        ['BANK-CASH-01', '库存现金', 'cash', '1001', 50000.00],
      ];
      for (const [code, name, type, subject, bal] of accounts) {
        const sql = gid === null
          ? `INSERT INTO fin_bank_accounts (group_id, code, name, account_type, subject_code, initial_balance)
             VALUES (NULL,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), subject_code=VALUES(subject_code), is_active=1`
          : `INSERT INTO fin_bank_accounts (group_id, code, name, account_type, subject_code, initial_balance)
             VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), subject_code=VALUES(subject_code), is_active=1`;
        await conn.query(sql, gid === null ? [code, name, type, subject, bal] : [gid, code, name, type, subject, bal]);
      }

      // 客户（演示）
      const customers = [
        ['CUS-001', '华美出版社', '王主编', '13800000001', '广州市天河区'],
        ['CUS-002', '联合利华', '李先生', '13800000002', '上海市静安区'],
      ];
      for (const [code, name, cp, phone, addr] of customers) {
        const sql = gid === null
          ? `INSERT INTO fin_customers (group_id, code, name, contact_person, contact_phone, address)
             VALUES (NULL,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), contact_person=VALUES(contact_person)`
          : `INSERT INTO fin_customers (group_id, code, name, contact_person, contact_phone, address)
             VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), contact_person=VALUES(contact_person)`;
        await conn.query(sql, gid === null ? [code, name, cp, phone, addr] : [gid, code, name, cp, phone, addr]);
      }

      // 开启当前期间
      if (gid === null) {
        await conn.query(
          `INSERT INTO fin_periods (group_id, period_no, status) VALUES (NULL, ?, 'open')
           ON DUPLICATE KEY UPDATE status=status`, [period]
        );
      } else {
        await conn.query(
          `INSERT INTO fin_periods (group_id, period_no, status) VALUES (?, ?, 'open')
           ON DUPLICATE KEY UPDATE status=status`, [gid, period]
        );
      }
    }
    console.log(`[seed] 资金账户/客户/期间 已按 ${groupCodes.length} 个业务组写入`);

    await conn.commit();
    console.log('\n[seed] 财务模块初始化完成 ✔');
  } catch (e) {
    await conn.rollback();
    console.error('[seed] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
