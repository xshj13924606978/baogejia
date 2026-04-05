/**
 * 通用数值匹配测试
 */
import { matchNumericParam, extractNumericFromText, extractAllParamsFromText } from '@/lib/intent-based-search';

describe('matchNumericParam', () => {
  test('精确匹配：0.8 匹配 0.78-0.84（误差<5%）', () => {
    const result1 = matchNumericParam(0.8, 0.78);
    expect(result1.matched).toBe(true);
    expect(result1.type).toBe('exact');

    const result2 = matchNumericParam(0.8, 0.84);
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('exact');

    const result3 = matchNumericParam(0.8, 0.8);
    expect(result3.matched).toBe(true);
    expect(result3.type).toBe('exact');
  });

  test('相近匹配：0.8 匹配 0.68-0.76 或 0.84-0.96（误差5-20%）', () => {
    const result1 = matchNumericParam(0.8, 0.72);
    expect(result1.matched).toBe(true);
    expect(result1.type).toBe('close');

    const result2 = matchNumericParam(0.8, 0.92);
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('close');
  });

  test('不匹配：0.8 不匹配 0.6 或 1.0（误差>20%）', () => {
    const result1 = matchNumericParam(0.8, 0.6);
    expect(result1.matched).toBe(false);
    expect(result1.type).toBe('none');

    const result2 = matchNumericParam(0.8, 1.0);
    expect(result2.matched).toBe(false);
    expect(result2.type).toBe('none');
  });

  test('边界值：5% 正好是精确和相近的分界', () => {
    // 0.8 * 0.05 = 0.04，所以 0.76 是精确边界
    const exact = matchNumericParam(0.8, 0.76);
    expect(exact.type).toBe('close'); // 0.76/0.8 = 0.95，diff = 0.05，不满足 <0.05

    // 0.8 * 0.20 = 0.16，所以 0.64 是相近边界
    const close = matchNumericParam(0.8, 0.64);
    expect(close.type).toBe('none'); // diff = 0.20，不满足 <0.20
  });

  test('无效输入：userValue <= 0 返回 none', () => {
    const result = matchNumericParam(0, 10);
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
  });

  test('功率匹配：5.5KW 匹配 5.2-5.8KW', () => {
    const result = matchNumericParam(5.5, 5.3);
    expect(result.matched).toBe(true);
    expect(result.type).toBe('exact');

    const result2 = matchNumericParam(5.5, 5.0);
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('close');
  });
});

describe('extractNumericFromText', () => {
  test('提取空压机参数', () => {
    const text = '功率：5.5KW 工作压力：0.8MPa 排气量：0.8m³/min';
    expect(extractNumericFromText(text, '功率')).toBe(5.5);
    expect(extractNumericFromText(text, '工作压力')).toBe(0.8);
    expect(extractNumericFromText(text, '排气量')).toBe(0.8);
  });

  test('提取水泵参数', () => {
    const text = '流量：100m³/h 扬程：30m 功率：15KW';
    expect(extractNumericFromText(text, '流量')).toBe(100);
    expect(extractNumericFromText(text, '扬程')).toBe(30);
    expect(extractNumericFromText(text, '功率')).toBe(15);
  });

  test('提取风机参数', () => {
    const text = '风量：2000m³/h 风压：500Pa 转速：1450rpm';
    expect(extractNumericFromText(text, '风量')).toBe(2000);
    expect(extractNumericFromText(text, '风压')).toBe(500);
    expect(extractNumericFromText(text, '转速')).toBe(1450);
  });

  test('参数不存在时返回 null', () => {
    const text = '功率：5.5KW';
    expect(extractNumericFromText(text, '排气量')).toBeNull();
  });

  test('空文本返回 null', () => {
    expect(extractNumericFromText('', '功率')).toBeNull();
    expect(extractNumericFromText('没有参数', '功率')).toBeNull();
  });
});

describe('extractAllParamsFromText', () => {
  test('提取所有空压机参数', () => {
    const text = '功率：5.5KW，工作压力：0.8MPa，排气量：0.8m³/min，电压：380V';
    const params = extractAllParamsFromText(text);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('工作压力')).toBe('0.8MPa');
    expect(params.get('排气量')).toBe('0.8m³/min');
    expect(params.get('电压')).toBe('380V');
  });

  test('提取所有水泵参数', () => {
    const text = '流量：100m³/h，扬程：30m，功率：15KW';
    const params = extractAllParamsFromText(text);
    expect(params.get('流量')).toBe('100m³/h');
    expect(params.get('扬程')).toBe('30m');
    expect(params.get('功率')).toBe('15KW');
  });

  test('空文本返回空 Map', () => {
    const params = extractAllParamsFromText('');
    expect(params.size).toBe(0);
  });
});
