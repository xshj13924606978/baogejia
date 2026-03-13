#!/usr/bin/env node

/**
 * API 路由批量修复脚本
 *
 * 功能：
 * - 修复未使用的导入
 * - 修复未使用的变量
 * - 修复未使用的函数参数
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取所有 API 路由文件
function getApiFiles() {
  try {
    const files = execSync('find src/app/api -name "route.ts" -type f', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f);
    return files;
  } catch (error) {
    console.error('❌ 获取 API 文件失败:', error.message);
    return [];
  }
}

// 获取文件的 ESLint 警告
function getLintWarnings(filePath) {
  try {
    const output = execSync(`npx eslint --ext .ts,.tsx ${filePath} 2>&1`, { encoding: 'utf8' });
    const warnings = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('warning')) {
        const match = line.match(/(\d+):(\d+)\s+warning\s+(.+)/);
        if (match) {
          warnings.push({
            line: parseInt(match[1]),
            col: parseInt(match[2]),
            message: match[3].trim()
          });
        }
      }
    }
    return warnings;
  } catch (error) {
    console.error(`❌ 获取 ${filePath} 的警告失败:`, error.message);
    return [];
  }
}

// 修复未使用的导入
function fixUnusedImports(content, warnings) {
  let modified = false;
  
  // 收集所有未使用的导入
  const unusedImports = warnings
    .filter(w => w.message.includes('is defined but never used'))
    .map(w => w.message.match(/'(\w+)'/)?.[1])
    .filter(Boolean);
  
  if (unusedImports.length === 0) return { content, modified };
  
  console.log(`   发现 ${unusedImports.length} 个未使用的导入`);
  
  // 删除未使用的导入
  unusedImports.forEach(importName => {
    const regex = new RegExp(
      `,\\s*${importName}\\b` + // 匹配逗号后的导入
      `|` + 
      `\\b${importName}\\s*,` + // 匹配逗号前的导入
      `|` +
      `import\\s+${importName}\\s+from`, // 匹配单独的导入
      'g'
    );
    
    if (regex.test(content)) {
      content = content.replace(regex, (match) => {
        // 保留 "import xxx from"
        if (match.includes('import')) {
          return match.replace(new RegExp(`\\b${importName}\\s+`), '');
        }
        return '';
      });
      modified = true;
      console.log(`   ✅ 删除未使用的导入: ${importName}`);
    }
  });
  
  // 清理格式问题
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/,\s*}/g, '}');
  content = content.replace(/\{\s*,/g, '{');
  
  return { content, modified };
}

// 修复未使用的变量
function fixUnusedVariables(content, warnings) {
  let modified = false;
  
  // 找出未使用的变量声明
  const unusedVars = warnings
    .filter(w => w.message.includes('is assigned a value but never used'))
    .map(w => {
      const match = w.message.match(/'(\w+)'/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  
  if (unusedVars.length === 0) return { content, modified };
  
  console.log(`   发现 ${unusedVars.length} 个未使用的变量`);
  
  // 为未使用的变量添加下划线前缀
  unusedVars.forEach(varName => {
    if (!varName.startsWith('_')) {
      const regex = new RegExp(`\\b(const|let|var)\\s+(${varName})\\b`, 'g');
      content = content.replace(regex, (match, keyword, name) => {
        return `${keyword} _${name}`;
      });
      modified = true;
      console.log(`   ✅ 标记未使用的变量: ${varName} → _${varName}`);
    }
  });
  
  return { content, modified };
}

// 修复未使用的函数参数
function fixUnusedParams(content, warnings) {
  let modified = false;
  
  // 找出未使用的参数
  const unusedParams = warnings
    .filter(w => w.message.includes('is defined but never used') || w.message.includes('is assigned a value but never used'))
    .map(w => {
      const match = w.message.match(/'(\w+)'/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  
  if (unusedParams.length === 0) return { content, modified };
  
  console.log(`   发现 ${unusedParams.length} 个未使用的参数`);
  
  // 为未使用的参数添加下划线前缀
  unusedParams.forEach(paramName => {
    if (!paramName.startsWith('_')) {
      // 匹配函数参数
      const regex = new RegExp(`\\b(${paramName})\\b(?=\\s*[\\),\\]])`, 'g');
      content = content.replace(regex, `_${paramName}`);
      modified = true;
      console.log(`   ✅ 标记未使用的参数: ${paramName} → _${paramName}`);
    }
  });
  
  return { content, modified };
}

// 处理单个文件
function processFile(filePath) {
  console.log(`\n🔧 处理: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  let modified = false;
  
  // 获取当前警告
  const warnings = getLintWarnings(filePath);
  
  if (warnings.length === 0) {
    console.log('   ✅ 无警告，跳过');
    return;
  }
  
  console.log(`   当前警告数: ${warnings.length}`);
  
  // 修复未使用的导入
  const result1 = fixUnusedImports(content, warnings);
  content = result1.content;
  modified = modified || result1.modified;
  
  // 修复未使用的变量
  const result2 = fixUnusedVariables(content, warnings);
  content = result2.content;
  modified = modified || result2.modified;
  
  // 修复未使用的参数
  const result3 = fixUnusedParams(content, warnings);
  content = result3.content;
  modified = modified || result3.modified;
  
  // 保存文件
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('   ✅ 文件已保存');
    
    // 再次检查警告
    const newWarnings = getLintWarnings(filePath);
    console.log(`   修复后警告数: ${newWarnings.length} (减少 ${warnings.length - newWarnings.length})`);
  } else {
    console.log('   ⚠️  无可自动修复的警告');
  }
}

// 主函数
function main() {
  console.log('🔧 开始批量修复 API 路由...\n');
  
  const apiFiles = getApiFiles();
  
  if (apiFiles.length === 0) {
    console.log('❌ 未找到 API 路由文件');
    process.exit(1);
  }
  
  console.log(`📁 找到 ${apiFiles.length} 个 API 路由文件\n`);
  
  let totalProcessed = 0;
  let totalFixed = 0;
  
  apiFiles.forEach(file => {
    try {
      processFile(file);
      totalProcessed++;
    } catch (error) {
      console.error(`❌ 处理 ${file} 失败:`, error.message);
    }
  });
  
  console.log(`\n✅ 批量修复完成！`);
  console.log(`   处理文件数: ${totalProcessed}`);
  
  // 生成最终报告
  console.log('\n📊 运行最终检查...');
  try {
    execSync('node scripts/track-eslint-warnings.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ 生成报告失败:', error.message);
  }
}

main();
