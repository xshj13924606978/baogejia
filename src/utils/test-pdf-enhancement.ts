/**
 * PDF解析增强功能测试
 */

import { cleanParameterDescriptionEnhanced, extractParameterSummary } from './string-cleaner-enhanced';
import { PdfTableEnhancer, TableMerger, ColumnIdentifier, TextEnhancer } from './pdf-table-enhancer';

console.log('🧪 开始测试PDF解析增强功能\n');
console.log('='.repeat(80));

// 测试1：增强版参数清洗
console.log('\n📋 测试1: 增强版参数清洗');
console.log('-'.repeat(80));

const testCases = [
  {
    name: '基础清洗',
    input: 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢/壁厚 10mm；环氧树脂内外防腐/带顶盖及 活动加药孔；3条400mm支腿/不锈钢 304工艺管道 φ4000×3000',
  },
  {
    name: '品牌拆分修复',
    input: '药剂搅拌系统不锈钢搅拌器/功率/380V；电机：佳木斯/减速机：宁波动力；轴承：哈瓦洛(Harbin Bearing)11kW搅拌机组',
  },
  {
    name: '参数格式修复',
    input: 'φ 4000 × 3000 mm Q235 B 碳钢/壁厚 10 mm',
  },
  {
    name: '数量信息移除',
    input: '不锈钢管道套3 2 φ4000×3000 数量：5',
  },
  {
    name: '换行修复',
    input: 'Harbin Bearing 轴承\n佳木斯 电机',
  },
];

testCases.forEach((test, index) => {
  console.log(`\n测试用例 ${index + 1}: ${test.name}`);
  console.log('输入:', test.input);
  
  const result = cleanParameterDescriptionEnhanced(test.input);
  console.log('输出:', result.cleaned);
  console.log('清洗项:', result.removedItems);
  console.log('统计:', result.statistics);
});

// 测试2：参数摘要提取
console.log('\n📋 测试2: 参数摘要提取');
console.log('-'.repeat(80));

const summaryTest = 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢/壁厚10mm；11kW电机；处理量50吨/天；环氧树脂防腐';
const summary = extractParameterSummary(summaryTest);

console.log('输入:', summaryTest);
console.log('摘要:', JSON.stringify(summary, null, 2));

// 测试3：表格行合并
console.log('\n📋 测试3: 表格行合并');
console.log('-'.repeat(80));

const merger = new TableMerger(30, 20);

const testRows = [
  {
    cells: ['PAM搅拌罐本体', 'φ4000×3000mm Q235B碳钢', '套', '3'],
    x: 0,
    y: 0,
    height: 20,
    originalIndex: 0,
  },
  {
    cells: ['', '佳木斯/减速机：宁波动力', '', ''],
    x: 0,
    y: 20,
    height: 20,
    originalIndex: 1,
  },
  {
    cells: ['', '轴承：哈瓦洛', '', ''],
    x: 0,
    y: 40,
    height: 20,
    originalIndex: 2,
  },
  {
    cells: ['药剂搅拌系统', '不锈钢搅拌器', '套', '3'],
    x: 0,
    y: 80,
    height: 20,
    originalIndex: 3,
  },
];

console.log('合并前:', testRows.length, '行');
testRows.forEach((row, i) => {
  console.log(`  行${i + 1}:`, row.cells.join(' | '));
});

const mergedRows = merger.mergeRows(testRows);

console.log('\n合并后:', mergedRows.length, '行');
mergedRows.forEach((row, i) => {
  console.log(`  行${i + 1}:`, row.cells.join(' | '));
});

// 测试4：列识别
console.log('\n📋 测试4: 列识别');
console.log('-'.repeat(80));

const columnIdentifier = new ColumnIdentifier();

const headerRow = {
  cells: ['序号', '产品名称', '参数描述', '品牌', '单位', '数量', '单价(元)', '小计(元)'],
  x: 0,
  y: 0,
  height: 20,
  originalIndex: 0,
};

const dataRows = [
  {
    cells: ['1', 'PAM搅拌罐本体', 'φ4000×3000mm Q235B碳钢', '-', '套', '3', '13636', '40908'],
    x: 0,
    y: 20,
    height: 20,
    originalIndex: 1,
  },
  {
    cells: ['2', '药剂搅拌系统', '11kW不锈钢搅拌器', '佳木斯', '套', '3', '0', '0'],
    x: 0,
    y: 40,
    height: 20,
    originalIndex: 2,
  },
];

console.log('表头:', headerRow.cells);
console.log('数据行数:', dataRows.length);

const columns = columnIdentifier.identifyColumns(headerRow, dataRows);
console.log('\n识别结果:');
columns.forEach(col => {
  console.log(`  列${col.index}: "${col.header}" → ${col.type} (置信度: ${col.confidence.toFixed(2)})`);
});

// 测试5：文本增强
console.log('\n📋 测试5: 文本增强');
console.log('-'.repeat(80));

const textEnhancer = new TextEnhancer();

const textTest = 'PAM搅拌罐本体  φ4000×3000mm  Q235B碳钢/壁厚10mm';
const enhancedText = textEnhancer.fixTextIssues(textTest);

console.log('原始:', textTest);
console.log('增强后:', enhancedText);

// 测试6：完整表格增强
console.log('\n📋 测试6: 完整表格增强');
console.log('-'.repeat(80));

const tableEnhancer = new PdfTableEnhancer();

const sampleTable = `
序号	产品名称	参数描述	品牌	单位	数量	单价(元)	小计(元)
1	PAM搅拌罐本体	φ4000×3000mm Q235B碳钢/壁厚10mm；环氧树脂内外防腐	-	套	3	13636	40908
2	药剂搅拌系统	11kW不锈钢搅拌器	佳木斯	套	3	0	0
`;

console.log('输入表格:');
console.log(sampleTable);

const enhancedTable = tableEnhancer.enhanceTable(sampleTable);
console.log('\n增强结果:');
console.log('  行数:', enhancedTable.rows.length);
console.log('  列数:', enhancedTable.columns.length);

const products = tableEnhancer.extractProductsFromEnhancedTable(enhancedTable);
console.log('\n提取的产品:');
products.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.name}`);
  console.log(`     参数: ${p.parameter_description}`);
  console.log(`     品牌: ${p.brand || '-'}`);
  console.log(`     数量: ${p.quantity}`);
  console.log(`     单价: ${p.price}`);
});

console.log('\n' + '='.repeat(80));
console.log('🎉 所有测试完成！');
