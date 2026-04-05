/**
 * 通用数值匹配测试
 * 容差：精确±3% / 相近±10% / 不匹配>±10%
 */
import { matchNumericParam, extractNumericFromText, extractAllParamsFromText } from '@/lib/intent-based-search';

describe('matchNumericParam', () => {
  test('精确匹配：1.1 m³/min 精确范围 1.067-1.133（误差<3%）', () => {
    const result1 = matchNumericParam(1.1, 1.08);
    expect(result1.matched).toBe(true);
    expect(result1.type).toBe('exact');

    const result2 = matchNumericParam(1.1, 1.1);
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('exact');

    const result3 = matchNumericParam(1.1, 1.13);
    expect(result3.matched).toBe(true);
    expect(result3.type).toBe('exact');
  });

  test('精确边界：1.1 * 0.97 = 1.067 → 刚好在精确边界外', () => {
    const result = matchNumericParam(1.1, 1.067);
    // |1.1 - 1.067| / 1.1 = 0.03 = 3%，不满足 < 3%
    expect(result.type).toBe('close');
  });

  test('相近匹配：1.1 相近范围 0.99-1.21（误差3-10%）', () => {
    const result1 = matchNumericParam(1.1, 1.0);
    // |1.1 - 1.0| / 1.1 = 0.091 = 9.1% → close
    expect(result1.matched).toBe(true);
    expect(result1.type).toBe('close');

    const result2 = matchNumericParam(1.1, 1.05);
    // |1.1 - 1.05| / 1.1 = 0.045 = 4.5% → close
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('close');
  });

  test('不匹配：1.1 不匹配 0.9（误差18%）', () => {
    const result = matchNumericParam(1.1, 0.9);
    // |1.1 - 0.9| / 1.1 = 0.182 = 18.2% → none
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
  });

  test('不匹配：1.1 不匹配 1.3（误差18%）', () => {
    const result = matchNumericParam(1.1, 1.3);
    // |1.1 - 1.3| / 1.1 = 0.182 = 18.2% → none
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
  });

  test('相近边界：1.1 * 0.9 = 0.99 → 刚好在相近边界外', () => {
    const result = matchNumericParam(1.1, 0.99);
    // |1.1 - 0.99| / 1.1 = 0.10 = 10%，不满足 < 10%
    expect(result.type).toBe('none');
  });

  test('errorPercent 正确计算', () => {
    const result1 = matchNumericParam(1.1, 1.0);
    expect(result1.errorPercent).toBe(9); // 9%

    const result2 = matchNumericParam(1.1, 0.9);
    expect(result2.errorPercent).toBe(18); // 18%

    const result3 = matchNumericParam(1.1, 1.1);
    expect(result3.errorPercent).toBe(0); // 0%
  });

  test('无效输入：userValue <= 0 返回 none', () => {
    const result = matchNumericParam(0, 10);
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
  });

  test('功率匹配：5.5KW 精确范围 5.335-5.665', () => {
    const result = matchNumericParam(5.5, 5.5);
    expect(result.matched).toBe(true);
    expect(result.type).toBe('exact');

    const result2 = matchNumericParam(5.5, 5.0);
    // |5.5 - 5.0| / 5.5 = 9.1% → close
    expect(result2.matched).toBe(true);
    expect(result2.type).toBe('close');

    const result3 = matchNumericParam(5.5, 4.8);
    // |5.5 - 4.8| / 5.5 = 12.7% → none
    expect(result3.matched).toBe(false);
    expect(result3.type).toBe('none');
  });

  test('0.8 m³/min 精确范围 0.776-0.824', () => {
    const exact = matchNumericParam(0.8, 0.8);
    expect(exact.type).toBe('exact');

    const close = matchNumericParam(0.8, 0.75);
    // |0.8 - 0.75| / 0.8 = 6.25% → close
    expect(close.type).toBe('close');

    const none = matchNumericParam(0.8, 0.7);
    // |0.8 - 0.7| / 0.8 = 12.5% → none
    expect(none.type).toBe('none');
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
