/**
 * 产品智能分类匹配工具
 * 根据产品名称、描述等信息自动匹配分类
 */

import { CategoryNode, flattenCategories } from '@/data/product-categories';

// 分类关键词映射表
const CATEGORY_KEYWORDS: Record<string, {
  keywords: string[];
  excludeKeywords?: string[];
}> = {
  // 通用设备 - 泵、阀门、压缩机
  '17-02': {
    keywords: ['泵', '提升泵', '潜水泵', '离心泵', '螺杆泵', '计量泵', '隔膜泵', '阀门', '闸阀', '蝶阀', '球阀', '止回阀', '压缩机', '空压机'],
    excludeKeywords: ['真空泵'],
  },
  // 通用设备 - 锅炉、发动机
  '17-01': {
    keywords: ['锅炉', '蒸汽锅炉', '热水锅炉', '发动机', '柴油机', '汽油机', '涡轮机', '发电机组'],
  },
  // 通用设备 - 轴承、齿轮
  '17-03': {
    keywords: ['轴承', '滚珠轴承', '滑动轴承', '齿轮', '减速机', '减速器', '传动轴', '联轴器'],
  },
  // 专用设备 - 采矿、冶金、建筑
  '18-01': {
    keywords: ['挖掘机', '推土机', '装载机', '起重机', '塔吊', '破碎机', '球磨机', '压滤机', '板框压滤机', '振动筛', '输送机', '皮带输送机', '斗提机', '提升机'],
  },
  // 专用设备 - 食品、饮料加工
  '18-02': {
    keywords: ['搅拌罐', '发酵罐', '杀菌设备', '灌装机', '包装机', '食品加工', '饮料设备', '均质机', '乳化机'],
  },
  // 专用设备 - 医疗器械
  '18-03': {
    keywords: ['医疗', '医疗器械', '诊断设备', '治疗仪', '手术器械', '医用', 'X光', 'CT', '核磁共振', '监护仪'],
  },
  // 电气设备 - 电机、输配电
  '20-01': {
    keywords: ['电机', '电动机', '发电机', '变压器', '配电柜', '开关柜', '断路器', '接触器', '继电器', '电缆', '电线'],
  },
  // 电气设备 - 电池、家电
  '20-02': {
    keywords: ['电池', '蓄电池', '锂电池', '家用电器', '空调', '冰箱', '洗衣机', '电视', '热水器'],
  },
  // 电气设备 - 照明
  '20-03': {
    keywords: ['灯具', '照明', 'LED灯', '路灯', '投光灯', '筒灯', '日光灯', '节能灯'],
  },
  // 通信设备、计算机
  '21-01': {
    keywords: ['通信设备', '路由器', '交换机', '基站', '天线', '广播电视', '服务器', '计算机', '电脑'],
  },
  // 电子元器件
  '21-02': {
    keywords: ['芯片', '集成电路', '电路板', 'PCB', '电容', '电阻', '二极管', '三极管', '传感器', '电子元件'],
  },
  // 仪器仪表
  '22-01': {
    keywords: ['仪表', '仪器', '测量仪', '流量计', '压力表', '温度计', '液位计', '分析仪', '检测仪', '传感器'],
  },
  // 仪器仪表 - 专用
  '22-02': {
    keywords: ['医疗仪器', '环境监测仪', '气体检测仪', '水质分析仪', '气象仪器', '测绘仪器'],
  },
  // 金属制品
  '16-01': {
    keywords: ['钢材', '钢板', '钢管', '型钢', '金属结构件', '钢结构件', '铁件', '钢构件'],
  },
  '16-02': {
    keywords: ['工具', '扳手', '钳子', '螺丝刀', '刀具', '金属容器', '储罐', '油桶'],
  },
  // 橡胶和塑料
  '13-01': {
    keywords: ['橡胶', '橡胶管', '橡胶板', '密封圈', 'O型圈', '轮胎', '胶带'],
  },
  '13-02': {
    keywords: ['塑料', '塑料管', 'PVC管', 'PE管', '塑料板', '塑料桶', '塑料制品', '注塑件'],
  },
  // 化工产品
  '11-02': {
    keywords: ['化工原料', '化学试剂', '肥料', '农药', '硫酸', '盐酸', '烧碱', '纯碱', '催化剂'],
  },
  '11-03': {
    keywords: ['涂料', '油漆', '油墨', '颜料', '染料', '树脂', '胶粘剂'],
  },
  // 医药
  '12-01': {
    keywords: ['药品', '西药', '药物', '抗生素', '维生素', '原料药'],
  },
  '12-02': {
    keywords: ['中药', '中药材', '中成药', '饮片'],
  },
  // 环保设备
  '43-01': {
    keywords: ['环保设备', '污水处理', '除尘器', '废气处理', '净化设备', '环保材料', '水处理设备', '污泥处理', '压滤机', '脱水机'],
  },
  // 交通运输 - 汽车
  '19-01': {
    keywords: ['汽车', '轿车', '卡车', '货车', '客车', '汽车配件', '轮胎', '发动机', '变速箱'],
  },
  // 建筑施工
  '31-01': {
    keywords: ['建筑材料', '水泥', '混凝土', '钢筋', '砖', '瓦', '石材', '玻璃', '保温材料', '防水材料'],
  },
  // 非金属矿物
  '14-01': {
    keywords: ['水泥', '石灰', '石膏', '砂浆'],
  },
  '14-02': {
    keywords: ['瓷砖', '陶瓷', '玻璃', '石材', '砖瓦', '大理石', '花岗岩'],
  },
};

