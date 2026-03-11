import { PriceMatcher } from './src/lib/price-matching.js';

async function debugPriceQuery() {
  console.log('========== 调试价格查询 ==========\n');
  
  const testCase = { name: '化粪池', model: '1' };
  console.log('输入:', testCase);
  console.log('');
  
  const result = await PriceMatcher.matchPrice(testCase);
  
  console.log('\n========== 查询结果 ==========');
  console.log('价格:', result.price);
  console.log('来源:', result.source);
  console.log('置信度:', result.confidence);
  console.log('产品名:', result.productName);
  console.log('型号:', result.model);
  console.log('品牌:', result.brand);
  console.log('货币:', result.currency);
  console.log('');
  
  console.log('========== 预期结果 ==========');
  console.log('价格应该是: 545元');
  console.log('来源应该是: database');
  console.log('型号应该是: 1m³');
  console.log('');
}

debugPriceQuery().catch(console.error);
