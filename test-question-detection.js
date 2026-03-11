import { PriceMatcher } from './src/lib/price-matching.js';

async function testQuestionDetection() {
  console.log('========== 测试询问句检测 ==========\n');

  const testCases = [
    // 测试用例 1: 询问句（应该被识别为不明确）
    {
      name: "产库里面好像有满足这参数的产 能告诉我价吗",
      expected: false,
      desc: "包含'好像有'、'这参数'、'能告诉我'的询问句"
    },
    
    // 测试用例 2: 指代词询问
    {
      name: "能告诉我这个产品的供应商及联系方式吗",
      expected: false,
      desc: "包含'这个产品'、'能告诉我'的询问句"
    },
    
    // 测试用例 3: 正常产品（应该被识别为明确）
    {
      name: "化粪池",
      model: "20m³",
      expected: true,
      desc: "明确的产品名称"
    },
    
    // 测试用例 4: 明确购买意图（应该被识别为明确）
    {
      name: "我要买化粪池",
      model: "20m³",
      expected: true,
      desc: "包含'我要买'的明确购买意图"
    },
    
    // 测试用例 5: 参数描述（应该被识别为不明确）
    {
      name: "功率：300KW，柴油机型号：六缸",
      expected: false,
      desc: "参数描述，无明确产品类型"
    },
    
    // 测试用例 6: 产品+参数（应该被识别为明确）
    {
      name: "化粪池：功率：300KW",
      expected: true,
      desc: "产品名称+参数描述"
    }
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`\n测试用例: ${testCase.desc}`);
    console.log(`输入: "${testCase.name}"${testCase.model ? `, 型号: "${testCase.model}"` : ''}`);
    
    const result = await PriceMatcher.matchPrice(testCase);
    const actualIsClear = !result.needsConfirmation;
    const pass = actualIsClear === testCase.expected;
    
    if (pass) {
      console.log(`✅ 通过 - ${actualIsClear ? '类别明确' : '需要确认'} (预期: ${testCase.expected ? '类别明确' : '需要确认'})`);
      passCount++;
    } else {
      console.log(`❌ 失败 - ${actualIsClear ? '类别明确' : '需要确认'} (预期: ${testCase.expected ? '类别明确' : '需要确认'})`);
      failCount++;
    }
    
    if (result.needsConfirmation && result.possibleCategories.length > 0) {
      console.log(`   可能的类别: ${result.possibleCategories.join(', ')}`);
    }
  }

  console.log('\n========== 测试结果 ==========');
  console.log(`总测试数: ${testCases.length}`);
  console.log(`通过: ${passCount}`);
  console.log(`失败: ${failCount}`);
  console.log(`通过率: ${(passCount / testCases.length * 100).toFixed(1)}%`);
}

testQuestionDetection().catch(console.error);
