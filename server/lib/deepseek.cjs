/**
 * DeepSeek API 客户端
 *
 * 封装 DeepSeek Chat Completions API（兼容 OpenAI 格式）
 * 文档：https://platform.deepseek.com/api-docs
 *
 * 使用 Node.js 内置 fetch（Node 18+），零外部依赖
 */

const DEEPSEEK_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * 获取 API Key（优先级：环境变量 > config.json）
 */
function getApiKey() {
  if (process.env.DEEPSEEK_API_KEY) {
    return process.env.DEEPSEEK_API_KEY;
  }
  // 降级：尝试从 config.json 读取
  try {
    const config = require('../config.json');
    if (config && config.deepseekApiKey) {
      return config.deepseekApiKey;
    }
  } catch (_) {
    // config.json 不存在是正常的
  }
  return null;
}

/**
 * 调用 DeepSeek Chat API
 *
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {object} [options]
 * @param {string} [options.model] - 模型名称，默认 deepseek-chat
 * @param {number} [options.temperature] - 温度，默认 0.3
 * @param {number} [options.maxTokens] - 最大输出 token，默认 4096
 * @param {number} [options.timeout] - 超时毫秒，默认 60000
 * @param {boolean} [options.enableThinking] - 是否开启思考链（默认 false，关闭可大幅提速且让 max_tokens 生效）
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function chat(messages, options = {}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      success: false,
      error: '未配置 DeepSeek API Key，请设置环境变量 DEEPSEEK_API_KEY',
    };
  }

  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeout = DEFAULT_TIMEOUT_MS,
    enableThinking = false,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        enable_thinking: enableThinking,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法读取错误详情');
      let errorMsg = `DeepSeek API 返回错误 (${response.status})`;

      // 尝试解析常见错误
      if (response.status === 401) {
        errorMsg = 'DeepSeek API Key 无效，请检查 DEEPSEEK_API_KEY';
      } else if (response.status === 429) {
        errorMsg = 'DeepSeek API 请求频率超限，请稍后重试';
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        errorMsg = 'DeepSeek 服务暂时不可用，请稍后重试';
      }

      console.error('[deepseek] API error:', response.status, errorText);
      return { success: false, error: errorMsg };
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[deepseek] Unexpected response format:', JSON.stringify(data).substring(0, 500));
      return { success: false, error: 'DeepSeek 返回了非预期的数据格式' };
    }

    const content = data.choices[0].message.content || '';

    return {
      success: true,
      content: content.trim(),
      // 透传用量信息供调试
      usage: data.usage || null,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      return { success: false, error: `AI 服务响应超时（${timeout / 1000}秒），请稍后重试` };
    }

    // 网络错误
    if (err.cause && err.cause.code === 'ECONNREFUSED') {
      return { success: false, error: '无法连接到 DeepSeek 服务，请检查网络连接' };
    }

    console.error('[deepseek] Request failed:', err.message);
    return { success: false, error: `AI 服务调用失败: ${err.message}` };
  }
}

/**
 * 流式调用 DeepSeek Chat API，返回 async generator
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options]
 * @yields {object} { delta: '新增文本', accumulated: '累积全文', done: false }
 * @yields {object} { done: true, content: '完整文本', usage: {...} }
 */
async function* chatStream(messages, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    yield { done: true, error: '未配置 DeepSeek API Key' };
    return;
  }

  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeout = DEFAULT_TIMEOUT_MS,
    enableThinking = false,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        enable_thinking: enableThinking,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      yield { done: true, error: `DeepSeek API ${response.status}: ${errText.substring(0, 200)}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            yield { delta, accumulated, done: false };
          }
          if (parsed.usage) usage = parsed.usage;
        } catch (_) {
          // 跳过解析失败的行
        }
      }
    }

    // 最后发送完成事件
    yield { done: true, content: accumulated.trim(), usage };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      yield { done: true, error: `AI 服务响应超时（${timeout / 1000}秒）` };
    } else {
      yield { done: true, error: `AI 服务调用失败: ${err.message}` };
    }
  }
}

module.exports = { chat, chatStream, getApiKey };
