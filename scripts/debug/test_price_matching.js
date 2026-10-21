const { ProductExtractor } = require('./src/lib/product-extractor');
const { PriceMatcher } = require('./src/lib/price-matching');

async function test() {
  // 测试1: 测试提取
  console.log('\n=== 测试1: 产品信息提取 ===');
  const extraction = await ProductExtractor.extract('2立方的化粪池多少钱');
  console.log('提取结果:', JSON.stringify(extraction, null, 2));

  // 测试2: 测试价格匹配
  console.log('\n=== 测试2: 价格匹配 ===');
  const priceResult = await PriceMatcher.matchPrice({
    name: '2立方的化粪池',
    model: undefined
  });
  console.log('价格匹配结果:', JSON.stringify(priceResult, null, 2));

  // 测试3: 直接使用提取的模型匹配
  console.log('\n=== 测试3: 使用提取的模型匹配 ===');
  if (extraction) {
    const priceResult2 = await PriceMatcher.matchPrice({
      name: extraction.productName,
      model: extraction.model
    });
    console.log('价格匹配结果:', JSON.stringify(priceResult2, null, 2));
  }
}

test().catch(console.error);
