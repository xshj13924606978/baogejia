import { PriceMatcher } from './src/lib/price-matching.ts';

// 测试"空压机"产品类型识别
async function testAirCompressorDetection() {
  console.log('========== 测试空压机产品类型识别 ==========\n');

  // 测试用例1：空压机 - 排气量查询
  const testCase1 = {
    name: '排气量：0.5 m³/min的空压机多少钱一台？',
    model: '',
    parameter_description: '排气量：0.5 m³/min'
  };

  console.log('测试用例1：', testCase1.name);
  const isClear1 = PriceMatcher.isProductCategoryClear(testCase1);
  console.log('产品类别是否明确:', isClear1);
  console.log('---\n');

  // 测试用例2：空气压缩机
  const testCase2 = {
    name: '空气压缩机',
    model: '10A',
    parameter_description: ''
  };

  console.log('测试用例2：', testCase2.name, testCase2.model);
  const isClear2 = PriceMatcher.isProductCategoryClear(testCase2);
  console.log('产品类别是否明确:', isClear2);
  console.log('---\n');

  // 测试用例3：化粪池
  const testCase3 = {
    name: '化粪池',
    model: '10立方米',
    parameter_description: ''
  };

  console.log('测试用例3：', testCase3.name, testCase3.model);
  const isClear3 = PriceMatcher.isProductCategoryClear(testCase3);
  console.log('产品类别是否明确:', isClear3);
  console.log('---\n');

  // 测试用例4：不带产品类型的纯参数描述
  const testCase4 = {
    name: '排气量：0.5 m³/min',
    model: '',
    parameter_description: ''
  };

  console.log('测试用例4：', testCase4.name);
  const isClear4 = PriceMatcher.isProductCategoryClear(testCase4);
  console.log('产品类别是否明确:', isClear4);
  console.log('---\n');

  console.log('========== 测试完成 ==========');
}

testAirCompressorDetection();
