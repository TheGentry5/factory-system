import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Modal, Form, message,
  Row, Col, Popconfirm, Badge, DatePicker,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, TeamOutlined,
  UserOutlined, PhoneOutlined, MailOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

// ==================== API 工具 ====================
const api = {
  get: (url, params) =>
    fetch(`/api${url}?` + new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)
    )).then(r => r.json()),
  post: (url, data) =>
    fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  put: (url, data) =>
    fetch(`/api${url}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  del: (url) =>
    fetch(`/api${url}`, { method: 'DELETE' }).then(r => r.json()),
};

// 部门选项（从种子数据中提取）
const DEPARTMENTS = ['采购部', '生产部', '质检部', '仓储部', '设备部', '财务部', '行政部'];

export default function EmployeeManage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees', {
        page, pageSize: 15, keyword, department: deptFilter, status: statusFilter,
      });
      if (res.success) { setData(res.data); setTotal(res.total); }
    } catch (e) { message.error('加载员工数据失败'); }
    setLoading(false);
  }, [page, keyword, deptFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [nextEmpNo, setNextEmpNo] = useState('');

  // 新增/编辑
  const handleEdit = async (record) => {
    setEditingId(record?.id || null);
    if (record) {
      form.setFieldsValue({
        ...record,
        hire_date: record.hire_date ? dayjs(record.hire_date) : null,
      });
      setNextEmpNo('');
    } else {
      form.resetFields();
      // 获取下一个工号
      try {
        const res = await api.get('/employees/next-emp-no');
        if (res.success) {
          setNextEmpNo(res.data.emp_no);
        }
      } catch (e) { /* ignore */ }
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        // disabled 字段不会被 validateFields 返回，需手动补充
        emp_no: editingId ? form.getFieldValue('emp_no') : nextEmpNo,
        hire_date: values.hire_date ? values.hire_date.format('YYYY-MM-DD') : null,
      };
      let res;
      if (editingId) {
        res = await api.put(`/employees/${editingId}`, payload);
      } else {
        res = await api.post('/employees', payload);
      }
      if (res.success) {
        message.success(editingId ? '员工信息已更新' : `员工 ${res.data.emp_no} 已新增`);
        setEditOpen(false);
        fetchData();
      } else {
        message.error(res.message);
      }
    } catch (e) { /* validation error */ }
  };

  const handleDelete = async (id) => {
    const res = await api.del(`/employees/${id}`);
    if (res.success) { message.success('已删除'); fetchData(); }
    else { message.error(res.message); }
  };

  const columns = [
    { title: '工号', dataIndex: 'emp_no', width: 90 },
    { title: '姓名', dataIndex: 'name', width: 80,
      render: (text) => <Space><UserOutlined />{text}</Space>,
    },
    { title: '性别', dataIndex: 'gender', width: 55,
      render: v => v === '男' ? <Tag color="blue">男</Tag> : v === '女' ? <Tag color="pink">女</Tag> : '-',
    },
    { title: '部门', dataIndex: 'department', width: 90,
      render: v => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    { title: '岗位', dataIndex: 'position', width: 110, ellipsis: true },
    { title: '电话', dataIndex: 'phone', width: 120,
      render: v => v ? <Space size={4}><PhoneOutlined style={{ fontSize: 12 }} />{v}</Space> : '-',
    },
    { title: '邮箱', dataIndex: 'email', width: 170, ellipsis: true,
      render: v => v ? <Space size={4}><MailOutlined style={{ fontSize: 12 }} />{v}</Space> : '-',
    },
    { title: '入职日期', dataIndex: 'hire_date', width: 100,
      render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    { title: '入职年限', dataIndex: 'hire_date', width: 100,
      render: v => {
        if (!v) return '-';
        const now = dayjs();
        const hire = dayjs(v);
        const years = now.diff(hire, 'year');
        const months = now.diff(hire, 'month') % 12;
        if (years === 0) return `${months}个月`;
        if (months === 0) return `${years}年`;
        return `${years}年${months}个月`;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 65,
      render: v => v === 1
        ? <Badge status="success" text="在职" />
        : <Badge status="default" text="离职" />,
    },
    { title: '备注', dataIndex: 'remark', width: 130, ellipsis: true },
    {
      title: '操作', width: 140, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除该员工？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />员工管理
        </h3>
        <span style={{ color: '#888', fontSize: 13 }}>共 {total} 名员工</span>
      </div>

      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索工号/姓名/岗位/电话…"
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            onSearch={fetchData}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            placeholder="部门筛选"
            value={deptFilter}
            onChange={v => { setDeptFilter(v || ''); setPage(1); }}
            allowClear
            style={{ width: 130 }}
            options={DEPARTMENTS.map(d => ({ label: d, value: d }))}
          />
          <Select
            placeholder="在职状态"
            value={statusFilter}
            onChange={v => { setStatusFilter(v || ''); setPage(1); }}
            allowClear
            style={{ width: 110 }}
            options={[
              { label: '在职', value: '1' },
              { label: '离职', value: '0' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>
            新增员工
          </Button>
        </Space>
      </Card>

      {/* 员工表格 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1330 }}
        pagination={{
          current: page, total, pageSize: 15, showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p),
        }}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingId ? '编辑员工信息' : '新增员工'}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="emp_no" label="工号">
                <Input
                  disabled
                  placeholder={editingId ? '' : (nextEmpNo || '加载中…')}
                  style={{ color: '#888' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="员工姓名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="gender" label="性别">
                <Select placeholder="选择性别" options={[
                  { label: '男', value: '男' },
                  { label: '女', value: '女' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department" label="部门">
                <Select placeholder="选择部门" options={DEPARTMENTS.map(d => ({ label: d, value: d }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label="岗位">
                <Input placeholder="岗位名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="手机/座机" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱">
                <Input placeholder="email@factory.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hire_date" label="入职日期">
                <DatePicker style={{ width: '100%' }} placeholder="选择入职日期" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { label: '在职', value: 1 },
                  { label: '离职', value: 0 },
                ]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="补充说明…" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
