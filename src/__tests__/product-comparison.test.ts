/**
 * 通用参数提取和对比测试
 */
import { extractAllParams, extractNumber, isNumericParam, getKeyParameters, generateComparison, formatComparisonAsMarkdown } from '@/lib/product-comparison';
import type { IntentProduct } from '@/lib/intent-understanding';

// 测试用产品数据
const makeProduct = (overrides: Partial<IntentProduct> & { name: string }): IntentProduct => ({
  model: '',
  price: 0,
  brand: '',
  parameterDescription: '',
  minPrice: 0,
  costPrice: 0,
  source: 'database',
  ...overrides,
});

describe('extractAllParams', () => {
  test('空压机参数提取', () => {
    const text = '功率：5.5KW，工作压力：0.8MPa，排气量：0.8m³/min，电压：380V，控制方式：永磁变频';
    const params = extractAllParams(text);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('工作压力')).toBe('0.8MPa');
    expect(params.get('排气量')).toBe('0.8m³/min');
    expect(params.get('电压')).toBe('380V');
    expect(params.get('控制方式')).toBe('永磁变频');
  });

  test('水泵参数提取', () => {
    const text = '流量：100m³/h，扬程：30m，功率：15KW，电压：380V，进出口径：DN80';
    const params = extractAllParams(text);
    expect(params.get('流量')).toBe('100m³/h');
    expect(params.get('扬程')).toBe('30m');
    expect(params.get('功率')).toBe('15KW');
    expect(params.get('进出口径')).toBe('DN80');
  });

  test('风机参数提取', () => {
    const text = '风量：2000m³/h，风压：500Pa，功率：7.5KW，转速：1450rpm';
    const params = extractAllParams(text);
    expect(params.get('风量')).toBe('2000m³/h');
    expect(params.get('风压')).toBe('500Pa');
    expect(params.get('转速')).toBe('1450rpm');
  });

  test('空文本返回空 Map', () => {
    const params = extractAllParams('');
    expect(params.size).toBe(0);
  });

  test('无参数文本返回空 Map', () => {
    const params = extractAllParams('这是一段描述文字');
    expect(params.size).toBe(0);
  });
});

describe('getKeyParameters', () => {
  test('空压机产品返回空压机专属参数', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        parameterDescription: '功率：5.5KW，工作压力：0.8MPa，排气量：0.8m³/min，电压：380V',
      }),
      makeProduct({
        name: '空压机B',
        parameterDescription: '功率：7.5KW，工作压力：0.8MPa，排气量：1.2m³/min，电压：380V',
      }),
    ];
    const keys = getKeyParameters('空压机', products);
    expect(keys).toContain('功率');
    expect(keys).toContain('工作压力');
    expect(keys).toContain('排气量');
    expect(keys).toContain('电压');
  });

  test('水泵产品返回水泵专属参数', () => {
    const products = [
      makeProduct({
        name: '水泵A',
        parameterDescription: '流量：100m³/h，扬程：30m，功率：15KW',
      }),
    ];
    const keys = getKeyParameters('水泵', products);
    expect(keys).toContain('流量');
    expect(keys).toContain('扬程');
  });

  test('未知产品类型按出现频率排序', () => {
    const products = [
      makeProduct({
        name: '产品A',
        parameterDescription: '转速：1450rpm，噪音：65dB',
      }),
    ];
    const keys = getKeyParameters('未知产品', products);
    expect(keys).toContain('转速');
    expect(keys).toContain('噪音');
  });
});

describe('generateComparison', () => {
  test('对比两个空压机产品', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        brand: '品牌A',
        price: 10000,
        minPrice: 8000,
        parameterDescription: '功率：5.5KW，工作压力：0.8MPa，排气量：0.8m³/min，电压：380V',
      }),
      makeProduct({
        name: '空压机B',
        brand: '品牌B',
        price: 15000,
        minPrice: 12000,
        parameterDescription: '功率：7.5KW，工作压力：1.0MPa，排气量：1.2m³/min，电压：380V',
      }),
    ];
    const result = generateComparison(products, '空压机');
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.commonPoints.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
    // 价格应该有差异
    expect(result.differences.some(d => d.field === '价格')).toBe(true);
    // 电压应该相同
    expect(result.commonPoints.some(c => c.includes('380V'))).toBe(true);
  });

  test('对比两个水泵产品', () => {
    const products = [
      makeProduct({
        name: '水泵A',
        brand: '品牌A',
        price: 5000,
        minPrice: 4000,
        parameterDescription: '流量：100m³/h，扬程：30m，功率：15KW',
      }),
      makeProduct({
        name: '水泵B',
        brand: '品牌B',
        price: 8000,
        minPrice: 6500,
        parameterDescription: '流量：200m³/h，扬程：50m，功率：30KW',
      }),
    ];
    const result = generateComparison(products, '水泵');
    expect(result.differences.length).toBeGreaterThan(0);
    // 应该包含流量和扬程的差异
    expect(result.differences.some(d => d.field === '流量')).toBe(true);
    expect(result.differences.some(d => d.field === '扬程')).toBe(true);
  });

  test('少于2个产品返回提示', () => {
    const result = generateComparison([makeProduct({ name: '产品A' })], '空压机');
    expect(result.recommendation).toContain('至少2个产品');
  });
});

