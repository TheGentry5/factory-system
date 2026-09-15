/**
 * 员工表建表 + 种子数据脚本
 * 运行: node server/seed-employees.cjs
 */
const pool = require('./db.cjs');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS employees (
  id int NOT NULL AUTO_INCREMENT,
  emp_no varchar(20) NOT NULL COMMENT '工号',
  name varchar(50) NOT NULL COMMENT '姓名',
  gender enum('男','女') DEFAULT NULL COMMENT '性别',
  department varchar(50) DEFAULT NULL COMMENT '部门',
  position varchar(50) DEFAULT NULL COMMENT '岗位',
  phone varchar(20) DEFAULT NULL COMMENT '联系电话',
  email varchar(100) DEFAULT NULL COMMENT '邮箱',
  hire_date date DEFAULT NULL COMMENT '入职日期',
  status tinyint(1) DEFAULT '1' COMMENT '状态 1=在职 0=离职',
  remark varchar(500) DEFAULT NULL COMMENT '备注',
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY emp_no (emp_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工表'
`;

// 17 名员工：1 采购经理 + 2 采购专员 + 12 名其他岗位 + 2 名测试用例(张三/李四)
const EMPLOYEES = [
  ['EMP001', '张伟',   '男', '采购部', '采购经理',       '13801001001', 'zhangwei@factory.com',   '2020-03-16'],
  ['EMP002', '李娜',   '女', '采购部', '采购专员',       '13801001002', 'lina@factory.com',       '2021-06-01'],
  ['EMP003', '王强',   '男', '采购部', '采购专员',       '13801001003', 'wangqiang@factory.com',  '2022-09-13'],
  ['EMP004', '刘洋',   '男', '生产部', '生产主管',       '13801001004', 'liuyang@factory.com',    '2019-05-20'],
  ['EMP005', '陈静',   '女', '生产部', '生产操作员',     '13801001005', 'chenjing@factory.com',   '2021-11-08'],
  ['EMP006', '杨帆',   '男', '生产部', '生产操作员',     '13801001006', 'yangfan@factory.com',    '2022-02-14'],
  ['EMP007', '赵磊',   '男', '生产部', '生产操作员',     '13801001007', 'zhaolei@factory.com',    '2023-04-03'],
  ['EMP008', '孙丽',   '女', '质检部', '质检主管',       '13801001008', 'sunli@factory.com',      '2019-08-26'],
  ['EMP009', '周涛',   '男', '质检部', '质检员',         '13801001009', 'zhoutao@factory.com',    '2022-07-11'],
  ['EMP010', '吴敏',   '女', '质检部', '质检员',         '13801001010', 'wumin@factory.com',      '2023-10-09'],
  ['EMP011', '郑浩',   '男', '仓储部', '仓库主管',       '13801001011', 'zhenghao@factory.com',   '2020-01-06'],
  ['EMP012', '冯雪',   '女', '仓储部', '仓管员',         '13801001012', 'fengxue@factory.com',    '2022-12-05'],
  ['EMP013', '徐建国', '男', '设备部', '设备维修工程师', '13801001013', 'xujianguo@factory.com',  '2018-04-16'],
  ['EMP014', '何芳',   '女', '财务部', '财务专员',       '13801001014', 'hefang@factory.com',     '2021-03-22'],
  ['EMP015', '高翔',   '男', '行政部', '人事行政专员',   '13801001015', 'gaoxiang@factory.com',   '2023-06-19'],
  ['EMP016', '张三',   '男', '质检部', '质检员',         '13801001016', 'zhangsan@factory.com',   '2021-03-01'],
  ['EMP017', '李四',   '男', '仓储部', '仓管员',         '13801001017', 'lisi@factory.com',       '2021-06-15'],
];

(async () => {
  await pool.query(CREATE_TABLE_SQL);
  console.log('[seed] employees 表已就绪');

  const [result] = await pool.query(
    `INSERT INTO employees (emp_no, name, gender, department, position, phone, email, hire_date)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), gender=VALUES(gender), department=VALUES(department),
       position=VALUES(position), phone=VALUES(phone), email=VALUES(email), hire_date=VALUES(hire_date)`,
    [EMPLOYEES]
  );
  console.log(`[seed] 员工数据写入完成 (affectedRows=${result.affectedRows})`);

  const [rows] = await pool.query(
    'SELECT emp_no, name, department, position FROM employees ORDER BY emp_no'
  );
  console.table(rows);
  process.exit(0);
})().catch((e) => {
  console.error('[seed] 失败:', e.message);
  process.exit(1);
});
