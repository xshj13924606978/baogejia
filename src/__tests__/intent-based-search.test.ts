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

  test('反向偏差：productValue 高于 userValue', () => {
    // productValue > userValue，误差计算对称
    const exact = matchNumericParam(100, 102);
    // |100 - 102| / 100 = 2% → exact
    expect(exact.matched).toBe(true);
    expect(exact.type).toBe('exact');

    const close = matchNumericParam(100, 108);
    // |100 - 108| / 100 = 8% → close
    expect(close.matched).toBe(true);
    expect(close.type).toBe('close');

    const none = matchNumericParam(100, 120);
    // |100 - 120| / 100 = 20% → none
    expect(none.matched).toBe(false);
    expect(none.type).toBe('none');
  });

  test('相近档上边界：刚好在 10% 内', () => {
    const close1 = matchNumericParam(100, 109);
    // |100 - 109| / 100 = 9% → close
    expect(close1.type).toBe('close');

    const close2 = matchNumericParam(100, 91);
    // |100 - 91| / 100 = 9% → close
    expect(close2.type).toBe('close');

    // 刚好在 10% 边界外
    const none1 = matchNumericParam(100, 110);
    // |100 - 110| / 100 = 10% → none
    expect(none1.type).toBe('none');

    const none2 = matchNumericParam(100, 90);
    // |100 - 90| / 100 = 10% → none
    expect(none2.type).toBe('none');
  });

  test('大数值：1000m³/h 精确范围 970-1030', () => {
    const exact1 = matchNumericParam(1000, 980);
    // |1000 - 980| / 1000 = 2% → exact
    expect(exact1.type).toBe('exact');

    const exact2 = matchNumericParam(1000, 1020);
    // |1000 - 1020| / 1000 = 2% → exact
    expect(exact2.type).toBe('exact');

    const close = matchNumericParam(1000, 950);
    // |1000 - 950| / 1000 = 5% → close
    expect(close.type).toBe('close');

    const none = matchNumericParam(1000, 890);
    // |1000 - 890| / 1000 = 11% → none
    expect(none.type).toBe('none');
  });

  test('userValue 为负数返回 none', () => {
    const result = matchNumericParam(-10, 10);
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
    expect(result.errorPercent).toBe(100);
  });

  test('productValue 为 0', () => {
    const result = matchNumericParam(10, 0);
    // |10 - 0| / 10 = 100% → none
    expect(result.matched).toBe(false);
    expect(result.type).toBe('none');
    expect(result.errorPercent).toBe(100);
  });

  test('userValue 为 null 或 undefined 返回 none', () => {
    const r1 = matchNumericParam(null as any, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');
    expect(r1.errorPercent).toBe(100);

    const r2 = matchNumericParam(undefined as any, 10);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
    expect(r2.errorPercent).toBe(100);
  });

  test('productValue 为 null 或 undefined 返回 none', () => {
    const r1 = matchNumericParam(10, null as any);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');
    expect(r1.errorPercent).toBe(100);

    const r2 = matchNumericParam(10, undefined as any);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
    expect(r2.errorPercent).toBe(100);
  });

  test('两个参数均为 null/undefined 返回 none', () => {
    const r1 = matchNumericParam(null as any, null as any);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(undefined as any, undefined as any);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
  });

  test('极小正数：0.001 附近', () => {
    const exact = matchNumericParam(0.001, 0.001);
    expect(exact.matched).toBe(true);
    expect(exact.type).toBe('exact');
    expect(exact.errorPercent).toBe(0);

    const close = matchNumericParam(0.001, 0.00095);
    // |0.001 - 0.00095| / 0.001 = 5% → close
    expect(close.matched).toBe(true);
    expect(close.type).toBe('close');

    const none = matchNumericParam(0.001, 0.0008);
    // |0.001 - 0.0008| / 0.001 = 20% → none
    expect(none.matched).toBe(false);
    expect(none.type).toBe('none');
  });

  test('极大数值：1e9 精确范围 970M-1030M', () => {
    const exact = matchNumericParam(1e9, 1.01e9);
    // |1e9 - 1.01e9| / 1e9 = 1% → exact
    expect(exact.matched).toBe(true);
    expect(exact.type).toBe('exact');

    const close = matchNumericParam(1e9, 0.95e9);
    // |1e9 - 0.95e9| / 1e9 = 5% → close
    expect(close.matched).toBe(true);
    expect(close.type).toBe('close');

    const none = matchNumericParam(1e9, 0.8e9);
    // |1e9 - 0.8e9| / 1e9 = 20% → none
    expect(none.matched).toBe(false);
    expect(none.type).toBe('none');
  });

  test('大数值接近 10% 边界：9999 和 9000', () => {
    const close = matchNumericParam(9999, 9009);
    // |9999 - 9009| / 9999 = 9.9% → close
    expect(close.matched).toBe(true);
    expect(close.type).toBe('close');

    const none = matchNumericParam(9999, 8999);
    // |9999 - 8999| / 9999 = 10.001% → none
    expect(none.matched).toBe(false);
    expect(none.type).toBe('none');
  });

  test('极小误差：浮点精度边界', () => {
    const r1 = matchNumericParam(1, 1.0000001);
    // 误差 < 0.0001% → exact
    expect(r1.matched).toBe(true);
    expect(r1.type).toBe('exact');

    const r2 = matchNumericParam(1, 0.9999999);
    expect(r2.matched).toBe(true);
    expect(r2.type).toBe('exact');

    // 误差恰好 0%
    const r3 = matchNumericParam(1, 1);
    expect(r3.errorPercent).toBe(0);
  });

  test('Number.MAX_SAFE_INTEGER 附近', () => {
    const big = Number.MAX_SAFE_INTEGER; // 9007199254740991
    const exact = matchNumericParam(big, big);
    expect(exact.matched).toBe(true);
    expect(exact.type).toBe('exact');
    expect(exact.errorPercent).toBe(0);

    const close = matchNumericParam(big, big * 0.95);
    // 5% → close
    expect(close.matched).toBe(true);
    expect(close.type).toBe('close');

    const none = matchNumericParam(big, big * 0.8);
    // 20% → none
    expect(none.matched).toBe(false);
    expect(none.type).toBe('none');
  });

  test('NaN 输入返回 none', () => {
    const r1 = matchNumericParam(NaN, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(10, NaN);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');

    const r3 = matchNumericParam(NaN, NaN);
    expect(r3.matched).toBe(false);
    expect(r3.type).toBe('none');
  });

  test('Infinity 输入', () => {
    // Infinity > 0 但差值计算无意义，应返回 none
    const r1 = matchNumericParam(Infinity, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(10, Infinity);
    // |10 - Infinity| / 10 = Infinity → none
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
  });

  test('-Infinity 输入返回 none', () => {
    const r1 = matchNumericParam(-Infinity, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(10, -Infinity);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
  });

  test('字符串类型输入返回 none', () => {
    const r1 = matchNumericParam('10' as any, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(10, '10' as any);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');

    const r3 = matchNumericParam('abc' as any, 10);
    expect(r3.matched).toBe(false);
    expect(r3.type).toBe('none');
  });

  test('布尔类型输入返回 none', () => {
    const r1 = matchNumericParam(true as any, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam(false as any, 10);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
  });

  test('对象和数组输入返回 none', () => {
    const r1 = matchNumericParam({} as any, 10);
    expect(r1.matched).toBe(false);
    expect(r1.type).toBe('none');

    const r2 = matchNumericParam([10] as any, 10);
    expect(r2.matched).toBe(false);
    expect(r2.type).toBe('none');
  });

  test('科学计数法和十六进制正常处理', () => {
    const r1 = matchNumericParam(0xFF, 255);
    // 255 === 0xFF → exact
    expect(r1.matched).toBe(true);
    expect(r1.type).toBe('exact');

    const r2 = matchNumericParam(1e-7, 1e-7);
    expect(r2.matched).toBe(true);
    expect(r2.type).toBe('exact');
    expect(r2.errorPercent).toBe(0);

    const r3 = matchNumericParam(1e-7, 1.1e-7);
    // |1e-7 - 1.1e-7| / 1e-7 = 10% → none
    expect(r3.matched).toBe(false);
    expect(r3.type).toBe('none');
  });

  test('浮点精度误差：0.1 + 0.2', () => {
    // 0.1 + 0.2 = 0.30000000000000004，不是精确的 0.3
    const r1 = matchNumericParam(0.1 + 0.2, 0.3);
    // 误差极小 → exact
    expect(r1.matched).toBe(true);
    expect(r1.type).toBe('exact');

    const r2 = matchNumericParam(0.1 + 0.2, 0.30000000000000004);
    // 完全相同 → exact
    expect(r2.matched).toBe(true);
    expect(r2.type).toBe('exact');
    expect(r2.errorPercent).toBe(0);
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

  test('null 或 undefined 输入返回 null', () => {
    expect(extractNumericFromText(null as any, '功率')).toBeNull();
    expect(extractNumericFromText(undefined as any, '功率')).toBeNull();
    expect(extractNumericFromText('功率：5.5KW', null as any)).toBeNull();
    expect(extractNumericFromText('功率：5.5KW', undefined as any)).toBeNull();
    expect(extractNumericFromText(null as any, null as any)).toBeNull();
    expect(extractNumericFromText(undefined as any, undefined as any)).toBeNull();
  });

  test('paramLabel 含正则特殊字符时正确转义', () => {
    const text = '排气量(m³/min)：0.8';
    expect(extractNumericFromText(text, '排气量(m³/min)')).toBe(0.8);

    const text2 = '功率[KW]：5.5';
    expect(extractNumericFromText(text2, '功率[KW]')).toBe(5.5);

    const text3 = '压力(MPa)：0.7';
    expect(extractNumericFromText(text3, '压力(MPa)')).toBe(0.7);
  });

  test('值为 0 时正确提取', () => {
    expect(extractNumericFromText('功率：0KW', '功率')).toBe(0);
  });

  test('只有冒号没有值时返回 null', () => {
    expect(extractNumericFromText('功率：', '功率')).toBeNull();
    expect(extractNumericFromText('功率：KW', '功率')).toBeNull();
    expect(extractNumericFromText('功率：abc', '功率')).toBeNull();
  });

  test('全角冒号和半角冒号均支持', () => {
    expect(extractNumericFromText('功率：5.5KW', '功率')).toBe(5.5);
    expect(extractNumericFromText('功率:5.5KW', '功率')).toBe(5.5);
    expect(extractNumericFromText('功率：5.5KW', '功率')).toBe(5.5);
  });

  test('多个同名参数时返回第一个匹配', () => {
    const text = '功率：5.5KW 功率：7.5KW';
    expect(extractNumericFromText(text, '功率')).toBe(5.5);
  });

  test('值含多个小数点时只提取第一个数字部分', () => {
    const text = '流量：12.34.56m³/h';
    expect(extractNumericFromText(text, '流量')).toBe(12.34);
  });

  test('空格和换行对提取的影响', () => {
    const text = '功率 ：  5.5 KW';
    // 正则 \s* 匹配冒号前后空格，数字后紧跟空格不影响 parseFloat
    expect(extractNumericFromText(text, '功率')).toBe(5.5);

    const text2 = '功率：\n5.5KW';
    // 正则 \s* 匹配换行符，能正常提取
    expect(extractNumericFromText(text2, '功率')).toBe(5.5);
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

  test('null 或 undefined 输入返回空 Map', () => {
    const r1 = extractAllParamsFromText(null as any);
    expect(r1).toBeInstanceOf(Map);
    expect(r1.size).toBe(0);

    const r2 = extractAllParamsFromText(undefined as any);
    expect(r2).toBeInstanceOf(Map);
    expect(r2.size).toBe(0);
  });

  test('冒号后多个空格时前一项被跳过', () => {
    const params = extractAllParamsFromText('功率：  扬程：30m');
    // 冒号后 \s? 只匹配一个空格，第二个空格导致功率无值被跳过
    expect(params.size).toBe(1);
    expect(params.get('扬程')).toBe('30m');
  });

  test('键或值为空白字符时跳过', () => {
    const params = extractAllParamsFromText('  ：5.5KW  功率：  ');
    expect(params.size).toBe(0);
  });

  test('重复键时后者覆盖前者', () => {
    const params = extractAllParamsFromText('功率：5.5KW 功率：7.5KW');
    expect(params.size).toBe(1);
    expect(params.get('功率')).toBe('7.5KW');
  });

  test('不同分隔符：逗号、顿号、换行', () => {
    const text = '功率：5.5KW，扬程：30m\n流量：100m³/h、电压：380V';
    const params = extractAllParamsFromText(text);
    expect(params.size).toBe(4);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
    expect(params.get('流量')).toBe('100m³/h');
    expect(params.get('电压')).toBe('380V');
  });

  test('全角冒号和半角冒号混合', () => {
    const params = extractAllParamsFromText('功率:5.5KW 扬程：30m');
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
  });

  test('冒号后单个空格正确提取', () => {
    const params = extractAllParamsFromText('功率： 5.5KW 扬程： 30m');
    expect(params.size).toBe(2);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
  });

  test('冒号后无空格正确提取', () => {
    const params = extractAllParamsFromText('功率:5.5KW 扬程:30m');
    expect(params.size).toBe(2);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
  });

  test('多个空格分隔的混合场景', () => {
    const params = extractAllParamsFromText('功率：5.5KW  扬程：30m 流量：100m³/h');
    expect(params.size).toBe(3);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
    expect(params.get('流量')).toBe('100m³/h');
  });

  test('值含空格时只提取空格前的部分', () => {
    const params = extractAllParamsFromText('备注：hello world 扬程：30m');
    expect(params.size).toBe(2);
    expect(params.get('备注')).toBe('hello');
    expect(params.get('扬程')).toBe('30m');
  });

  test('键前后有空格时正确提取', () => {
    const params = extractAllParamsFromText('  功率 ：5.5KW  扬程 ：30m  ');
    expect(params.size).toBe(2);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
  });

  test('连续三个空格分隔', () => {
    const params = extractAllParamsFromText('功率：5.5KW   扬程：30m');
    expect(params.size).toBe(2);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
  });

  test('Tab 分隔', () => {
    const params = extractAllParamsFromText('功率：5.5KW\t扬程：30m\t流量：100m³/h');
    expect(params.size).toBe(3);
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('扬程')).toBe('30m');
    expect(params.get('流量')).toBe('100m³/h');
  });

  test('双引号包裹的值完整提取', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机" 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('型号')).toBe('GA37');
  });

  test('单引号包裹的值完整提取', () => {
    const params = extractAllParamsFromText("名称：'螺杆空压机' 型号：GA37");
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe("'螺杆空压机'");
    expect(params.get('型号')).toBe('GA37');
  });

  test('中文引号包裹的值完整提取', () => {
    const params = extractAllParamsFromText('名称：\u201c螺杆空压机\u201d 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('\u201c螺杆空压机\u201d');
    expect(params.get('型号')).toBe('GA37');
  });

  test('书名号包裹的值完整提取', () => {
    const params = extractAllParamsFromText('名称：《螺杆空压机》 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('《螺杆空压机》');
    expect(params.get('型号')).toBe('GA37');
  });

  test('引号与逗号分隔混合', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机"，型号：GA37，排气量：0.8m³/min');
    expect(params.size).toBe(3);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('型号')).toBe('GA37');
    expect(params.get('排气量')).toBe('0.8m³/min');
  });

  test('值只有引号无内容时提取空字符串被跳过', () => {
    const params = extractAllParamsFromText('名称："" 型号：GA37');
    // 值部分 [^\s，,、\n：:：]+ 需要至少一个非空字符，双引号是有效字符
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('""');
    expect(params.get('型号')).toBe('GA37');
  });

  test('引号内无空格时完整提取', () => {
    const params = extractAllParamsFromText('名称："他叫小明" 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('"他叫小明"');
    expect(params.get('型号')).toBe('GA37');
  });

  test('引号内有空格时完整提取（引号配对）', () => {
    const params = extractAllParamsFromText('描述："5.5KW 高压 空压机" 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('描述')).toBe('"5.5KW 高压 空压机"');
    expect(params.get('型号')).toBe('GA37');
  });

  test('单引号内有转义时完整提取（引号配对）', () => {
    const params = extractAllParamsFromText("名称：'it\\'s a pump' 型号：GA37");
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe("'it\\'s a pump'");
    expect(params.get('型号')).toBe('GA37');
  });

  test('反斜杠路径完整提取（非引号模式下反斜杠不是终止符）', () => {
    const params = extractAllParamsFromText('路径：C:\\Users\\admin 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('路径')).toBe('C:\\Users\\admin');
    expect(params.get('型号')).toBe('GA37');
  });

  test('双引号内有转义双引号时未闭合', () => {
    // JS 字符串中 \\" 是 \"（反斜杠+双引号），转义后找不到闭合引号
    const params = extractAllParamsFromText('名称："他叫\\"小明\\" 型号：GA37');
    expect(params.size).toBe(1);
    // 引号未闭合，值扫描到文本末尾
    expect(params.get('名称')).toBeTruthy();
  });

  test('引号未闭合时回退到空格终止', () => {
    const params = extractAllParamsFromText('描述："未闭合 扬程：30m');
    // 左引号无配对右引号，扫描到文本末尾
    expect(params.size).toBe(1);
    expect(params.get('描述')).toBe('"未闭合 扬程：30m');
  });

  test('多层嵌套不同类型引号', () => {
    const params = extractAllParamsFromText("名称：\"外层 '内层' 结束\" 型号：GA37");
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe("\"外层 '内层' 结束\"");
    expect(params.get('型号')).toBe('GA37');
  });

  test('中文引号配对', () => {
    const params = extractAllParamsFromText('描述：\u201c5.5KW 高压\u201d 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('描述')).toBe('\u201c5.5KW 高压\u201d');
    expect(params.get('型号')).toBe('GA37');
  });

  test('中文引号未配对左引号时回退', () => {
    const params = extractAllParamsFromText('描述：\u201c未闭合 扬程：30m');
    expect(params.size).toBe(1);
    expect(params.get('描述')).toBe('\u201c未闭合 扬程：30m');
  });

  test('双引号内含多个空格和冒号', () => {
    const params = extractAllParamsFromText('描述："规格：5.5KW 压力：0.8MPa" 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('描述')).toBe('"规格：5.5KW 压力：0.8MPa"');
    expect(params.get('型号')).toBe('GA37');
  });

  test('双引号紧邻后续参数无空格', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机"型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('型号')).toBe('GA37');
  });

  test('单引号内含逗号完整提取', () => {
    const params = extractAllParamsFromText("标签：'空压,水泵,风机' 类别：设备");
    expect(params.size).toBe(2);
    expect(params.get('标签')).toBe("'空压,水泵,风机'");
    expect(params.get('类别')).toBe('设备');
  });

  test('单引号内含顿号完整提取', () => {
    const params = extractAllParamsFromText("标签：'空压、水泵、风机' 类别：设备");
    expect(params.size).toBe(2);
    expect(params.get('标签')).toBe("'空压、水泵、风机'");
    expect(params.get('类别')).toBe('设备');
  });

  test('中文引号内含冒号完整提取', () => {
    const params = extractAllParamsFromText('描述：\u201c功率：5.5KW\u201d 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('描述')).toBe('\u201c功率：5.5KW\u201d');
    expect(params.get('型号')).toBe('GA37');
  });

  test('多个引号值相邻', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机" 品牌："阿特拉斯" 功率：5.5KW');
    expect(params.size).toBe(3);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('品牌')).toBe('"阿特拉斯"');
    expect(params.get('功率')).toBe('5.5KW');
  });

  test('引号值与非引号值混合', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机" 功率：5.5KW 排气量：0.8m³/min');
    expect(params.size).toBe(3);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('功率')).toBe('5.5KW');
    expect(params.get('排气量')).toBe('0.8m³/min');
  });

  test('引号内仅空格', () => {
    const params = extractAllParamsFromText('备注："   " 型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('备注')).toBe('"   "');
    expect(params.get('型号')).toBe('GA37');
  });

  test('单引号后紧跟逗号无空格', () => {
    const params = extractAllParamsFromText("标签：'设备',类别：工业");
    expect(params.size).toBe(2);
    expect(params.get('标签')).toBe("'设备'");
    expect(params.get('类别')).toBe('工业');
  });

  test('双引号后紧跟换行', () => {
    const params = extractAllParamsFromText('名称："螺杆空压机"\n型号：GA37');
    expect(params.size).toBe(2);
    expect(params.get('名称')).toBe('"螺杆空压机"');
    expect(params.get('型号')).toBe('GA37');
  });
});