describe('extractNumber', () => {
  test('空字符串返回 null', () => {
    expect(extractNumber('')).toBeNull();
  });

  test('null/undefined 输入返回 null', () => {
    expect(extractNumber(null as any)).toBeNull();
    expect(extractNumber(undefined as any)).toBeNull();
  });

  test('纯数字字符串', () => {
    expect(extractNumber('123')).toBe(123);
  });

  test('带单位数字', () => {
    expect(extractNumber('5.5KW')).toBe(5.5);
    expect(extractNumber('380V')).toBe(380);
    expect(extractNumber('0.8MPa')).toBe(0.8);
  });

  test('非数字字符串返回 null', () => {
    expect(extractNumber('abc')).toBeNull();
    expect(extractNumber('KW')).toBeNull();
  });

  test('零值返回 null（num > 0 条件过滤）', () => {
    expect(extractNumber('0')).toBeNull();
  });

  test('负数返回绝对值（提取数字部分，num > 0 通过）', () => {
    expect(extractNumber('-5')).toBe(5);
  });
});

describe('isNumericParam', () => {
  test('含数字字符串返回 true', () => {
    expect(isNumericParam('5.5KW')).toBe(true);
    expect(isNumericParam('380V')).toBe(true);
  });

  test('不含数字字符串返回 false', () => {
    expect(isNumericParam('abc')).toBe(false);
    expect(isNumericParam('永磁变频')).toBe(false);
  });

  test('空字符串返回 false', () => {
    expect(isNumericParam('')).toBe(false);
  });
});

describe('formatComparisonAsMarkdown', () => {
  test('空差异和共同点返回推荐文本', () => {
    const result = { commonPoints: [], differences: [], recommendation: '参数基本一致' };
    expect(formatComparisonAsMarkdown(result)).toBe('参数基本一致');
  });

  test('有差异无共同点生成差异表格', () => {
    const result = {
      commonPoints: [],
      differences: [
        { field: '品牌', values: ['品牌A', '品牌B'] },
      ],
      recommendation: '以上产品各有特点，请根据实际使用场景选择。',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).toContain('产品差异');
    expect(md).toContain('| 品牌 |');
    expect(md).toContain('| 品牌 | 品牌A | 品牌B |');
  });

  test('有共同点无差异生成共同点文本', () => {
    const result = {
      commonPoints: ['电压相同：380V', '控制方式相同：永磁变频'],
      differences: [],
      recommendation: '参数基本一致，可根据价格偏好选择。',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).toContain('共同点：');
    expect(md).toContain('电压相同：380V');
    expect(md).toContain('控制方式相同：永磁变频');
  });

  test('差异 + 共同点 + 推荐完整路径', () => {
    const result = {
      commonPoints: ['电压相同：380V'],
      differences: [
        { field: '价格', values: ['¥8,000.00', '¥12,000.00'], highlight: '空压机A 比空压机B 便宜 33%' },
        { field: '品牌', values: ['品牌A', '品牌B'] },
      ],
      recommendation: '空压机A 比空压机B 便宜 33%。',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).toContain('产品差异');
    expect(md).toContain('| 价格 | ¥8,000.00 | ¥12,000.00 |');
    expect(md).toContain('空压机A 比空压机B 便宜 33%');
    expect(md).toContain('↳ 说明');
    expect(md).toContain('共同点：');
    expect(md).toContain('电压相同：380V');
    expect(md).toContain('推荐：');
  });

  test('差异含 highlight 生成说明行', () => {
    const result = {
      commonPoints: [],
      differences: [
        { field: '功率', values: ['5.5KW', '7.5KW'], highlight: '产品A（5.5KW）更小，产品B（7.5KW）更大' },
      ],
      recommendation: '推荐',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).toContain('↳ 说明');
    expect(md).toContain('产品A（5.5KW）更小');
  });

  test('差异无 highlight 不生成说明行', () => {
    const result = {
      commonPoints: [],
      differences: [
        { field: '品牌', values: ['品牌A', '品牌B'] },
      ],
      recommendation: '以上产品各有特点',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).not.toContain('↳ 说明');
  });

  test('含中文参数值', () => {
    const result = {
      commonPoints: [],
      differences: [
        { field: '控制方式', values: ['永磁变频', '工频'] },
      ],
      recommendation: '推荐',
    };
    const md = formatComparisonAsMarkdown(result);
    expect(md).toContain('| 控制方式 | 永磁变频 | 工频 |');
  });

  test('多产品多差异排序正确', () => {
    const result = {
      commonPoints: ['参数相同：0.8MPa'],
      differences: [
        { field: '排气量', values: ['0.8', '1.2'], highlight: 'A 更小，B 更大' },
        { field: '价格', values: ['¥8,000.00', '¥12,000.00'], highlight: 'A 便宜 33%' },
        { field: '品牌', values: ['品牌A', '品牌B'] },
      ],
      recommendation: '推荐',
    };
    const md = formatComparisonAsMarkdown(result);
    // 检查输出中包含所有差异字段
    expect(md).toContain('| 价格 |');
    expect(md).toContain('| 品牌 |');
    expect(md).toContain('| 排气量 |');
  });
});

