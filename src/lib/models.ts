/**
 * 模型配置中心
 *
 * 定义所有可用的 AI 模型及其属性，
 * 支持「自动」模式和「手动」选择模式。
 */

// ============================================================================
// 模型 ID 类型
// ============================================================================

/** 所有可用模型 ID（含 "auto" 自动模式） */
export type ModelId =
  | 'auto'
  | 'deepseek'
  | 'deepseek-v4-pro'
  | 'gemini'
  | 'gemma'
  | 'minimax-m2-her'
  | 'kimi-k2.7-code'
  | 'octopus-rpa'
  | 'coze';

// ============================================================================
// 模型配置接口
// ============================================================================

export interface ModelConfig {
  id: ModelId;
  name: string;
  provider: string;
  description: string;
  strengths: string[];
  category: 'reasoning' | 'search' | 'code' | 'multimodal' | 'data' | 'general';
  icon: string;
  isRPA?: boolean;
}

// ============================================================================
// 所有可用模型列表
// ============================================================================

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'auto',
    name: '自动',
    provider: 'auto',
    description: 'AI 根据问题自动选择最合适的模型',
    strengths: ['智能路由', '自动选择'],
    category: 'general',
    icon: '',
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    description: '旗舰推理模型，适合复杂报价和技术方案',
    strengths: ['100万上下文', '推理强'],
    category: 'reasoning',
    icon: '',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    description: '通用对话模型',
    strengths: ['通用理解', '稳定可靠'],
    category: 'general',
    icon: '',
  },
  {
    id: 'minimax-m2-her',
    name: 'MiniMax M2 Her',
    provider: 'minimax',
    description: '支持联网搜索，适合市场行情对比',
    strengths: ['200K上下文', '联网搜索'],
    category: 'search',
    icon: '',
  },
  {
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    provider: 'moonshot',
    description: '代码优化和结构化数据生成',
    strengths: ['代码专注', '结构化'],
    category: 'code',
    icon: '',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'laozhang',
    description: '多模态模型，支持图片理解',
    strengths: ['多模态', '图片理解'],
    category: 'multimodal',
    icon: '',
  },
  {
    id: 'gemma',
    name: 'Gemma 4 (本地)',
    provider: 'ollama',
    description: '本地运行，快速免费',
    strengths: ['本地运行', '免费'],
    category: 'general',
    icon: '',
  },
  {
    id: 'octopus-rpa',
    name: '八爪鱼 RPA',
    provider: 'octopus',
    description: '网页数据采集，抓取市场信息',
    strengths: ['数据采集', '自动化'],
    category: 'data',
    icon: '',
    isRPA: true,
  },
];

// ============================================================================
// 自动路由规则类型
// ============================================================================

export interface RouteRule {
  keywords: string[];
  model: ModelId;
  reason: string;
}

// ============================================================================
// 自动路由规则表
// ============================================================================

export const AUTO_ROUTE_RULES: RouteRule[] = [
  {
    keywords: ['报价', '价格', '多少钱', '方案', '预算', '费用', '成本'],
    model: 'deepseek-v4-pro',
    reason: '推理能力强，适合报价和方案生成',
  },
  {
    keywords: ['对比', '市场', '行情', '趋势', '竞品', '搜索', '查询', '最新'],
    model: 'minimax-m2-her',
    reason: '支持联网搜索，适合市场行情对比',
  },
  {
    keywords: ['代码', '函数', '修复', '优化', '编程', '开发', '脚本', '算法'],
    model: 'kimi-k2.7-code',
    reason: '专注代码生成与优化',
  },
  {
    keywords: ['图片', '照片', '图纸', '图像', '看图', '识别'],
    model: 'gemini',
    reason: '多模态能力强，支持图片理解',
  },
  {
    keywords: ['采集', '抓取', '爬虫', '网页', '网站数据', '提取数据'],
    model: 'octopus-rpa',
    reason: '自动化网页数据采集',
  },
];

/** 默认模型（通用能力强） */
export const DEFAULT_MODEL: ModelId = 'deepseek-v4-pro';

// ============================================================================
// 自动路由函数
// ============================================================================

/**
 * 根据用户输入自动选择最适合的模型
 */
export function autoSelectModel(userInput: string): { model: ModelId; reason: string } {
  if (!userInput || userInput.trim().length === 0) {
    return { model: 'deepseek', reason: '默认模型' };
  }

  const input = userInput.toLowerCase();

  // 简单问候/闲聊 → Gemma
  const greetingPatterns = ['你好', '早上好', '下午好', '晚上好', 'hello', 'hi', '谢谢', '再见'];
  if (greetingPatterns.some((p) => input.includes(p)) && input.length < 20) {
    return { model: 'gemma', reason: '简单问候使用本地模型，快速免费' };
  }

  // 关键词匹配
  for (const rule of AUTO_ROUTE_RULES) {
    if (rule.keywords.some((kw) => input.includes(kw))) {
      return { model: rule.model, reason: rule.reason };
    }
  }

  // 默认使用 DeepSeek V4 Pro
  return { model: DEFAULT_MODEL, reason: '通用场景使用 DeepSeek V4 Pro' };
}

// ============================================================================
// 模型查找辅助函数
// ============================================================================

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

export function getAvailableModels(): ModelConfig[] {
  return AVAILABLE_MODELS.filter((m) => m.id !== 'auto');
}
