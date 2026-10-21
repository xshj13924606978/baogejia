#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 开始批量修复未使用参数...\n');

// 读取 ESLint 报告
const eslintOutput = fs.readFileSync('eslint-output.json', 'utf8');
const data = JSON.parse(eslintOutput);

let totalFixed = 0;
const fixedFiles = [];

// 处理每个文件
data.forEach(fileResult => {
  if (!fileResult.messages || fileResult.messages.length === 0) return;
  
  const filePath = fileResult.filePath;
  const unusedVars = fileResult.messages.filter(m => 
    m.ruleId && m.ruleId.includes('no-unused-vars')
  );
  
  if (unusedVars.length === 0) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let modified = false;
  
  // 按行号从大到小处理
  const sortedVars = [...unusedVars].sort((a, b) => b.line - a.line);
  
  sortedVars.forEach(warning => {
    const lineIndex = warning.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    const line = lines[lineIndex];
    const column = warning.column - 1;
    
    // 提取变量名
    const varMatch = line.slice(column).match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/);
    if (!varMatch) return;
    
    const varName = varMatch[1];
    
    // 跳过已经有下划线前缀的
    if (varName.startsWith('_')) return;
    
    // 只修复参数，不修复导入和变量声明
    // 参数通常出现在 function(...), (...)=>, 或 async (...)=> 中
    const isParam = 
      line.includes('function') || 
      line.includes('=>') ||
      line.match(/\(\s*[^)]*\)/) ||
      line.match(/async\s*\(/);
    
    if (!isParam) return;
    
    // 替换为带下划线的版本
    lines[lineIndex] = line.replace(new RegExp(`\\b${varName}\\b(?!\\s*:)`), `_${varName}`);
    modified = true;
    totalFixed++;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    fixedFiles.push(path.relative(process.cwd(), filePath));
  }
});

console.log(`🎉 修复完成！共修复 ${totalFixed} 个参数，${fixedFiles.length} 个文件\n`);

if (fixedFiles.length > 0) {
  console.log('修复的文件:');
  fixedFiles.forEach(f => console.log(`  - ${f}`));
}
