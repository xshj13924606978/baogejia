import { supabase } from '../src/lib/supabase-client.js';

async function queryDatabase() {
  console.log('========== 查询数据库中的化粪池产品 ==========');
  
  // 查询所有化粪池产品
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%化粪池%')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('查询失败:', error);
    return;
  }

  console.log('找到', products.length, '个化粪池产品:\n');

  products.forEach((p: any, index: number) => {
    console.log(`产品 ${index + 1}:`);
    console.log(`  ID: ${p.id}`);
    console.log(`  name: "${p.name}" (类型: ${typeof p.name}, 长度: ${p.name?.length})`);
    console.log(`  model: "${p.model}" (类型: ${typeof p.model}, 长度: ${p.model?.length})`);
    console.log(`  brand: "${p.brand}"`);
    console.log(`  category: "${p.category}"`);
    console.log(`  price: ${p.price} (类型: ${typeof p.price})`);
    console.log(`  unit: "${p.unit}"`);
    console.log(`  specifications: "${p.specifications}"`);
    console.log(`  keywords: "${p.keywords}"`);
    console.log(`  verified: ${p.verified}`);
    console.log(`  created_at: ${p.created_at}`);
    console.log('');
  });

  // 测试精确匹配
  console.log('\n========== 测试精确匹配 ==========');
  
  const testCases = [
    { name: '化粪池', model: '3' },
    { name: '化粪池', model: 3 },
    { name: '化粪池', model: '2' },
    { name: '化粪池', model: 2 }
  ];

  for (const testCase of testCases) {
    console.log(`\n测试: name="${testCase.name}", model="${testCase.model}" (类型: ${typeof testCase.model})`);
    
    const { data: matches, error: matchError } = await supabase
      .from('products')
      .select('*')
      .ilike('name', testCase.name)
      .eq('model', testCase.model)
      .limit(5);

    if (matchError) {
      console.log('  查询错误:', matchError);
    } else {
      console.log('  匹配数量:', matches.length);
      matches.forEach((m: any, i: number) => {
        console.log(`  匹配${i + 1}: name="${m.name}", model="${m.model}" (类型: ${typeof m.model})`);
      });
    }
  }

  // 测试模糊匹配
  console.log('\n========== 测试模糊匹配 ==========');
  
  const fuzzyTestCases = [
    { name: '化粪池', modelPattern: '%3%' },
    { name: '化粪池', modelPattern: '%2%' }
  ];

  for (const testCase of fuzzyTestCases) {
    console.log(`\n测试: name="${testCase.name}", model LIKE "${testCase.modelPattern}"`);
    
    const { data: matches, error: matchError } = await supabase
      .from('products')
      .select('*')
      .ilike('name', `%${testCase.name}%`)
      .ilike('model', testCase.modelPattern)
      .limit(5);

    if (matchError) {
      console.log('  查询错误:', matchError);
    } else {
      console.log('  匹配数量:', matches.length);
      matches.forEach((m: any, i: number) => {
        console.log(`  匹配${i + 1}: name="${m.name}", model="${m.model}" (类型: ${typeof m.model})`);
      });
    }
  }
}

queryDatabase().catch(console.error);
