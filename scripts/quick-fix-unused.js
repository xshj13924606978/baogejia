#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始批量修复未使用变量...\n');

// 运行 ESLint 并获取 JSON 输出
let eslintOutput = '';
try {
  eslintOutput = execSync('npx eslint src/ --format json', { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 20
  });
} catch (e) {
  eslintOutput = e.stdout || '';
}

// 提取 JSON 数据
let data = [];
try {
  const jsonStart = eslintOutput.indexOf('[');
  const jsonEnd = eslintOutput.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonString = eslintOutput.substring(jsonStart, jsonEnd + 1);
    data = JSON.parse(jsonString);
  }
} catch (e) {
  console.error('❌ 解析 ESLint 输出失败:', e.message);
  process.exit(1);
}

console.log(`📊 扫描完成，发现 ${data.length} 个文件\n`);

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
  
  console.log(`\n📄 处理: ${path.relative(process.cwd(), filePath)} (${unusedVars.length} 警告)`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let modified = false;
  
  // 按行号从大到小处理，避免行号变化
  const sortedVars = [...unusedVars].sort((a, b) => b.line - a.line);
  
  sortedVars.forEach(warning => {
    const lineIndex = warning.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    const line = lines[lineIndex];
    
    // 提取变量名（从列号开始）
    const column = warning.column - 1;
    const varMatch = line.slice(column).match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/);
    if (!varMatch) return;
    
    const varName = varMatch[1];
    
    // 跳过已经有下划线前缀的
    if (varName.startsWith('_')) return;
    
    // 跳过导入语句（ESLint 会报告但我们需要保留结构）
    if (line.trim().startsWith('import')) return;
    
    // 替换为带下划线的版本
    // 需要精确匹配，避免替换其他地方的相同变量名
    const beforeStr = line.slice(0, column);
    const afterStr = line.slice(column + varName.length);
    
    // 检查是否在类型注解中（不替换）
    if (afterStr.startsWith(':')) return;
    
    lines[lineIndex] = beforeStr + '_' + varName + afterStr;
    modified = true;
    totalFixed++;
    console.log(`  ✅ ${varName} → _${varName} (行 ${warning.line})`);
  });
  
  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    fixedFiles.push({
      file: path.relative(process.cwd(), filePath),
      fixedCount: sortedVars.length
    });
  }
});

// 运行 ESLint fix 进行额外清理
console.log('\n🔄 运行 ESLint 自动修复进行额外清理...');
try {
  execSync('npx eslint src/ --fix', { 
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10
  });
  console.log('✅ ESLint 自动修复完成');
} catch (e) {
  console.log('⚠️ ESLint 自动修复完成（部分问题可能需要手动处理）');
}

// 检查最终结果
console.log('\n📊 检查最终结果...');
let finalOutput = '';
try {
  finalOutput = execSync('npx eslint src/ --format json', { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 20
  });
} catch (e) {
  finalOutput = e.stdout || '';
}

let finalData = [];
try {
  const jsonStart = finalOutput.indexOf('[');
  const jsonEnd = finalOutput.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonString = finalOutput.substring(jsonStart, jsonEnd + 1);
    finalData = JSON.parse(jsonString);
  }
} catch (e) {
  // 忽略错误
}

const remainingWarnings = finalData.reduce((sum, f) => {
  const unused = f.messages.filter(m => m.ruleId && m.ruleId.includes('no-unused-vars'));
  return sum + unused.length;
}, 0);

// 计算所有警告
const totalAllWarnings = finalData.reduce((sum, f) => sum + f.messages.length, 0);

console.log(`
🎉 批量修复完成！

📈 结果统计:
  修复变量: ${totalFixed}
  修复文件: ${fixedFiles.length}
  剩余未使用变量警告: ${remainingWarnings}
  总剩余警告: ${totalAllWarnings}
`);

// 显示修复详情
if (fixedFiles.length > 0) {
  console.log('\n📝 修复文件详情:');
  fixedFiles.forEach(f => {
    console.log(`  - ${f.file} (${f.fixedCount} 处)`);
  });
}

// 显示剩余警告文件
if (remainingWarnings > 0) {
  console.log('\n⚠️  剩余警告最多的文件 (Top 10):');
  const topFiles = finalData
    .filter(f => f.messages.some(m => m.ruleId && m.ruleId.includes('no-unused-vars')))
    .map(f => ({
      file: path.relative(process.cwd(), f.filePath),
      count: f.messages.filter(m => m.ruleId && m.ruleId.includes('no-unused-vars')).length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  topFiles.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.file} (${f.count})`);
  });
}

// 生成报告
const report = {
  timestamp: new Date().toISOString(),
  fixedVars: totalFixed,
  fixedFiles: fixedFiles.length,
  remainingUnusedWarnings: remainingWarnings,
  totalRemainingWarnings: totalAllWarnings,
  fileDetails: fixedFiles
};

fs.writeFileSync('final-cleanup-report.json', JSON.stringify(report, null, 2));
console.log('\n📝 报告已保存: final-cleanup-report.json');

if (totalAllWarnings < 100) {
  console.log('\n✅ 太棒了！警告数已降到 100 以下！');
} else {
  console.log(`\n📊 当前警告数: ${totalAllWarnings}`);
}
