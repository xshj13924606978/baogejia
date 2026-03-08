/**
 * 智能对话处理器
 * 
 * 核心理念：
 * 1. 完全移除固定意图检测（IntentDetector）
 * 2. 使用 LLM 进行真正的语义理解
 * 3. 动态理解用户意图并生成响应
 * 4. 灵活处理各种场景（问候、方案、报价、技术咨询等）
 * 
 * 对比传统方案：
 * ❌ 传统：固定意图 → 关键词匹配 → 预设回复
 * ✅ 智能方案：用户输入 → LLM语义理解 → 动态响应
 */

import { callDeepSeekChat } from './deepseek-client';
import { ProcessedInput } from './input-processor';

interface ConversationContext {
  conversationId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastTopic?: string;
  lastUserInput?: string;
  lastResponse?: string;
}

interface SmartResponse {
  content: string;
  intent?: string; // 动态识别的意图，不固定
  suggestions?: string[];
  requiresFollowUp?: boolean;
  followUpQuestions?: string[];
  metadata?: {
    inputType: string;
    confidence: number;
    extractedEntities?: any;
  };
}

export class SmartChatProcessor {
  private conversations: Map<string, ConversationContext> = new Map();

  constructor() {
    console.log('[SmartChatProcessor] 智能对话处理器初始化完成');
  }

  /**
   * 处理用户输入（核心方法）
   */
  async process(
    userInput: string,
    processedInput?: ProcessedInput,
    conversationId?: string
  ): Promise<SmartResponse> {
    console.log('[SmartChatProcessor] ========== 开始智能处理 ==========');
    console.log('[SmartChatProcessor] 用户输入:', userInput);
    console.log('[SmartChatProcessor] 输入类型:', processedInput?.type);

    // 1. 获取或创建对话上下文
    const context = this.getOrCreateContext(conversationId);

    // 2. 如果有文件上传，先处理文件内容
    let enhancedInput = userInput;
    if (processedInput && processedInput.type !== 'text') {
      enhancedInput = this.enrichInputWithFileInfo(userInput, processedInput);
    }

    // 3. 使用 LLM 智能理解并生成响应
    const response = await this.generateSmartResponse(enhancedInput, context, processedInput);

    // 4. 更新对话历史
    this.updateContext(context, userInput, response.content);

    // 5. 返回响应
    console.log('[SmartChatProcessor] ========== 智能处理完成 ==========');
    return response;
  }

