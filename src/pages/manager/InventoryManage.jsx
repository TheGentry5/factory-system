import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, message, Modal, Select, Input, InputNumber, Descriptions,
         Row, Col, Badge, Tooltip, Statistic, Empty, Alert, Form, Popconfirm, DatePicker } from 'antd';
import dayjs from 'dayjs';
import {
  EnvironmentOutlined, InboxOutlined, SearchOutlined, ReloadOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, HistoryOutlined,
  CheckCircleOutlined, HomeOutlined, EditOutlined,
  WarningOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';

import api from '../../utils/api';

// ==================== 库存管理主页 ====================
// 子模块由路由参数决定，顶部子导航由 BaseLayout 按菜单分组渲染
const INVENTORY_PANELS = {
  overview: OverviewPanel,
  map: WarehouseMapPanel,
  inbound: InboundPanel,
  outbound: OutboundPanel,
  transfer: TransferPanel,
  check: CheckPanel,
  'ai-query': AIAndLogsPanel,
};

export default function InventoryManage() {
  const { tab } = useParams();
  const Panel = INVENTORY_PANELS[tab] || OverviewPanel;
  return <Panel />;
}

// ==================== 1. 库存总览面板 ====================
function OverviewPanel() {
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [slowMoving, setSlowMoving] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ovRes, alertRes, slowRes] = await Promise.all([
        api.get('/inventory/overview'),
        api.get('/inventory/alerts'),
        api.get('/inventory/slow-moving', { days: 90, pageSize: 10 }),
      ]);
      if (ovRes.success) setOverview(ovRes.data);
      if (alertRes.success) setAlerts(alertRes.data);
      if (slowRes.success) setSlowMoving(slowRes.data);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card><Statistic title="物料 SKU" value={overview?.totalSku || 0} prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="总库存量" value={overview?.totalStock || 0} precision={0} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="库存金额" value={overview?.totalValue || 0} precision={2} prefix="¥" /></Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="低库存预警" value={overview?.lowStockCount || 0}
              valueStyle={{ color: overview?.lowStockCount > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="本月入库" value={overview?.monthInbound || 0} precision={0} valueStyle={{ color: '#52c41a' }} prefix={<ArrowDownOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="本月出库" value={overview?.monthOutbound || 0} precision={0} valueStyle={{ color: '#1890ff' }} prefix={<ArrowUpOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 低库存预警 */}
        <Col span={12}>
          <Card title={<><WarningOutlined style={{ color: '#faad14' }} /> 低库存预警</>} size="small" loading={loading}>
            {alerts?.lowStock?.length > 0 ? (
              <Table rowKey="id" size="small" dataSource={alerts.lowStock} pagination={false}
                columns={[
                  { title: '物料编码', dataIndex: 'code', width: 100 },
                  { title: '名称', dataIndex: 'name', width: 100 },
                  { title: '规格', dataIndex: 'spec', width: 80 },
                  { title: '当前库存', dataIndex: 'current_stock', width: 80, align: 'right' },
                  { title: '安全库存', dataIndex: 'safety_stock', width: 80, align: 'right' },
                  { title: '缺口', dataIndex: 'shortage', width: 70, align: 'right', render: v => <Tag color="red">{v}</Tag> },
                  { title: '单位', dataIndex: 'unit', width: 50 },
                ]}
              />
            ) : <Empty description="暂无低库存预警，所有物料库存充足 ✅" />}
          </Card>
        </Col>

        {/* 呆滞料预警 */}
        <Col span={12}>
          <Card title={<><HistoryOutlined style={{ color: '#ff4d4f' }} /> 呆滞料预警（超90天未动）</>} size="small" loading={loading}>
            {slowMoving.length > 0 ? (
              <Table rowKey="id" size="small" dataSource={slowMoving} pagination={false}
                columns={[
                  { title: '物料', dataIndex: 'material_name', width: 100 },
                  { title: '库位', dataIndex: 'location_code', width: 90, render: v => <Tag>{v}</Tag> },
                  { title: '存量', dataIndex: 'quantity', width: 70, align: 'right' },
                  { title: '单位', dataIndex: 'unit', width: 50 },
                  { title: '闲置天数', dataIndex: 'idle_days', width: 80, align: 'right',
                    render: v => <Tag color={v > 180 ? 'red' : 'orange'}>{v}天</Tag> },
                  { title: '区域', dataIndex: 'zone_name', width: 80 },
                ]}
              />
            ) : <Empty description="暂无呆滞料，库存周转正常 ✅" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ==================== 2. 仓库地图面板 ====================
function WarehouseMapPanel() {
  const [zones, setZones] = useState([]);
  const [locations, setLocations] = useState([]);
  const [expandedZone, setExpandedZone] = useState(null);
  const [selectedSubZone, setSelectedSubZone] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchZones = async () => {
    const res = await api.get('/warehouse/zones');
    if (res.success) setZones(res.data);
  };

  useEffect(() => { fetchZones(); }, []);

  const toggleZone = (zone) => {
    setExpandedZone(expandedZone?.id === zone.id ? null : zone);
    setSelectedSubZone(null);
    setLocations([]);
  };

  const handleSubZoneClick = async (child) => {
    setSelectedSubZone(child);
    const res = await api.get('/warehouse/locations', { zone_code: child.code });
    if (res.success) setLocations(res.data);
  };

  const handleLocationClick = async (loc) => {
    const res = await api.get(`/warehouse/locations/${loc.code}`);
    if (res.success) { setSelectedLocation(res.data); setDetailOpen(true); }
  };

  const statusColor = { available: '#52c41a', partial: '#faad14', full: '#ff4d4f', maintenance: '#d9d9d9' };
  const statusLabel = { available: '空闲', partial: '部分占用', full: '已满', maintenance: '维护中' };

  const groupedLocations = locations.reduce((acc, loc) => {
    const key = loc.code.split('-').slice(0, -2).join('-');
    if (!acc[key]) acc[key] = [];
    acc[key].push(loc);
    return acc;
  }, {});

  return (
    <>
      <Row gutter={16}>
        <Col span={7}>
          <Card title="仓库区域" size="small">
            {zones.map(zone => {
              const isExpanded = expandedZone?.id === zone.id;
              const zoneColors = { A: '#1890ff', B: '#fa8c16', C: '#722ed1', D: '#52c41a' };
              const zoneColor = zoneColors[zone.code] || '#666';
              return (
                <div key={zone.id} style={{ marginBottom: 6 }}>
                  <Card size="small" hoverable
                    style={{ borderLeft: `4px solid ${zoneColor}`, background: isExpanded ? '#fafafa' : '#fff' }}
                    onClick={() => toggleZone(zone)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>
                        <EnvironmentOutlined style={{ color: zoneColor }} />
                        <strong>{zone.code}区 - {zone.name}</strong>
                        {zone.env_note && <Tag>{zone.env_note}</Tag>}
                      </Space>
                      <Tag>{zone.children?.length || 0}个子区</Tag>
                    </div>
                  </Card>
                  {isExpanded && zone.children && (
                    <div style={{ marginLeft: 12, marginTop: 4, borderLeft: `2px dashed ${zoneColor}33`, paddingLeft: 10 }}>
                      {zone.children.map(child => {
                        const isSelected = selectedSubZone?.id === child.id;
                        return (
                          <Card key={child.id} size="small" hoverable
                            style={{ marginBottom: 3, borderLeft: `3px solid ${isSelected ? zoneColor : '#d9d9d9'}`, background: isSelected ? `${zoneColor}10` : '#fff' }}
                            onClick={(e) => { e.stopPropagation(); handleSubZoneClick(child); }}
                          >
                            <div style={{ fontSize: 13 }}><strong>{child.code}</strong> {child.name}</div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </Col>
        <Col span={17}>
          <Card
            title={selectedSubZone ? `${selectedSubZone.code} - ${selectedSubZone.name}` : expandedZone ? `${expandedZone.code}区 - 请点击小分区查看库位` : '选择一个区域'}
            size="small"
            extra={selectedSubZone && (
              <Space>
                <Badge color="green" text={`${locations.filter(l => l.status === 'available').length}空`} />
                <Badge color="orange" text={`${locations.filter(l => l.status === 'partial').length}用`} />
                <Badge color="red" text={`${locations.filter(l => l.status === 'full').length}满`} />
                <Tag>{locations.length}个位</Tag>
              </Space>
            )}
          >
            {selectedSubZone ? (
              <div>
                {Object.entries(groupedLocations).map(([shelfName, locs]) => {
                  const shelfType = locs[0].shelf_type;
                  const typeLabel = shelfType === 'row' ? '排' : shelfType === 'cabinet' ? '柜' : '架';
                  return (
                    <Card key={shelfName} size="small"
                      title={<Space><EnvironmentOutlined /><span>{shelfName.split('-').slice(-1)[0]}{typeLabel}</span><Tag>{locs.length}位</Tag></Space>}
                      style={{ marginBottom: 12 }}
                    >
                      {Array.from({ length: Math.max(...locs.map(l => parseInt(l.level_no))) }, (_, li) => {
                        const level = li + 1;
                        const levelLocs = locs.filter(l => parseInt(l.level_no) === level);
                        return (
                          <div key={level} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{level}层</div>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${levelLocs.length}, 1fr)`, gap: 6 }}>
                              {levelLocs.sort((a, b) => parseInt(a.position_no) - parseInt(b.position_no)).map(loc => {
                                const used = parseFloat(loc.total_stored || 0);
                                const cap = parseFloat(loc.capacity);
                                const pct = cap > 0 ? (used / cap) * 100 : 0;
                                const bgColor = pct === 0 ? '#f6ffed' : pct < 80 ? '#fffbe6' : '#fff2f0';
                                const borderColor = pct === 0 ? '#b7eb8f' : pct < 80 ? '#ffe58f' : '#ffa39e';
                                return (
                                  <Tooltip key={loc.id} title={`${loc.code} | ${used}/${cap} | ${statusLabel[loc.status]}`}>
                                    <div onClick={() => handleLocationClick(loc)}
                                      style={{
                                        background: bgColor, border: `2px solid ${borderColor}`,
                                        borderRadius: 6, padding: '8px 6px', textAlign: 'center',
                                        cursor: 'pointer', fontSize: 11, transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                      <div style={{ fontWeight: 600 }}>{loc.position_no}位</div>
                                      <Badge color={statusColor[loc.status]} text={used || 0} style={{ fontSize: 10 }} />
                                    </div>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  );
                })}
              </div>
            ) : <Empty description={expandedZone ? '点击左侧小分区查看库位详情' : '点击左侧大区展开，再选择小分区'} />}
          </Card>
        </Col>
      </Row>

      <Modal title={`库位详情 — ${selectedLocation?.code || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={600}>
        {selectedLocation && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="库位编码">{selectedLocation.code}</Descriptions.Item>
              <Descriptions.Item label="所属区域">{selectedLocation.zone_name}</Descriptions.Item>
              <Descriptions.Item label="货架类型">
                {selectedLocation.shelf_type === 'row' ? '排' : selectedLocation.shelf_type === 'cabinet' ? '柜' : '架'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge color={statusColor[selectedLocation.status]} text={statusLabel[selectedLocation.status]} />
              </Descriptions.Item>
              <Descriptions.Item label="容量">{selectedLocation.used_capacity} / {selectedLocation.capacity}</Descriptions.Item>
              <Descriptions.Item label="推荐优先级">{selectedLocation.priority}</Descriptions.Item>
            </Descriptions>
            {(selectedLocation.items && selectedLocation.items.length > 0) ? (
              <Table rowKey="id" size="small" dataSource={selectedLocation.items} pagination={false}
                columns={[
                  { title: '物料编码', dataIndex: 'material_code', width: 100 },
                  { title: '物料名称', dataIndex: 'material_name', width: 100 },
                  { title: '规格', dataIndex: 'spec', width: 100 },
                  { title: '数量', dataIndex: 'quantity', width: 60 },
                  { title: '单位', dataIndex: 'unit', width: 50 },
                  { title: '批次号', dataIndex: 'batch_no' },
                  { title: '入库单号', dataIndex: 'inbound_no' },
                ]}
              />
            ) : <Empty description="该库位暂无物料存放" />}
          </>
        )}
      </Modal>
    </>
  );
}

// ==================== 3. 入库操作面板 ====================
function InboundPanel() {
  const [mode, setMode] = useState('restock');
  const [materials, setMaterials] = useState([]);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    api.get('/materials', { pageSize: 100 }).then(r => r.success && setMaterials(r.data));
  }, []);

  const handleNext = async () => {
    const values = await form.validateFields();
    const matId = values.material_id;
    const qty = values.quantity;
    const recRes = await api.get('/warehouse/recommend', { material_id: matId, quantity: qty });
    if (recRes.success) setRecommendations(recRes.data.recommendations);
    setStep(2);
  };

  const handleSubmit = async () => {
    const values = form.getFieldsValue();
    const locationCode = form.getFieldValue('location_code');
    if (!locationCode) { message.warning('请选择一个库位'); return; }
    setSubmitting(true);

    let endpoint = '/warehouse/restock';
    const payload = {
      material_id: values.material_id,
      quantity: values.quantity,
      location_code: locationCode,
      confirmed_by: values.confirmed_by,
      remark: values.remark,
    };

    if (mode === 'restock') {
      payload.original_record_no = values.original_record_no;
    } else if (mode === 'piggyback') {
      endpoint = '/warehouse/piggyback';
      payload.piggyback_record_no = values.piggyback_record_no;
      payload.identity_verified = true;
    } else if (mode === 'manual') {
      endpoint = '/warehouse/manual-inbound';
      payload.batch_no = values.batch_no;
      payload.duty_personnel = values.duty_personnel;
      payload.storage_area = values.storage_area;
    }

    const res = await api.post(endpoint, payload);
    if (res.success) {
      message.success(`${mode === 'restock' ? '回库' : mode === 'piggyback' ? '蹭码入库' : '手动入库'}成功！已存入 ${locationCode}`);
      form.resetFields();
      setStep(1);
      setRecommendations([]);
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  const modeConfig = {
    restock: { title: '剩余物料回库（扫原码）', desc: '生产剩余/未用完的物料，扫描原入库单二维码 → 确认数量 → 免检入库', requireOriginalNo: true, noInspection: true },
    piggyback: { title: '极小量蹭码入库', desc: '数量极少时，扫描同品种其他物料的二维码 → 确认数量 → 必须确认操作人身份', requirePiggybackNo: true, requireIdentity: true },
    manual: { title: '小批量手动入库（无QR）', desc: '极少采购量或紧急到货，手动填写信息直接入库，需填写当值人员', requireDuty: true },
  };

  const config = modeConfig[mode];

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card title="入库模式" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button block type={mode === 'restock' ? 'primary' : 'default'} onClick={() => { setMode('restock'); setStep(1); form.resetFields(); }}>
              <ArrowDownOutlined /> 回库（扫原码）
            </Button>
            <Button block type={mode === 'piggyback' ? 'primary' : 'default'} onClick={() => { setMode('piggyback'); setStep(1); form.resetFields(); }}>
              <SwapOutlined /> 蹭码入库（极小量）
            </Button>
            <Button block type={mode === 'manual' ? 'primary' : 'default'} onClick={() => { setMode('manual'); setStep(1); form.resetFields(); }}>
              <EditOutlined /> 手动入库（无QR）
            </Button>
          </Space>
          <Card size="small" style={{ marginTop: 12, background: '#fafafa' }}>
            <strong>{config.title}</strong>
            <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{config.desc}</p>
            {config.noInspection && <Tag color="green">免质检</Tag>}
            {config.requireIdentity && <Tag color="orange">需身份确认</Tag>}
          </Card>
        </Card>
      </Col>
      <Col span={16}>
        <Card title={step === 1 ? `填写信息 — ${config.title}` : '选择存放库位'} size="small">
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="material_id" label="物料" rules={[{ required: true }]}>
                  <Select showSearch placeholder="搜索物料" optionFilterProp="label"
                    options={materials.map(m => ({ label: `${m.code} ${m.name}`, value: m.id }))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="回库/入库数量" />
                </Form.Item>
              </Col>
              {mode === 'restock' && (
                <Col span={12}>
                  <Form.Item name="original_record_no" label="原入库单号" rules={[{ required: true, message: '扫描或输入原入库单号' }]}>
                    <Input placeholder="IN20260715001（扫码自动填入）" />
                  </Form.Item>
                </Col>
              )}
              {mode === 'piggyback' && (
                <Col span={12}>
                  <Form.Item name="piggyback_record_no" label="所蹭入库单号" rules={[{ required: true }]}>
                    <Input placeholder="同品种物料的入库单号" />
                  </Form.Item>
                </Col>
              )}
              {mode === 'manual' && (
                <>
                  <Col span={12}><Form.Item name="batch_no" label="批次号"><Input placeholder="可选" /></Form.Item></Col>
                  <Col span={12}><Form.Item name="duty_personnel" label="当值人员" rules={[{ required: true }]}><Input placeholder="入库当班人员" /></Form.Item></Col>
                  <Col span={12}><Form.Item name="storage_area" label="归类区域"><Input placeholder="如A1区" /></Form.Item></Col>
                </>
              )}
              <Col span={12}>
                <Form.Item name="confirmed_by" label="确认人" rules={[{ required: true, message: '请输入操作确认人' }]}>
                  <Input placeholder={mode === 'piggyback' ? '蹭码入库必须确认身份' : '操作人姓名'} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="remark" label="备注"><Input placeholder="补充说明" /></Form.Item>
              </Col>
            </Row>
            {step === 1 && <Button type="primary" onClick={handleNext}>下一步：选择库位</Button>}
          </Form>
          {step === 2 && (
            <div style={{ marginTop: 16 }}>
              <Alert message="推荐库位（同类合并优先）" type="info" showIcon style={{ marginBottom: 12 }} />
              <Table rowKey="code" size="small" dataSource={recommendations} pagination={false}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: form.getFieldValue('location_code') ? [form.getFieldValue('location_code')] : [],
                  onChange: keys => form.setFieldsValue({ location_code: keys[0] }),
                }}
                columns={[
                  { title: '推荐', width: 50, render: (_, __, i) => ['🥇','🥈','🥉'][i] },
                  { title: '库位', dataIndex: 'code', render: v => <Tag color="blue">{v}</Tag> },
                  { title: '区域', dataIndex: 'zone_name' },
                  { title: '容量', render: (_, r) => `${r.used_capacity||0}/${r.capacity}` },
                  { title: '理由', dataIndex: 'reason', ellipsis: true },
                ]}
              />
              <div style={{ marginTop: 16 }}>
                <Space>
                  <Button onClick={() => setStep(1)}>上一步</Button>
                  <Button type="primary" loading={submitting} onClick={handleSubmit}>确认存入</Button>
                </Space>
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ==================== 4. 出库操作面板 ====================
function OutboundPanel() {
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [retrieveQty, setRetrieveQty] = useState({});
  const [operatorName, setOperatorName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    api.get('/materials', { pageSize: 100 }).then(r => r.success && setMaterials(r.data));
  }, []);

  const handleMaterialSelect = async (materialId) => {
    const mat = materials.find(m => m.id === materialId);
    setSelectedMaterial(mat);
    if (materialId) {
      const res = await api.get(`/warehouse/inventory/${materialId}`);
      if (res.success) setInventory(res.data);
    } else {
      setInventory([]);
    }
  };

  // 全局库存搜索
  const handleSearch = async () => {
    if (!searchKeyword.trim()) { message.warning('请输入搜索关键词'); return; }
    const res = await api.get('/inventory/search', { keyword: searchKeyword, pageSize: 50 });
    if (res.success) {
      setInventory(res.data);
      if (res.data.length > 0) {
        const mat = materials.find(m => m.id === res.data[0].material_id);
        if (mat) setSelectedMaterial(mat);
      }
    }
  };

  const handleRetrieve = async (item) => {
    const qty = parseFloat(retrieveQty[item.id]) || 0;
    if (qty <= 0) { message.warning('请输入取出数量'); return; }
    if (qty > parseFloat(item.quantity)) { message.warning('数量超过该库位存量'); return; }
    if (!operatorName.trim()) { message.warning('请输入领料人'); return; }
    setSubmitting(true);
    const res = await api.post('/warehouse/retrieve', {
      material_id: item.material_id,
      location_code: item.location_code,
      quantity: qty,
      operator_name: operatorName,
    });
    if (res.success) {
      message.success(`已从 ${item.location_code} 取出 ${qty} ${selectedMaterial?.unit || ''}`);
      setRetrieveQty({});
      if (selectedMaterial) handleMaterialSelect(selectedMaterial.id);
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card title="选择物料" size="small">
          <Select
            showSearch
            placeholder="搜索物料"
            style={{ width: '100%', marginBottom: 12 }}
            optionFilterProp="label"
            value={selectedMaterial?.id}
            onChange={handleMaterialSelect}
            allowClear
            options={materials.map(m => ({ label: `${m.code} ${m.name} (库存:${m.current_stock}${m.unit})`, value: m.id }))}
          />
          <Input.Search
            placeholder="或按库位/批次全局搜索..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
            style={{ marginBottom: 12 }}
          />
          <Input
            placeholder="领料人姓名"
            value={operatorName}
            onChange={e => setOperatorName(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {selectedMaterial && (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="物料">{selectedMaterial.code} {selectedMaterial.name}</Descriptions.Item>
              <Descriptions.Item label="规格">{selectedMaterial.spec}</Descriptions.Item>
              <Descriptions.Item label="总库存">{selectedMaterial.current_stock} {selectedMaterial.unit}</Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      </Col>
      <Col span={16}>
        <Card title={`库存分布 — ${selectedMaterial?.name || '请选择物料或搜索'}`} size="small">
          {inventory.length === 0 ? (
            <Empty description="未选择物料或该物料无库位记录" />
          ) : (
            <Table rowKey="id" size="small" dataSource={inventory} pagination={false}
              columns={[
                { title: '物料', dataIndex: 'material_name', width: 100 },
                { title: '库位', dataIndex: 'location_code', width: 120, render: v => <Tag color="blue">{v}</Tag> },
                { title: '区域', dataIndex: 'zone_name', width: 90 },
                { title: '存量', dataIndex: 'quantity', width: 70, align: 'right' },
                { title: '批次', dataIndex: 'batch_no' },
                { title: '存放时间', dataIndex: 'stored_at', width: 100, render: v => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
                {
                  title: '取出', width: 150,
                  render: (_, r) => (
                    <Space size={4}>
                      <InputNumber size="small" min={0} max={parseFloat(r.quantity)} placeholder="数量"
                        style={{ width: 60 }}
                        value={retrieveQty[r.id]}
                        onChange={v => setRetrieveQty({ ...retrieveQty, [r.id]: v })}
                      />
                      <Button size="small" type="primary" icon={<ArrowUpOutlined />}
                        loading={submitting}
                        disabled={!retrieveQty[r.id] || retrieveQty[r.id] <= 0}
                        onClick={() => handleRetrieve(r)}>
                        取
                      </Button>
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ==================== 5. 调拨管理面板 ====================
function TransferPanel() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [materials, setMaterials] = useState([]);

  const fetchTransfers = async () => {
    setLoading(true);
    const res = await api.get('/inventory/transfers', { pageSize: 50 });
    if (res.success) setTransfers(res.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTransfers();
    api.get('/materials', { pageSize: 100 }).then(r => r.success && setMaterials(r.data));
  }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    const res = await api.post('/inventory/transfers', values);
    if (res.success) {
      message.success(`调拨单 ${res.data.transfer_no} 已创建`);
      setCreateOpen(false);
      form.resetFields();
      fetchTransfers();
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  const handleApprove = async (id) => {
    const name = prompt('请输入审批人姓名：');
    if (!name) return;
    const res = await api.put(`/inventory/transfers/${id}/approve`, { approved_by: name });
    if (res.success) { message.success('调拨已执行'); fetchTransfers(); }
    else message.error(res.message);
  };

  const handleCancel = async (id) => {
    const res = await api.del(`/inventory/transfers/${id}`);
    if (res.success) { message.success('已取消'); fetchTransfers(); }
    else message.error(res.message);
  };

  const statusMap = {
    pending: { color: 'orange', label: '待执行' },
    approved: { color: 'blue', label: '已审批' },
    completed: { color: 'green', label: '已完成' },
    cancelled: { color: 'default', label: '已取消' },
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建调拨单</Button>
        <Button icon={<ReloadOutlined />} onClick={fetchTransfers}>刷新</Button>
      </Space>
      <Table rowKey="id" size="small" dataSource={transfers} loading={loading} pagination={{ pageSize: 20 }}
        columns={[
          { title: '调拨单号', dataIndex: 'transfer_no', width: 140 },
          { title: '物料', dataIndex: 'material_name', width: 100 },
          { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
          { title: '单位', dataIndex: 'unit', width: 50 },
          { title: '来源库位', dataIndex: 'from_location_code', width: 110, render: v => <Tag color="red">{v}</Tag> },
          { title: '目标库位', dataIndex: 'to_location_code', width: 110, render: v => <Tag color="green">{v}</Tag> },
          { title: '状态', dataIndex: 'status', width: 80, render: v => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label || v}</Tag> },
          { title: '申请人', dataIndex: 'requested_by', width: 80 },
          { title: '审批人', dataIndex: 'approved_by', width: 80 },
          { title: '创建时间', dataIndex: 'created_at', width: 140, render: v => new Date(v).toLocaleString('zh-CN') },
          {
            title: '操作', width: 150,
            render: (_, r) => (
              <Space size={4}>
                {r.status === 'pending' && (
                  <>
                    <Button size="small" type="primary" icon={<SwapOutlined />} onClick={() => handleApprove(r.id)}>执行</Button>
                    <Button size="small" danger onClick={() => handleCancel(r.id)}>取消</Button>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="创建调拨单" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate} confirmLoading={submitting}>
        <Form form={form} layout="vertical">
          <Form.Item name="material_id" label="物料" rules={[{ required: true }]}>
            <Select showSearch placeholder="搜索物料" optionFilterProp="label"
              options={materials.map(m => ({ label: `${m.code} ${m.name}`, value: m.id }))} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="from_location_code" label="来源库位" rules={[{ required: true }]}>
                <Input placeholder="如 A1-01-1-1" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="to_location_code" label="目标库位" rules={[{ required: true }]}>
                <Input placeholder="如 B1-02-2-3" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="requested_by" label="申请人">
                <Input placeholder="操作人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ==================== 6. 盘点管理面板 ====================
function CheckPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState([]);
  const [zoneMap, setZoneMap] = useState({});       // zone_id → label 映射，用于自动生成标题
  const [checkDate, setCheckDate] = useState(dayjs());   // 盘点日期，默认当日

  // 盘点明细编辑状态：{ [detailId]: { actualQty, reason } }
  const [editValues, setEditValues] = useState({});

  const fetchTasks = async () => {
    setLoading(true);
    const res = await api.get('/inventory/check-tasks', { pageSize: 50 });
    if (res.success) setTasks(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  // 打开创建弹窗时加载仓库小分区列表
  const openCreateModal = async () => {
    setCreateOpen(true);
    setCheckDate(dayjs());
    form.resetFields();
    try {
      const res = await api.get('/warehouse/zones');
      if (res.success) {
        const subZones = [];
        const map = {};
        for (const zone of res.data) {
          if (zone.children && zone.children.length > 0) {
            for (const child of zone.children) {
              const label = `${zone.code}区-${child.code} ${child.name}`;
              subZones.push({ value: child.id, label });
              map[child.id] = label;
            }
          }
        }
        setZones(subZones);
        setZoneMap(map);
      }
    } catch (e) {
      // 忽略加载失败
    }
  };

  // 根据日期+区域生成标题
  const generateTitle = (date, zoneId) => {
    if (!zoneId) return '';
    const d = date || dayjs();
    return `${d.year()}年${d.month() + 1}月${d.date()}日 ${zoneMap[zoneId] || ''}盘点`;
  };

  // 选择盘点区域后自动生成任务名称
  const handleZoneChange = (zoneId) => {
    form.setFieldsValue({ title: generateTitle(checkDate, zoneId) });
  };

  // 日期变更时重新生成标题
  const handleDateChange = (d) => {
    setCheckDate(d || dayjs());
    const zoneId = form.getFieldValue('zone_id');
    form.setFieldsValue({ title: generateTitle(d, zoneId) });
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    const res = await api.post('/inventory/check-tasks', values);
    if (res.success) {
      message.success(`盘点任务 ${res.data.task_no} 已创建`);
      setCreateOpen(false);
      form.resetFields();
      fetchTasks();
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  const handleViewDetail = async (task) => {
    const res = await api.get(`/inventory/check-tasks/${task.id}`);
    if (res.success) {
      setSelectedTask(res.data);
      // 初始化编辑值：系统数量为默认实盘数量
      const initial = {};
      (res.data.details || []).forEach(d => {
        initial[d.id] = {
          actualQty: d.actual_quantity ?? d.system_quantity,
          reason: d.reason || '',
        };
      });
      setEditValues(initial);
      setDetailOpen(true);
    }
  };

  const updateEditValue = (detailId, field, value) => {
    setEditValues(prev => ({
      ...prev,
      [detailId]: { ...(prev[detailId] || {}), [field]: value },
    }));
  };

  const handleSubmitCheck = async () => {
    if (!selectedTask) return;
    const checkedBy = prompt('请输入盘点人姓名：');
    if (!checkedBy) return;

    const details = (selectedTask.details || []).map(d => {
      const ev = editValues[d.id] || {};
      const actualQty = parseFloat(ev.actualQty) ?? parseFloat(d.system_quantity);
      return {
        id: d.id,
        material_id: d.material_id,
        location_id: d.location_id,
        system_quantity: d.system_quantity,
        actual_quantity: actualQty,
        reason: ev.reason || '',
      };
    });

    setSubmitting(true);
    const res = await api.post(`/inventory/check-tasks/${selectedTask.id}/submit`, {
      checked_by: checkedBy,
      details,
    });
    if (res.success) {
      message.success('盘点结果已提交');
      setDetailOpen(false);
      fetchTasks();
    } else {
      message.error(res.message);
    }
    setSubmitting(false);
  };

  const handleApprove = async (taskId) => {
    const name = prompt('请输入审批人姓名：');
    if (!name) return;
    const res = await api.put(`/inventory/check-tasks/${taskId}/approve`, { approved_by: name });
    if (res.success) { message.success(`已审批，调整了 ${res.data.adjustedCount} 项差异`); fetchTasks(); }
    else message.error(res.message);
  };

  const statusMap = {
    pending: { color: 'default', label: '待盘点' },
    in_progress: { color: 'blue', label: '盘点中' },
    submitted: { color: 'orange', label: '已提交' },
    approved: { color: 'green', label: '已审批' },
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>创建盘点任务</Button>
        <Button icon={<ReloadOutlined />} onClick={fetchTasks}>刷新</Button>
      </Space>
      <Table rowKey="id" size="small" dataSource={tasks} loading={loading} pagination={{ pageSize: 20 }}
        columns={[
          { title: '任务单号', dataIndex: 'task_no', width: 130 },
          { title: '任务名称', dataIndex: 'title', width: 150 },
          { title: '盘点区域', dataIndex: 'zone_name', width: 100 },
          { title: '明细数', dataIndex: 'detail_count', width: 60, align: 'right' },
          { title: '状态', dataIndex: 'status', width: 80, render: v => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label || v}</Tag> },
          { title: '盘点人', dataIndex: 'checked_by', width: 80 },
          { title: '创建时间', dataIndex: 'created_at', width: 140, render: v => new Date(v).toLocaleString('zh-CN') },
          {
            title: '操作', width: 180,
            render: (_, r) => (
              <Space size={4}>
                <Button size="small" onClick={() => handleViewDetail(r)}>详情</Button>
                {r.status === 'submitted' && (
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(r.id)}>审批</Button>
                )}
                {r.status === 'pending' && (
                  <Popconfirm title="确认删除?" onConfirm={async () => { await api.del(`/inventory/check-tasks/${r.id}`); fetchTasks(); }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="创建盘点任务" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate} confirmLoading={submitting}>
        <Form form={form} layout="vertical">
          <Form.Item name="check_date" label="盘点日期">
            <DatePicker
              value={checkDate}
              onChange={handleDateChange}
              style={{ width: '100%' }}
              placeholder="选择盘点日期"
            />
          </Form.Item>
          <Form.Item name="title" label="任务名称（选择区域后自动生成）" rules={[{ required: true }]}>
            <Input placeholder="选择盘点区域和日期后自动生成" />
          </Form.Item>
          <Form.Item name="zone_id" label="盘点区域（选择后自动生成明细）">
            <Select
              allowClear
              showSearch
              placeholder="选择仓库小分区"
              optionFilterProp="label"
              options={zones}
              onChange={handleZoneChange}
            />
          </Form.Item>
          <Form.Item name="created_by" label="创建人">
            <Input placeholder="操作人姓名" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`盘点详情 — ${selectedTask?.title || ''} (${selectedTask?.task_no || ''})`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={800}
        footer={
          <Space>
            <Button onClick={() => setDetailOpen(false)}>关闭</Button>
            {selectedTask?.status !== 'approved' && (
              <Button type="primary" loading={submitting} onClick={handleSubmitCheck}>提交盘点结果</Button>
            )}
          </Space>
        }
      >
        {selectedTask?.details && selectedTask.details.length > 0 ? (
          <Table rowKey="id" size="small" dataSource={selectedTask.details} pagination={{ pageSize: 50 }}
            columns={[
              { title: '库位', dataIndex: 'location_code', width: 110, render: v => v ? <Tag>{v}</Tag> : '-' },
              { title: '物料编码', dataIndex: 'material_code', width: 110 },
              { title: '物料名称', dataIndex: 'material_name', width: 100 },
              { title: '系统数量', dataIndex: 'system_quantity', width: 85, align: 'right' },
              {
                title: '实盘数量', width: 100,
                render: (_, r) => {
                  const ev = editValues[r.id] || {};
                  return (
                    <InputNumber
                      size="small"
                      min={0}
                      value={ev.actualQty}
                      onChange={v => updateEditValue(r.id, 'actualQty', v)}
                      style={{ width: 80 }}
                    />
                  );
                },
              },
              {
                title: '差异', width: 75, align: 'right',
                render: (_, r) => {
                  const ev = editValues[r.id] || {};
                  const actual = parseFloat(ev.actualQty) ?? parseFloat(r.system_quantity);
                  const diff = actual - parseFloat(r.system_quantity);
                  return (
                    <span style={{ fontWeight: 600, color: diff === 0 ? '#52c41a' : diff > 0 ? '#1890ff' : '#ff4d4f' }}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                    </span>
                  );
                },
              },
              {
                title: '原因说明', width: 180,
                render: (_, r) => {
                  const ev = editValues[r.id] || {};
                  return (
                    <Input
                      size="small"
                      value={ev.reason}
                      onChange={e => updateEditValue(r.id, 'reason', e.target.value)}
                      placeholder={Math.abs((parseFloat(ev.actualQty) ?? parseFloat(r.system_quantity)) - parseFloat(r.system_quantity)) > 0.001 ? '请说明差异原因' : ''}
                    />
                  );
                },
              },
            ]}
          />
        ) : (
          <Empty description="该任务暂无盘点明细，请创建任务时选择盘点区域以自动生成" />
        )}
      </Modal>
    </>
  );
}

// ==================== 7. AI查询 & 操作日志面板 ====================
function AIAndLogsPanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const exampleQueries = [
    'A1-01排最近3天的操作日志',
    '铜版纸的库存有没有异常',
    '今天入库了哪些物料',
    'B2-01柜最近一周的出入记录',
    '白卡纸有没有多了或少了',
  ];

  const handleQuery = async (q) => {
    const qText = q || query;
    if (!qText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.get('/warehouse/query', { q: qText });
      if (res.success) {
        setResult(res.data);
        setHistory(prev => [{ q: qText, time: new Date() }, ...prev].slice(0, 10));
      }
    } catch (e) { message.error('查询失败'); }
    setLoading(false);
  };

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    const res = await api.get('/warehouse/logs', { type: typeFilter, pageSize: 50 });
    if (res.success) setLogs(res.data);
    setLogsLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const typeTag = (type) => {
    const m = {
      inbound: { color: 'green', label: '入库' }, outbound: { color: 'blue', label: '出库' },
      restock: { color: 'cyan', label: '回库' }, manual_inbound: { color: 'lime', label: '手动入库' },
      move: { color: 'orange', label: '移库' }, check: { color: 'purple', label: '盘点' },
    };
    const t = m[type] || { color: 'default', label: type };
    return <Tag color={t.color}>{t.label}</Tag>;
  };

  return (
    <Row gutter={16}>
      {/* 左侧：AI查询 */}
      <Col span={8}>
        <Card title="🤖 智能查询" size="small">
          <Input.TextArea value={query} onChange={e => setQuery(e.target.value)}
            placeholder="用自然语言描述你想查的内容…&#10;例如：A1-01排最近3天有没有异常" rows={4}
            onPressEnter={e => { e.preventDefault(); handleQuery(); }}
          />
          <Button type="primary" block icon={<SearchOutlined />} loading={loading}
            onClick={() => handleQuery()} style={{ marginTop: 8 }}>查询</Button>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>💡 试试这些：</div>
            {exampleQueries.map((eq, i) => (
              <Tag key={i} style={{ cursor: 'pointer', marginBottom: 6 }}
                onClick={() => { setQuery(eq); handleQuery(eq); }}>{eq}</Tag>
            ))}
          </div>
          {history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>📋 历史查询</div>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 12, cursor: 'pointer', color: '#1890ff', marginBottom: 2 }}
                  onClick={() => { setQuery(h.q); handleQuery(h.q); }}>{h.q}</div>
              ))}
            </div>
          )}
        </Card>
      </Col>

      {/* 右侧：查询结果 + 操作日志 */}
      <Col span={16}>
        {result && (
          <>
            <Alert message="📊 查询摘要" description={result.summary} type="info" showIcon style={{ marginBottom: 12 }} />
            {result.analysis && result.analysis.length > 0 && (
              <Card size="small" title="🔍 异常分析" style={{ marginBottom: 12, borderColor: result.analysis.some(a=>a.startsWith('⚠️')) ? '#ff4d4f' : '#52c41a' }}>
                {result.analysis.map((a, i) => (
                  <Alert key={i} message={a} type={a.startsWith('⚠️') ? 'warning' : a.startsWith('✅') ? 'success' : 'info'} showIcon style={{ marginBottom: 4 }} />
                ))}
              </Card>
            )}
            {result.stockData && (
              <Card size="small" title="📦 库存快照" style={{ marginBottom: 12 }}>
                <Table rowKey="code" size="small" dataSource={result.stockData} pagination={false}
                  columns={[
                    { title: '编码', dataIndex: 'code' }, { title: '物料', dataIndex: 'name' },
                    { title: '当前库存', dataIndex: 'current_stock', align: 'right' },
                    { title: '安全库存', dataIndex: 'safety_stock', align: 'right' },
                    { title: '单位', dataIndex: 'unit' },
                    { title: '状态', render: (_, r) => parseFloat(r.current_stock) <= parseFloat(r.safety_stock) ? <Tag color="red">低于安全线</Tag> : <Tag color="green">正常</Tag> },
                  ]}
                />
              </Card>
            )}
            {result.data && result.data.length > 0 && (
              <Card size="small" title={`📋 查询结果（${result.data.length}条）`}>
                <Table rowKey="id" size="small" dataSource={result.data} pagination={{ pageSize: 15 }}
                  columns={[
                    { title: '时间', dataIndex: 'created_at', width: 150, render: v => new Date(v).toLocaleString('zh-CN') },
                    { title: '类型', dataIndex: 'type', width: 90, render: v => typeTag(v) },
                    { title: '物料', dataIndex: 'material_name', width: 110 },
                    { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
                    { title: '库位', dataIndex: 'location_code', width: 110, render: v => v ? <Tag>{v}</Tag> : '-' },
                    { title: '操作人', dataIndex: 'operator_name', width: 80 },
                    { title: '备注', dataIndex: 'remark', ellipsis: true },
                  ]}
                />
              </Card>
            )}
            {(!result.data || result.data.length === 0) && !result.stockData && <Empty description="未找到匹配结果" />}
          </>
        )}

        {/* 操作日志（无查询时显示） */}
        {!result && (
          <Card size="small" title="📋 操作日志">
            <Space style={{ marginBottom: 12 }}>
              <Select value={typeFilter} onChange={setTypeFilter} allowClear placeholder="操作类型" style={{ width: 120 }}
                options={[{ label: '全部', value: '' }, { label: '入库', value: 'inbound' }, { label: '出库', value: 'outbound' }]}
              />
              <Button icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</Button>
            </Space>
            <Table rowKey="id" size="small" dataSource={logs} loading={logsLoading} pagination={{ pageSize: 20 }}
              columns={[
                { title: '时间', dataIndex: 'created_at', width: 150, render: v => new Date(v).toLocaleString('zh-CN') },
                { title: '操作', dataIndex: 'type', width: 80, render: v => typeTag(v) },
                { title: '物料', dataIndex: 'material_name', width: 100 },
                { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
                { title: '库位', dataIndex: 'location_code', width: 120, render: v => v ? <Tag>{v}</Tag> : '-' },
                { title: '操作人', dataIndex: 'operator_name', width: 80 },
                { title: '来源', dataIndex: 'source_type', width: 70, render: v => v === 'miniapp' ? <Tag color="green">小程序</Tag> : <Tag>Web</Tag> },
                { title: '备注', dataIndex: 'remark', ellipsis: true },
              ]}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}
