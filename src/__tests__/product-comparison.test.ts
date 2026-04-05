/**
 * 通用参数提取和对比测试
 */
import { extractAllParams, getKeyParameters, generateComparison } from '@/lib/product-comparison';
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
