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

  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-multi-row.xlsx');


    result.products.forEach((p, i) => {
    });

    // 验证结果
    const test1Passed = result.products.length === 3 &&
                       result.products[0].name === 'PAM搅拌罐本体' &&
                       result.products[0].parameter_description?.includes('环氧树脂内外防腐');

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


    // 详细检查每个产品的参数描述
    result.products.forEach((p, i) => {

      // 检查是否包含备注关键词
      const footerKeywords = ['以上价格', '不含税', '含运费'];
      footerKeywords.forEach(keyword => {
        if (p.parameter_description?.includes(keyword)) {
        }
      });
    });

    // 验证：页脚被正确排除
    const test2Passed = productCountCorrect &&
                       !hasFooterInProductName &&
                       !hasFooterInParameter;


    if (!test2Passed) {
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

  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-cleaning.xlsx');

    const product1 = result.products[0];


    // 验证：品牌信息合并正确
    const test3Passed = product1.brand === '佳木斯/减速机' &&
                       product1.parameter_description?.includes('环氧树脂');

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

  // 创建包含多余空格和换行的测试数据
  const testBuffer = createTestExcel();

  try {
    const result = await parseExcelEnhanced(testBuffer, 'test-whitespace.xlsx');

    const hasExtraWhitespace = result.products.some(p =>
      p.name?.match(/\s{3,}/) ||  // 超过3个连续空格
      p.parameter_description?.match(/\n/) // 换行符
    );


    result.products.forEach((p, i) => {
    });

    const test4Passed = !hasExtraWhitespace;

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

  const results: { name: string; passed: boolean }[] = [];

  try {
    results.push({ name: '测试1：多行产品描述合并', passed: await testMultiRowMerge() });
    results.push({ name: '测试2：页脚备注排除', passed: await testFooterExclusion() });
    results.push({ name: '测试3：参数清洗', passed: await testParameterCleaning() });
    results.push({ name: '测试4：空格和换行处理', passed: await testWhitespaceHandling() });
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }


  results.forEach((result, i) => {
    const icon = result.passed ? '✅' : '❌';
  });

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;


  return passedCount === totalCount;
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  runAllExcelParserTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
