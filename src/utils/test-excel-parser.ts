/**
 * Excel 增强解析器测试
 * 测试以下功能：
 * 1. 页脚备注排除
 * 2. 多行内容合并
 * 3. 参数清洗
 * 4. 产品信息提取
 */

import { parseExcelEnhanced, createTestExcel } from './excel-parser-enhanced';

/**
 * 测试1：多行产品描述合并
 */
async function testMultiRowMerge() {
  console.log('\n🧪 ===== 测试1：多行产品描述合并 =====\n');

  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-multi-row.xlsx');

    console.log('\n📊 解析结果:');
    console.log('产品数量:', result.products.length);
    console.log('解析详情:', result.parseDetails);

    console.log('\n📋 产品列表:');
    result.products.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.name}`);
      console.log('   参数:', p.parameter_description);
      console.log('   品牌:', p.brand);
      console.log('   单位:', p.unit);
      console.log('   数量:', p.quantity);
      console.log('   单价:', p.unit_price);
    });

    // 验证结果
    const test1Passed = result.products.length === 3 &&
                       result.products[0].name === 'PAM搅拌罐本体' &&
                       result.products[0].parameter_description?.includes('环氧树脂内外防腐');

    console.log('\n✅ 测试1结果:', test1Passed ? '通过' : '失败');
    return test1Passed;
  } catch (error) {
    console.error('❌ 测试1失败:', error);
    return false;
  }
}

/**
 * 测试2：页脚备注排除（重点测试）
 */
async function testFooterExclusion() {
  console.log('\n🧪 ===== 测试2：页脚备注排除（重点） =====\n');

  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-footer.xlsx');

    // 检查产品数量（应该是3个，不包含备注）
    const productCountCorrect = result.products.length === 3;

    // 检查是否有产品包含备注内容
    const hasFooterInProductName = result.products.some(p =>
      p.name?.includes('以上价格') || p.name?.includes('不含税')
    );

    const hasFooterInParameter = result.products.some(p =>
      p.parameter_description?.includes('以上价格不含税') ||
      p.parameter_description?.includes('含运费') ||
      p.parameter_description?.includes('不含税')
    );

    console.log('\n📊 解析结果:');
    console.log('✅ 产品数量:', result.products.length, '(期望: 3)');
    console.log('✅ 产品名称中是否包含备注:', hasFooterInProductName, '(期望: false)');
    console.log('✅ 参数描述中是否包含备注:', hasFooterInParameter, '(期望: false)');
    console.log('✅ 页脚行数:', result.parseDetails.footerRows.length);
    console.log('✅ 页脚内容:', result.parseDetails.footerRows);

    // 详细检查每个产品的参数描述
    console.log('\n🔍 详细检查每个产品的参数描述:');
    result.products.forEach((p, i) => {
      console.log(`  产品${i + 1} "${p.name}":`);
      console.log(`    参数: ${p.parameter_description}`);

      // 检查是否包含备注关键词
      const footerKeywords = ['以上价格', '不含税', '含运费'];
      footerKeywords.forEach(keyword => {
        if (p.parameter_description?.includes(keyword)) {
          console.log(`    ❌ 发现备注关键词: ${keyword}`);
        }
      });
    });

    // 验证：页脚被正确排除
    const test2Passed = productCountCorrect &&
                       !hasFooterInProductName &&
                       !hasFooterInParameter;

    console.log('\n✅ 测试2结果:', test2Passed ? '通过' : '失败');

    if (!test2Passed) {
      console.log('❌ 失败原因:');
      if (!productCountCorrect) console.log('  - 产品数量不正确');
      if (hasFooterInProductName) console.log('  - 产品名称中包含备注');
      if (hasFooterInParameter) console.log('  - 参数描述中包含备注');
    }

    return test2Passed;
  } catch (error) {
    console.error('❌ 测试2失败:', error);
    return false;
  }
}

/**
 * 测试3：参数清洗
 */
async function testParameterCleaning() {
  console.log('\n🧪 ===== 测试3：参数清洗 =====\n');

  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-cleaning.xlsx');

    const product1 = result.products[0];

    console.log('\n📊 解析结果:');
    console.log('产品1参数:', product1.parameter_description);
    console.log('产品1品牌:', product1.brand);

    // 验证：品牌信息合并正确
    const test3Passed = product1.brand === '佳木斯/减速机' &&
                       product1.parameter_description?.includes('环氧树脂');

    console.log('\n✅ 测试3结果:', test3Passed ? '通过' : '失败');
    return test3Passed;
  } catch (error) {
    console.error('❌ 测试3失败:', error);
    return false;
  }
}

/**
 * 测试4：空格和换行处理
 */
async function testWhitespaceHandling() {
  console.log('\n🧪 ===== 测试4：空格和换行处理 =====\n');

  // 创建包含多余空格和换行的测试数据
  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-whitespace.xlsx');

    const hasExtraWhitespace = result.products.some(p =>
      p.name?.match(/\s{3,}/) ||  // 超过3个连续空格
      p.parameter_description?.match(/\n/) // 换行符
    );

    console.log('\n📊 解析结果:');
    console.log('产品数量:', result.products.length);
    console.log('是否有多余空格或换行:', hasExtraWhitespace);

    result.products.forEach((p, i) => {
      console.log(`\n${i + 1}. 名称: "${p.name}"`);
      console.log(`   参数: "${p.parameter_description}"`);
    });

    const test4Passed = !hasExtraWhitespace;

    console.log('\n✅ 测试4结果:', test4Passed ? '通过' : '失败');
    return test4Passed;
  } catch (error) {
    console.error('❌ 测试4失败:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
export async function runAllExcelParserTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Excel 增强解析器 - 全部测试开始');
  console.log('='.repeat(60));

  const results: { name: string; passed: boolean }[] = [];

  try {
    results.push({ name: '测试1：多行产品描述合并', passed: await testMultiRowMerge() });
    results.push({ name: '测试2：页脚备注排除', passed: await testFooterExclusion() });
    results.push({ name: '测试3：参数清洗', passed: await testParameterCleaning() });
    results.push({ name: '测试4：空格和换行处理', passed: await testWhitespaceHandling() });
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  results.forEach((result, i) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  });

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`📈 通过率: ${passedCount}/${totalCount} (${Math.round(passedCount / totalCount * 100)}%)`);
  console.log('='.repeat(60) + '\n');

  return passedCount === totalCount;
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  runAllExcelParserTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
