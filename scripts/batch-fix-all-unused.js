/**
 * 批量修复所有未使用的变量和参数
 * 策略：
 * 1. 给未使用的参数添加下划线前缀
 * 2. 给未使用的变量添加下划线前缀
 * 3. 保留所有导入（不删除）
 */

const fs = require('fs');

console.log('🔧 批量修复所有未使用的变量和参数...\n');

// 获取所有警告
const { execSync } = require('child_process');
const lintOutput = execSync('pnpm lint 2>&1', { encoding: 'utf-8' });

// 解析警告
const warnings = [];
const lines = lintOutput.split('\n');
let currentFile = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // 匹配文件路径
  if (line.includes('/workspace/projects/src/') && (line.endsWith('.ts') || line.endsWith('.tsx'))) {
    currentFile = line.replace('/workspace/projects/', '');
    continue;
  }

  // 匹配未使用变量/参数的警告
  if (currentFile && line.includes('warning') && line.includes("Allowed unused")) {
    const match = line.match(/^\s*(\d+):(\d+)\s+warning\s+'([^']+)'\s+is\s+(defined|assigned)\s+but\s+never\s+used/);
    if (match) {
      const [_, lineNumber, colNumber, varName, type] = match;
      warnings.push({
        file: currentFile,
        line: parseInt(lineNumber),
        col: parseInt(colNumber),
        varName: varName,
        type: type
      });
    }

    // 匹配参数
    const paramMatch = line.match(/^\s*(\d+):(\d+)\s+warning\s+'([^']+)'\s+is\s+defined\s+but\s+never\s+used\. Allowed unused args/);
    if (paramMatch) {
      const [_, lineNumber, colNumber, varName] = paramMatch;
      warnings.push({
        file: currentFile,
        line: parseInt(lineNumber),
        col: parseInt(colNumber),
        varName: varName,
        type: 'param'
      });
    }
  }

  // 遇到空行或新文件时重置
  if (line.trim() === '' || (line.includes('/workspace/projects/src/') && line !== lines[i - 1])) {
    currentFile = '';
  }
}

console.log(`发现 ${warnings.length} 个警告\n`);

// 按文件分组
const fileWarnings = {};
warnings.forEach(warning => {
  if (!fileWarnings[warning.file]) {
    fileWarnings[warning.file] = [];
  }
  fileWarnings[warning.file].push(warning);
});

console.log(`涉及 ${Object.keys(fileWarnings).length} 个文件\n`);

// 逐文件修复
let totalFixed = 0;

Object.entries(fileWarnings).forEach(([file, fileWarningList]) => {
  console.log(`处理: ${file} (${fileWarningList.length} 个警告)`);

  try {
    const content = fs.readFileSync(file, 'utf-8');
    const contentLines = content.split('\n');
    let fixedCount = 0;

    // 按行号降序排序，避免修改后行号变化
    fileWarningList.sort((a, b) => b.line - a.line);

    fileWarningList.forEach(warning => {
      const lineIndex = warning.line - 1;
      const line = contentLines[lineIndex];

      // 跳过已经是下划线开头的
      if (warning.varName.startsWith('_')) {
        return;
      }

      // 检查是否是参数定义
      if (warning.type === 'param' || line.includes('function') || line.includes('=>')) {
        // 匹配参数
        const paramRegex = new RegExp(`(${warning.varName}\\s*[:\\)])([^,)]*)`);
        const newLine = line.replace(paramRegex, `_${warning.varName}$1$2`);

        if (newLine !== line) {
          contentLines[lineIndex] = newLine;
          fixedCount++;
          console.log(`  修复参数: 第 ${warning.line} 行 - ${warning.varName} → _${warning.varName}`);
          return;
        }
      }

      // 检查是否是变量定义（跳过导入）
      if (warning.type === 'assigned' && !line.includes('import')) {
        // 匹配赋值
        const assignRegex = new RegExp(`(\\bconst|let|var)\\s+(${warning.varName})\\s*=`);
        const newLine = line.replace(assignRegex, `$1 _${warning.varName} =`);

        if (newLine !== line) {
          contentLines[lineIndex] = newLine;
          fixedCount++;
          console.log(`  修复变量: 第 ${warning.line} 行 - ${warning.varName} → _${warning.varName}`);
          return;
        }
      }

      // 不修复导入，保留原有导入
    });

    if (fixedCount > 0) {
      fs.writeFileSync(file, contentLines.join('\n'), 'utf-8');
      console.log(`  ✅ 修复了 ${fixedCount} 个警告`);
      totalFixed += fixedCount;
    } else {
      console.log(`  ⏭️  无法自动修复，跳过`);
    }

  } catch (error) {
    console.error(`  ❌ 处理失败: ${error.message}`);
  }
});

console.log(`\n🎉 批量修复完成！`);
console.log(`📊 总共修复了 ${totalFixed} 个警告`);
console.log(`\n💡 提示: 剩余的警告需要手动处理或配置规则忽略`);
