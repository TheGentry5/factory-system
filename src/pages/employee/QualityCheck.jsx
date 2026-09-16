import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal, Form, message,
  Row, Col, Descriptions, Badge, Tabs, Divider,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExperimentOutlined, EyeOutlined,
  FormOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import api from '../../utils/api';

const STATUS_COLOR = {
  pending_inspection: 'processing',
  inspecting: 'warning',
  passed: 'success',
  failed: 'error',
};

export default function QualityCheck() {
  const [activeTab, setActiveTab] = useState('pending');

  const tabs = [
    { key: 'pending', label: '待检任务' },
    { key: 'history', label: '我的检验历史' },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />质量检验
      </h3>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs.map(t => ({
        key: t.key,
        label: t.label,
        children: t.key === 'pending' ? <PendingTab /> : <MyHistoryTab />,
      }))} />
    </div>
  );
}

// ==================== 待检任务 ====================
function PendingTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectRecord, setInspectRecord] = useState(null);
  const [standards, setStandards] = useState([]);
  const [form] = Form.useForm();
  const [inspectorName, setInspectorName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = { status: 'pending_inspection', pageSize: 100 };
    if (keyword) params.keyword = keyword;
    const res = await api.get('/staging', params);
    if (res.success) setData(res.data);
    setLoading(false);
  }, [keyword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInspect = async (record) => {
    setInspectRecord(record);
    // 获取完整详情（含检验标准）
    const res = await api.get(`/staging/${record.id}`);
    if (res.success) {
      setInspectRecord(res.data);
      setStandards(res.data.standards || []);
      // 根据标准生成检验明细表单
      const detailFields = {};
      (res.data.standards || []).forEach((s, i) => {
        detailFields[`item_${i}_value`] = '';
        detailFields[`item_${i}_remark`] = '';
      });
      form.resetFields();
      form.setFieldsValue({ inspector: inspectorName || '', ...detailFields });
    }
    setInspectOpen(true);
  };

  const doInspect = async () => {
    const values = await form.validateFields();
    setInspectorName(values.inspector);

    // 收集检验明细
    const details = standards.map((s, i) => {
      const actualValue = values[`item_${i}_value`];
      let result = 'na';
      if (actualValue !== undefined && actualValue !== '') {
        // 简单判定：如果填写了值，和标准值比较
        if (s.standard_value) {
          const stdVal = parseFloat(s.standard_value);
          const actVal = parseFloat(actualValue);
          const upper = parseFloat(s.tolerance_upper) || 0;
          const lower = parseFloat(s.tolerance_lower) || 0;
          if (!isNaN(stdVal) && !isNaN(actVal)) {
            result = (actVal >= stdVal + lower && actVal <= stdVal + upper) ? 'pass' : 'fail';
          } else {
            result = actualValue === s.standard_value ? 'pass' : 'fail';
          }
        } else {
          result = 'pass'; // 无标准值时默认通过
        }
      }
      return {
        standard_id: s.id,
        inspection_item: s.inspection_item,
        standard_value: s.standard_value,
        actual_value: actualValue || null,
        result,
        remark: values[`item_${i}_remark`] || null,
        is_required: s.is_required,
      };
    });

    // 判定整体结论：任何项不通过即为不合格
    const hasFail = details.some(d => d.result === 'fail');
    const inspect_result = hasFail ? 'fail' : 'pass';

    const res = await api.post(`/staging/${inspectRecord.id}/inspect`, {
      inspector: values.inspector,
      inspect_result,
      inspect_remark: values.inspect_remark,
      details,
    });

    if (res.success) {
      message.success(inspect_result === 'pass' ? '检验通过！物料可入库' : '检验不通过，物料滞留暂存区等待处置');
      setInspectOpen(false);
      fetchData();
    } else {
      message.error(res.message);
    }
  };

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '采购单号', dataIndex: 'po_no', width: 150, render: v => v || '-' },
    { title: '物料', dataIndex: 'material_name', width: 120,
      render: (text, r) => <Space size={4}>{text}<Tag>{r.material_code}</Tag></Space>,
    },
    { title: '供应商', dataIndex: 'supplier_name', width: 100, render: v => v || '-' },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '批次', dataIndex: 'batch_no', width: 90, render: v => v || '-' },
    { title: '暂存区域', dataIndex: 'storage_area', width: 100, render: v => v || '-' },
    { title: '到货日期', dataIndex: 'arrival_date', width: 100, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button type="primary" size="small" icon={<FormOutlined />} onClick={() => handleInspect(r)}>
          执行检验
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索单号/物料/批次…"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={fetchData}
            style={{ width: 260 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条待检` }}
      />

      {/* 执行检验弹窗 */}
      <Modal
        title={`执行检验 — ${inspectRecord?.staging_no || ''}`}
        open={inspectOpen}
        onOk={doInspect}
        onCancel={() => setInspectOpen(false)}
        width={700}
        okText="提交检验结果"
      >
        {inspectRecord && (
          <>
            <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物料">{inspectRecord.material_name} ({inspectRecord.material_code})</Descriptions.Item>
              <Descriptions.Item label="数量">{inspectRecord.quantity}</Descriptions.Item>
              <Descriptions.Item label="批次">{inspectRecord.batch_no || '-'}</Descriptions.Item>
            </Descriptions>

            <Form form={form} layout="vertical">
              <Form.Item name="inspector" label="质检员" rules={[{ required: true, message: '请输入质检员姓名' }]}>
                <Input placeholder="签入姓名" />
              </Form.Item>

              {standards.length > 0 && (
                <>
                  <Divider>检验项目明细</Divider>
                  {standards.map((s, i) => (
                    <Row gutter={12} key={s.id} style={{ marginBottom: 8 }}>
                      <Col span={6}>
                        <Form.Item label="检验项目" style={{ marginBottom: 0 }}>
                          <Input value={s.inspection_item} disabled size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item label="标准值" style={{ marginBottom: 0 }}>
                          <Input value={`${s.standard_value || '-'} ${s.tolerance_upper ? `(+${s.tolerance_upper})` : ''}${s.tolerance_lower ? `(${s.tolerance_lower})` : ''}`} disabled size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name={`item_${i}_value`} label="实测值" style={{ marginBottom: 0 }}>
                          <Input placeholder="填入实测数据" size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item label="方法" style={{ marginBottom: 0 }}>
                          <Input value={s.test_method || '-'} disabled size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item name={`item_${i}_remark`} label="备注" style={{ marginBottom: 0 }}>
                          <Input placeholder="备注" size="small" />
                        </Form.Item>
                      </Col>
                    </Row>
                  ))}
                </>
              )}

              {standards.length === 0 && (
                <div style={{ textAlign: 'center', color: '#faad14', padding: 16, marginBottom: 16, background: '#fffbe6', borderRadius: 6 }}>
                  该物料尚未配置检验标准，将直接判定检验结果
                </div>
              )}

              <Form.Item name="inspect_remark" label="整体备注">
                <Input.TextArea rows={2} placeholder="检验总结说明…" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}

// ==================== 我的检验历史 ====================
function MyHistoryTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inspectorName, setInspectorName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/staging', { pageSize: 200 });
    if (res.success) {
      const mine = inspectorName
        ? res.data.filter(r => r.inspector === inspectorName && r.inspect_result !== 'pending')
        : res.data.filter(r => r.inspect_result !== 'pending');
      setData(mine);
    }
    setLoading(false);
  }, [inspectorName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { title: '暂存单号', dataIndex: 'staging_no', width: 160 },
    { title: '物料', dataIndex: 'material_name', width: 120,
      render: (text, r) => <Space size={4}>{text}<Tag>{r.material_code}</Tag></Space>,
    },
    { title: '数量', dataIndex: 'quantity', width: 80 },
    { title: '检验结果', dataIndex: 'inspect_result', width: 90,
      render: v => v === 'pass' ? <Tag color="green">合格</Tag> : v === 'fail' ? <Tag color="red">不合格</Tag> : v === 'partial' ? <Tag color="orange">部分</Tag> : '-',
    },
    { title: '检验时间', dataIndex: 'inspect_date', width: 160,
      render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    { title: '备注', dataIndex: 'inspect_remark', width: 150, ellipsis: true },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="输入质检员姓名筛选…"
            value={inspectorName}
            onChange={e => setInspectorName(e.target.value)}
            onSearch={fetchData}
            style={{ width: 220 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </Card>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
        scroll={{ x: 800 }}
        pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条记录` }}
      />
    </>
  );
}
