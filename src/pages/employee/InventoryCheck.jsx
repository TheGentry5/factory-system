import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, message, Modal, InputNumber, Input, Statistic, Row, Col, Empty, Tabs } from 'antd';
import { CheckCircleOutlined, EyeOutlined, ReloadOutlined, DashboardOutlined, OrderedListOutlined } from '@ant-design/icons';
import PermissionGuard from '../../components/PermissionGuard';

const api = {
  get: (url, params) => fetch(`/api${url}?` + new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  )).then(r => r.json()),
  post: (url, data) => fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
};

export default function InventoryCheck() {
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <PermissionGuard permKey="inventory_check">
      <div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'tasks', label: '📋 盘点任务', icon: <OrderedListOutlined /> },
          { key: 'overview', label: '📊 库存概况', icon: <DashboardOutlined /> },
        ]} />
        {activeTab === 'tasks' && <CheckTaskList />}
        {activeTab === 'overview' && <InventoryOverview />}
      </div>
    </PermissionGuard>
  );
}

// ==================== 盘点任务列表 ====================
function CheckTaskList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    const res = await api.get('/inventory/check-tasks', { pageSize: 50 });
    if (res.success) setTasks(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleViewDetail = async (task) => {
    const res = await api.get(`/inventory/check-tasks/${task.id}`);
    if (res.success) {
      setSelectedTask(res.data);
      const initial = {};
      (res.data.details || []).forEach(d => {
        initial[d.id] = { actualQty: d.actual_quantity ?? d.system_quantity, reason: d.reason || '' };
      });
      setEditValues(initial);
      setDetailOpen(true);
    }
  };

  const updateEditValue = (detailId, field, value) => {
    setEditValues(prev => ({ ...prev, [detailId]: { ...(prev[detailId] || {}), [field]: value } }));
  };

  const handleSubmitCheck = async () => {
    if (!selectedTask) return;
    const checkedBy = prompt('请输入您的姓名：');
    if (!checkedBy) return;

    const details = (selectedTask.details || []).map(d => {
      const ev = editValues[d.id] || {};
      return {
        id: d.id, material_id: d.material_id, location_id: d.location_id,
        system_quantity: d.system_quantity,
        actual_quantity: parseFloat(ev.actualQty) ?? parseFloat(d.system_quantity),
        reason: ev.reason || '',
      };
    });

    setSubmitting(true);
    const res = await api.post(`/inventory/check-tasks/${selectedTask.id}/submit`, { checked_by: checkedBy, details });
    if (res.success) { message.success('盘点结果已提交'); setDetailOpen(false); fetchTasks(); }
    else message.error(res.message);
    setSubmitting(false);
  };

  const statusMap = {
    pending: { color: 'default', label: '待盘点' }, in_progress: { color: 'blue', label: '盘点中' },
    submitted: { color: 'orange', label: '已提交' }, approved: { color: 'green', label: '已审批' },
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchTasks}>刷新</Button>
      </Space>
      <Table rowKey="id" size="small" dataSource={tasks} loading={loading} pagination={{ pageSize: 20 }}
        columns={[
          { title: '任务单号', dataIndex: 'task_no', width: 130 },
          { title: '任务名称', dataIndex: 'title', width: 200 },
          { title: '盘点区域', dataIndex: 'zone_name', width: 120 },
          { title: '明细数', dataIndex: 'detail_count', width: 60, align: 'right' },
          { title: '状态', dataIndex: 'status', width: 80, render: v => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label || v}</Tag> },
          { title: '盘点人', dataIndex: 'checked_by', width: 80 },
          { title: '创建时间', dataIndex: 'created_at', width: 140, render: v => new Date(v).toLocaleString('zh-CN') },
          {
            title: '操作', width: 100,
            render: (_, r) => (
              <Button size="small" icon={<EyeOutlined />}
                onClick={() => handleViewDetail(r)}
                disabled={r.status === 'approved'}>
                {r.status === 'pending' ? '执行盘点' : '查看'}
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={`盘点 — ${selectedTask?.title || ''} (${selectedTask?.task_no || ''})`}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={800}
        footer={
          <Space>
            <Button onClick={() => setDetailOpen(false)}>关闭</Button>
            {selectedTask?.status !== 'approved' && (
              <Button type="primary" loading={submitting} onClick={handleSubmitCheck}
                icon={<CheckCircleOutlined />}>提交盘点结果</Button>
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
                  return <InputNumber size="small" min={0} value={ev.actualQty}
                    onChange={v => updateEditValue(r.id, 'actualQty', v)} style={{ width: 80 }} />;
                },
              },
              {
                title: '差异', width: 75, align: 'right',
                render: (_, r) => {
                  const ev = editValues[r.id] || {};
                  const actual = parseFloat(ev.actualQty) ?? parseFloat(r.system_quantity);
                  const diff = actual - parseFloat(r.system_quantity);
                  return <span style={{ fontWeight: 600, color: diff === 0 ? '#52c41a' : diff > 0 ? '#1890ff' : '#ff4d4f' }}>{diff > 0 ? '+' : ''}{diff.toFixed(2)}</span>;
                },
              },
              {
                title: '原因', width: 150,
                render: (_, r) => {
                  const ev = editValues[r.id] || {};
                  return <Input size="small" value={ev.reason}
                    onChange={e => updateEditValue(r.id, 'reason', e.target.value)} placeholder="差异原因" />;
                },
              },
            ]}
          />
        ) : <Empty description="暂无盘点明细" />}
      </Modal>
    </>
  );
}

// ==================== 库存概况 ====================
function InventoryOverview() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get('/inventory/overview').then(r => r.success && setOverview(r.data));
  }, []);

  return (
    <Row gutter={16}>
      <Col span={6}><Card><Statistic title="物料SKU" value={overview?.totalSku || 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="库区数" value={overview?.zoneCount || 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="库位数" value={overview?.locationCount || 0} /></Card></Col>
      <Col span={6}><Card><Statistic title="本月入库量" value={overview?.monthInbound || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
    </Row>
  );
}