  /**
   * 使用 LLM 智能理解并生成响应
   */
  private async generateSmartResponse(
    userInput: string,
    context: ConversationContext,
    processedInput?: ProcessedInput
  ): Promise<SmartResponse> {
    console.log('[SmartChatProcessor] 调用 LLM 进行语义理解...');

    // 构建对话历史
    const historyText = this.formatHistoryForLLM(context.history);

    // 系统提示词 - 核心指令
    const systemPrompt = this.buildSystemPrompt(processedInput);

    try {
      // 调用 DeepSeek LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        ...historyText,
        { role: 'user', content: userInput }
      ] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      
      console.log('[SmartChatProcessor] 发送给 LLM 的消息数:', messages.length);
      console.log('[SmartChatProcessor] System Prompt 长度:', systemPrompt.length);
      console.log('[SmartChatProcessor] User Input:', userInput);
      
      const aiResponse = await callDeepSeekChat({
        messages: messages,
        temperature: 0.7,
        maxTokens: 8192,
      });

      console.log('[SmartChatProcessor] LLM 响应:', aiResponse.text.substring(0, 200));

      // 解析 LLM 响应（提取内容和元数据）
      const parsedResponse = this.parseLLMResponse(aiResponse.text);

      return {
        content: parsedResponse.content,
        intent: parsedResponse.intent,
        suggestions: parsedResponse.suggestions,
        requiresFollowUp: parsedResponse.requiresFollowUp,
        followUpQuestions: parsedResponse.followUpQuestions,
        metadata: {
          inputType: processedInput?.type || 'text',
          confidence: parsedResponse.confidence || 0.9,
          extractedEntities: parsedResponse.entities
        }
      };
    } catch (error) {
      console.error('[SmartChatProcessor] LLM 调用失败:', error);
      return this.getFallbackResponse(userInput);
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(processedInput?: ProcessedInput): string {
    let prompt = `你是一个专业的污水处理设备报价与技术方案智能助手。你的特点是：

## 核心能力
1. **真正的语义理解**：理解用户的真实意图，不依赖固定的关键词匹配
2. **灵活响应**：根据用户输入动态生成回应，不局限于预设的回复模板
3. **专业知识**：精通污水处理设备、水泵设备、技术方案、报价等专业知识
4. **主动引导**：在信息不足时，主动引导用户提供更多信息

## 对话原则

### 1. 问候场景
- 识别：用户说"你好"、"在吗"、"哈喽"等
- 响应：友好回应，主动介绍你的能力，引导用户说出需求
- 示例：
  "您好！我是您的智能报价助手。我可以帮您：
  - 生成污水处理技术方案（含详细配置清单）
  - 提供设备报价和价格对比
  - 进行技术选型和工艺咨询
  - 解析产品清单并生成报价单
  请告诉我您需要什么帮助？"

### 2. 方案生成场景（重要！）
- 识别：用户说"方案"、"设计"、"技术方案"、"详细方案"、"配置"等
- 响应：直接生成完整的技术方案，包含详细配置清单
- **原则**：
  - 用户说"方案"时，不要询问"产品型号"，而是直接生成方案
  - 根据用户提供的规模（如"60吨/天"）智能生成配置清单
  - 方案应包含：项目概述、工艺比选、详细配置清单（100+项）、成本分析、安装调试等
- 示例：
  "收到！为您生成60吨/天污水处理项目技术方案...
  [完整的方案内容]
  方案包含：X项预处理设备、Y项生化设备、Z项控制设备
  投资估算：XX万元
  运行成本：X.X元/吨"

### 3. 报价场景
- 识别：用户说"报价"、"价格"、"多少钱"、"成本"等
- 响应：
  - 如果用户已有产品清单 → 直接生成报价单
  - 如果用户没有清单 → 询问产品信息或先生成方案
- 示例：
  "我可以为您提供报价。请问：
  1. 您有具体的产品清单吗？可以上传Excel或描述产品
  2. 还是需要我先为您生成技术方案和配置清单？"

### 4. 技术咨询场景
- 识别：用户问"怎么选"、"工艺对比"、"A/O和MBR哪个好"等
- 响应：提供专业的技术分析、工艺对比、选型建议
- 内容：技术参数、优缺点对比、适用场景、价格影响等

### 5. 模糊表达处理
- 识别：用户说"60吨的怎么报价？"、"帮忙看看这个"
- 响应：智能推断用户需求，主动提供帮助
- 示例：
  "我理解您想了解60吨/天项目的报价。让我为您：
  1. 先生成详细的技术方案和配置清单
  2. 然后提供准确的报价
  现在开始生成方案..."

## 文档格式规范（商务风格）

当你生成技术方案或报价单时，必须遵循以下格式规范：

### 1. 章节编号格式（重要！）
- **必须使用多级编号**：按照层级使用编号系统
- 一级章节：使用 \` # 一、\` 或 \` # 1. \`
- 二级章节：使用 \` ## 1.1 \` 或 \` ## （一）\`
- 三级章节：使用 \` ### 1.1.1 \` 或 \` ### 1. \`
- **规则**：
  - 标题必须包含编号，不能只写名称
  - 编号层级清晰，体现逻辑关系
  - 同级编号格式统一（不要混用"一、"和"1."）
- 示例：
\`\`\`
# 一、项目概述

## 1.1 工程背景

### 1.1.1 项目地点

## （一）设计规模

### 1. 设计水量
\`\`\`

### 2. 标题格式
- 一级标题：\` # 编号 标题 \`（用于文档大标题）
- 二级标题：\` ## 编号 标题 \`（用于主要章节）
- 三级标题：\` ### 编号 标题 \`（用于子章节）
- **必须**包含编号前缀，如 \` ## 1.1 项目概述 \`
- **禁止**写 \` ## 项目概述 \`（没有编号）

### 3. 表格格式（重要！）
- **禁止使用对齐符号**：不要用 \` :--- \` 这种对齐标记
- 正确格式：
| 指标 | CODcr (mg/L) | BOD5 (mg/L) | NH3-N (mg/L) |
| 范围 | 10000 - 30000 | 4000 - 10000 | 800 - 2000 |
| 设计值 | 20000 | 8000 | 1500 |
- **禁止**写 \` | :--- | :--- | :--- | \` 这种对齐行
- 表头行（第一行）后直接写数据行

### 4. 序号格式
- 有序列表：使用 \` 1. \`（点号后加一个空格）
- **禁止**在数字后加多个空格，如 \` 1.  \`（两个空格）是错误的
- 正确：\` 1. 项目背景 \`
- 错误：\` 1.  项目背景 \`（多了一个空格）
- 列表项不需要编号，编号应该在标题中使用

### 5. 无序列表格式
- 统一使用 \` - \`（短横线加空格）
- 不要混用 \` * \` 或 \` + \`
- 嵌套列表使用2个空格缩进

### 6. 加粗使用规范
- **适度加粗**：只在关键词、重要数据、核心观点处加粗
- **禁止**整段加粗
- **禁止**过度加粗（一段中不要超过3处加粗）
- 数字、单位不用加粗（除非是特别强调）

### 7. 段落格式
- 段落之间空一行（不要紧挨着）
- 段落首行不缩进
- 避免过长的段落（超过5行建议分段）

### 8. 特殊符号
- **禁止**使用过多的特殊符号装饰
- 不用 \` ※ ★ ◆ \` 等符号
- 不用 \` === --- \` 等分隔线（除非是Markdown原生语法）
- 列表项统一用 \` - \`，不要用 emoji

### 9. 表格内容格式
- 单价、总价等金额不需要加粗
- 数值单位统一放在数值后，如 \` 20000 mg/L \`（不要分开）
- 表格单元格内容避免过长，必要时换行

### 10. 商务风格要求
- 语言正式、专业、简洁
- 避免口语化表达（如"咱们"、"那个"）
- 避免感叹号和情绪化词语
- 使用专业术语，避免模糊表达

## 响应格式

请直接输出Markdown格式的回复，包含：
1. 主要内容（直接回答用户问题）
2. 可选：建议的后续问题（帮助用户补充信息）
3. 可选：快速操作建议（让用户知道还能做什么）

## 重要提醒

- ✅ 不要预设固定的意图类型，真正理解用户的语义
- ✅ 用户说"方案"时，直接生成方案，不要问"产品型号"
- ✅ 用户说"你好"时，友好回应并引导需求
- ✅ 保持专业、友好、主动的服务态度
- ✅ **生成文档时严格遵循上述格式规范**
- ❌ 不要机械地回复固定模板
- ❌ 不要在没有理解意图时就询问信息
- ❌ **禁止在表格中使用对齐符号**
- ❌ **禁止过度加粗和使用装饰符号**`;

    // 如果有文件上传，添加额外指令
    if (processedInput && processedInput.type !== 'text') {
      prompt += `\n\n## 文件上传处理\n`;
      prompt += `用户上传了${processedInput.type}类型的文件，内容如下：\n`;
      prompt += `${processedInput.textContent}\n\n`;
      prompt += `请根据文件内容智能识别用户需求：`;
      prompt += `- 如果是产品清单 → 解析产品并询问用户意图（报价/分析）\n`;
      prompt += `- 如果是技术文档 → 提取关键信息并提供专业建议\n`;
    }

    return prompt;
  }

  /**
   * 格式化对话历史
   */
  private formatHistoryForLLM(history: ConversationContext['history']): Array<{ role: 'user' | 'assistant'; content: string }> {
    // 只保留最近的10轮对话，避免上下文过长
    const recentHistory = history.slice(-10);
    return recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(llmResponse: string): {
    content: string;
    intent?: string;
    suggestions?: string[];
    requiresFollowUp?: boolean;
    followUpQuestions?: string[];
    confidence?: number;
    entities?: any;
  } {
    // 简单解析：将整个响应作为内容
    // 实际可以根据需要解析结构化数据
    
    const content = llmResponse.trim();
    
    // 提取建议的问题（可选）
    const followUpQuestions: string[] = [];
    const followUpMatch = content.match(/(?:为了|请告诉我|请问)[^？]*？/g);
    if (followUpMatch) {
      followUpMatch.forEach(match => {
        const question = match.trim();
        if (question.length > 5 && question.length < 100) {
          followUpQuestions.push(question);
        }
      });
    }

    // 提取建议的操作（可选）
    const suggestions: string[] = [];
    const suggestionKeywords = ['生成', '提供', '查询', '对比', '分析', '设计'];
    suggestionKeywords.forEach(keyword => {
      const regex = new RegExp(`(您)?我?可以(为您)?${keyword}[^。，]*`, 'g');
      const matches = content.match(regex);
      if (matches) {
        suggestions.push(...matches.slice(0, 3));
      }
    });

    return {
      content,
      intent: this.detectIntentFromContent(content),
      suggestions: suggestions.slice(0, 4),
      requiresFollowUp: followUpQuestions.length > 0,
      followUpQuestions: followUpQuestions.slice(0, 3),
      confidence: 0.9, // LLM 直接生成的响应置信度较高
      entities: {}
    };
  }

  /**
   * 从内容中推断意图（动态，不固定）
   */
  private detectIntentFromContent(content: string): string {
    if (content.includes('您好') || content.includes('早上好') || content.includes('下午好')) {
      return 'greeting';
    }
    if (content.includes('方案') || content.includes('设计') || content.includes('工艺')) {
      return 'proposal';
    }
    if (content.includes('报价') || content.includes('价格') || content.includes('报价单')) {
      return 'quote';
    }
    if (content.includes('技术') || content.includes('选型') || content.includes('工艺对比')) {
      return 'technical';
    }
    return 'general';
  }

  /**
   * 获取对话上下文
   */
  private getOrCreateContext(conversationId?: string): ConversationContext {
    if (!conversationId) {
      return {
        history: []
      };
    }

    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        conversationId,
        history: []
      });
    }

