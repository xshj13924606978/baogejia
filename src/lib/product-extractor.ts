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
   - 保留容量单位作为型号的一部分：如"100立方"提取为"100立方"，"5m³"提取为"5m³"
   - 中文数字转换：两立方 -> 2立方，二立方 -> 2立方，三立方 -> 3立方

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
- "2立方的化粪池多少钱" -> productName="化粪池", model="2立方", parameter_description=""
- "化粪池2立方价格" -> productName="化粪池", model="2立方", parameter_description=""
- "两立方化粪池" -> productName="化粪池", model="2立方", parameter_description=""
- "2m³化粪池" -> productName="化粪池", model="2m³", parameter_description=""
- "2方化粪池设备" -> productName="化粪池", model="2方", parameter_description=""
- "HFC化粪池2立方" -> productName="化粪池", model="2立方", brand="HFC", parameter_description=""
- "化粪池 60m³ 进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm" -> productName="化粪池", model="60m³", parameter_description="进出水管口径：DN160pvc，规格尺寸：Φ4800×3000mm"
- "药剂搅拌系统 11kW 不锈钢材质" -> productName="药剂搅拌系统", model="11kW", parameter_description="不锈钢材质"

输出格式（JSON）：
{
  "productName": "产品名称",
  "model": "型号（可选，保留容量单位如立方、m³、m3等）",
  "parameter_description": "参数描述（可选，如果输入中有详细规格则必须提取）",
  "brand": "品牌（可选）",
  "confidence": 95,
  "explanation": "简短说明提取逻辑"
}

