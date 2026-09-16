import { useState, useEffect, useRef, useMemo, Component } from 'react';
import {
  Card, Row, Col, Table, Tag, Typography, Button, Spin, Space, Empty, Tooltip,
} from 'antd';
import {
  ThunderboltOutlined, ReloadOutlined, RobotOutlined, WarningOutlined,
  ClockCircleOutlined, AppstoreOutlined, TeamOutlined, DashboardOutlined,
} from '@ant-design/icons';
import api from '../../utils/api';

const { Title, Text, Paragraph } = Typography;

// ==================== 错误边界 ====================

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div style={{ padding: 40, textAlign: 'center' }}><Title level={4} type="danger">渲染出错</Title><Button onClick={() => this.setState({ hasError: false })}>重试</Button></div>;
    return this.props.children;
  }
}

// ==================== 课表矩阵常量 ====================

const SLOT_MINUTES = 30;                 // 时间轴最小粒度
const DAY_START_MIN = 0;                 // 每天 00:00 起
const DAY_END_MIN = 24 * 60;             // 每天 24:00 止（显示到 23:59）
const SLOTS_PER_DAY = (DAY_END_MIN - DAY_START_MIN) / SLOT_MINUTES; // 48 格
const MIN_SLOT_W = 20;                    // 每格最小像素宽（不足时横向滚动）
const MACHINE_COL_W = 132;                // 左侧设备列宽
const LANE_H = 44;                        // 色块高度（容纳 3 行文字，含边框不裁切）
const LANE_GAP = 4;                       // 同设备重叠色块间距
const ROW_LANES = 2;                      // 每个设备行固定层数（保证行高一致）
const ROW_PAD = 4;                        // 行上下内边距
const HEADER_H = 46;                      // 表头高度
const MATRIX_MAX_H = 565;                 // 课表最大高度：表头 + 5 行设备（超出纵向滚动）
const HOUR_LABELS = [0, 120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320]; // 00:00 ~ 22:00 隔 2 小时

const CACHE_KEY = 'aiSchedulingResult';
const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const RISK_RANK = { high: 3, medium: 2, low: 1 };

// ==================== 工具函数 ====================

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  const label = Number.isNaN(d.getTime()) ? '' : WEEK_NAMES[d.getDay()];
  return `${label} ${date.slice(5)}`;
}

/** 把一条排产明细换算成矩阵内的几何位置 */
function geometry(e) {
  const startRaw = toMinutes(e.startTime);
  let start = startRaw == null ? DAY_START_MIN : startRaw;
  start = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SLOT_MINUTES, start));

  let end = toMinutes(e.endTime);
  if (end == null || end <= start) {
    end = start + Math.max(SLOT_MINUTES, Math.round((Number(e.durationHours) || 1) * 60));
  }
  end = Math.min(DAY_END_MIN, end);
  if (end <= start) end = start + SLOT_MINUTES;

  const startSlot = Math.round((start - DAY_START_MIN) / SLOT_MINUTES);
  const spanSlots = Math.max(1, Math.round((end - start) / SLOT_MINUTES));
  return { startMin: start, endMin: end, startSlot, spanSlots };
}

/** 同一设备同一天内，把重叠的色块分配到不同泳道 */
function layout(entries) {
  const items = entries.map((e, idx) => ({ e, idx, ...geometry(e) }));
  const dates = [...new Set(items.map(it => it.e.date).filter(Boolean))].sort();
  const dateIndex = {};
  dates.forEach((d, i) => { dateIndex[d] = i; });

  const groups = {};
  items.forEach(it => {
    const key = `${it.e.machineName}||${it.e.date}`;
    (groups[key] = groups[key] || []).push(it);
  });

  const conflictIdx = new Set();
  const laneCountByName = {};
  let maxLanes = 1;
  Object.values(groups).forEach(arr => {
    arr.sort((a, b) => a.startMin - b.startMin);
    const laneEnds = [];
    arr.forEach(it => {
      let lane = laneEnds.findIndex(end => end <= it.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.endMin); }
      else laneEnds[lane] = it.endMin;
      it.lane = lane;
      laneCountByName[it.e.machineName] = Math.max(laneCountByName[it.e.machineName] || 0, lane + 1);
      maxLanes = Math.max(maxLanes, lane + 1);
    });
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j].startMin < arr[i].endMin) { conflictIdx.add(arr[i].idx); conflictIdx.add(arr[j].idx); }
        else break;
      }
    }
  });

  return { items, dates, dateIndex, conflictIdx, laneCountByName, maxLanes };
}

