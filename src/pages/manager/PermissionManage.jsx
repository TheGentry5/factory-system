import { Card, Typography, Space, Tag, Table, Switch, Button, message, Spin } from 'antd';
import { useState, useEffect } from 'react';
import { allPermissions, employeePermissions, users } from '../../data/mockData';

const { Title, Text, Paragraph } = Typography;

// 员工姓名 → 系统用户ID 映射（张三/李四对应 mockData users 中的 e001/e002）
function getEmpId(emp) {
  const matchedUser = users.find(u => u.name === emp.name && u.role === 'employee');
  return matchedUser ? matchedUser.id : emp.emp_no.toLowerCase();
}

/**
 * 权限分发页面 —— 从 API 获取员工列表，权限数据暂用本地状态
 */
export default function PermissionManage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [perms, setPerms] = useState({ ...employeePermissions });
  const [saving, setSaving] = useState(false);

  // 从后端加载员工列表
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/employees?pageSize=100&status=1').then(r => r.json());
        if (res.success) {
          setEmployees(res.data.map(emp => ({
            id: getEmpId(emp),
            name: emp.name,
            department: emp.department || '未分配',
            position: emp.position || '未分配',
          })));
        }
      } catch (e) {
        // API 不可用时回退到静态数据
        console.warn('加载员工列表失败，使用静态数据', e);
      }
      setLoading(false);
    })();
  }, []);

  const togglePerm = (empId, permKey) => {
    setPerms((prev) => {
      const current = prev[empId] || [];
      const updated = current.includes(permKey)
        ? current.filter((k) => k !== permKey)
        : [...current, permKey];
      return { ...prev, [empId]: updated };
    });
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      message.success('权限已保存（演示模式，刷新后恢复默认）');
    }, 800);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>权限分发</Title>
          <Paragraph type="secondary">
            为公司员工分配功能操作权限。勾选的功能模块可被对应员工使用，未勾选的将展示"暂无权限"。
          </Paragraph>
        </div>
        <Button type="primary" loading={saving} onClick={handleSave}>
          保存权限
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" tip="加载员工列表…" />
        </div>
      ) : (
        employees.map((emp) => (
          <Card
            key={emp.id}
            title={
              <Space>
                <Text strong>{emp.name}</Text>
                <Tag color="blue">{emp.department}</Tag>
                <Tag>{emp.position}</Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Space wrap size={[16, 12]}>
              {allPermissions.map((perm) => {
                const checked = (perms[emp.id] || []).includes(perm.key);
                return (
                  <div
                    key={perm.key}
                    style={{
                      border: `1px solid ${checked ? '#52c41a' : '#d9d9d9'}`,
                      borderRadius: 6,
                      padding: '8px 16px',
                      background: checked ? '#f6ffed' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'all .2s',
                    }}
                    onClick={() => togglePerm(emp.id, perm.key)}
                  >
                    <Space>
                      <Switch checked={checked} size="small" />
                      <Text style={{ color: checked ? '#52c41a' : '#999' }}>
                        {perm.label}
                      </Text>
                    </Space>
                  </div>
                );
              })}
            </Space>
          </Card>
        ))
      )}

      <Card style={{ marginTop: 8 }}>
        <Text type="secondary">
          💡 扩展计划：增加角色模板功能，新建员工时可直接选择"质检员模板""仓管员模板"等预置权限组合，
          减少逐项勾选的工作量。
        </Text>
      </Card>
    </div>
  );
}
