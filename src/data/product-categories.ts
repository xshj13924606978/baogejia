/**
 * 产品国标分类标准
 * 按照国民经济行业分类标准构建
 */

export interface CategoryNode {
  id: string;
  name: string;
  code: string;
  children?: CategoryNode[];
  count?: number; // 该分类下的产品数量
}

/**
 * 默认国标分类树 - 按照国民经济行业分类
 */
export const defaultCategoryTree: CategoryNode = {
  id: 'root',
  name: '全部产品',
  code: '00',
  children: [
    // 01 农业产品
    {
      id: 'agriculture',
      name: '农业产品',
      code: '01',
      children: [
        { id: 'agriculture-grains', name: '谷物、薯类、油料、豆类、棉花', code: '01-01' },
        { id: 'agriculture-vegetables', name: '蔬菜、食用菌及调味料作物', code: '01-02' },
        { id: 'agriculture-fruits', name: '水果及坚果', code: '01-03' },
        { id: 'agriculture-tea', name: '茶及其他饮料作物', code: '01-04' },
        { id: 'agriculture-forestry', name: '林业产品', code: '01-05' },
      ],
    },
    // 02 畜牧业产品、渔业产品
    {
      id: 'livestock-fishery',
      name: '畜牧业产品、渔业产品',
      code: '02',
      children: [
        { id: 'livestock-live', name: '活性畜', code: '02-01' },
        { id: 'livestock-products', name: '畜禽产品', code: '02-02' },
        { id: 'fishery-products', name: '渔业产品', code: '02-03' },
      ],
    },
    // 03 木材产品
    {
      id: 'wood',
      name: '木材产品',
      code: '03',
      children: [
        { id: 'wood-sawn', name: '锯材、木片', code: '03-01' },
        { id: 'wood-panel', name: '人造板', code: '03-02' },
      ],
    },
    // 06 纺织品、服装和鞋帽
    {
      id: 'textile-clothing',
      name: '纺织品、服装和鞋帽',
      code: '06',
      children: [
        { id: 'textile-material', name: '纱、线、布等纺织材料', code: '06-01' },
        { id: 'textile-industrial', name: '产业用纺织品（如非织造布、线绳带等）', code: '06-02' },
        { id: 'clothing-shoes', name: '服装、鞋、帽', code: '06-03' },
      ],
    },
    // 07 食品和饮料
    {
      id: 'food-beverage',
      name: '食品和饮料',
      code: '07',
      children: [
        { id: 'food-grain-meat', name: '粮油加工品、屠宰及肉制品', code: '07-01' },
        { id: 'food-fruit-veg', name: '水产品加工、蔬菜水果加工', code: '07-02' },
        { id: 'food-dairy', name: '乳制品、方便食品、罐头', code: '07-03' },
        { id: 'beverage-alcohol', name: '酒、饮料、茶叶', code: '07-04' },
      ],
    },
    // 08 烟草制品
    {
      id: 'tobacco',
      name: '烟草制品',
      code: '08',
      children: [],
    },
    // 09 纺织品、服装和鞋帽（重复的，可能是另一个分类）
    {
      id: 'textile-clothing-2',
      name: '纺织品、服装和鞋帽',
      code: '09',
      children: [
        { id: 'textile-2-material', name: '纱、线、布等纺织材料', code: '09-01' },
        { id: 'textile-2-industrial', name: '产业用纺织品（如非织造布、线绳带等）', code: '09-02' },
        { id: 'clothing-2-shoes', name: '服装、鞋、帽', code: '09-03' },
      ],
    },
    // 10 家具、印刷品、文教体育用品
    {
      id: 'furniture-printing',
      name: '家具、印刷品、文教体育用品',
      code: '10',
      children: [
        { id: 'furniture', name: '家具', code: '10-01' },
        { id: 'printing', name: '印刷品、记录媒介复制品', code: '10-02' },
        { id: 'stationery', name: '文教、体育、娱乐用品', code: '10-03' },
      ],
    },
    // 11 石油、化工产品
    {
      id: 'petroleum-chemical',
      name: '石油、化工产品',
      code: '11',
      children: [
        { id: 'petroleum-refined', name: '精炼石油产品', code: '11-01' },
        { id: 'chemical-basic', name: '基础化学原料、肥料、农药', code: '11-02' },
        { id: 'chemical-coating', name: '涂料、油墨、颜料', code: '11-03' },
        { id: 'chemical-synthetic', name: '合成材料、专用化学产品', code: '11-04' },
        { id: 'chemical-daily', name: '日用化学品', code: '11-05' },
      ],
    },
    // 12 医药用品
    {
      id: 'medicine',
      name: '医药用品',
      code: '12',
      children: [
        { id: 'medicine-chemical', name: '化学药品原料药、制剂', code: '12-01' },
        { id: 'medicine-traditional', name: '中药饮片、中成药', code: '12-02' },
        { id: 'medicine-biological', name: '生物、生化制品', code: '12-03' },
      ],
    },
    // 13 橡胶和塑料制品
    {
      id: 'rubber-plastic',
      name: '橡胶和塑料制品',
      code: '13',
      children: [
        { id: 'rubber', name: '橡胶制品', code: '13-01' },
        { id: 'plastic', name: '塑料制品', code: '13-02' },
      ],
    },
    // 14 非金属矿物制品
    {
      id: 'nonmetal',
      name: '非金属矿物制品',
      code: '14',
      children: [
        { id: 'nonmetal-cement', name: '水泥、石灰、石膏', code: '14-01' },
        { id: 'nonmetal-brick', name: '砖瓦、石材、陶瓷、玻璃', code: '14-02' },
      ],
    },
    // 15 金属冶炼及压延产品
    {
      id: 'metal-smelting',
      name: '金属冶炼及压延产品',
      code: '15',
      children: [
        { id: 'metal-steel', name: '钢材、铁合金', code: '15-01' },
        { id: 'metal-nonferrous', name: '有色金属冶炼及压延产品', code: '15-02' },
      ],
    },
    // 16 金属制品
    {
      id: 'metal-products',
      name: '金属制品',
      code: '16',
      children: [
        { id: 'metal-structure', name: '结构性金属制品', code: '16-01' },
        { id: 'metal-tools', name: '金属工具、包装容器', code: '16-02' },
      ],
    },
    // 17 通用设备
    {
      id: 'general-equipment',
      name: '通用设备',
      code: '17',
      children: [
        { id: 'equipment-boiler', name: '锅炉、发动机、涡轮机', code: '17-01' },
        { id: 'equipment-pump', name: '泵、阀门、压缩机', code: '17-02' },
        { id: 'equipment-bearing', name: '轴承、齿轮、传动部件', code: '17-03' },
      ],
    },
    // 18 专用设备
    {
      id: 'special-equipment',
      name: '专用设备',
      code: '18',
      children: [
        { id: 'equipment-mining', name: '采矿、冶金、建筑专用设备', code: '18-01' },
        { id: 'equipment-food', name: '食品、饮料、烟草加工设备', code: '18-02' },
        { id: 'equipment-medical', name: '医疗仪器设备及器械', code: '18-03' },
      ],
    },
    // 19 交通运输设备
    {
      id: 'transportation-equipment',
      name: '交通运输设备',
      code: '19',
      children: [
        { id: 'transportation-car', name: '汽车', code: '19-01' },
        { id: 'transportation-rail', name: '铁路船舶、航空航天设备', code: '19-02' },
        { id: 'transportation-motorcycle', name: '摩托车、自行车', code: '19-03' },
      ],
    },
    // 20 电气机械及器材
    {
      id: 'electrical-equipment',
      name: '电气机械及器材',
      code: '20',
      children: [
        { id: 'electrical-motor', name: '电机、输配电设备', code: '20-01' },
        { id: 'electrical-battery', name: '电池、家用电力器具', code: '20-02' },
        { id: 'electrical-lighting', name: '照明器具', code: '20-03' },
      ],
    },
    // 21 通信设备、计算机及其他电子设备
    {
      id: 'communication-computer',
      name: '通信设备、计算机及其他电子设备',
      code: '21',
      children: [
        { id: 'communication-broadcast', name: '通信设备、广播电视设备', code: '21-01' },
        { id: 'computer-components', name: '电子计算机、电子元器件', code: '21-02' },
        { id: 'computer-audio', name: '家用视听设备', code: '21-03' },
      ],
    },
    // 22 仪器仪表及文化、办公用机械
    {
      id: 'instrument-office',
      name: '仪器仪表及文化、办公用机械',
      code: '22',
      children: [
        { id: 'instrument-general', name: '通用仪器仪表', code: '22-01' },
        { id: 'instrument-special', name: '专用仪器仪表', code: '22-02' },
        { id: 'instrument-optical', name: '光学仪器、办公设备', code: '22-03' },
      ],
    },
    // 23 工艺品及其他制造产品
    {
      id: 'crafts',
      name: '工艺品及其他制造产品',
      code: '23',
      children: [
        { id: 'crafts-art', name: '工艺美术品、日用杂品', code: '23-01' },
      ],
    },
    // 24 废弃资源和废旧材料回收加工品
    {
      id: 'recycling',
      name: '废弃资源和废旧材料回收加工品',
      code: '24',
      children: [],
    },
    // 29 金属制品、机械和设备修理服务
    {
      id: 'repair-service',
      name: '金属制品、机械和设备修理服务',
      code: '29',
      children: [],
    },
    // 30 电力、热力、燃气和水
    {
      id: 'utility',
      name: '电力、热力、燃气和水',
      code: '30',
      children: [
        { id: 'utility-power', name: '电力、热力', code: '30-01' },
        { id: 'utility-gas-water', name: '燃气、水', code: '30-02' },
      ],
    },
    // 31 建筑施工
    {
      id: 'construction',
      name: '建筑施工',
      code: '31',
      children: [
        { id: 'construction-building', name: '房屋工程、土木工程建筑', code: '31-01' },
      ],
    },
    // 32 批发和零售服务
    {
      id: 'wholesale-retail',
      name: '批发和零售服务',
      code: '32',
      children: [],
    },
    // 33 运输、仓储和邮政服务
    {
      id: 'transportation-logistics',
      name: '运输、仓储和邮政服务',
      code: '33',
      children: [],
    },
    // 34 住宿和餐饮服务
    {
      id: 'hospitality-food',
      name: '住宿和餐饮服务',
      code: '34',
      children: [
        { id: 'hospitality-hotel', name: '旅游饭店、一般旅馆', code: '34-01' },
        { id: 'food-restaurant', name: '正餐、快餐、饮料服务', code: '34-02' },
      ],
    },
    // 35 信息技术服务
    {
      id: 'it-service',
      name: '信息技术服务',
      code: '35',
      children: [
        { id: 'it-software', name: '软件开发、信息系统服务', code: '35-01' },
      ],
    },
    // 36 金融服务
    {
      id: 'financial-service',
      name: '金融服务',
      code: '36',
      children: [
        { id: 'financial-banking', name: '货币银行、证券、保险服务', code: '36-01' },
      ],
    },
    // 37 商务服务
    {
      id: 'business-service',
      name: '商务服务',
      code: '37',
      children: [
        { id: 'business-legal', name: '法律服务、会计服务、广告', code: '37-01' },
      ],
    },
    // 38 研究和试验开发服务
    {
      id: 'rd-service',
      name: '研究和试验开发服务',
      code: '38',
      children: [],
    },
    // 39 技术服务
    {
      id: 'technical-service',
      name: '技术服务',
      code: '39',
      children: [
        { id: 'technical-testing', name: '气象、测绘、质检、设计服务', code: '39-01' },
      ],
    },
    // 40 科技交流和推广服务
    {
      id: 'tech-exchange',
      name: '科技交流和推广服务',
      code: '40',
      children: [],
    },
    // 41 地质勘查
    {
      id: 'geological',
      name: '地质勘查',
      code: '41',
      children: [],
    },
    // 42 水利管理
    {
      id: 'water-management',
      name: '水利管理',
      code: '42',
      children: [],
    },
    // 43 生态环境
    {
      id: 'environmental',
      name: '生态环境',
      code: '43',
      children: [
        { id: 'environmental-protection', name: '环境治理、生态保护', code: '43-01' },
      ],
    },
    // 44 公共设施管理
    {
      id: 'public-facility',
      name: '公共设施管理',
      code: '44',
      children: [
        { id: 'public-municipal', name: '市政设施、园林绿化', code: '44-01' },
      ],
    },
    // 45 居民服务
    {
      id: 'resident-service',
      name: '居民服务',
      code: '45',
      children: [
        { id: 'resident-daily', name: '家政、洗染、理发、洗浴', code: '45-01' },
      ],
    },
    // 46 教育服务
    {
      id: 'education',
      name: '教育服务',
      code: '46',
      children: [
        { id: 'education-school', name: '学前教育、初等/中等/高等教育', code: '46-01' },
      ],
    },
    // 47 卫生和社会工作
    {
      id: 'health',
      name: '卫生和社会工作',
      code: '47',
      children: [
        { id: 'health-hospital', name: '医院、卫生院、社区医疗', code: '47-01' },
      ],
    },
    // 48 新闻出版和广播影视
    {
      id: 'media',
      name: '新闻出版和广播影视',
      code: '48',
      children: [],
    },
    // 49 文化艺术服务
    {
      id: 'culture-art',
      name: '文化艺术服务',
      code: '49',
      children: [
        { id: 'culture-art-performance', name: '文艺创作、表演、博物馆', code: '49-01' },
      ],
    },
    // 50 体育服务
    {
      id: 'sports',
      name: '体育服务',
      code: '50',
      children: [],
    },
    // 51 娱乐服务
    {
      id: 'entertainment',
      name: '娱乐服务',
      code: '51',
      children: [],
    },
  ],
};

/**
 * 扁平化分类列表（用于下拉选择）
 */
export function flattenCategories(node: CategoryNode): Array<{id: string; name: string; code: string; parentId?: string}> {
  const result: Array<{id: string; name: string; code: string; parentId?: string}> = [];
  const stack: {node: CategoryNode; parentId?: string}[] = [{node}];

  while (stack.length > 0) {
    const {node, parentId} = stack.pop()!;
    result.push({
      id: node.id,
      name: node.name,
      code: node.code,
      parentId,
    });

    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({node: node.children[i], parentId: node.id});
      }
    }
  }

  return result;
}

/**
 * 获取分类全路径
 */
export function getCategoryPath(node: CategoryNode, targetId: string, path: string[] = []): string[] | null {
  if (node.id === targetId) {
    return [...path, node.name];
  }

  if (node.children) {
    for (const child of node.children) {
      const result = getCategoryPath(child, targetId, [...path, node.name]);
      if (result) {
        return result;
      }
    }
  }

  return null;
}
// test
