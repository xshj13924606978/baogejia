#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始修复 API 路由中的未使用 request 参数...\n');

// 只处理 API 路由
const apiDir = path.join(process.cwd(), 'src/app/api');

// 递归查找所有 API 路由文件
function findApiFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findApiFiles(fullPath));
    } else if (item.name === 'route.ts' || item.name === 'route.js') {
      files.push(fullPath);
    }
  }
  
  return files;
}

const apiFiles = findApiFiles(apiDir);
console.log(`📄 找到 ${apiFiles.length} 个 API 路由文件\n`);

let totalFixed = 0;
const fixedFiles = [];

// 处理每个文件
apiFiles.forEach(filePath => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 查找所有导出的异步函数定义
    const functionPattern = /export\s+async\s+function\s+(\w+)\s*\([^)]*request[^)]*\)\s*:\s*[^{]*\{/g;
    
    let match;
    let modified = false;
    
    while ((match = functionPattern.exec(content)) !== null) {
      const funcName = match[1];
      const startPos = match.index + match[0].length;
      
      // 查找函数的结束位置（匹配对应的闭合大括号）
      let braceCount = 1;
      let endPos = startPos;
      
      for (let i = startPos; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
          endPos = i;
          break;
        }
      }
      
      const functionBody = content.slice(startPos, endPos);
      
      // 检查函数体中是否使用了 request
      // 排除声明语句，只检查实际使用
      const usesRequest = /\brequest\s*\./.test(functionBody) || 
                          /request\.\w+/.test(functionBody) ||
                          /\bawait\s+request/.test(functionBody) ||
                          /request\)\)/.test(functionBody); // request.json(), request.text() 等
      
      if (!usesRequest) {
        // 只有在函数体中不使用 request 时才修改
        const functionSignature = match[0];
        const newSignature = functionSignature.replace(/\brequest\b/g, '_request');
        
        if (newSignature !== functionSignature) {
          content = content.slice(0, match.index) + newSignature + content.slice(match.index + functionSignature.length);
          modified = true;
          console.log(`  ✅ ${path.relative(process.cwd(), filePath)}: ${funcName} - request → _request`);
          totalFixed++;
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      fixedFiles.push(path.relative(process.cwd(), filePath));
    }
  } catch (e) {
    console.error(`❌ 处理文件失败: ${filePath}`, e.message);
  }
});

console.log(`\n🎉 修复完成！共修复 ${totalFixed} 个参数，${fixedFiles.length} 个文件\n`);

// 验证修复
console.log('🔍 验证修复结果...');
try {
  execSync('pnpm run type-check', { stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('✅ TypeScript 类型检查通过');
} catch (e) {
  console.log('❌ TypeScript 类型检查失败');
  console.log('恢复修改...');
  
  // 恢复所有修改
  fixedFiles.forEach(file => {
    execSync(`git checkout -- "${file}"`, { stdio: ['pipe', 'pipe', 'pipe'] });
  });
  
  console.log('✅ 已恢复所有修改');
  process.exit(1);
}

console.log('\n📊 重新统计警告数...');
const output = execSync('npx eslint src/ 2>&1', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
const match = output.match(/✖\s+(\d+)\s+problems/);
if (match) {
  const warnings = parseInt(match[1]);
  console.log(`当前警告数: ${warnings}`);
}
