import { useState, useRef, useEffect, Component } from 'react';
import {
  Card, Input, Button, Typography, Space, Tag, Spin,
  Divider, Empty,
} from 'antd';
import {
  SendOutlined, RobotOutlined, UserOutlined,
  ThunderboltOutlined, SearchOutlined, ClearOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ==================== 错误边界 ====================
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Title level={4} type="danger">页面渲染出错</Title>
          <Text type="secondary">{String(this.state.error)}</Text>
          <br />
          <Button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12 }}>重试</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==================== API ====================
import api from '../../utils/api';

const QUICK_QUESTIONS = [
  '出墨不匀怎么排查', '套印不准怎么办', '墨杠水杠怎么区分',
  '糊版怎么处理', '纸张歪斜什么原因', '水墨平衡怎么控制',
];

// ==================== 页面 ====================
export default function AIAssistant() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: '你好！我是印刷专用 AI 助手。内置 50 种常见印刷故障排查方案。\n\n直接描述问题，我会给出：可能原因 + 排查步骤 + 关键参数。\n\n试试输入"出墨不匀"或点击下方快捷问题。',
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState(null);
  const [topicError, setTopicError] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get('/assistant/topics')
      .then(r => { if (r.success && r.data) setTopics(r.data); })
      .catch(() => setTopicError(true));
  }, []);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages]);

  const sendMessage = async (text) => {
    const q = (text || input || '').trim();
    if (!q || loading) return;

    const userMsg = { role: 'user', content: q, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/assistant/ask', { question: q });
      if (res.success && res.data) {
        const d = res.data;
        let answer = d.answer || '未找到相关答案';
        if (d.found) {
          answer += '\n\n---\n📚 匹配' + d.matchCount + '条 | 知识库共' + d.knowledgeBaseSize + '条';
        }
        setMessages(prev => [...prev, { role: 'assistant', content: answer, timestamp: Date.now(), data: d }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，查询出错，请重试。', timestamp: Date.now() }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '无法连接 AI 助手服务。', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '对话已清空。有什么印刷问题？', timestamp: Date.now() }]);
  };

  const renderMsg = (msg, i) => {
    const isUser = msg.role === 'user';
    const contentHtml = String(msg.content || '')
      .replace(/### (.*)/g, '<strong style="font-size:15px">$1</strong>')
      .replace(/## (.*)/g, '<strong style="font-size:16px;color:#1890ff">$1</strong>')
      .replace(/\n/g, '<br/>');

    return (
      <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16, flexDirection: isUser ? 'row-reverse' : 'row' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isUser ? '#1890ff' : '#52c41a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isUser ? <UserOutlined style={{ color: '#fff' }} /> : <RobotOutlined style={{ color: '#fff' }} />}
        </div>
        <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 10,
          background: isUser ? '#e6f7ff' : '#f6ffed',
          border: '1px solid ' + (isUser ? '#91d5ff' : '#b7eb8f'),
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.7 }}>
          <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
          {msg.data && msg.data.params && msg.data.params !== '无' && (
            <Tag color="blue" style={{ marginTop: 8 }}><ThunderboltOutlined /> {msg.data.params}</Tag>
          )}
          <div style={{ fontSize: 10, color: '#999', marginTop: 4, textAlign: isUser ? 'left' : 'right' }}>
            {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
          </div>
        </div>
      </div>
    );
  };

  // 构建分类标签
  const categories = topics && topics.categories ? Object.entries(topics.categories) : [];
  const totalFaults = topics ? topics.totalFaults : 50;

  return (
    <ErrorBoundary>
      <div>
        <Title level={4} style={{ marginBottom: 16 }}>
          <RobotOutlined style={{ marginRight: 8 }} />AI 知识助手
          <Tag color="green" style={{ marginLeft: 8, fontSize: 12 }}>印刷专用</Tag>
          <Tag style={{ fontSize: 11 }}>{totalFaults}条故障</Tag>
        </Title>

        <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 200px)', minHeight: 500 }}>
          {/* 左侧分类 */}
          <Card size="small" title={<><SearchOutlined /> 知识库目录</>}
            style={{ width: 220, flexShrink: 0, overflow: 'auto' }}
            bodyStyle={{ padding: '8px 12px' }}>
            {topicError ? (
              <Text type="secondary" style={{ fontSize: 12 }}>目录加载失败</Text>
            ) : !topics ? (
              <Spin size="small" />
            ) : (
              <div>
                {categories.map(([cat, symptoms]) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 12, color: '#333' }}>{cat}</Text>
                    <div style={{ marginTop: 4 }}>
                      {(symptoms || []).slice(0, 6).map(s => (
                        <div key={s} onClick={() => sendMessage(s)}
                          style={{ fontSize: 11, padding: '3px 6px', cursor: 'pointer',
                            borderRadius: 4, marginBottom: 2, color: '#1890ff', background: '#f0f5ff' }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 右侧聊天 */}
          <Card size="small" title={<><RobotOutlined /> 故障排查对话</>}
            extra={<Button size="small" icon={<ClearOutlined />} onClick={clearChat}>清空</Button>}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
            {/* 消息列表 */}
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
              {messages.map((msg, i) => renderMsg(msg, i))}
              {loading && (
                <div style={{ textAlign: 'center', padding: 12 }}>
                  <Spin size="small" /> <Text type="secondary" style={{ fontSize: 12 }}>AI 正在分析...</Text>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 快捷问题 */}
            <div style={{ marginBottom: 8 }}>
              <Space wrap size={4}>
                {QUICK_QUESTIONS.map(q => (
                  <Tag key={q} style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => sendMessage(q)}>{q}</Tag>
                ))}
              </Space>
            </div>

            {/* 输入框 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea value={input} onChange={e => setInput(e.target.value)}
                onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="描述故障现象，如：海德堡SM74出墨不匀..."
                rows={2} style={{ flex: 1 }} disabled={loading} />
              <Button type="primary" icon={<SendOutlined />}
                onClick={() => sendMessage()} loading={loading} style={{ height: 'auto' }}>发送</Button>
            </div>
            <Text type="secondary" style={{ fontSize: 10, marginTop: 4 }}>
              Enter 发送 · Shift+Enter 换行 · 基于 50 条印刷故障知识库
            </Text>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
}
