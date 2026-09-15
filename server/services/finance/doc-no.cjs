/**
 * 单据号生成服务（原子自增）
 *
 * 用法（必须在事务连接内调用）：
 *   const { nextDocNo } = require('./doc-no.cjs');
 *   const no = await nextDocNo(conn, { prefix: 'AP', display: '2026-09-02' });
 *   // → AP-2026-09-02-001
 *
 * 并发安全：依赖 fin_doc_seq 表
 *   INSERT ... ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)
 * 避免 MAX(SUBSTRING(no)) + 1 撞号。
 */

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localCompact(d = new Date()) {
  return localDateStr(d).replace(/-/g, '');
}

/**
 * 取下一个单据号（原子）。
 * @param {object} conn 事务连接
 * @param {object} opts
 *   - prefix: 前缀，如 'AP' / 'VCH' / 'EXP'
 *   - display: 单号中的日期/期间展示段，默认本地日期 YYYY-MM-DD
 *   - key: fin_doc_seq 的序列键，默认 `${prefix}-${compact(display 或今天)}`
 *   - pad: 序号位数，默认 3
 * @returns {Promise<string>}
 */
async function nextDocNo(conn, { prefix, display, key, pad = 3 }) {
  const disp = display || localDateStr();
  const compactDisp = disp.replace(/-/g, '');
  const seqKey = key || `${prefix}-${compactDisp}`;

  await conn.query(
    `INSERT INTO fin_doc_seq (seq_key, seq) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)`,
    [seqKey]
  );
  const [[{ n }]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${disp}-${String(n).padStart(pad, '0')}`;
}

module.exports = { nextDocNo, localDateStr, localCompact };