function buildRiskMap(risks) {
  const map = {};
  (risks || []).forEach(r => {
    if (!r || !r.orderNo) return;
    const sev = r.severity || 'medium';
    if (!map[r.orderNo] || (RISK_RANK[sev] || 0) > (RISK_RANK[map[r.orderNo]] || 0)) {
      map[r.orderNo] = sev;
    }
  });
  return map;
}

/** 综合风险警告与优先级，判定色块颜色等级 */
function levelOf(e, riskMap) {
  const sev = riskMap[e.orderNo];
  if (sev === 'high') return 'high';
  if (sev === 'medium') return 'medium';
  if (e.priority === 'urgent') return 'high';
  if (e.priority === 'high') return 'medium';
  return 'normal';
}

const BLOCK_COLORS = {
  normal: { background: '#e6f7ff', border: '1px solid #91d5ff', color: '#0958d9' },
  medium: { background: '#fffbe6', border: '1px solid #ffe58f', color: '#ad6800' },
  high: { background: '#fff1f0', border: '1px solid #ffa39e', color: '#a8071a' },
};

function blockStyle(level, conflict) {
  const base = BLOCK_COLORS[level] || BLOCK_COLORS.normal;
  return conflict
    ? { ...base, border: '2px solid #ff4d4f', boxShadow: '0 0 0 2px rgba(255,77,79,.2)' }
    : base;
}

const LEVEL_TEXT = { normal: '正常', medium: '预警紧张', high: '高风险延期' };

function detailNode(e, level, conflict) {
  const rows = [
    ['工单号', e.orderNo],
    ['产品', e.productName || '-'],
    ['工序', `第 ${e.stepOrder ?? '-'} 道 · ${e.stepName || '-'}`],
    ['设备', `${e.machineName || '-'}（${e.machineOwner || '共享'}）`],
    ['日期', `${e.dayLabel || ''} ${e.date || ''}`.trim() || '-'],
    ['时段', `${e.startTime || ''}-${e.endTime || ''}`],
    ['工时', `${(Number(e.durationHours) || 0).toFixed(1)} h`],
    ['数量', (Number(e.productionQty) || 0).toLocaleString()],
    ['费用', `¥${(Number(e.subtotalCost) || 0).toFixed(2)}`],
    ['风险', LEVEL_TEXT[level]],
  ];
  return (
    <div style={{ fontSize: 12, lineHeight: '20px', minWidth: 176 }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: '#bfbfbf' }}>{k}：</span>{v}
        </div>
      ))}
      {conflict && <div style={{ color: '#ff7875', fontWeight: 600 }}>⚠ 该时段与同设备其他工单冲突</div>}
    </div>
  );
}

// ==================== 课表矩阵组件 ====================

