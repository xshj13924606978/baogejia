/**
 * 报价单工具函数
 */

import { Product, FeeConfig, FeeSummary, GroupInfo, GroupType } from '@/types/quote';

/**
 * 计算产品总价
 */
export const calculateProductTotal = (quantity: number, unitPrice: number): number => {
  return quantity * unitPrice;
};

/**
 * 计算小计
 */
export const calculateSubtotal = (products: Product[]): number => {
  return products.reduce((sum, product) => {
    return sum + calculateProductTotal(product.quantity, product.unitPrice);
  }, 0);
};

/**
 * 计算税金
 */
export const calculateTaxAmount = (subtotal: number, taxRate: number): number => {
  return subtotal * (taxRate / 100);
};

/**
 * 计算费用汇总
 */
export const calculateFeeSummary = (products: Product[], feeConfig: FeeConfig): FeeSummary => {
  const subtotal = calculateSubtotal(products);
  const taxAmount = calculateTaxAmount(subtotal, feeConfig.taxRate);

  return {
    subtotal,
    taxAmount,
    shippingFee: feeConfig.shippingFee,
    installationFee: feeConfig.installationFee,
    otherFee: feeConfig.otherFee,
    totalAmount:
      subtotal + taxAmount + feeConfig.shippingFee + feeConfig.installationFee + feeConfig.otherFee,
  };
};

/**
 * 按分组类型对产品进行分组
 */
export const groupProducts = (products: Product[], groupType: GroupType): GroupInfo[] => {
  if (groupType === 'none') {
    return [{ type: 'none', name: '全部产品', products }];
  }

  const groups = new Map<string, Product[]>();

  products.forEach((product) => {
    let key = '未分类';

    switch (groupType) {
      case 'category':
        key = product.category || '未分类';
        break;
      case 'brand':
        key = product.brand || '未分类';
        break;
      case 'system':
        key = product.system || '未分类';
        break;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(product);
  });

  return Array.from(groups.entries()).map(([name, products]) => ({
    type: groupType,
    name,
    products,
  }));
};

/**
 * 格式化金额为中文大写
 */
export const formatAmountToChinese = (amount: number): string => {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];
  const _decimalUnits = ['角', '分'];

  if (amount === 0) return '零元整';

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let result = '';

  if (integerPart > 0) {
    let str = integerPart.toString();
    let zeroFlag = false;

    for (let i = 0; i < str.length; i++) {
      const digit = parseInt(str[i]);
      const unitIndex = str.length - 1 - i;

      if (digit === 0) {
        zeroFlag = true;
        if (unitIndex === 4 || unitIndex === 8) {
          result += units[unitIndex];
        }
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += digits[digit] + units[unitIndex];
      }
    }

    result += '元';
  }

  if (decimalPart > 0) {
    const jiao = Math.floor(decimalPart / 10);
    const fen = decimalPart % 10;

    if (jiao > 0) {
      result += digits[jiao] + '角';
    }
    if (fen > 0) {
      result += digits[fen] + '分';
    }
  } else {
    result += '整';
  }

  return result;
};

/**
 * 动态生成报价单标题
 */
export const getQuoteTitle = (products: any[]): string => {
  const productCount = products?.length || 0;
  if (productCount === 0) return '报价单';

  // 获取主要产品类别（如果有）
  const categories = new Set(products.map((p) => p.category).filter((c) => c && c !== '未分类'));

  // 获取主要品牌（如果有）
  const brands = new Set(products.map((p) => p.brand).filter((b) => b && b.trim() !== ''));

  // 计算总价
  const totalAmount = products.reduce((sum, p) => sum + (p.totalPrice || 0), 0);

  // 根据产品数量、类别、品牌和总价生成智能标题
  if (productCount === 1) {
    // 单个产品
    const product = products[0];
    if (product.category && product.category !== '未分类') {
      return `${product.category}报价单`;
    }
    return '产品报价单';
  }

  // 多个产品，根据内容生成更精准的标题
  let titlePrefix = '';

  // 优先使用类别作为前缀
  if (categories.size === 1) {
    const category = Array.from(categories)[0];
    titlePrefix = category;
  } else if (categories.size > 1 && categories.size <= 3) {
    // 有2-3个类别，可以组合显示
    titlePrefix = Array.from(categories).join('+');
  } else if (brands.size === 1) {
    // 类别多但品牌单一，使用品牌
    const brand = Array.from(brands)[0];
    titlePrefix = `${brand}品牌`;
  }

  // 根据总价和产品数量判断是小型、中型还是大型项目
  if (totalAmount < 10000) {
    // 小型项目
    if (titlePrefix) {
      return `${titlePrefix}报价单`;
    }
    return '产品报价单';
  } else if (totalAmount < 100000) {
    // 中型项目
    if (titlePrefix) {
      return `${titlePrefix}项目报价单`;
    }
    return '工程项目报价单';
  } else {
    // 大型项目
    if (titlePrefix) {
      return `${titlePrefix}整体解决方案报价单`;
    }
    return '完整解决方案报价单';
  }
};

/**
 * 动态生成总价标题
 */
export const getTotalTitle = (products: any[]): string => {
  const productCount = products?.length || 0;
  if (productCount === 0) return '总价';
  if (productCount === 1) return '产品总价';

  // 计算总价
  const totalAmount = products.reduce((sum, p) => sum + (p.totalPrice || 0), 0);

  if (totalAmount < 10000) {
    return '产品总价';
  } else {
    return '工程总价';
  }
};

/**
 * 生成报价单编号
 * 格式：公司简称首字母+年月日+千位阿拉伯数字
 * 例如：ABC20250115001
 * @param companyAbbr 公司简称
 * @param db 数据库连接
 * @returns 报价单编号
 */
export const generateQuoteNumber = async (companyAbbr: string, db: any): Promise<string> => {
  // 提取公司简称首字母（只取中文或英文的首字母）
  let prefix = '';
  if (companyAbbr) {
    // 移除空格和特殊字符
    const cleaned = companyAbbr.replace(/[\s\-_]/g, '');
    // 取前3个字符作为前缀
    prefix = cleaned.substring(0, 3).toUpperCase();
  }
  // 如果没有公司简称，使用默认前缀
  if (!prefix) {
    prefix = 'QT';
  }

  // 生成日期部分：年月日
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 查询当天已有的报价单数量
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  try {
    const { data: existingQuotes } = await db
      .from('quotes')
      .select('quote_number')
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd);

    // 生成序号（从001开始）
    const sequence = (existingQuotes?.length || 0) + 1;
    const sequenceStr = String(sequence).padStart(3, '0');

    return `${prefix}${dateStr}${sequenceStr}`;
  } catch (error) {
    console.error('[QuoteUtils] Failed to generate quote number:', error);
    // 如果查询失败，使用时间戳作为备用方案
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${dateStr}${timestamp}`;
  }
};
export const calculatePriceDiff = (
  ourPrice: number,
  marketPrice: number
): {
  diff: number;
  percentage: number;
  isLower: boolean;
} => {
  const diff = ourPrice - marketPrice;
  const percentage = marketPrice > 0 ? (diff / marketPrice) * 100 : 0;
  return {
    diff,
    percentage: Math.abs(percentage),
    isLower: diff < 0,
  };
};
