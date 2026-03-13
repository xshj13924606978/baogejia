#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('📊 分析未使用的变量和参数...\n');

// 获取 ESLint JSON 输出
let eslintJson;
try {
  eslintJson = execSync('npx eslint src/ --format=json 2>/dev/null', { encoding: 'utf8' });
} catch (e) {
  eslintJson = e.stdout;
}

const results = JSON.parse(eslintJson);
const fileCounts = new Map();
const varCounts = new Map();

// 分析警告
results.forEach(result => {
  const messages = result.messages.filter(m => 
    m.ruleId === '@typescript-eslint/no-unused-vars' && 
    m.messageId === 'unusedVar' &&
    !m.message.includes('request')
  );
  
  if (messages.length > 0) {
    const fileName = result.filePath.split('/').pop();
    fileCounts.set(fileName, (fileCounts.get(fileName) || 0) + messages.length);
    
    messages.forEach(msg => {
      const match = msg.message.match(/'([^']+)'/);
      if (match) {
        const varName = match[1];
        varCounts.set(varName, (varCounts.get(varName) || 0) + 1);
      }
    });
  }
});

console.log('📁 文件分布（Top 20）：\n');
const sortedFiles = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
sortedFiles.forEach(([file, count]) => {
  console.log(`  ${count} - ${file}`);
});

console.log('\n\n📝 变量分布（Top 20）：\n');
const sortedVars = [...varCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
sortedVars.forEach(([varName, count]) => {
  console.log(`  ${count} - ${varName}`);
});

const totalUnused = [...fileCounts.values()].reduce((a, b) => a + b, 0);
console.log(`\n\n总计：${totalUnused} 个未使用的变量/参数\n`);
