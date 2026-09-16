import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal, Form, message,
  Row, Col, Descriptions, Badge, Tabs, InputNumber, DatePicker, Divider, Tooltip,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, InboxOutlined,
  EnvironmentOutlined, CheckCircleOutlined, ScanOutlined,
  ArrowRightOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import api from '../../utils/api';

const STATUS_MAP = {
  pending_inspection: { label: '待检验', color: 'processing' },
  passed: { label: '已合格', color: 'success' },
  partial_accepted: { label: '部分接收', color: 'warning' },
  stored: { label: '已入库', color: 'default' },
};

export default function MaterialInbound() {
  const [activeTab, setActiveTab] = useState('receive');

  const tabs = [
    { key: 'receive', label: '到货接收', icon: <ShoppingCartOutlined /> },
    { key: 'store', label: '待上架入库', icon: <InboxOutlined /> },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>
        <InboxOutlined style={{ marginRight: 8 }} />物料入库
      </h3>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs.map(t => ({
        key: t.key,
        label: <span>{t.icon} {t.label}</span>,
        children: t.key === 'receive' ? <ReceiveTab /> : <StoreTab />,
      }))} />
    </div>
  );
}

// ==================== Tab 1: 到货接收 ====================
function ReceiveTab() {
  const [pos, setPos] = useState([]);      // 采购单列表
  const [posLoading, setPosLoading] = useState(false);
  const [posKeyword, setPosKeyword] = useState('');
  const [materials, setMaterials] = useState([]);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState(null);
  const [receiveType, setReceiveType] = useState('po'); // po | manual
  const [form] = Form.useForm();

  // 获取已审批的采购单
  const fetchPOs = useCallback(async () => {
    setPosLoading(true);
    const res = await api.get('/purchase-orders', { status: 'approved', pageSize: 50 });
    if (res.success) {
      // 筛选已审批待收货的
      setPos(res.data.filter(po => po.status === 'approved'));
    }
    setPosLoading(false);
  }, []);

  useEffect(() => { fetchPOs(); }, [fetchPOs]);

  useEffect(() => {
    api.get('/materials', { pageSize: 200 }).then(r => {
      if (r.success) setMaterials(r.data || []);
    });
  }, []);

  const handleReceive = (record) => {
    setReceiveType('po');
    setReceiveRecord(record);
    form.resetFields();
    form.setFieldsValue({
      material_id: record.material_id,
      supplier_id: record.supplier_id,
      quantity: record.quantity,
      purchase_order_id: record.id,
      arrival_date: dayjs(),
    });
    setReceiveOpen(true);
  };

  const handleManualReceive = () => {
    setReceiveType('manual');
    setReceiveRecord(null);
    form.resetFields();
    form.setFieldsValue({ arrival_date: dayjs() });
    setReceiveOpen(true);
  };

  const doReceive = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      arrival_date: values.arrival_date ? values.arrival_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    };
    const res = await api.post('/staging', payload);
    if (res.success) {
      message.success(`物料已接收至暂存区，暂存单号: ${res.data.staging_no}`);
      setReceiveOpen(false);
      fetchPOs();
    } else {
      message.error(res.message);
    }
  };

  const poColumns = [
    { title: '采购单号', dataIndex: 'order_no', width: 160 },
    { title: '物料', dataIndex: 'material_name', width: 120,
      render: (text, r) => <Space size={4}>{text}<Tag>{r.material_code}</Tag></Space>,
    },
    { title: '供应商', dataIndex: 'supplier_name', width: 100, render: v => v || '-' },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '预计到货', dataIndex: 'expected_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '采购员', dataIndex: 'created_by', width: 80, render: v => v || '-' },
    { title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button type="primary" size="small" icon={<ArrowRightOutlined />} onClick={() => handleReceive(r)}>
          接收
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索采购单号/物料…"
            value={posKeyword}
            onChange={e => setPosKeyword(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={fetchPOs}>刷新</Button>
          <Button icon={<PlusOutlined />} onClick={handleManualReceive}>手动接收（无采购单）</Button>
        </Space>
        <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          显示已审批待收货的采购单。到货物料将先进入暂存区等待质检。
        </div>
      </Card>

      <Table rowKey="id" columns={poColumns}
        dataSource={pos.filter(po => !posKeyword ||
          po.order_no?.includes(posKeyword) ||
          po.material_name?.includes(posKeyword) ||
          po.material_code?.includes(posKeyword)
        )}
        loading={posLoading}
        scroll={{ x: 800 }}
        pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条待收货` }}
      />

      {/* 到货接收弹窗 */}
      <Modal
        title={receiveType === 'po' ? `到货接收 — ${receiveRecord?.order_no || ''}` : '手动接收（无采购单）'}
        open={receiveOpen}
        onOk={doReceive}
        onCancel={() => setReceiveOpen(false)}
        width={550}
        okText="确认接收至暂存区"
      >
        <Form form={form} layout="vertical">
          {receiveType === 'po' && (
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物料">{receiveRecord?.material_name}</Descriptions.Item>
              <Descriptions.Item label="供应商">{receiveRecord?.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="采购数量">{receiveRecord?.quantity}</Descriptions.Item>
              <Descriptions.Item label="预计到货">{receiveRecord?.expected_date ? dayjs(receiveRecord.expected_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            </Descriptions>
          )}

          <Form.Item name="purchase_order_id" hidden><Input /></Form.Item>

          {receiveType === 'manual' && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="material_id" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
                  <Select showSearch placeholder="选择物料" filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}
                    options={materials.map(m => ({ label: `${m.code} ${m.name}`, value: m.id }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="supplier_id" label="供应商">
                  <Input placeholder="供应商名称" />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="quantity" label="到货数量" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batch_no" label="批次号">
                <Input placeholder="如：B20260717" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="arrival_date" label="到货日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="duty_personnel" label="收货人员" rules={[{ required: true, message: '请填写收货人员' }]}>
                <Input placeholder="签收人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="storage_area" label="暂存区域">
                <Input placeholder="如：暂存区-A" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ==================== Tab 2: 待上架入库 ====================
function StoreTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeRecord, setStoreRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = { pageSize: 100, status: '' };
    if (keyword) params.keyword = keyword;
    // 获取已合格待入库的暂存记录
    const [passedRes, partialRes] = await Promise.all([
      api.get('/staging', { ...params, status: 'passed' }),
      api.get('/staging', { ...params, status: 'partial_accepted' }),
    ]);
    const all = [
      ...(passedRes.success ? passedRes.data : []),
      ...(partialRes.success ? partialRes.data : []),
    ].filter(r => r.status !== 'stored');
    if (keyword) {
      setData(all.filter(r =>
        r.staging_no?.includes(keyword) ||
        r.material_name?.includes(keyword) ||
        r.material_code?.includes(keyword)
      ));
    } else {
      setData(all);
    }
    setLoading(false);
  }, [keyword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 获取库位推荐
  const handleStore = async (record) => {
    setStoreRecord(record);
    form.resetFields();
    form.setFieldsValue({
      store_quantity: record.qualified_quantity || record.quantity,
    });
    // 获取库位推荐
    try {
      const res = await api.get('/warehouse/recommend', {
        material_id: record.material_id,
        quantity: record.qualified_quantity || record.quantity,
      });
      if (res.success && res.data.recommendations?.length > 0) {
        const rec = res.data.recommendations[0];
        form.setFieldsValue({
          location_code: rec.code,
          recommend_info: `${rec.zone_name || ''} ${rec.code} — ${rec.reason} (评分:${rec.score})`,
        });
      }
    } catch (e) { /* ignore */ }
    setStoreOpen(true);
  };

  const doStore = async () => {
    const values = await form.validateFields();
    const res = await api.post(`/staging/${storeRecord.id}/store`, {
      location_code: values.location_code,
      operator_name: values.operator_name,
      store_quantity: values.store_quantity,
    });
    if (res.success) {
      message.success(`入库完成！入库单号: ${res.data.record_no}，数量: ${res.data.quantity}`);
      setStoreOpen(false);
      fetchData();
    } else {
      message.error(res.message);
    }
  };

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '物料', dataIndex: 'material_name', width: 120,
      render: (text, r) => <Space size={4}>{text}<Tag>{r.material_code}</Tag></Space>,
    },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '合格数量', dataIndex: 'qualified_quantity', width: 80, render: v => v || '-' },
    { title: '批次', dataIndex: 'batch_no', width: 90, render: v => v || '-' },
    { title: '质检员', dataIndex: 'inspector', width: 80 },
    { title: '质检日期', dataIndex: 'inspect_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '状态', dataIndex: 'status', width: 90,
      render: v => <Badge status={STATUS_MAP[v]?.color || 'default'} text={STATUS_MAP[v]?.label || v} />,
    },
    { title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button type="primary" size="small" icon={<InboxOutlined />} onClick={() => handleStore(r)}>
          入库上架
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索暂存单号/物料…"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={fetchData}
            style={{ width: 260 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
        <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          显示已通过质检、等待入库上架的物料。系统会自动推荐最佳库位。
        </div>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条待上架` }}
      />

      {/* 入库上架弹窗 */}
      <Modal title="入库上架" open={storeOpen} onOk={doStore} onCancel={() => setStoreOpen(false)} width={500} okText="确认入库">
        <Form form={form} layout="vertical">
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="暂存单号">{storeRecord?.staging_no}</Descriptions.Item>
            <Descriptions.Item label="物料">{storeRecord?.material_name}</Descriptions.Item>
            <Descriptions.Item label="数量">{storeRecord?.quantity}</Descriptions.Item>
            <Descriptions.Item label="合格量">{storeRecord?.qualified_quantity || '-'}</Descriptions.Item>
          </Descriptions>

          {form.getFieldValue('recommend_info') && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
              💡 <strong>系统推荐库位：</strong>{form.getFieldValue('recommend_info')}
            </div>
          )}

          <Form.Item name="location_code" label="存放库位编码" rules={[{ required: true, message: '请输入库位编码' }]}>
            <Input placeholder="如：A1-01-1-1" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="store_quantity" label="入库数量">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="operator_name" label="操作人" rules={[{ required: true, message: '请填写操作人' }]}>
                <Input placeholder="仓管员姓名" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
