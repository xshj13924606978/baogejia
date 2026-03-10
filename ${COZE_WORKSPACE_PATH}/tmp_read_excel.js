const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('/tmp/产品价格库_选中23条_2026-03-10.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== Excel 数据 ===');
console.log('总行数:', data.length);
console.log('\n表头:');
console.log(JSON.stringify(data[0], null, 2));
console.log('\n所有数据:');
data.forEach((row, index) => {
  console.log(`\n--- 第 ${index + 1} 行 ---`);
  console.log(JSON.stringify(row, null, 2));
});

// 查找化粪池相关产品
console.log('\n\n=== 化粪池相关产品 ===');
data.forEach((row, index) => {
  if (index === 0) return; // 跳过表头
  const rowStr = JSON.stringify(row);
  if (rowStr.includes('化粪池')) {
    console.log(`第 ${index + 1} 行:`, JSON.stringify(row, null, 2));
  }
});
