import { ProcessedInput } from './input-processor';

export type UserIntent = 
  | 'ask_quote'      // 询问报价
  | 'upload_document' // 上传文档（需要解析）
  | 'ask_general'     // 一般性问题
  | 'compare_quotes'  // 比较报价
  | 'modify_quote'    // 修改报价
  | 'export_quote'    // 导出报价
  | 'unknown';        // 未知意图

export interface IntentResult {
  intent: UserIntent;
  confidence: number; // 0-1 置信度
  entities: {
    productType?: string;
    quantity?: number;
    fileType?: string;
    operation?: string;
    specifications?: string;
    brand?: string;
    [key: string]: any;
  };
  originalInput: ProcessedInput;
}

export class IntentDetector {
  
  /**
   * 判断用户意图
   * 结合规则和关键词匹配
   */
  async detect(input: ProcessedInput): Promise<IntentResult> {
    console.log('[IntentDetector] 检测意图，输入类型:', input.type);
    
    // 策略1：基于输入类型的规则判断
    const typeBasedIntent = this.detectByType(input);
    if (typeBasedIntent.confidence > 0.8) {
      console.log('[IntentDetector] 类型匹配成功:', typeBasedIntent.intent);
      return typeBasedIntent;
    }
    
    // 策略2：基于关键词的规则判断
    const keywordBasedIntent = this.detectByKeywords(input.textContent);
    if (keywordBasedIntent.confidence > 0.6) {
      console.log('[IntentDetector] 关键词匹配成功:', keywordBasedIntent.intent, '置信度:', keywordBasedIntent.confidence);
      return keywordBasedIntent;
    }
    
    // 策略3：如果文本内容为空，返回未知
    if (!input.textContent || input.textContent.trim() === '' || input.textContent.startsWith('[图片文件]')) {
      return {
        intent: 'unknown',
        confidence: 0.5,
        entities: {
          fileType: input.type
        },
        originalInput: input
      };
    }
    
    // 策略4：取置信度较高的结果
    const result = typeBasedIntent.confidence > keywordBasedIntent.confidence 
      ? typeBasedIntent 
      : keywordBasedIntent;
    
    console.log('[IntentDetector] 最终意图:', result.intent, '置信度:', result.confidence);
    return result;
  }
  
  /**
   * 基于输入类型判断
   */
  private detectByType(input: ProcessedInput): IntentResult {
    // 文件上传：明确是上传文档的意图
    if (input.type === 'excel' || input.type === 'word' || input.type === 'pdf') {
      return {
        intent: 'upload_document',
        confidence: 0.95,
        entities: {
          fileType: input.type,
          fileName: input.metadata.fileName
        },
        originalInput: input
      };
    }
    
    // 图片上传：需要进一步分析
    if (input.type === 'image') {
      return {
        intent: 'upload_document',
        confidence: 0.7,
        entities: {
          fileType: 'image'
        },
        originalInput: input
      };
    }
    
    // 文本输入：需要进一步分析
    return {
      intent: 'unknown',
      confidence: 0.3,
      entities: {},
      originalInput: input
    };
  }
  
  /**
   * 基于关键词判断（增强版）
   */
  private detectByKeywords(text: string): IntentResult {
    const lowerText = text.toLowerCase();
    
    // 报价相关关键词（增强版）
    const quoteKeywords = [
      '报价', '价格', '多少钱', '怎么卖', '成本', '预算', '售价', '价位',
      'quote', 'price', 'cost', 'how much', 'pricing', '多少钱', '价格多少',
      '报价单', '价格表'
    ];
    
    // 比较相关关键词
    const compareKeywords = [
      '比较', '对比', '哪个好', '区别', '差异', 'vs', 'versus',
      'compare', 'vs', 'difference', 'versus', '与...相比', '更好'
    ];
    
    // 修改相关关键词
    const modifyKeywords = [
      '修改', '调整', '变更', '更新', '编辑', '改一下',
      'modify', 'change', 'update', 'edit', '更改'
    ];
    
    // 导出相关关键词
    const exportKeywords = [
      '导出', '下载', '保存', '生成文件', '打印',
      'export', 'download', 'save', 'generate', '输出'
    ];
    
    // 产品类型关键词
    const productKeywords = [
      '泵', '阀', '罐', '电机', '设备', '机器', '装置', '污水', '处理',
      'pump', 'valve', 'tank', 'motor', 'equipment'
    ];
    
    // 计算匹配分数 - 使用更直接的匹配方式
    const matchScore = (keywords: string[]): number => {
      let matches = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          matches++;
          console.log(`[IntentDetector] 匹配到关键词: "${keyword}"`);
        }
      }
      // 如果有匹配，返回基础分 + 匹配数量加成
      if (matches > 0) {
        return 0.5 + (matches * 0.1);
      }
      return 0;
    };
    
    // 计算每个意图的分数
    const quoteScore = matchScore(quoteKeywords);
    const compareScore = matchScore(compareKeywords);
    const modifyScore = matchScore(modifyKeywords);
    const exportScore = matchScore(exportKeywords);
    
    console.log('[IntentDetector] 关键词匹配分数:', {
      ask_quote: quoteScore,
      compare_quotes: compareScore,
      modify_quote: modifyScore,
      export_quote: exportScore
    });
    
    // 找出最高分
    let maxIntent: UserIntent = 'ask_general';
    let maxScore = 0.4; // 默认分数降低一点
    
    const scores = {
      ask_quote: quoteScore,
      compare_quotes: compareScore,
      modify_quote: modifyScore,
      export_quote: exportScore
    };
    
    for (const [intent, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxIntent = intent as UserIntent;
      }
    }
    
    // 提取可能的数量实体
    const quantityMatch = lowerText.match(/(\d+)(?:\s*个|\s*台|\s*套|\s*只|\s*件|\s*吨)/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1]) : undefined;
    
    // 提取产品类型
    let productType: string | undefined;
    for (const keyword of productKeywords) {
      if (lowerText.includes(keyword)) {
        productType = keyword;
        break;
      }
    }
    
    // 如果分数太低，返回 general
    if (maxScore < 0.5) {
      return {
        intent: 'ask_general',
        confidence: 0.5,
        entities: {
          quantity,
          productType
        },
        originalInput: { type: 'text', textContent: text, rawContent: text, metadata: {} }
      };
    }
    
    return {
      intent: maxIntent,
      confidence: Math.min(maxScore, 0.95),
      entities: {
        quantity,
        productType,
        matchedKeywords: maxIntent
      },
      originalInput: { type: 'text', textContent: text, rawContent: text, metadata: {} }
    };
  }
}
