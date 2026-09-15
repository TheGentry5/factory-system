import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Tabs, message, Modal, Select, Input, InputNumber, Descriptions,
         Row, Col, Badge, Tooltip, Statistic, Empty, Alert, Form } from 'antd';
import {
  EnvironmentOutlined, InboxOutlined, SearchOutlined, ReloadOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, HistoryOutlined,
  CheckCircleOutlined, HomeOutlined, EditOutlined,
} from '@ant-design/icons';

const api = {
  get: (url, params) => fetch(`/api${url}?` + new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  )).then(r => r.json()),
  post: (url, data) => fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
};

// ==================== 仓库管理主页 ====================
export default function Warehouse() {
  const [activeTab, setActiveTab] = useState('map');
  const [zones, setZones] = useState([]);
  const [locations, setLocations] = useState([]);
  const [expandedZone, setExpandedZone] = useState(null);       // 展开的大区
  const [selectedSubZone, setSelectedSubZone] = useState(null);  // 选中的小分区
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchZones = async () => {
    const res = await api.get('/warehouse/zones');
    if (res.success) setZones(res.data);
  };

  useEffect(() => { fetchZones(); }, []);

  // 展开大区 → 不加载库位，仅展示子分区卡片
  const toggleZone = (zone) => {
    setExpandedZone(expandedZone?.id === zone.id ? null : zone);
    setSelectedSubZone(null);
    setLocations([]);
  };

  // 点击小分区 → 加载库位网格
  const handleSubZoneClick = async (child) => {
    setSelectedSubZone(child);
    const res = await api.get('/warehouse/locations', { zone_code: child.code });
    if (res.success) setLocations(res.data);
  };

  // 点击库位
  const handleLocationClick = async (loc) => {
    const res = await api.get(`/warehouse/locations/${loc.code}`);
    if (res.success) { setSelectedLocation(res.data); setDetailOpen(true); }
  };

  // 库位状态颜色
  const statusColor = { available: '#52c41a', partial: '#faad14', full: '#ff4d4f', maintenance: '#d9d9d9' };
  const statusLabel = { available: '空闲', partial: '部分占用', full: '已满', maintenance: '维护中' };

  // 按 shelf_no 分组库位（同一排/柜/架归到一起）
  const groupedLocations = locations.reduce((acc, loc) => {
    const key = loc.code.split('-').slice(0, -2).join('-'); // A1-01, A1-02...
    if (!acc[key]) acc[key] = [];
    acc[key].push(loc);
    return acc;
  }, {});

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'map', label: '仓库总览', icon: <HomeOutlined /> },
        { key: 'retrieve', label: '领料出库', icon: <ArrowUpOutlined /> },
        { key: 'restock', label: '回库登记', icon: <ArrowDownOutlined /> },
        { key: 'ai_query', label: 'AI 智能查询', icon: <SearchOutlined /> },
        { key: 'logs', label: '操作日志', icon: <HistoryOutlined /> },
      ]} />

      {activeTab === 'map' && (
        <Row gutter={16}>
          {/* 左侧：大区列表 → 展开后显示小分区 */}
          <Col span={7}>
            <Card title="仓库区域" size="small">
              {zones.map(zone => {
                const isExpanded = expandedZone?.id === zone.id;
                const zoneColors = { A: '#1890ff', B: '#fa8c16', C: '#722ed1', D: '#52c41a' };
                const zoneColor = zoneColors[zone.code] || '#666';
                return (
                  <div key={zone.id} style={{ marginBottom: 6 }}>
                    {/* 大区卡片 */}
                    <Card
                      size="small"
                      hoverable
                      style={{
                        borderLeft: `4px solid ${zoneColor}`,
                        background: isExpanded ? '#fafafa' : '#fff',
                      }}
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

                    {/* 展开的子分区列表 */}
                    {isExpanded && zone.children && (
                      <div style={{ marginLeft: 12, marginTop: 4, borderLeft: `2px dashed ${zoneColor}33`, paddingLeft: 10 }}>
                        {zone.children.map(child => {
                          const isSelected = selectedSubZone?.id === child.id;
                          return (
                            <Card
                              key={child.id}
                              size="small"
                              hoverable
                              style={{
                                marginBottom: 3,
                                borderLeft: `3px solid ${isSelected ? zoneColor : '#d9d9d9'}`,
                                background: isSelected ? `${zoneColor}10` : '#fff',
                              }}
                              onClick={(e) => { e.stopPropagation(); handleSubZoneClick(child); }}
                            >
                              <div style={{ fontSize: 13 }}>
                                <strong>{child.code}</strong> {child.name}
                              </div>
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

          {/* 右侧：库位展示 */}
          <Col span={17}>
            <Card
              title={selectedSubZone ? `${selectedSubZone.code} - ${selectedSubZone.name}` : expandedZone ? `${expandedZone.code}区 - 请点击小分区查看库位` : '选择一个区域'}
              size="small"
              extra={
                selectedSubZone && (
                  <Space>
                    <Badge color="green" text={`${locations.filter(l => l.status === 'available').length}空`} />
                    <Badge color="orange" text={`${locations.filter(l => l.status === 'partial').length}用`} />
                    <Badge color="red" text={`${locations.filter(l => l.status === 'full').length}满`} />
                    <Tag>{locations.length}个位</Tag>
                  </Space>
                )
              }
            >
              {selectedSubZone ? (
                <div>
                  {Object.entries(groupedLocations).map(([shelfName, locs]) => {
                    const shelfType = locs[0].shelf_type;
                    const typeLabel = shelfType === 'row' ? '排' : shelfType === 'cabinet' ? '柜' : '架';
                    return (
                      <Card
                        key={shelfName}
                        size="small"
                        title={
                          <Space>
                            <EnvironmentOutlined />
                            <span>{shelfName.split('-').slice(-1)[0]}{typeLabel}</span>
                            <Tag>{locs.length}位</Tag>
                          </Space>
                        }
                        style={{ marginBottom: 12 }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(...locs.map(l => parseInt(l.position_no)))}, 1fr)`, gap: 8 }}>
                          {/* 按层分行 */}
                          {Array.from({ length: Math.max(...locs.map(l => parseInt(l.level_no))) }, (_, li) => {
                            const level = li + 1;
                            const levelLocs = locs.filter(l => parseInt(l.level_no) === level);
                            return (
                              <div key={level} style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
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
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Empty description={expandedZone ? '点击左侧小分区查看库位详情' : '点击左侧大区展开，再选择小分区'} />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {activeTab === 'retrieve' && <RetrievePanel />}
      {activeTab === 'restock' && <RestockPanel />}
      {activeTab === 'ai_query' && <AIQueryPanel />}
      {activeTab === 'logs' && <LogsPanel />}

      {/* 库位详情弹窗 */}
      <Modal
        title={`库位详情 — ${selectedLocation?.code || ''}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
      >
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
              <Descriptions.Item label="容量">
                {selectedLocation.used_capacity} / {selectedLocation.capacity}
              </Descriptions.Item>
              <Descriptions.Item label="推荐优先级">{selectedLocation.priority}</Descriptions.Item>
            </Descriptions>

            {(selectedLocation.items && selectedLocation.items.length > 0) ? (
              <Table
                rowKey="id"
                size="small"
                dataSource={selectedLocation.items}
                pagination={false}
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
            ) : (
              <Empty description="该库位暂无物料存放" />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

// ==================== 领料出库面板 ====================
function RetrievePanel() {
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [retrieveQty, setRetrieveQty] = useState({});
  const [operatorName, setOperatorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const handleRetrieve = async (item) => {
    const qty = parseFloat(retrieveQty[item.id]) || 0;
    if (qty <= 0) { message.warning('请输入取出数量'); return; }
    if (qty > parseFloat(item.quantity)) { message.warning('数量超过该库位存量'); return; }
    if (!operatorName.trim()) { message.warning('请输入领料人'); return; }

    setSubmitting(true);
    const res = await api.post('/warehouse/retrieve', {
      material_id: selectedMaterial.id,
      location_code: item.location_code,
      quantity: qty,
      operator_name: operatorName,
    });
    if (res.success) {
      message.success(`已从 ${item.location_code} 取出 ${qty} ${selectedMaterial.unit}`);
      setRetrieveQty({});
      handleMaterialSelect(selectedMaterial.id);
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
        <Card title={`库位分布 — ${selectedMaterial?.name || '请选择物料'}`} size="small">
          {inventory.length === 0 ? (
            <Empty description="未选择物料或该物料无库位记录" />
          ) : (
            <Table
              rowKey="id"
              size="small"
              dataSource={inventory}
              pagination={false}
              columns={[
                { title: '库位', dataIndex: 'location_code', width: 120, render: v => <Tag color="blue">{v}</Tag> },
                { title: '区域', dataIndex: 'zone_name', width: 100 },
                { title: '存量', dataIndex: 'quantity', width: 70, align: 'right' },
                { title: '批次', dataIndex: 'batch_no' },
                { title: '入库单', dataIndex: 'inbound_no' },
                { title: '存放时间', dataIndex: 'stored_at', width: 100, render: v => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
                {
                  title: '取出', width: 150,
                  render: (_, r) => (
                    <Space size={4}>
                      <InputNumber
                        size="small"
                        min={0}
                        max={parseFloat(r.quantity)}
                        placeholder="数量"
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

// ==================== 回库登记面板 ====================
function RestockPanel() {
  const [mode, setMode] = useState('restock'); // restock | piggyback | manual
  const [materials, setMaterials] = useState([]);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [step, setStep] = useState(1); // 1=填信息 2=选库位

  useEffect(() => {
    api.get('/materials', { pageSize: 100 }).then(r => r.success && setMaterials(r.data));
  }, []);

  const handleNext = async () => {
    const values = await form.validateFields();
    const matId = values.material_id;
    const qty = values.quantity;
    // 推荐库位
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
    restock: {
      title: '剩余物料回库（扫原码）',
      desc: '生产剩余/未用完的物料，扫描原入库单二维码 → 确认数量 → 免检入库',
      requireOriginalNo: true,
      noInspection: true,
    },
    piggyback: {
      title: '极小量蹭码入库',
      desc: '数量极少时，扫描同品种其他物料的二维码 → 确认数量 → 必须确认操作人身份',
      requirePiggybackNo: true,
      requireIdentity: true,
    },
    manual: {
      title: '小批量手动入库（无QR）',
      desc: '极少采购量或紧急到货，手动填写信息直接入库，需填写当值人员',
      requireDuty: true,
    },
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
                  <Col span={12}>
                    <Form.Item name="batch_no" label="批次号"><Input placeholder="可选" /></Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="duty_personnel" label="当值人员" rules={[{ required: true }]}>
                      <Input placeholder="入库当班人员" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="storage_area" label="归类区域"><Input placeholder="如A1区" /></Form.Item>
                  </Col>
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

            {step === 1 && (
              <Button type="primary" onClick={handleNext}>下一步：选择库位</Button>
            )}
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
                  <Button type="primary" loading={submitting} onClick={handleSubmit}>
                    确认存入
                  </Button>
                </Space>
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ==================== AI 智能查询面板 ====================
function AIQueryPanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const exampleQueries = [
    'A1-01排最近3天的操作日志',
    '铜版纸的库存有没有异常',
    '今天入库了哪些物料',
    'B2-01柜最近一周的出入记录',
    '白卡纸有没有多了或少了',
    'C1区的操作记录',
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
      <Col span={8}>
        <Card title="🤖 智能查询" size="small">
          <Input.TextArea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="用自然语言描述你想查的内容…&#10;例如：A1-01排最近3天有没有异常"
            rows={4}
            onPressEnter={e => { e.preventDefault(); handleQuery(); }}
          />
          <Button type="primary" block icon={<SearchOutlined />} loading={loading}
            onClick={() => handleQuery()} style={{ marginTop: 8 }}>
            查询
          </Button>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>💡 试试这些：</div>
            {exampleQueries.map((eq, i) => (
              <Tag key={i} style={{ cursor: 'pointer', marginBottom: 6 }}
                onClick={() => { setQuery(eq); handleQuery(eq); }}>
                {eq}
              </Tag>
            ))}
          </div>

          {history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>📋 历史查询</div>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 12, cursor: 'pointer', color: '#1890ff', marginBottom: 2 }}
                  onClick={() => { setQuery(h.q); handleQuery(h.q); }}>
                  {h.q}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Col>

      <Col span={16}>
        {loading && <Card loading size="small"><div style={{ height: 200 }} /></Card>}

        {result && (
          <>
            {/* 摘要 */}
            <Alert message="📊 查询摘要" description={result.summary} type="info" showIcon style={{ marginBottom: 12 }} />

            {/* 异常分析 */}
            {result.analysis && result.analysis.length > 0 && (
              <Card size="small" title="🔍 异常分析" style={{ marginBottom: 12, borderColor: result.analysis.some(a=>a.startsWith('⚠️')) ? '#ff4d4f' : '#52c41a' }}>
                {result.analysis.map((a, i) => (
                  <Alert key={i} message={a} type={a.startsWith('⚠️') ? 'warning' : a.startsWith('✅') ? 'success' : 'info'} showIcon style={{ marginBottom: 4 }} />
                ))}
              </Card>
            )}

            {/* 库存快照 */}
            {result.stockData && (
              <Card size="small" title="📦 库存快照" style={{ marginBottom: 12 }}>
                <Table rowKey="code" size="small" dataSource={result.stockData} pagination={false}
                  columns={[
                    { title: '编码', dataIndex: 'code' },
                    { title: '物料', dataIndex: 'name' },
                    { title: '当前库存', dataIndex: 'current_stock', align: 'right' },
                    { title: '安全库存', dataIndex: 'safety_stock', align: 'right' },
                    { title: '单位', dataIndex: 'unit' },
                    { title: '状态', render: (_, r) => parseFloat(r.current_stock) <= parseFloat(r.safety_stock) ? <Tag color="red">低于安全线</Tag> : <Tag color="green">正常</Tag> },
                  ]}
                />
              </Card>
            )}

            {/* 操作日志列表 */}
            {result.data && result.data.length > 0 && (
              <Card size="small" title={`📋 操作记录（${result.data.length}条）`}>
                <Table rowKey="id" size="small" dataSource={result.data} pagination={{ pageSize: 15, showTotal: t => `共${t}条` }}
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

            {(!result.data || result.data.length === 0) && !result.stockData && (
              <Empty description="未找到匹配结果，试试换个问法" />
            )}
          </>
        )}
      </Col>
    </Row>
  );
}

// ==================== 操作日志面板 ====================
function LogsPanel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/warehouse/logs', { type: typeFilter, pageSize: 50 });
    if (res.success) setData(res.data);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const typeMap = {
    inbound: { color: 'green', icon: <ArrowDownOutlined />, label: '入库' },
    outbound: { color: 'blue', icon: <ArrowUpOutlined />, label: '出库' },
    move: { color: 'orange', icon: <SwapOutlined />, label: '移库' },
    check: { color: 'purple', icon: <CheckCircleOutlined />, label: '盘点' },
  };

  const columns = [
    { title: '时间', dataIndex: 'created_at', width: 150, render: v => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', dataIndex: 'type', width: 80,
      render: v => { const m = typeMap[v] || {}; return <Tag color={m.color} icon={m.icon}>{m.label || v}</Tag>; },
    },
    { title: '物料', dataIndex: 'material_name', width: 100 },
    { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
    { title: '库位', dataIndex: 'location_code', width: 120, render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: '操作人', dataIndex: 'operator_name', width: 80 },
    { title: '来源', dataIndex: 'source_type', width: 70, render: v => v === 'miniapp' ? <Tag color="green">小程序</Tag> : <Tag>Web</Tag> },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          allowClear
          placeholder="操作类型"
          style={{ width: 120 }}
          options={[
            { label: '全部', value: '' },
            { label: '入库', value: 'inbound' },
            { label: '出库', value: 'outbound' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} size="small" />
    </>
  );
}
