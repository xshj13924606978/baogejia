/**
 * 智能产品信息提取器
 *
 * 核心理念：
 * 1. 使用 LLM 进行语义理解，应对千变万化的用户表达
 * 2. 多策略组合：LLM 提取 + 规则匹配 + 模糊搜索
 * 3. 宽松匹配 + 精确验证的策略
 *
 * 支持的用户表达方式：
 * - "化粪池100立方的多少钱一个"
 * - "100立方的化粪池价格"
 * - "化粪池，规格100立方米，多少钱"
 * - "HFC(GFE)13#型号化粪池多少钱"
 * - "化粪池 100立方 价格"
 * - "100m³化粪池报价"
 * - "化粪池型号100，成本价和售价"
 * - "查询一下化粪池，100立方的"
 */

import { callDeepSeekChat } from './deepseek-client';

export interface ExtractedProduct {
  productName: string;
  model?: string;
  parameter_description?: string;
  category?: string;
  brand?: string;
  confidence: number; // 0-100
  originalInput: string;
  normalizedInput: string;
}

export class ProductExtractor {
  /**
   * 使用 LLM 进行语义理解提取
   * 这是最高优先级的方法，能够理解各种复杂的表达方式
   */
  static async extractWithLLM(userInput: string): Promise<ExtractedProduct | null> {
    try {
      const systemPrompt = `你是一个专业的产品信息提取专家。你的任务是从用户的自然语言输入中提取产品信息。

提取规则：
1. 产品名称：提取核心产品名称，不包含型号、规格、品牌等信息
   - 例如："HFC(GFE)13#化粪池" -> "化粪池"
   - 例如："100立方化粪池" -> "化粪池"
   - 例如："普耐尔氩弧焊枪10M" -> "氩弧焊枪"
   - 例如："化粪池2立方设备" -> "化粪池"
   - 例如："两立方化粪池" -> "化粪池"

2. 型号：提取产品的型号、规格、容量等标识信息
   - 支持数字（100、10M、5.5）
   - 支持字母数字组合（HFC-13、PW-100、KQ-150）
   - 支持带单位（100立方、50吨、10M³、5L、两立方）
   - 提取时保留核心标识，如"100立方"提取为"100"
   - 中文数字转换：两立方 -> 2，二立方 -> 2，三立方 -> 3

3. 参数描述：提取详细的技术规格和参数信息（重要！）
   - 如果输入中包含详细的规格说明、尺寸、材质、性能参数等，必须提取到 parameter_description
   - 例如："化粪池 60m³ 进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm" -> parameter_description="进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm"
   - 例如："药剂搅拌系统 不锈钢搅拌器/功率11kW/380V；电机：佳木斯/减速机：宁波动力" -> parameter_description="不锈钢搅拌器/功率11kW/380V；电机：佳木斯/减速机：宁波动力"
   - 例如："Φ4000×3000mm" -> parameter_description="Φ4000×3000mm"
   - 如果只有简单的型号，参数描述可以留空或填写型号本身

4. 品牌：提取品牌信息（如果有）
   - 例如："普耐尔焊枪" -> "普耐尔"
   - 例如："广州金石化粪池" -> "广州金石"

5. 置信度：根据输入的清晰度给出0-100的分数

支持的输入模式示例：
- "2立方的化粪池多少钱" -> productName="化粪池", model="2", parameter_description=""
- "化粪池2立方价格" -> productName="化粪池", model="2", parameter_description=""
- "两立方化粪池" -> productName="化粪池", model="2", parameter_description=""
- "2m³化粪池" -> productName="化粪池", model="2", parameter_description=""
- "2方化粪池设备" -> productName="化粪池", model="2", parameter_description=""
- "HFC化粪池2立方" -> productName="化粪池", model="2", brand="HFC", parameter_description=""
- "化粪池 60m³ 进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm" -> productName="化粪池", model="60", parameter_description="进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm"
- "药剂搅拌系统 11kW 不锈钢材质" -> productName="药剂搅拌系统", model="11kW", parameter_description="不锈钢材质"

输出格式（JSON）：
{
  "productName": "产品名称",
  "model": "型号（可选，统一转换为阿拉伯数字）",
  "parameter_description": "参数描述（可选，如果输入中有详细规格则必须提取）",
  "brand": "品牌（可选）",
  "confidence": 95,
  "explanation": "简短说明提取逻辑"
}

重要提醒：
- 如果无法提取出产品名称，返回 null
- 型号必须是阿拉伯数字或字母数字组合，中文数字需要转换
- 如果输入中包含详细的规格、尺寸、材质等信息，必须提取到 parameter_description 字段
- 不要过度提取，保持信息准确`;

      const userPrompt = `请从以下用户输入中提取产品信息：

用户输入："${userInput}"

请输出JSON格式的提取结果。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // 低温度确保一致性
        maxTokens: 500,
      });

      // 解析 LLM 返回的 JSON
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[ProductExtractor] LLM 返回的不是有效的 JSON');
        return null;
      }

      const result = JSON.parse(jsonMatch[0]);

      // 验证提取结果
      if (!result.productName || result.productName.length === 0) {
        console.warn('[ProductExtractor] LLM 未提取到产品名称');
        return null;
      }

      // 标准化型号（移除单位，只保留数字或字母数字组合）
      let model = result.model;
      if (model) {
        const unitPattern = /(立方|立方米|m³|m3|吨|升|L|ML|毫米|mm|厘米|cm|米|m)/i;
        if (unitPattern.test(model)) {
          const numberMatch = model.match(/(\d+(\.\d+)?)/);
          if (numberMatch) {
            model = numberMatch[1];
            console.log('[ProductExtractor] LLM 提取的型号已标准化:', result.model, '->', model);
          }
        }
      }

      return {
        productName: result.productName,
        model,
        parameter_description: result.parameter_description,
        brand: result.brand,
        confidence: result.confidence || 70,
        originalInput: userInput,
        normalizedInput: this.normalizeInput(userInput),
      };
    } catch (error) {
      console.error('[ProductExtractor] LLM 提取失败:', error);
      return null;
    }
  }

  /**
   * 使用规则引擎提取（LLM 失败时的回退方案）
   * 基于正则表达式和关键词匹配
   */
  static extractWithRules(userInput: string): ExtractedProduct | null {
    try {
      const normalized = this.normalizeInput(userInput);

      // 1. 移除价格查询关键词
      const priceKeywords = [
        '多少钱',
        '价格',
        '单价',
        '售价',
        '报价',
        '成本',
        '费用',
        '询问',
        '查询',
        '想知道',
      ];
      let cleaned = normalized;
      priceKeywords.forEach((keyword) => {
        cleaned = cleaned.replace(keyword, '');
      });

      // 2. 移除量词
      const unitKeywords = [
        '一个',
        '一台',
        '一套',
        '一件',
        '一只',
        '一支',
        '每台',
        '每套',
        '每件',
        '个',
        '台',
        '套',
        '件',
        '座',
      ];
      unitKeywords.forEach((keyword) => {
        cleaned = cleaned.replace(keyword, '');
      });

      console.log('[ProductExtractor] 规则提取 - 移除查询词后:', cleaned);

      // 3. 提取型号（多种模式，按优先级）
      const patterns = [
        // 模式1: 中文数字 + 容量单位（两立方、二立方、三立方等）
        /([一二三四五六七八九十百千万亿]+)\s*(立方|立方米|m³|m3|方)\b/gi,
        // 模式2: 数字 + 容量单位（100立方、50吨、10升）
        /(\d+(\.\d+)?)\s*(立方|立方米|m³|m3|吨|升|升|L|ML|万|亿)\b/gi,
        // 模式3: 字母数字组合（HFC-13、PW-100、10M、5.5K）
        /([A-Za-z]*[-_]?\d+(\.\d+)?[A-Za-z]*|\d+(\.\d+)?[A-Za-z]+)/gi,
        // 模式4: 纯数字（100、50、10）
        /(\d+(\.\d+)?)/g,
      ];

      let model: string | undefined;
      let modelMatch: RegExpExecArray | null = null;

      for (const pattern of patterns) {
        pattern.lastIndex = 0; // 重置正则表达式
        modelMatch = pattern.exec(cleaned);
        if (modelMatch && modelMatch.length > 0) {
          // 提取第一个匹配的型号
          model = modelMatch[1].trim();
          console.log('[ProductExtractor] 规则提取 - 原始型号:', model);

          // 如果是中文数字，转换为阿拉伯数字
          const chineseNumbers: Record<string, string> = {
            一: '1',
            二: '2',
            三: '3',
            四: '4',
            五: '5',
            六: '6',
            七: '7',
            八: '8',
            九: '9',
            十: '10',
            百: '100',
            千: '1000',
            万: '10000',
            亿: '100000000',
          };

          if (/^[一二三四五六七八九十百千万亿]+$/.test(model)) {
            let converted = '';
            for (let i = 0; i < model.length; i++) {
              const char = model[i];
              converted += chineseNumbers[char] || char;
            }
            model = converted;
            console.log('[ProductExtractor] 规则提取 - 中文数字转换:', model);
          }

          // 如果是带单位的型号，只保留数字部分
          const unitPattern = /(立方|立方米|m³|m3|吨|升|L|ML|毫米|mm|厘米|cm|米|m|万|亿)/i;
          if (unitPattern.test(model)) {
            const numberMatch = model.match(/(\d+(\.\d+)?)/);
            if (numberMatch) {
              model = numberMatch[1];
            }
          }
          console.log('[ProductExtractor] 规则提取 - 最终型号:', model);
          break;
        }
      }

      // 4. 从输入中移除型号，得到产品名称
      let productName = cleaned;
      if (model && modelMatch) {
        // 移除匹配的整个模式，不仅仅是型号数字
        productName = cleaned.replace(modelMatch[0], '').trim();
        console.log('[ProductExtractor] 规则提取 - 移除型号后:', productName);
      }

      // 5. 清理产品名称（使用增强的清理逻辑）
      productName = this.cleanProductName(productName);
      console.log('[ProductExtractor] 规则提取 - 清理后产品名称:', productName);

      // 6. 验证结果
      if (!productName || productName.length < 2) {
        console.log('[ProductExtractor] 规则提取失败 - 产品名称无效');
        return null;
      }

      return {
        productName,
        model,
        parameter_description: model,
        confidence: 60, // 规则匹配置信度较低
        originalInput: userInput,
        normalizedInput: normalized,
      };
    } catch (error) {
      console.error('[ProductExtractor] 规则提取失败:', error);
      return null;
    }
  }

  /**
   * 智能提取（主方法）
   * 优先使用 LLM，失败时回退到规则匹配
   */
  static async extract(userInput: string): Promise<ExtractedProduct | null> {
    console.log('[ProductExtractor] ========== 开始智能提取 ==========');
    console.log('[ProductExtractor] 用户输入:', userInput);

    // 策略1: 使用 LLM 提取（最高优先级）
    const llmResult = await this.extractWithLLM(userInput);
    if (llmResult && llmResult.confidence > 60) {
      console.log('[ProductExtractor] ✅ LLM 提取成功:', llmResult);
      return llmResult;
    }

    // 策略2: 使用规则匹配（回退方案）
    const ruleResult = this.extractWithRules(userInput);
    if (ruleResult) {
      console.log('[ProductExtractor] ⚠️ 规则提取成功:', ruleResult);
      return ruleResult;
    }

    console.log('[ProductExtractor] ❌ 提取失败');
    return null;
  }

  /**
   * 标准化输入文本
   * 注意：不要替换数字中的小数点
   */
  private static normalizeInput(input: string): string {
    return (
      input
        .toLowerCase()
        // 替换标点符号，但保留数字中的小数点
        .replace(/[？?！!，,。;;、\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * 清理产品名称
   */
  private static cleanProductName(name: string): string {
    return (
      name
        .replace(/[型号|规格|品牌|系列|款式|款式|种类|类型]/g, '')
        // 移除容量单位
        .replace(/\d+(\.\d+)?\s*(立方|立方米|m³|m3)\b/gi, '')
        // 移除长度单位（如果在型号被移除后还残留）
        .replace(/\d+(\.\d+)?\s*(mm|mm|cm|厘米|m|米)\b/gi, '')
        .replace(/[，,。.;;、]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * 验证提取结果的合理性
   */
  static validate(extraction: ExtractedProduct): boolean {
    // 产品名称不能为空
    if (!extraction.productName || extraction.productName.length < 2) {
      return false;
    }

    // 产品名称不能是纯数字
    if (/^\d+$/.test(extraction.productName)) {
      return false;
    }

    // 产品名称不能是纯符号
    if (/^[^\w\u4e00-\u9fa5]+$/.test(extraction.productName)) {
      return false;
    }

    return true;
  }
}