重要提醒：
- 如果无法提取出产品名称，返回 null
- 型号必须是阿拉伯数字或字母数字组合，中文数字需要转换
- 容量单位（立方、立方米、m³、m3、方）是型号的组成部分，必须保留
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

      // 标准化型号 — 将容量单位统一为数据库中的 "m³" 格式
      // 数据库中 model 字段存储的是 "5m³"、"25m³" 等值
      let model = result.model;
      if (model) {
        const volumeNormMap: [RegExp, string][] = [
          [/(\d+(?:\.\d+)?)\s*立方米/i, '$1m³'],
          [/(\d+(?:\.\d+)?)\s*立方/i, '$1m³'],
          [/(\d+(?:\.\d+)?)\s*方/i, '$1m³'],
          [/(\d+(?:\.\d+)?)\s*m3\b/i, '$1m³'],
        ];
        let volumeNormalized = false;
        for (const [pattern, replacement] of volumeNormMap) {
          if (pattern.test(model)) {
            model = model.replace(pattern, replacement);
            volumeNormalized = true;
            break;
          }
        }

        // 非容量单位：剥离无关单位（长度、重量等）
        if (!volumeNormalized) {
          const irrelevantUnitPattern = /(毫米|mm|厘米|cm|米|m(?!³|3)|吨|kg|g|升|L(?!M)|ML|万|亿|瓦|W|伏|V|安|A|Hz)$/i;
          if (irrelevantUnitPattern.test(model)) {
            const numberMatch = model.match(/(\d+(\.\d+)?)/);
            if (numberMatch) {
              model = numberMatch[1];
            }
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
   * 中文数字转阿拉伯数字（支持组合：十五→15，二十→20，一百五十→150）
   */
  private static convertChineseNumber(str: string): string {
    const digitMap: Record<string, number> = {
      '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    };
    const unitMap: Record<string, number> = {
      '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000,
    };

    if (unitMap[str] !== undefined && digitMap[str[0]] === undefined) {
      return String(unitMap[str]);
    }

    let result = 0;
    let current = 0;
    let section = 0;

    for (const char of str) {
      if (digitMap[char] !== undefined) {
        current = digitMap[char];
      } else if (unitMap[char] !== undefined) {
        const unit = unitMap[char];
        if (unit >= 10000) {
          section = (section + (current || 1)) * unit;
          result += section;
          section = 0;
          current = 0;
        } else {
          section += (current || 1) * unit;
          current = 0;
        }
      }
    }

    result += section + current;
    return String(result || 0);
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


      // 3. 提取型号（多种模式，按优先级）
      const patterns = [
        // 模式1: 中文数字 + 容量单位（两立方、二十方、一百五十方等）
        // 注意：两=2 是特殊映射，需要单独处理
        /([一二两三四五六七八九十百千万亿]+)\s*(立方米|立方|m³|m3|方)/gi,
        // 模式2: 数字 + 单位（100立方米、5方、50吨、100g/h、2kg/h、500mg/L 等）
        // 注意：立方米必须在立方之前（更长匹配优先）
        /(\d+(\.\d+)?)\s*(立方米|立方|m³|m3|方|吨|升|L|ML|万|亿|[gGkKtT][gGkKmMlL]?\s*(\/\s*[hHmMdDmin分钟秒秒天])?|[mM][gGlL]\s*(\/\s*[hHmMdDmin分钟秒秒天])?)/gi,
        // 模式3: 字母数字组合（HFC-13、PW-100、10M、5.5K）
        /([A-Za-z]+[-_]\d+(\.\d+)?[A-Za-z]*|[A-Za-z]*[-_]?\d+(\.\d+)?[A-Za-z]+)/gi,
        // 模式4: 纯数字（100、50、10）— 仅作为最后兜底
        /(\d+(\.\d+)?)/g,
      ];

      let model: string | undefined;
      let modelMatch: RegExpExecArray | null = null;

      for (const pattern of patterns) {
        pattern.lastIndex = 0; // 重置正则表达式
        modelMatch = pattern.exec(cleaned);
        if (modelMatch && modelMatch.length > 0) {
          // 提取整个匹配（包含单位），而不是仅数字部分
          // 例如 "5方" 取 "5方"，"100g/h" 取 "100g/h"，"HFC-13" 取 "HFC-13"
          model = modelMatch[0].trim();

          // 如果包含中文数字，转换为阿拉伯数字（如 "十方" → "10方"、"十五方" → "15方"）
          const chineseNumPattern = /[一二两三四五六七八九十百千万亿]+/;
          const chineseNumMatch = model.match(chineseNumPattern);
          if (chineseNumMatch) {
            const converted = this.convertChineseNumber(chineseNumMatch[0]);
            model = model.replace(chineseNumMatch[0], converted);
          }

          // 容量单位标准化：将各种容量单位统一为 "m³"
          const volumeNormRules: [RegExp, string][] = [
            [/(\d+(?:\.\d+)?)\s*立方米/i, '$1m³'],
            [/(\d+(?:\.\d+)?)\s*立方/i, '$1m³'],
            [/(\d+(?:\.\d+)?)\s*方/i, '$1m³'],
            [/(\d+(?:\.\d+)?)\s*m3\b/i, '$1m³'],
          ];
          let volNormed = false;
          for (const [pat, repl] of volumeNormRules) {
            if (pat.test(model)) {
              model = model.replace(pat, repl);
              volNormed = true;
              break;
            }
          }
          // 非容量单位：剥离无关单位
          if (!volNormed) {
            const irrelevantUnitPattern = /(毫米|mm|厘米|cm|米|m(?!³|3)|吨|kg|g|升|L(?!M)|ML|万|亿|瓦|W|伏|V|安|A|Hz)$/i;
            if (irrelevantUnitPattern.test(model)) {
              const numberMatch = model.match(/(\d+(\.\d+)?)/);
              if (numberMatch) {
                model = numberMatch[1];
              }
            }
          }
          break;
        }
      }

      // 4. 从输入中移除型号，得到产品名称
      let productName = cleaned;
      if (model && modelMatch) {
        // 移除匹配的整个模式，不仅仅是型号数字
        productName = cleaned.replace(modelMatch[0], '').trim();
      }

      // 5. 清理产品名称（使用增强的清理逻辑）
      productName = this.cleanProductName(productName);

      // 6. 验证结果
      if (!productName || productName.length < 2) {
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

    // 策略1: 使用 LLM 提取（最高优先级）
    const llmResult = await this.extractWithLLM(userInput);
    if (llmResult && llmResult.confidence > 60) {
      return llmResult;
    }

    // 策略2: 使用规则匹配（回退方案）
    const ruleResult = this.extractWithRules(userInput);
    if (ruleResult) {
      return ruleResult;
    }

    return null;
  }

  /**
   * 标准化输入文本
   * 注意：不要替换数字中的小数点
   */
  private static normalizeInput(input: string): string {
    return (
      input
        // 不转小写！保留原始大小写（HFC-13、DN50 等需要大小写）
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
        // 移除常见修饰词（精确词组替换，避免误删单字）
        .replace(/型号|规格|品牌|系列|款式|种类|类型/g, '')
        // 移除残留的容量单位
        .replace(/\d+(\.\d+)?\s*(立方米|立方|m³|m3|方)\b/gi, '')
        // 移除残留的长度单位
        .replace(/\d+(\.\d+)?\s*(mm|cm|厘米|米)\b/gi, '')
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

/**
 * 通用参数回退提取函数（当 LLM 提取失败时使用正则回退）
 * 从任意产品的 parameter_description 中提取参数键值对
 * 返回 Record<string, string>，如 {"排气量": "0.8m³/min", "功率": "5.5KW"}
 */
export function fallbackExtractParams(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;

  // 通用键值对提取
  const kvRegex = /([^，,、\n]+?)\s*[：:：]\s*([^，,、\n]+)/g;
  let match;
  while ((match = kvRegex.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value && key.length < 20 && value.length < 30) {
      result[key] = value;
    }
  }

  return result;
}
