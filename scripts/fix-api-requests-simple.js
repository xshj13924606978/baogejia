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
    let modified = false;
    
    // 匹配所有导出的异步函数
    // 格式：export async function GET(request: NextRequest, ...) { ... }
    // 或：export const POST = async (request: NextRequest, ...) => { ... }
    
    // 查找所有函数定义
    const patterns = [
      /export\s+async\s+function\s+(\w+)\s*\(([^)]+)\)\s*\{/g,
      /export\s+const\s+(\w+)\s*=\s*async\s*\(([^)]+)\)\s*(?:=>|:)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      const replacements = [];
      
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1];
        const params = match[2];
        
        // 检查参数中是否包含 request（但不包括 _request）
        if (params.includes('request') && !params.includes('_request')) {
          // 提取函数体
          const afterFunc = content.slice(match.index + match[0].length);
          
          // 找到对应的函数体
          let braceCount = 0;
          let bodyEnd = -1;
          let inBody = false;
          
          for (let i = 0; i < afterFunc.length; i++) {
            const char = afterFunc[i];
            if (char === '{') {
              braceCount++;
              inBody = true;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && inBody) {
                bodyEnd = match.index + match[0].length + i;
                break;
              }
            }
          }
          
          if (bodyEnd === -1) continue;
          
          const body = afterFunc.slice(0, afterFunc.indexOf('{') + 1);
          const afterBody = afterFunc.slice(afterFunc.indexOf('{') + 1, bodyEnd - match.index - match[0].length);
          
          // 检查函数体中是否使用了 request
          // 排除：request: NextRequest (类型声明)
          const usesRequest = 
            /request\.[a-zA-Z]/.test(afterBody) ||        // request.json(), request.text() 等
            /\bawait\s+request\b/.test(afterBody) ||       // await request
            /=\s*request\b/.test(afterBody) ||             // x = request
            /\brequest\b,/.test(afterBody) ||              // request, 作为参数
            /\(\s*request\b/.test(afterBody);              // (request 作为参数
          
          if (!usesRequest) {
            // 只有在函数体中不使用 request 时才修改
            const newParams = params.replace(/\brequest(?!\s*:)/g, '_request');
            
            if (newParams !== params) {
              replacements.push({
                start: match.index + match[0].indexOf(params),
                end: match.index + match[0].indexOf(params) + params.length,
                oldParams: params,
                newParams: newParams,
                funcName: funcName
              });
            }
          }
        }
      }
      
      // 应用替换（从后往前，避免位置偏移）
      replacements.reverse().forEach(rep => {
        content = content.slice(0, rep.start) + rep.newParams + content.slice(rep.end);
        modified = true;
        console.log(`  ✅ ${path.relative(process.cwd(), filePath)}: ${rep.funcName} - request → _request`);
        totalFixed++;
      });
    });
    
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
