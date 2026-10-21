/**
 * 批量修复 Top 10 高警告文件中的未使用变量和参数
 * 策略：
 * 1. 给未使用的参数添加下划线前缀 (_)
 * 2. 删除未使用的导入（需要手动确认）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Top 10 高警告文件
const TOP10_FILES = [
  'src/app/api/chat/route.ts',
  'src/app/team/[id]/page.tsx',
  'src/components/chat-area.tsx',
  'src/lib/payment-service.ts',
  'src/components/admin/levels/LevelEditor.tsx',
  'src/components/sidebar.tsx',
  'src/components/team/comment-section.tsx',
  'src/components/team/shared-quotes-list.tsx',
  'src/components/user/customer-list-panel.tsx',
  'src/components/admin/levels/LevelList.tsx'
];

console.log('🔧 批量修复 Top 10 高警告文件...\n');

let totalFixed = 0;

TOP10_FILES.forEach((file, index) => {
  console.log(`\n[${index + 1}/10] 处理: ${file}`);
  
  try {
    // 读取文件内容
    const content = fs.readFileSync(file, 'utf-8');
    
    // 获取该文件的具体警告信息
    const eslintOutput = execSync(`pnpm lint 2>&1 | grep -A50 "${file}"`, { encoding: 'utf-8' });
    
    // 解析警告，提取行号和变量名
    const warnings = [];
    const lines = eslintOutput.split('\n');
    let currentFile = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 匹配文件路径
      if (line.includes(file)) {
        currentFile = file;
        continue;
      }
      
      // 匹配警告行
      if (currentFile && line.includes('warning') && line.includes('no-unused-vars')) {
        const match = line.match(/^\s*(\d+):(\d+)\s+warning\s+'([^']+)'/);
        if (match) {
          const [_, lineNumber, colNumber, varName] = match;
          warnings.push({
            line: parseInt(lineNumber),
            col: parseInt(colNumber),
            varName: varName
          });
        }
      }
      
      // 遇到空行或新文件时重置
      if (line.trim() === '' || line.includes('/workspace/projects/src/')) {
        if (line !== lines[i - 1]) {
          currentFile = '';
        }
      }
    }
    
    console.log(`  发现 ${warnings.length} 个警告`);
    
    if (warnings.length === 0) {
      console.log('  ✅ 无警告，跳过');
      return;
    }
    
    // 逐行修复未使用的参数
    const contentLines = content.split('\n');
    let fixedCount = 0;
    
    warnings.forEach(warning => {
      const lineIndex = warning.line - 1;
      const line = contentLines[lineIndex];
      
      // 检查是否是参数定义（在函数括号内）
      const paramMatch = line.match(new RegExp(`(${warning.varName}\\s*:\\s*[^,)]+)([,)])`));
      
      if (paramMatch) {
        // 在参数前添加下划线
        const before = line.substring(0, paramMatch.index);
        const after = line.substring(paramMatch.index + paramMatch[1].length);
        const newLine = before + `_${warning.varName}` + after;
        
        contentLines[lineIndex] = newLine;
        fixedCount++;
        console.log(`  修复: 第 ${warning.line} 行 - ${warning.varName} → _${warning.varName}`);
      }
    });
    
    // 写回文件
    fs.writeFileSync(file, contentLines.join('\n'), 'utf-8');
    
    console.log(`  ✅ 修复了 ${fixedCount} 个参数`);
    totalFixed += fixedCount;
    
  } catch (error) {
    console.error(`  ❌ 处理失败: ${error.message}`);
  }
});

console.log(`\n🎉 批量修复完成！`);
console.log(`📊 总共修复了 ${totalFixed} 个未使用参数`);

// 运行 eslint --fix 自动修复其他问题
console.log(`\n🔨 运行 ESLint 自动修复...`);
try {
  execSync('pnpm eslint --fix src/app/api/chat/route.ts src/app/team/[id]/page.tsx src/components/chat-area.tsx src/lib/payment-service.ts', { 
    encoding: 'utf-8',
    stdio: 'inherit'
  });
  console.log(`✅ ESLint 自动修复完成`);
} catch (error) {
  console.log(`⚠️  ESLint 自动修复有些问题（正常，已手动修复主要部分）`);
}
