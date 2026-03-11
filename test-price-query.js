import { PriceMatcher } from './src/lib/price-matching.js';

async function testPriceQuery() {
  console.log('========== 开始价格查询测试 ==========');

  const testCases = [
    { name: '化粪池', model: '20m³' },
    { name: '化粪池', model: '1m³' },
    { name: '化粪池', model: '150m³' },
  ];

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name} ${testCase.model}`);
    const result = await PriceMatcher.matchPrice(testCase);
    console.log('结果:', JSON.stringify(result, null, 2));
  }

  console.log('\n========== 测试完成 ==========');
}

testPriceQuery().catch(console.error);
