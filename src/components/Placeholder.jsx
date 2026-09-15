import { Result, Typography, Space, Tag } from 'antd';

const { Paragraph, Text } = Typography;

/**
 * 占位页面组件 ——
 * 接收 title / description / features 纯展示，不包含任何实际逻辑
 * features = [{ label: string, desc: string, tag?: string }]
 */
export default function Placeholder({ title, description, features = [] }) {
  return (
    <div style={{ padding: 24 }}>
      <Result
        status="info"
        title={title || '功能模块'}
        subTitle={description || '该功能模块尚在规划中，后续将在此处实现具体业务逻辑'}
      />

      {features.length > 0 && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <Paragraph>
            <Text strong style={{ fontSize: 16 }}>
              计划实现的功能点：
            </Text>
          </Paragraph>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {features.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  background: '#fafafa',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <Text strong>{f.label}</Text>
                  <br />
                  <Text type="secondary">{f.desc}</Text>
                </div>
                {f.tag && <Tag color="blue">{f.tag}</Tag>}
              </div>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}
