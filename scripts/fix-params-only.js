#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始修复未使用参数...\n');

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

console.log(`📊 扫描完成\n`);

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
  const fixedVars = [];
  
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
    
    // 只修复参数，不修复变量声明
    // 检查是否在函数参数位置
    // 函数参数的特征: 在 ( ... ) 中，不在 let/const/var 后
    
    // 检查是否是变量声明
    if (line.includes('const ') || line.includes('let ') || line.includes('var ')) {
      // 跳过变量声明
      return;
    }
    
    // 检查是否在导入语句中
    if (line.trim().startsWith('import')) {
      return;
    }
    
    // 检查是否在参数位置
    // 简单判断：如果这一行包含 ( 或 =>，很可能是参数
    const isParamLine = line.includes('(') || line.includes('=>') || line.includes('function');
    
    if (!isParamLine) {
      return;
    }
    
    // 替换为带下划线的版本
    lines[lineIndex] = line.replace(new RegExp(`\\b${varName}\\b(?!\\s*:)`), `_${varName}`);
    modified = true;
    totalFixed++;
    fixedVars.push(varName);
  });
  
  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    fixedFiles.push({
      file: path.relative(process.cwd(), filePath),
      fixedCount: fixedVars.length,
      vars: fixedVars
    });
  }
});

console.log(`🎉 修复完成！共修复 ${totalFixed} 个参数，${fixedFiles.length} 个文件\n`);

if (fixedFiles.length > 0) {
  console.log('📝 修复的文件:');
  fixedFiles.forEach(f => {
    console.log(`  - ${f.file} (${f.fixedCount} 处)`);
    if (f.vars.length <= 3) {
      console.log(`    参数: ${f.vars.join(', ')}`);
    }
  });
}

// 验证修复
console.log('\n🔍 验证修复结果...');
try {
  execSync('pnpm run type-check', { stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('✅ TypeScript 类型检查通过');
} catch (e) {
  console.log('❌ TypeScript 类型检查失败');
  console.log('请手动检查修复的代码');
}