/**
 * 智能匹配产品分类
 * @param productName 产品名称
 * @param description 产品描述（可选）
 * @returns 匹配的分类代码，如果没有匹配则返回 null
 */
export function matchCategory(productName: string, description?: string): string | null {
  if (!productName) return null;

  const searchText = `${productName} ${description || ''}`.toLowerCase();
  
  let bestMatch: { code: string; score: number } | null = null;

  for (const [code, config] of Object.entries(CATEGORY_KEYWORDS)) {
    // 检查排除关键词
    if (config.excludeKeywords) {
      const hasExcluded = config.excludeKeywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );
      if (hasExcluded) continue;
    }

    // 检查匹配关键词
    for (const keyword of config.keywords) {
      const keywordLower = keyword.toLowerCase();
      
      // 完全匹配产品名称
      if (productName.toLowerCase().includes(keywordLower)) {
        const score = keyword.length * 2; // 长关键词权重更高
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { code, score };
        }
      }
      // 在描述中匹配
      else if (description && description.toLowerCase().includes(keywordLower)) {
        const score = keyword.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { code, score };
        }
      }
    }
  }

  return bestMatch?.code || null;
}

/**
 * 根据分类代码获取分类名称
 */
export function getCategoryNameByCode(code: string, tree: CategoryNode = {} as CategoryNode): string {
  const flatCategories = flattenCategories(tree);
  const category = flatCategories.find(c => c.code === code);
  return category?.name || code;
}

/**
 * 获取分类的完整路径
 */
export function getCategoryFullPath(code: string, tree: CategoryNode): string[] {
  const flatCategories = flattenCategories(tree);
  const category = flatCategories.find(c => c.code === code);
  if (!category) return [code];
  
  const path: string[] = [category.name];
  let current = category;
  
  while (current.parentId) {
    const parent = flatCategories.find(c => c.id === current.parentId);
    if (parent) {
      path.unshift(parent.name);
      current = parent;
    } else {
      break;
    }
  }
  
  return path;
}

/**
 * 批量匹配产品分类
 */
export function batchMatchCategories(
  products: Array<{ name: string; description?: string; category?: string }>
): Array<{ name: string; matchedCategory: string | null; originalCategory?: string }> {
  return products.map(product => ({
    name: product.name,
    matchedCategory: matchCategory(product.name, product.description),
    originalCategory: product.category,
  }));
}