describe('generateComparison - recommendation 分支', () => {
  test('完全相同的产品返回参数一致推荐', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        brand: '品牌A',
        price: 10000,
        minPrice: 10000,
        parameterDescription: '功率：5.5KW，工作压力：0.8MPa',
      }),
      makeProduct({
        name: '空压机B',
        brand: '品牌A',
        price: 10000,
        minPrice: 10000,
        parameterDescription: '功率：5.5KW，工作压力：0.8MPa',
      }),
    ];
    const result = generateComparison(products, '空压机');
    expect(result.recommendation).toContain('参数基本一致');
    expect(result.differences.length).toBe(0);
  });

  test('差异无 highlight 返回各有特点推荐', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        brand: '品牌A',
        price: 10000,
        minPrice: 10000,
        parameterDescription: '颜色：红色',
      }),
      makeProduct({
        name: '空压机B',
        brand: '品牌B',
        price: 10000,
        minPrice: 10000,
        parameterDescription: '颜色：蓝色',
      }),
    ];
    const result = generateComparison(products, '空压机');
    // 品牌差异没有 highlight，颜色是文本参数也不会有 numericDiffs highlight
    expect(result.recommendation).toContain('各有特点');
  });
});

describe('generateComparisonLegacy', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENABLE_DYNAMIC_COMPARISON;
    process.env.ENABLE_DYNAMIC_COMPARISON = 'false';
  });

  afterEach(() => {
    process.env.ENABLE_DYNAMIC_COMPARISON = originalEnv;
  });

  test('legacy 路径对比两个空压机', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        brand: '品牌A',
        price: 10000,
        minPrice: 8000,
        parameterDescription: '功率：5.5KW，工作压力：0.8MPa，排气量：0.8m³/min，电压：380V，控制方式：永磁变频',
      }),
      makeProduct({
        name: '空压机B',
        brand: '品牌B',
        price: 15000,
        minPrice: 12000,
        parameterDescription: '功率：7.5KW，工作压力：1.0MPa，排气量：1.2m³/min，电压：380V，控制方式：工频',
      }),
    ];
    const result = generateComparison(products, '空压机');
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
  });

  test('legacy 路径 — 工频与变频控制方式差异', () => {
    const products = [
      makeProduct({
        name: '变频机',
        brand: '品牌A',
        price: 20000,
        minPrice: 18000,
        parameterDescription: '功率：7.5KW，控制方式：永磁变频',
      }),
      makeProduct({
        name: '工频机',
        brand: '品牌B',
        price: 12000,
        minPrice: 10000,
        parameterDescription: '功率：7.5KW，控制方式：工频',
      }),
    ];
    const result = generateComparison(products, '空压机');
    expect(result.differences.some(d => d.field === '控制方式')).toBe(true);
    expect(result.differences.find(d => d.field === '控制方式')?.highlight).toContain('节能');
  });

  test('legacy 路径 — 相同工作压力为共同点', () => {
    const products = [
      makeProduct({
        name: '空压机A',
        brand: '品牌A',
        price: 10000,
        minPrice: 8000,
        parameterDescription: '工作压力：0.8MPa，功率：5.5KW',
      }),
      makeProduct({
        name: '空压机B',
        brand: '品牌B',
        price: 12000,
        minPrice: 10000,
        parameterDescription: '工作压力：0.8MPa，功率：7.5KW',
      }),
    ];
    const result = generateComparison(products, '空压机');
    expect(result.commonPoints.some(c => c.includes('工作压力相同'))).toBe(true);
  });
});
