/**
 * AI 知识助手 — 印刷故障排查问答
 *
 * POST /api/assistant/ask
 *   body: { question: "出墨不匀怎么修" }
 *   → 关键词搜索知识库 + 结构化返回答案
 *
 * 知识库常驻内存（服务启动时加载一次）
 * 预留 DeepSeek API 接入点（设置环境变量 DEEPSEEK_API_KEY 启用）
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// ==================== 知识库加载（常驻内存） ====================

let knowledgeBase = [];

try {
  const kbPath = path.join(__dirname, '..', 'knowledge-base', 'printing-faults.json');
  knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
  console.log(`[assistant] 印刷知识库已加载：${knowledgeBase.length} 条故障`);
} catch (e) {
  console.error('[assistant] 知识库加载失败:', e.message);
}

// ==================== 搜索引擎 ====================

// 近义词映射
const SYNONYMS = {
  '不匀': '不均',
  '不均': '不匀',
  '卡纸': '堵纸',
  '堵纸': '卡纸',
  '模糊': '发虚',
  '发虚': '模糊',
  '脏版': '起脏',
  '起脏': '脏版',
  '墨杠': '条痕',
  '条痕': '墨杠',
  '重影': '双影',
  '双影': '重影',
  '停机': '停',
  '掉粉': '掉毛',
  '掉毛': '掉粉',
  '飞墨': '墨雾',
  '墨雾': '飞墨',
  '不干': '干燥',
  '干燥': '不干',
};

function normalizeQuery(q) {
  let result = q;
  for (const [from, to] of Object.entries(SYNONYMS)) {
    if (q.includes(from)) result = result.replace(from, to);
  }
  return result;
}

function searchKnowledge(question) {
  const q = normalizeQuery(question.toLowerCase());
  const results = [];

  for (const fault of knowledgeBase) {
    let score = 0;

    // 关键词匹配（精确 + 模糊）
    for (const kw of fault.keywords) {
      const nkw = normalizeQuery(kw.toLowerCase());
      // 精确或模糊匹配
      if (q.includes(nkw) || nkw.includes(q.split(' ')[0])) {
        score += 30;
      }
      // 部分字匹配：至少2个字相同
      for (let i = 0; i < nkw.length - 1; i++) {
        const chunk = nkw.slice(i, i + 2);
        if (chunk.length === 2 && q.includes(chunk)) score += 8;
      }
    }

    // 症状文本匹配
    const nsymptom = normalizeQuery(fault.symptom.toLowerCase());
    if (q.includes(nsymptom.slice(0, 4)) || nsymptom.includes(q.slice(0, 4))) {
      score += 20;
    }

    // 原因关键词（部分匹配）
    for (const cause of fault.causes) {
      const words = cause.slice(0, 6);
      if (q.includes(words)) score += 5;
    }

    if (score > 0) {
      results.push({ ...fault, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

// ==================== 回答生成 ====================

function generateAnswer(question, matches) {
  if (matches.length === 0) {
    return {
      found: false,
      answer: '抱歉，我目前的知识库中没有找到与您问题匹配的故障信息。\n\n建议：\n1. 尝试用更具体的关键词描述问题（如"糊版""套印不准""墨杠"）\n2. 联系老师傅或设备供应商获取技术支持\n3. 该问题将记录在案，后续补充到知识库中',
      relatedTopics: knowledgeBase.slice(0, 3).map(f => f.symptom),
    };
  }

  const best = matches[0];
  const answer = buildDetailedAnswer(best, matches);

  return {
    found: true,
    answer,
    faultId: best.id,
    category: best.category,
    params: best.params || null,
    relatedTopics: matches.slice(1, 3).map(m => m.symptom),
  };
}

function buildDetailedAnswer(primary, related) {
  let answer = '';

  // 标题
  answer += `## ${primary.symptom}\n\n`;
  answer += `**分类**：${primary.category}\n\n`;

  // 可能原因
  answer += '### 🔍 可能原因\n\n';
  primary.causes.forEach((c, i) => {
    answer += `${i + 1}. ${c}\n`;
  });

  // 排查步骤
  answer += '\n### 🛠️ 排查步骤（按顺序操作）\n\n';
  primary.steps.forEach((s, i) => {
    answer += `${i + 1}. ${s}\n`;
  });

  // 关键参数
  if (primary.params && primary.params !== '无') {
    answer += `\n### 📐 关键参数\n\n${primary.params}\n`;
  }

  // 相关故障
  if (related.length > 0) {
    answer += '\n### 📋 相关故障（可能也有帮助）\n\n';
    related.forEach(r => {
      answer += `- **${r.symptom}**：${r.causes[0]}\n`;
    });
  }

  return answer;
}

// ==================== API 端点 ====================

/**
 * POST /api/assistant/ask
 * 传入问题文本，返回匹配的故障排查答案
 */
router.post('/ask', (req, res) => {
  const { question } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, message: '请输入问题描述' });
  }

  const matches = searchKnowledge(question.trim());
  const result = generateAnswer(question.trim(), matches);

  res.json({
    success: true,
    data: {
      question: question.trim(),
      ...result,
      matchCount: matches.length,
      knowledgeBaseSize: knowledgeBase.length,
    },
  });
});

/**
 * GET /api/assistant/topics
 * 返回知识库中的所有故障分类和症状列表（供前端快速浏览）
 */
router.get('/topics', (req, res) => {
  const categories = {};
  for (const fault of knowledgeBase) {
    if (!categories[fault.category]) {
      categories[fault.category] = [];
    }
    categories[fault.category].push(fault.symptom);
  }

  res.json({
    success: true,
    data: {
      totalFaults: knowledgeBase.length,
      categories,
    },
  });
});

module.exports = router;