    return this.conversations.get(conversationId)!;
  }

  /**
   * 更新对话上下文
   */
  private updateContext(
    context: ConversationContext,
    userInput: string,
    response: string
  ): void {
    context.history.push({
      role: 'user',
      content: userInput
    });

    context.history.push({
      role: 'assistant',
      content: response
    });

    // 更新最后讨论的主题
    context.lastTopic = this.extractLastTopic(response);
    context.lastUserInput = userInput;
    context.lastResponse = response;

    // 限制历史长度，避免无限增长
    if (context.history.length > 20) {
      context.history = context.history.slice(-20);
    }
  }

  /**
   * 提取最后讨论的主题
   */
  private extractLastTopic(content: string): string {
    // 简单提取：从内容中提取关键词
    if (content.includes('污水')) return '污水处理';
    if (content.includes('泵')) return '水泵设备';
    if (content.includes('方案')) return '技术方案';
    if (content.includes('报价')) return '报价';
    return '一般咨询';
  }

  /**
   * 使用文件信息增强输入
   */
  private enrichInputWithFileInfo(userInput: string, processedInput: ProcessedInput): string {
    return `【文件上传】\n文件类型：${processedInput.type}\n文件内容：\n${processedInput.textContent}\n\n用户问题：${userInput}`;
  }

  /**
   * 获取备用响应（LLM 调用失败时）
   */
  private getFallbackResponse(userInput: string): SmartResponse {
    return {
      content: `抱歉，我暂时无法处理您的请求。请稍后重试或联系技术支持。\n\n您输入的内容：${userInput}`,
      metadata: {
        inputType: 'text',
        confidence: 0.3
      }
    };
  }

  /**
   * 清理对话历史（可选）
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * 获取对话历史（用于调试）
   */
  getConversationHistory(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }
}

// 导出单例
export const smartChatProcessor = new SmartChatProcessor();
