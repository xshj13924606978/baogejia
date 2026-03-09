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
import { PriceMatcher, ProductMatch, PriceMatchResult } from './price-matching';

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
   * 检测价格查询意图
   */
  private detectPriceQuery(userInput: string): { isPriceQuery: boolean; productName?: string; model?: string } {
    // 价格查询关键词
    const priceKeywords = ['多少钱', '价格', '单价', '售价', '报价', '成本', '费用'];
    const hasPriceKeyword = priceKeywords.some(keyword => userInput.includes(keyword));

    if (!hasPriceKeyword) {
      return { isPriceQuery: false };
    }

    // 提取产品名称（简单提取，实际可以使用更复杂的NLP）
    // 移除价格查询关键词
    let productName = userInput;
    priceKeywords.forEach(keyword => {
      productName = productName.replace(keyword, '');
    });

    // 移除常见的量词（一个、一台、一套等）
    const unitKeywords = ['一个', '一台', '一套', '一件', '一只', '一支', '每台', '每套', '每件'];
    unitKeywords.forEach(keyword => {
      productName = productName.replace(keyword, '');
    });

    // 清理标点符号和多余空格
    productName = productName.replace(/[？?！!，,。.;;、\s]+/g, ' ').trim();

    if (productName.length === 0) {
      return { isPriceQuery: false };
    }

    // 尝试提取型号（例如：10M、PW-100、KQ-150等）
    // 改进正则表达式，更好地匹配型号
    const modelMatch = productName.match(/\b([A-Za-z]*[-_]?\d+[A-Za-z]*|\d+[A-Za-z]+\b)/);
    const model = modelMatch ? modelMatch[1].trim() : undefined;

    // 如果找到型号，从产品名称中移除
    if (model) {
      productName = productName.replace(model, '').trim();
    }

    return {
      isPriceQuery: true,
      productName: productName || userInput,
      model
    };
  }

  /**
   * 处理价格查询
   */
  private async handlePriceQuery(
    productName: string,
    model?: string
  ): Promise<{ priceData?: PriceMatchResult; contextInfo?: string }> {
    console.log('[SmartChatProcessor] 处理价格查询:', productName, model);

    try {
      const productMatch: ProductMatch = {
        name: productName,
        model,
      };

      // 调用价格匹配器
      const priceResult = await PriceMatcher.matchPrice(productMatch);

      console.log('[SmartChatProcessor] 价格查询结果:', priceResult);

      // 生成上下文信息
      let contextInfo = '';
      if (priceResult) {
        contextInfo = `\n\n【数据库价格查询结果】\n`;
        contextInfo += `产品名称：${priceResult.productName || productName}\n`;
        if (model) {
          contextInfo += `规格型号：${model}\n`;
        }
        contextInfo += `单价：${priceResult.price.toFixed(2)} 元\n`;
        contextInfo += `价格来源：${this.getPriceSourceText(priceResult.source)}\n`;
        contextInfo += `置信度：${priceResult.confidence}%\n`;
        
        if (priceResult.source === 'market' && priceResult.marketSource) {
          contextInfo += `市场价来源：${priceResult.marketSource}\n`;
          contextInfo += `注意：此价格为市场参考价，实际价格可能因供应商、数量等因素而异。`;
        }
      }

      return {
        priceData: priceResult,
        contextInfo
      };
    } catch (error) {
      console.error('[SmartChatProcessor] 价格查询失败:', error);
      return {};
    }
  }

  /**
   * 获取价格来源文本
   */
  private getPriceSourceText(source: string): string {
    const sourceMap: Record<string, string> = {
      'database': '产品知识库（已验证）',
      'knowledge': '历史报价/案例',
      'market': '市场参考价',
      'estimate': '类别估算',
      'default': '默认兜底',
    };
    return sourceMap[source] || source;
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

    // 2.5. 检测价格查询并预处理
    let priceContextInfo = '';
    if (!processedInput || processedInput.type === 'text') {
      const priceQuery = this.detectPriceQuery(userInput);
      if (priceQuery.isPriceQuery && priceQuery.productName) {
        console.log('[SmartChatProcessor] 检测到价格查询:', priceQuery);
        const priceResult = await this.handlePriceQuery(priceQuery.productName, priceQuery.model);
        if (priceResult.contextInfo) {
          priceContextInfo = priceResult.contextInfo;
          enhancedInput += priceContextInfo;
          console.log('[SmartChatProcessor] 已添加价格查询结果到上下文');
        }
      }
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

### 3. 产品价格查询场景（重要！）
- 识别：用户询问具体产品的价格，如"XX产品多少钱？"、"普耐尔氩弧焊枪10M多少？"
- **价格查询优先级**（必须严格遵循！）：
  1. **产品库优先**（置信度90-100）- 优先从产品知识库数据库查询
  2. **知识库次之**（置信度60-80）- 从历史报价、案例中查询
  3. **市场价兜底**（置信度40-50）- 如果没有数据库记录，使用市场价
  4. **按类别估算**（置信度30-40）- 根据产品类别估算
  5. **默认兜底**（置信度20-30）- 最后的兜底方案
- **响应格式**：
  - 必须说明价格来源（产品库/知识库/市场价/估算）
  - 必须包含产品名称、规格型号、单价
  - 如果有多个匹配结果，列出所有结果供用户选择
  - 如果价格来源是"市场价"，需要说明这是参考价，实际价格可能因供应商、数量等因素而异
- **示例1：产品库匹配成功**：
  根据产品库查询，普耐尔氩弧焊枪10M的信息如下：

  | 产品名称 | 规格型号 | 单价（元） | 价格来源 | 备注 |
  | --- | --- | --- | --- | --- |
  | 普耐尔氩弧焊枪 | 10M | 150.00 | 产品库 | 已验证 |

  注：此价格来自产品知识库数据库，置信度高。

- **示例2：市场价兜底**：
  根据市场价查询，普耐尔氩弧焊枪10M的信息如下：

  | 产品名称 | 规格型号 | 单价（元） | 价格来源 | 备注 |
  | --- | --- | --- | --- | --- |
  | 普耐尔氩弧焊枪 | 10M | 120.00-180.00 | 市场参考价 | 3个供应商平均 |

  注：此价格为市场参考价，实际价格可能因供应商、数量等因素而异。建议联系供应商获取准确报价。

### 4. 报价场景
- 识别：用户说"报价"、"价格"、"多少钱"、"成本"等（非单一产品查询）
- 响应：
  - 如果用户已有产品清单 → 直接生成报价单
  - 如果用户没有清单 → 询问产品信息或先生成方案
- 示例：
  "我可以为您提供报价。请问：
  1. 您有具体的产品清单吗？可以上传Excel或描述产品
  2. 还是需要我先为您生成技术方案和配置清单？"

### 5. 技术咨询场景
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

### 0. 整体排版原则（重要！）
- **按章节组织内容**：每个主要部分独立成节，使用编号标题
- **表格优先**：凡是可以用表格呈现的内容，必须使用表格
  - 配置清单、参数对比、设备清单等必须用表格
  - 避免用列表或段落描述表格内容
- **视觉层次**：通过标题、空行、分隔线建立清晰的视觉层次
- **便于阅读**：段落不要太长，适当分段，重点突出

### 1. 章节编号格式（非常重要！必须严格遵循！）

**层级说明（CRITICAL）**：
- **文档标题**：整个文档的标题，**不带编号**，仅用一个井号表示标题
- **一级章节**：文档的主要部分/模块，**必须使用**中文编号格式（如"一、"、"二、"）
- **二级章节**：一级章节下的细分内容，**必须使用**数字编号（如"1.1"、"2.1"）
- **三级章节**：二级章节下的细分内容，**必须使用**数字编号（如"1.1.1"）
- **四级章节**：三级章节下的细分内容，**必须使用**数字编号（如"1.1.1.1"）

**具体规则（必须严格执行！）**：

**1. 文档标题（不带编号）**：
- 文档开头的总标题，不带任何编号
- 格式：使用单个井号开头，后面直接跟标题，不加编号
- 示例：
  - 单个井号 + 垃圾转运站渗滤液处理项目技术方案
  - 单个井号 + 60吨/天污水处理项目报价单

**2. 一级章节（#）- 文档的主要模块（强制使用中文编号！）**：
- 文档的**主要部分**或**独立模块**
- **格式（强制，二选一）**：
  - **格式A（推荐）**：单个井号 + 中文编号 + 标题（如"一、XXX"、"二、XXX"、"三、XXX"）
  - **格式B（允许）**：单个井号 + 第X章 + 标题（如"第一章 XXX"、"第二章 XXX"、"第三章 XXX"）
- **严格禁止**：不要使用纯数字编号（如"1. XXX"）、"0.1"格式
- **示例（格式A）**：
  - 单个井号 + 一、项目概述
  - 单个井号 + 二、工艺比选与确定
  - 单个井号 + 三、设备配置清单
  - 单个井号 + 四、成本分析
- **示例（格式B）**：
  - 单个井号 + 第一章 项目概述
  - 单个井号 + 第二章 工艺比选与确定
  - 单个井号 + 第三章 设备配置清单
  - 单个井号 + 第四章 成本分析

**3. 二级章节（##）- 一级章节的细分（从1.1开始！）**：
- 一级章节下的具体内容
- **格式（强制）**：两个井号 + 数字编号 + 标题（如"1.1 XXX"、"2.1 XXX"）
- **第一个一级章节的第一个二级必须是1.1**，绝对不能是0.1！
- **示例**：
  - 在"一、项目概述"下：两个井号 + 1.1 工程背景、两个井号 + 1.2 建设规模
  - 在"二、工艺比选与确定"下：两个井号 + 2.1 工艺方案对比、两个井号 + 2.2 推荐工艺

**4. 三级章节（###）- 二级章节的细分**：
- 二级章节下的具体内容
- **格式（强制）**：三个井号 + 数字编号 + 标题（如"1.1.1 XXX"、"1.1.2 XXX"）
- **示例**：
  - 在"1.1 工程背景"下：三个井号 + 1.1.1 项目地点、三个井号 + 1.1.2 周边环境

**5. 四级章节（####）- 三级章节的细分**：
- 仅在必要时使用
- **格式（强制）**：四个井号 + 数字编号 + 标题（如"1.1.1.1 XXX"）

**严格规则（CRITICAL，违反即错误！）**：
- ✅ 文档标题：单个井号 + 标题（无编号）
- ✅ 一级章节（格式A）：单个井号 + 中文编号 + 标题（必须用"一、"、"二、"等）
- ✅ 一级章节（格式B）：单个井号 + 第X章 + 标题（可以用"第一章"、"第二章"等）
- ✅ 二级章节：两个井号 + 数字编号 + 标题（必须从1.1开始，不能是0.1）
- ✅ 三级章节：三个井号 + 数字编号 + 标题（必须有编号）
- ✅ 四级章节：四个井号 + 数字编号 + 标题（必须有编号）
- ❌ 禁止：文档标题带编号（如单个井号 + 一、文档标题）
- ❌ 禁止：一级章节无编号（如单个井号 + 项目概述）
- ❌ 禁止：一级章节使用纯数字编号（如单个井号 + 1. 项目概述、单个井号 + 0.1 项目概述）
- ❌ 禁止：二级章节从0.1开始（必须从1.1开始）
- ❌ 禁止：混用编号格式（如同时使用"一、"和"1."）

**完整示例**：
\`\`\`
# 垃圾转运站渗滤液处理项目技术方案

# 一、项目概述
## 1.1 工程背景
### 1.1.1 项目地点
### 1.1.2 周边环境
## 1.2 建设规模

# 二、工艺比选与确定
## 2.1 工艺方案对比
## 2.2 推荐工艺

# 三、设备配置清单
\`\`\`

### 2. 标题格式
- 一级标题：\` # 编号 标题 \`（用于文档大标题）
- 二级标题：\` ## 编号 标题 \`（用于主要章节）
- 三级标题：\` ### 编号 标题 \`（用于子章节）
- **必须**包含编号前缀，如 \` ## 1.1 项目概述 \`
- **禁止**写 \` ## 项目概述 \`（没有编号）

### 3. 表格格式（重要！）
- **必须使用表格**：凡是可以用表格呈现的内容（参数、配置、清单、对比等），必须用表格
- **表格结构**：
  - 第一行：表头（字段名称）
  - 第二行开始：数据行
  - 每列有明确的表头，如"设备名称"、"规格参数"、"数量"等
- **详细设备配置清单表格必须包含的列**：
  - 序号
  - 设备名称
  - 规格型号/参数
  - 单位
  - 数量
  - 材质
  - 单价（元）- **必须包含**
  - 小计（元）- **必须包含**
  - 备注
- **禁止使用对齐符号**：不要用 \` :--- \` 这种对齐标记
- 正确格式：
| 指标 | CODcr (mg/L) | BOD5 (mg/L) | NH3-N (mg/L) |
| 范围 | 10000 - 30000 | 4000 - 10000 | 800 - 2000 |
| 设计值 | 20000 | 8000 | 1500 |
- 详细设备配置清单表格格式：
|序号|设备名称|规格型号/参数|单位|数量|材质|单价（元）|小计（元）|备注|
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
|1|机械格栅|栅隙3mm，N=0.55kW|台|1|304不锈钢|12000|12000| |
|2|调节池提升泵|Q=1m³/h，H=15m，N=0.75kW|台|2|耐腐蚀|3500|7000|一用一备|
- **禁止**写 \` | :--- | :--- | :--- | \` 这种对齐行
- **禁止**用列表或段落描述表格内容**：如下面的反例必须避免
  - ❌ 错误：设备1：XX型号，参数A：100，参数B：200；设备2：YY型号，参数A：150，参数B：250
  - ✅ 正确：用表格呈现（设备名称 | 型号 | 参数A | 参数B | XX | XX型号 | 100 | 200 | YY | YY型号 | 150 | 250）
- **表格内容格式**：
  - 单价、总价等金额不需要加粗，数字保留两位小数
  - 数值单位统一放在数值后，如 \` 20000 mg/L \`
  - 表格单元格内容避免过长，必要时换行

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

### 9. 商务风格要求
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
