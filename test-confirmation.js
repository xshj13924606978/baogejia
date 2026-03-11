import { PriceMatcher } from './src/lib/price-matching.js';

async function test() {
  console.log('========== 测试1: 反馈文本 ==========');
  const testCase1 = {
    name: "当'没有明确指定产品类别'时你要我进行确定到底是想咨询发电机组还是柴油机这样才是比较人性化的"
  };
  
  console.log('输入:', testCase1.name);
  const result1 = await PriceMatcher.matchPrice(testCase1);
  console.log('结果:', JSON.stringify(result1, null, 2));
  
  console.log('\n========== 测试2: 参数描述 ==========');
  const testCase2 = {
    name: "功率：300KW，柴油机型号：六缸"
  };
  
  console.log('输入:', testCase2.name);
  const result2 = await PriceMatcher.matchPrice(testCase2);
  console.log('结果:', JSON.stringify(result2, null, 2));
  
  console.log('\n========== 测试3: 正常产品 ==========');
  const testCase3 = {
    name: "化粪池",
    model: "1"
  };
  
  console.log('输入:', testCase3);
  const result3 = await PriceMatcher.matchPrice(testCase3);
  console.log('结果:', JSON.stringify(result3, null, 2));
}

test().catch(console.error);
