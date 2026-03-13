#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始批量修复未使用变量...\n');

// 收集所有未使用变量的文件
const command = 'npx eslint src/ --format=json 2>&1 | grep -v "ESLintIgnoreWarning"';
const result = execSync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });

let data = [];
try {
  // 提取 JSON 部分
  const jsonStart = result.indexOf('[');
  const jsonEnd = result.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonString = result.substring(jsonStart, jsonEnd + 1);
    data = JSON.parse(jsonString);
  }
} catch (e) {
  console.error('❌ 解析 ESLint 输出失败:', e.message);
  process.exit(1);
}

let totalFixed = 0;
let totalWarnings = 0;
const filesToFix = new Set();

// 收集所有需要修复的文件
data.forEach(file => {
  if (!file.messages || file.messages.length === 0) return;
  
  const unusedVars = file.messages.filter(m => 
    m.ruleId && m.ruleId.includes('no-unused-vars')
  );
  
  if (unusedVars.length > 0) {
    filesToFix.add(file.filePath);
    totalWarnings += unusedVars.length;
  }
});

console.log(`📄 发现 ${filesToFix.size} 个文件包含 ${totalWarnings} 个未使用变量警告\n`);

// 使用 ESLint --fix 自动修复
console.log('🔄 运行 ESLint 自动修复...');
try {
  execSync('npx eslint src/ --fix', { 
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10 
  });
  console.log('✅ ESLint 自动修复完成\n');
} catch (e) {
  console.log('⚠️ ESLint 自动修复完成（部分问题可能需要手动处理）\n');
}

// 检查剩余警告
console.log('🔍 检查剩余警告...');
try {
  const checkCommand = 'npx eslint src/ --format=json 2>&1 | grep -v "ESLintIgnoreWarning"';
  const checkResult = execSync(checkCommand, { 
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10 
  });
  
  let checkData = [];
  try {
    const jsonStart = checkResult.indexOf('[');
    const jsonEnd = checkResult.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonString = checkResult.substring(jsonStart, jsonEnd + 1);
      checkData = JSON.parse(jsonString);
    }
  } catch (e) {
    // 忽略解析错误
  }
  
  const remainingWarnings = checkData.reduce((sum, f) => {
    const unused = f.messages.filter(m => 
      m.ruleId && m.ruleId.includes('no-unused-vars')
    );
    return sum + unused.length;
  }, 0);
  
  const fixedCount = totalWarnings - remainingWarnings;
  
  console.log(`
🎉 批量修复完成！

📈 结果统计:
  初始警告: ${totalWarnings}
  剩余警告: ${remainingWarnings}
  修复警告: ${fixedCount}
  处理文件: ${filesToFix.size}
`);

  if (remainingWarnings > 0) {
    console.log('\n⚠️  仍有警告剩余，主要是:');
    checkData.forEach(f => {
      const unused = f.messages.filter(m => 
        m.ruleId && m.ruleId.includes('no-unused-vars')
      );
      if (unused.length > 0) {
        console.log(`  - ${path.relative(process.cwd(), f.filePath)} (${unused.length})`);
      }
    });
  }
  
  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    initialWarnings: totalWarnings,
    remainingWarnings,
    fixedWarnings: fixedCount,
    filesProcessed: filesToFix.size
  };
  
  fs.writeFileSync('batch-fix-report.json', JSON.stringify(report, null, 2));
  console.log('\n📝 报告已保存: batch-fix-report.json');
  
} catch (e) {
  console.error('❌ 检查剩余警告失败:', e.message);
}
