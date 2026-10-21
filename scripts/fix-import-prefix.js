/**
 * 批量删除导入中的下划线前缀
 * 修复之前的批量修复脚本导致的错误
 */

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔧 批量删除导入中的下划线前缀...\n');

// 获取所有 TypeScript 错误
const tscOutput = execSync('npx tsc --noEmit 2>&1 || true', { encoding: 'utf-8' });

// 解析错误，提取文件和错误的导入
const errors = [];
const lines = tscOutput.split('\n');

lines.forEach(line => {
  const match = line.match(/src\/[^(]+\((\d+),\d+\): error TS\d+: .* has no exported member named '(_[^']+)'/);
  if (match) {
    const [_, lineNumber, varName] = match;
    const fileMatch = line.match(/(src\/[^(:]+)/);
    if (fileMatch) {
      errors.push({
        file: fileMatch[1],
        line: parseInt(lineNumber),
        varName: varName,
        correctName: varName.substring(1) // 去掉下划线
      });
    }
  }
});

console.log(`发现 ${errors.length} 个错误\n`);

// 按文件分组
const fileErrors = {};
errors.forEach(error => {
  if (!fileErrors[error.file]) {
    fileErrors[error.file] = [];
  }
  fileErrors[error.file].push(error);
});

console.log(`涉及 ${Object.keys(fileErrors).length} 个文件\n`);

// 逐文件修复
let totalFixed = 0;

Object.entries(fileErrors).forEach(([file, errorList]) => {
  console.log(`处理: ${file} (${errorList.length} 个错误)`);

  try {
    const content = fs.readFileSync(file, 'utf-8');
    const contentLines = content.split('\n');
    let fixedCount = 0;

    // 按行号降序排序，避免修改后行号变化
    errorList.sort((a, b) => b.line - a.line);

    errorList.forEach(error => {
      const lineIndex = error.line - 1;
      const line = contentLines[lineIndex];

      // 替换错误的导入名
      const newLine = line.replace(new RegExp(`\\b${error.varName}\\b`, 'g'), error.correctName);

      if (newLine !== line) {
        contentLines[lineIndex] = newLine;
        fixedCount++;
        console.log(`  修复: 第 ${error.line} 行 - ${error.varName} → ${error.correctName}`);
      }
    });

    if (fixedCount > 0) {
      fs.writeFileSync(file, contentLines.join('\n'), 'utf-8');
      console.log(`  ✅ 修复了 ${fixedCount} 个错误`);
      totalFixed += fixedCount;
    } else {
      console.log(`  ⏭️  无法自动修复，跳过`);
    }

  } catch (error) {
    console.error(`  ❌ 处理失败: ${error.message}`);
  }
});

console.log(`\n🎉 批量修复完成！`);
console.log(`📊 总共修复了 ${totalFixed} 个错误`);
