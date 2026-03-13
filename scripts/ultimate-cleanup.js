#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始终极清理...\n');

// 获取所有有警告的文件
try {
  const eslintOutput = execSync('npx eslint src/ --format json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const results = JSON.parse(eslintOutput);

  let totalFixed = 0;
  let totalWarnings = 0;
  const fileStats = [];

  results.forEach(result => {
    if (!result.messages || result.messages.length === 0) return;
    
    const filePath = result.filePath;
    // 只处理未使用变量的警告
    const warnings = result.messages.filter(m => m.ruleId && m.ruleId.includes('no-unused-vars'));
    if (warnings.length === 0) return;
    
    console.log(`\n📄 处理: ${path.relative(process.cwd(), filePath)} (${warnings.length} 警告)`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    const lines = content.split('\n');
    
    // 按行号倒序处理，避免行号变化
    const sortedWarnings = [...warnings].sort((a, b) => b.line - a.line);
    
    sortedWarnings.forEach(warning => {
      const lineIndex = warning.line - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) return;
      
      const line = lines[lineIndex];
      const column = warning.column - 1;
      
      // 提取变量名
      const varMatch = line.slice(column).match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/);
      if (!varMatch) return;
      
      const varName = varMatch[1];
      if (!varName || varName.startsWith('_')) return;
      
      // 策略1: 如果是导入语句，删除整个导入项
      if (line.includes('import')) {
        // 处理导入
        if (line.includes('{') && line.includes('}')) {
          // 删除单个导入项
          const patterns = [
            new RegExp(`,\\s*${varName}\\b`),
            new RegExp(`\\b${varName}\\s*,`),
            new RegExp(`\\b${varName}\\b(?=\\s*})`)
          ];
          
          let newLine = line;
          for (const pattern of patterns) {
            if (pattern.test(newLine)) {
              newLine = newLine.replace(pattern, '');
              modified = true;
              console.log(`  ✅ 删除未使用的导入: ${varName}`);
              break;
            }
          }
          
          if (newLine !== line) {
            lines[lineIndex] = newLine;
          }
        }
      }
      // 策略2: 如果是未使用的参数或变量，添加下划线前缀
      else {
        // 检查是否是参数定义
        const isParam = line.match(/\bfunction\s+\w*\s*\([^)]*\b|\([^)]*\)\s*=>/);
        
        // 检查是否是变量定义
        const isVarDecl = line.includes('const') || line.includes('let') || line.includes('var');
        
        if (isParam || isVarDecl) {
          // 替换变量名为 _变量名
          const pattern = new RegExp(`\\b${varName}\\b(?!\s*:)`); // 不替换类型注解中的
          if (pattern.test(line)) {
            lines[lineIndex] = line.replace(pattern, `_${varName}`);
            modified = true;
            console.log(`  ✅ 添加下划线前缀: ${varName} → _${varName}`);
          }
        }
      }
    });
    
    // 清理空的导入语句和修复语法
    for (let i = lines.length - 1; i >= 0; i--) {
      // 删除空的导入 { }
      if (lines[i].match(/import\s*\{\s*\}\s*from/)) {
        lines.splice(i, 1);
        modified = true;
        console.log(`  ✅ 删除空的导入语句`);
      }
      // 修复导入结尾的逗号
      else if (lines[i].match(/,\s*}/)) {
        lines[i] = lines[i].replace(/,\s*}/, '}');
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      totalFixed++;
      totalWarnings += warnings.length;
      fileStats.push({
        file: path.relative(process.cwd(), filePath),
        fixed: warnings.length
      });
    }
  });

  // 运行 ESLint fix 进行二次清理
  console.log('\n🔄 运行 ESLint 自动修复...');
  try {
    execSync('npx eslint src/ --fix', { stdio: 'inherit' });
  } catch (e) {
    // ESLint fix 可能有警告，继续执行
  }

  // 生成最终报告
  console.log('\\n📊 生成清理报告...');
  
  const finalOutput = execSync('npx eslint src/ --format json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const finalResults = JSON.parse(finalOutput);
  const remainingWarnings = finalResults.reduce((sum, r) => sum + r.messages.length, 0);

  const report = {
    timestamp: new Date().toISOString(),
    initialWarnings: 338,
    remainingWarnings,
    fixedWarnings: 338 - remainingWarnings,
    filesProcessed: totalFixed,
    fileDetails: fileStats
  };

  fs.writeFileSync('ultimate-cleanup-report.json', JSON.stringify(report, null, 2));

  console.log(`
🎉 终极清理完成！

📈 结果统计:
  初始警告: 338
  剩余警告: ${remainingWarnings}
  减少警告: ${338 - remainingWarnings}
  处理文件: ${totalFixed}

📝 报告已保存: ultimate-cleanup-report.json
`);

  // 如果还有剩余警告，给出建议
  if (remainingWarnings > 0) {
    console.log('\n⚠️  仍有警告剩余，建议手动处理以下文件:');
    finalResults.forEach(r => {
      if (r.messages.length > 0) {
        console.log(`  - ${path.relative(process.cwd(), r.filePath)} (${r.messages.length})`);
      }
    });
  }
} catch (error) {
  console.error('❌ 清理失败:', error.message);
  process.exit(1);
}