function ScheduleMatrix({ entries, machineRows, riskMap }) {
  const { items, dates, dateIndex, conflictIdx } = useMemo(() => layout(entries), [entries]);
  const scrollRef = useRef(null);
  const [availW, setAvailW] = useState(0);

  // 测量时间轴可视宽度：日期少时铺满，日期多时横向滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setAvailW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [entries.length, dates.length]);

  const avail = Math.max(0, availW - MACHINE_COL_W - 2);
  const slotW = dates.length > 0 ? Math.max(MIN_SLOT_W, avail / (dates.length * SLOTS_PER_DAY)) : MIN_SLOT_W;
  const dayW = slotW * SLOTS_PER_DAY;
  const totalWidth = dates.length * dayW;

  if (!entries.length) return <Empty description="暂无排产明细" style={{ padding: 40 }} />;

  // 所有设备行统一为固定层数，避免有冲突的行比普通行高
  const rowH = ROW_LANES * (LANE_H + LANE_GAP) - LANE_GAP + ROW_PAD * 2;

  const renderBlocks = rowName => items
    .filter(it => it.e.machineName === rowName && dateIndex[it.e.date] != null)
    .map(it => {
      const level = levelOf(it.e, riskMap);
      const conflict = conflictIdx.has(it.idx);
      const left = dateIndex[it.e.date] * dayW + it.startSlot * slotW;
      const width = Math.max(slotW, it.spanSlots * slotW) - 3;
      // 层数固定，超过固定层数的重叠回绕到已有层，保证行高不变
      const top = ROW_PAD + (it.lane % ROW_LANES) * (LANE_H + LANE_GAP);
      return (
        <Tooltip key={it.idx} title={detailNode(it.e, level, conflict)} mouseEnterDelay={0.15}>
          <div
            className="ai-sched-block"
            style={{
              position: 'absolute', left, top, width, height: LANE_H,
              borderRadius: 6, padding: '3px 6px', overflow: 'hidden',
              userSelect: 'none', zIndex: 2,
              ...blockStyle(level, conflict),
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.e.orderNo}
            </div>
            <div style={{ fontSize: 10, lineHeight: '11px', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.e.productName} · {it.e.stepName}
            </div>
            <div style={{ fontSize: 10, lineHeight: '11px', opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {Number(it.e.durationHours || 0).toFixed(1)}h · {(Number(it.e.productionQty) || 0).toLocaleString()} 件
            </div>
          </div>
        </Tooltip>
      );
    });

  return (
    <div
      ref={scrollRef}
      className="ai-sched-matrix ai-sched-scroll"
      style={{
        maxHeight: MATRIX_MAX_H, overflow: 'auto',
        border: '1px solid #f0f0f0', borderRadius: 10, background: '#fff',
      }}
    >
      <div style={{ display: 'flex', width: MACHINE_COL_W + totalWidth, alignItems: 'flex-start' }}>
        {/* 左侧设备列（横向固定） */}
        <div style={{ position: 'sticky', left: 0, zIndex: 4, width: MACHINE_COL_W, flex: '0 0 auto', borderRight: '1px solid #e8e8e8', background: '#fafafa' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, height: HEADER_H, borderBottom: '1px solid #e8e8e8', background: '#fafafa', display: 'flex', alignItems: 'center', paddingLeft: 12, fontWeight: 600, fontSize: 13, color: '#595959' }}>
            设备 / 负责人
          </div>
          {machineRows.map(row => (
            <div key={row.name} style={{ height: rowH, borderBottom: '1px solid #f0f0f0', padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>{row.owner || '共享'}</div>
            </div>
          ))}
        </div>

        {/* 右侧时间轴 */}
        <div style={{ width: totalWidth, flex: '0 0 auto' }}>
          {/* 表头：日期 + 时段（纵向固定） */}
          <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', height: HEADER_H, borderBottom: '1px solid #e8e8e8', background: '#fff' }}>
            {dates.map(d => (
              <div key={d} style={{ width: dayW, flex: '0 0 auto', borderRight: '1px solid #e8e8e8', background: '#f0f5ff' }}>
                <div style={{ height: 22, lineHeight: '22px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#2f54eb' }}>{dateLabel(d)}</div>
                <div style={{ position: 'relative', height: HEADER_H - 22 }}>
                  {HOUR_LABELS.map(min => (
                    <div key={min} style={{ position: 'absolute', top: 1, left: ((min - DAY_START_MIN) / SLOT_MINUTES) * slotW, fontSize: 10, color: '#8c8c8c' }}>
                      {fmtMin(min)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 设备行 */}
          {machineRows.map((row, ri) => (
            <div
              key={row.name}
              style={{
                position: 'relative',
                height: rowH,
                borderBottom: '1px solid #f0f0f0',
                backgroundColor: ri % 2 ? '#fcfcfc' : '#fff',
                backgroundImage: `repeating-linear-gradient(to right, #f5f5f5 0, #f5f5f5 1px, transparent 1px, transparent ${slotW}px)`,
              }}
            >
              {/* 日期分隔线 */}
              {dates.map((d, i) => (
                <div key={d} style={{ position: 'absolute', top: 0, bottom: 0, left: i * dayW, width: 1, background: '#e8e8e8' }} />
              ))}

              {/* 色块 */}
              {renderBlocks(row.name)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 页面主体 ====================

export default function AIScheduling() {
  const [data, setData] = useState(readCache);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 拉取设备台账，用于课表 Y 轴（含未排产的设备）
  useEffect(() => {
    let alive = true;
    api.get('/production/machines')
      .then(res => { if (alive && res.success) setMachines(res.data || []); })
      .catch(() => { /* 设备台账拉取失败时退化为从排产结果推导 */ });
    return () => { alive = false; };
  }, []);

  const runScheduling = async () => {
    setLoading(true);
    setError(null);
    try {
      // 排产为跨组视图：显式带 __all__（等价于旧版不带 header 的「不过滤」）
      const res = await api.get('/scheduling/schedule-suggestion', undefined, { groupCode: '__all__' });
      if (res.success) {
        setData(res.data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.data)); } catch { /* 忽略缓存失败 */ }
      }
      else setError(res.message || '排产失败');
    } catch (e) {
      // 后端不可达时给出明确提示，而非笼统的「网络错误」
      setError(e.message || '无法连接后端服务，请确认后端已启动');
    } finally {
      setLoading(false);
    }
  };

  const entries = useMemo(() => data?.scheduleEntries || [], [data]);
  const risks = useMemo(() => data?.riskWarnings || [], [data]);
  const summary = data?.summary || '';
  const riskMap = useMemo(() => buildRiskMap(risks), [risks]);

  // 设备行：优先用设备台账，再补齐排产结果中出现过的设备
  const machineRows = useMemo(() => {
    const rows = [];
    const seen = new Set();
    (machines || []).forEach(m => {
      if (m.machine_name && !seen.has(m.machine_name)) {
        seen.add(m.machine_name);
        rows.push({ name: m.machine_name, owner: m.owner_group_id, type: m.machine_type });
      }
    });
    entries.forEach(e => {
      if (e.machineName && !seen.has(e.machineName)) {
        seen.add(e.machineName);
        rows.push({ name: e.machineName, owner: e.machineOwner, type: '' });
      }
    });
    return rows;
  }, [machines, entries]);

  // 概览统计
  const stats = useMemo(() => {
    const orderCount = new Set(entries.map(e => e.orderNo)).size;
    const stepCount = entries.length;
    const crossGroup = new Set(entries.map(e => e.machineOwner).filter(o => o && !['共享', '无', '-'].includes(o))).size;
    const highRisks = risks.filter(r => r.severity === 'high').length;

    const m = /产能利用率[^0-9]*(\d+(?:\.\d+)?)\s*%/.exec(summary);
    let utilization = m ? Number(m[1]) : null;
    if (utilization == null) {
      const booked = entries.reduce((s, e) => s + (Number(e.durationHours) || 0), 0);
      const days = Math.max(1, new Set(entries.map(e => e.date)).size);
      const capacity = Math.max(1, machineRows.length) * days * 16;
      utilization = Math.round((booked / capacity) * 100);
    }

    return [
      { label: '总工单', value: orderCount, icon: <DashboardOutlined />, color: '#1677ff' },
      { label: '工序总数', value: stepCount, icon: <AppstoreOutlined />, color: '#722ed1' },
      { label: '跨组协作', value: crossGroup, icon: <TeamOutlined />, color: '#13c2c2' },
      { label: '高风险', value: highRisks, icon: <WarningOutlined />, color: '#ff4d4f' },
      { label: '产能利用率', value: `${utilization}%`, icon: <ClockCircleOutlined />, color: '#fa8c16' },
    ];
  }, [entries, risks, summary, machineRows]);

  // 机时费卡片：按设备汇总，保证所有设备都出现
  const machineCards = useMemo(() => machineRows.map(row => {
    const list = entries.filter(e => e.machineName === row.name);
    const totalHours = list.reduce((s, e) => s + (Number(e.durationHours) || 0), 0);
    const totalCost = list.reduce((s, e) => s + (Number(e.subtotalCost) || 0), 0);
    return { name: row.name, owner: row.owner || '共享', totalHours, totalCost, used: list.length > 0 };
  }), [machineRows, entries]);

  // ==================== 首次进入 / 加载 / 失败态 ====================

  if (!data && !loading && !error) {
    return (
      <ErrorBoundary>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 16px' }}>
          <Card style={{ maxWidth: 560, textAlign: 'center', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
            <RobotOutlined style={{ fontSize: 48, color: '#722ed1', marginBottom: 16 }} />
            <Title level={4}>DeepSeek AI 智能排产</Title>
            <Paragraph type="secondary">
              3+1 多路并行架构：3 路不同策略生成排产方案 → AI 校验修复 → 输出最优周排产课表
            </Paragraph>
            <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={runScheduling} loading={loading}>
              开始 AI 排产
            </Button>
          </Card>
        </div>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#595959' }}>DeepSeek AI 正在分析工单并生成最优排产方案...</div>
        <Text type="secondary" style={{ fontSize: 12 }}>3 路并行生成 + 1 路校验修复，约需 40 秒</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Title level={5} type="danger">排产失败</Title>
        <Paragraph type="secondary">{error}</Paragraph>
        <Button icon={<ReloadOutlined />} onClick={runScheduling} type="primary">重试</Button>
      </div>
    );
  }

  if (!data) return <Empty description="无数据" />;

  const cols = [
    { title: '#', key: 'i', width: 46, render: (_, r, i) => i + 1 },
    {
      title: '工单号', dataIndex: 'orderNo', width: 120,
      render: v => {
        const sev = riskMap[v];
        const color = sev === 'high' ? '#ff4d4f' : sev === 'medium' ? '#faad14' : null;
        return (
          <Space size={6}>
            {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
            <span>{v}</span>
          </Space>
        );
      },
    },
    { title: '产品', dataIndex: 'productName', width: 110 },
    { title: '工序', dataIndex: 'stepName', width: 110 },
    { title: '设备', dataIndex: 'machineName', width: 100 },
    { title: '归属', dataIndex: 'machineOwner', width: 70, render: v => v || '共享' },
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '时段', key: 'time', width: 110, render: (_, r) => `${r.startTime || ''}-${r.endTime || ''}` },
    { title: '工时', dataIndex: 'durationHours', width: 70, align: 'right', render: v => `${(Number(v) || 0).toFixed(1)}h` },
    { title: '数量', dataIndex: 'productionQty', width: 90, align: 'right', render: v => (Number(v) || 0).toLocaleString() },
    { title: '费用', dataIndex: 'subtotalCost', width: 90, align: 'right', render: v => `¥${(Number(v) || 0).toFixed(2)}` },
  ];

  return (
    <ErrorBoundary>
      <style>{`
        .ai-sched-matrix .ai-sched-block { transition: box-shadow .15s ease, transform .15s ease; }
        .ai-sched-matrix .ai-sched-block:hover { box-shadow: 0 4px 12px rgba(0,0,0,.2); transform: translateY(-1px); }
        .ai-sched-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        .ai-sched-scroll::-webkit-scrollbar-thumb { background: #bfbfbf; border-radius: 6px; }
        .ai-sched-scroll::-webkit-scrollbar-track { background: #fafafa; }
      `}</style>

      {/* ── 顶部操作栏 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'space-between' }}>
        <Space>
          <ThunderboltOutlined style={{ color: '#722ed1', fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>AI 排产</Title>
          {data.id && <Tag color="purple">#{data.id}</Tag>}
          {data.generatedAt && <Text type="secondary" style={{ fontSize: 12 }}>生成于 {new Date(data.generatedAt).toLocaleString('zh-CN')}</Text>}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={runScheduling}>重新排产</Button>
      </div>

      {/* ── 概览提示框 ── */}
      <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 10, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 40px' }}>
          {stats.map(s => (
            <div key={s.label} style={{ minWidth: 96 }}>
              <div style={{ fontSize: 12, color: '#595959', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: s.color }}>{s.icon}</span>{s.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0958d9', lineHeight: 1.3 }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #91d5ff', fontSize: 12, color: '#595959', lineHeight: 1.9 }}>
          <div>排产规则：工序顺序不可逆 · 同设备同一时段互斥 · 每台设备每日排产 ≤ 可用工时 80%（预留加急缓冲）· 均匀分布到可用排产日 · 优先 urgent 与早交期工单。</div>
          {data.reasoning && <div style={{ marginTop: 4 }}>AI 分析：{data.reasoning}</div>}
        </div>
      </div>

      {/* ── 核心：设备排产课表 ── */}
      <Card
        title={<span>🗓 设备排产课表（{entries.length} 条工序 · {machineRows.length} 台设备）</span>}
        style={{ marginBottom: 16, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}
        extra={
          <Space size={16} wrap>
            <Space size={6}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#e6f7ff', border: '1px solid #91d5ff', display: 'inline-block' }} /><Text style={{ fontSize: 12 }}>普通</Text></Space>
            <Space size={6}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fffbe6', border: '1px solid #ffe58f', display: 'inline-block' }} /><Text style={{ fontSize: 12 }}>预警紧张</Text></Space>
            <Space size={6}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fff1f0', border: '1px solid #ffa39e', display: 'inline-block' }} /><Text style={{ fontSize: 12 }}>高风险延期</Text></Space>
            <Space size={6}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fff', border: '2px solid #ff4d4f', display: 'inline-block' }} /><Text style={{ fontSize: 12 }}>时段冲突</Text></Space>
          </Space>
        }
      >
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>提示：色块横向跨时段展示每台设备每周的工单占用，鼠标悬浮可查看详情。</Text>
        </div>
        <ScheduleMatrix entries={entries} machineRows={machineRows} riskMap={riskMap} />
      </Card>

      {/* ── 机器机时费汇总 ── */}
      <Card title="💰 机器机时费汇总" style={{ marginBottom: 16, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <Row gutter={[12, 12]}>
          {machineCards.map(m => (
            <Col xs={12} sm={8} md={6} lg={6} key={m.name}>
              <Card
                size="small"
                className="ai-machine-card"
                style={{
                  borderRadius: 10,
                  background: m.used ? '#fff' : '#fafafa',
                  border: m.used ? '1px solid #e6f4ff' : '1px solid #f0f0f0',
                  boxShadow: m.used ? '0 1px 4px rgba(22,119,255,.08)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
                  <Tag color={m.owner === '共享' ? 'default' : 'cyan'} style={{ marginInlineEnd: 0, fontSize: 11 }}>{m.owner}</Tag>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: '#0958d9' }}>{m.totalHours.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}> h</span></Text>
                  <Text style={{ fontSize: 13, color: '#fa8c16' }}>¥{m.totalCost.toFixed(2)}</Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ── 排产明细 ── */}
      <Card title={`📋 排产明细（${entries.length} 条工序）`} style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <Table
          columns={cols}
          dataSource={entries}
          rowKey={(r, i) => `${r.orderNo}-${r.stepOrder}-${i}`}
          pagination={entries.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          size="small"
          scroll={{ x: 1020 }}
        />
      </Card>
    </ErrorBoundary>
  );
}
