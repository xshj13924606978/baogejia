import { PriceMatcher } from './src/lib/price-matching.js';

async function testPriceQuery() {
  console.log('========== 开始价格查询测试 ==========');

  const testCases = [
    { name: '化粪池', model: '20m³' },
    { name: '化粪池', model: '1m³' },
    { name: '化粪池', model: '150m³' },
    // 新增测试用例
    { name: "当'没有明确指定产品类别'时你要我进行确定到底是想咨询发电机组还是柴油机这样才是比较人性化的" },
    { name: "功率：300KW，柴油机型号：六缸" },
  ];

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`);
    if (testCase.model) {
      console.log(`型号: ${testCase.model}`);
    }
    const result = await PriceMatcher.matchPrice(testCase);
    console.log('结果:', JSON.stringify(result, null, 2));
  }

  console.log('\n========== 测试完成 ==========');
}

testPriceQuery().catch(console.error);
