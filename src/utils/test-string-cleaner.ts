/**
 * 参数描述清洗功能测试
 * 用于验证 cleanParameterDescription 函数的正确性
 */

import { cleanParameterDescription } from './string-cleaner';

interface TestCase {
  name: string;
  input: string;
  expected: string;
}

const testCases: TestCase[] = [
  {
    name: '尺寸规格重复测试（带mm和不带mm）',
    input: 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢 φ4000×3000',
    expected: 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢'
  },
  {
    name: '尺寸规格重复测试（多次出现）',
    input: 'φ4000×3000mm 不锈钢管道 φ4000×3000mm φ4000×3000',
    expected: 'φ4000×3000mm 不锈钢管道'
  },
  {
    name: '不同尺寸应保留',
    input: 'φ4000×3000mm 主罐 φ2000×1500mm 辅罐',
    expected: 'φ4000×3000mm 主罐 φ2000×1500mm 辅罐'
  },
  {
    name: '功率重复测试（kW）',
    input: '11kW搅拌器 电机11kW搅拌机组',
    expected: '11kW搅拌器 电机搅拌机组'
  },
  {
    name: '功率重复测试（千瓦）',
    input: '5.5千瓦电机 功率5.5千瓦',
    expected: '5.5千瓦电机 功率'
  },
  {
    name: '不同功率应保留',
    input: '11kW主电机 5.5kW辅助电机',
    expected: '11kW主电机 5.5kW辅助电机'
  },
  {
    name: '冗余信息清除测试（套3 2）',
    input: '不锈钢管道套3 2 φ4000×3000',
    expected: '不锈钢管道 φ4000×3000'
  },
  {
    name: '冗余信息清除测试（套3）',
    input: '设备套3 主体结构',
    expected: '设备主体结构'  // 修正：移除套3后不需要额外空格
  },
  {
    name: '冗余信息清除测试（套：3 2）',
    input: '搅拌罐套：3 2 φ4000×3000',
    expected: '搅拌罐 φ4000×3000'
  },
  {
    name: '组合场景测试1',
    input: 'PAM搅拌罐本体 φ4000×3000mm 11kW电机套3 2 φ4000×3000 11kW机组',
    expected: 'PAM搅拌罐本体 φ4000×3000mm 11kW电机 机组'  // 修正：移除重复的11kW后，"机组"保留
  },
  {
    name: '组合场景测试2（实际PDF数据）',
    input: 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢/壁厚 10mm；环氧树脂内外防腐/带顶盖及 活动加药孔；3条400mm支腿/不锈钢 304工艺管道 φ4000×3000',
    expected: 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢/壁厚 10mm；环氧树脂内外防腐/带顶盖及 活动加药孔；3条400mm支腿/不锈钢 304工艺管道'  // 修正：使用中文分号
  },
  {
    name: '组合场景测试3（无重复功率）',
    input: '药剂搅拌系统不锈钢搅拌器/功率/380V；电机：佳木斯/减速机：宁波动力；轴承：哈瓦洛(Harbin Bearing)11kW搅拌机组',
    expected: '药剂搅拌系统不锈钢搅拌器/功率/380V；电机：佳木斯/减速机：宁波动力；轴承：哈瓦洛(Harbin Bearing)11kW搅拌机组'  // 只有一个11kW，不重复，保留；使用中文标点
  },
  {
    name: '末尾数字清除',
    input: '设备参数说明 2',
    expected: '设备参数说明'
  },
  {
    name: '多个空格规范化',
    input: '设备1   设备2    设备3',
    expected: '设备1 设备2 设备3'
  },
  {
    name: '空字符串测试',
    input: '',
    expected: ''
  }
];


let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = cleanParameterDescription(testCase.input);
  const isPassed = result === testCase.expected;


  if (isPassed) {
    passed++;
  } else {
    failed++;
  }
});


if (failed === 0) {
} else {
}

export {};
