/**
 * PDF解析增强功能测试
 */

import { cleanParameterDescriptionEnhanced, extractParameterSummary } from './string-cleaner-enhanced';
import { PdfTableEnhancer, TableMerger, ColumnIdentifier, TextEnhancer } from './pdf-table-enhancer';


// 测试1：增强版参数清洗

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
  
  const result = cleanParameterDescriptionEnhanced(test.input);
});

// 测试2：参数摘要提取

const summaryTest = 'PAM搅拌罐本体 φ4000×3000mm Q235B碳钢/壁厚10mm；11kW电机；处理量50吨/天；环氧树脂防腐';
const summary = extractParameterSummary(summaryTest);


// 测试3：表格行合并

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

testRows.forEach((row, i) => {
});

const mergedRows = merger.mergeRows(testRows);

mergedRows.forEach((row, i) => {
});

// 测试4：列识别

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


const columns = columnIdentifier.identifyColumns(headerRow, dataRows);
columns.forEach(col => {
});

// 测试5：文本增强

const textEnhancer = new TextEnhancer();

const textTest = 'PAM搅拌罐本体  φ4000×3000mm  Q235B碳钢/壁厚10mm';
const enhancedText = textEnhancer.fixTextIssues(textTest);


// 测试6：完整表格增强

const tableEnhancer = new PdfTableEnhancer();

const sampleTable = `
序号	产品名称	参数描述	品牌	单位	数量	单价(元)	小计(元)
1	PAM搅拌罐本体	φ4000×3000mm Q235B碳钢/壁厚10mm；环氧树脂内外防腐	-	套	3	13636	40908
2	药剂搅拌系统	11kW不锈钢搅拌器	佳木斯	套	3	0	0
`;


const enhancedTable = tableEnhancer.enhanceTable(sampleTable);

const products = tableEnhancer.extractProductsFromEnhancedTable(enhancedTable);
products.forEach((p, i) => {
});

