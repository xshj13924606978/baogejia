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
    // 运行 ESLint 检查这个文件
    try {
      const eslintOutput = execSync(`npx eslint "${filePath}" 2>&1`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // 检查是否有未使用的 request 参数警告
      if (!eslintOutput.includes("request.*is defined but never used")) {
        return; // 没有警告，跳过
      }
    } catch (e) {
      // ESLint 返回非 0 退出码表示有错误/警告
      if (!e.stdout.includes("request.*is defined but never used")) {
        return; // 没有相关警告，跳过
      }
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    
    // 分析所有导出的异步函数
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 匹配 export async function 或 export async
      if (line.match(/export\s+async\s+(?:function\s+\w+|\w+\s*=)/)) {
        // 查找函数开始位置（大括号）
        let braceLine = i;
        while (braceLine < lines.length && !lines[braceLine].includes('{')) {
          braceLine++;
        }
        
        if (braceLine >= lines.length) continue;
        
        // 找到函数签名部分（从 export 到 { 之间）
        const signatureLines = lines.slice(i, braceLine + 1);
        const signature = signatureLines.join('\n');
        
        // 检查是否有 request 参数
        if (!signature.includes('request')) continue;
        
        // 检查参数是否已经加了 _ 前缀
        if (signature.includes('_request')) continue;
        
        // 查找函数体结束位置
        let braceCount = 0;
        let hasStarted = false;
        let endLine = braceLine + 1;
        
        for (let j = braceLine; j < lines.length; j++) {
          const line = lines[j];
          for (const char of line) {
            if (char === '{') {
              braceCount++;
              hasStarted = true;
            }
            if (char === '}') {
              braceCount--;
              if (hasStarted && braceCount === 0) {
                endLine = j;
                break;
              }
            }
          }
          if (hasStarted && braceCount === 0) break;
        }
        
        // 提取函数体
        const functionBody = lines.slice(braceLine + 1, endLine).join('\n');
        
        // 检查函数体中是否使用了 request
        // 允许的 request 使用场景
        const usesRequest = 
          functionBody.includes('request.') ||           // request.json(), request.text() 等
          functionBody.includes('request,') ||           // 作为参数传递
          functionBody.includes('await request') ||      // await request...
          functionBody.includes('const ') && functionBody.includes('= request'); // const x = request
        
        if (!usesRequest) {
          // 只修改函数签名中的 request 为 _request
          const newSignature = signature.replace(/\brequest\b(?!\s*:)/g, '_request');
          
          if (newSignature !== signature) {
            // 替换原始签名
            let newLines = [...lines];
            for (let k = i; k <= braceLine; k++) {
              newLines[k] = signatureLines[k - i].replace(/\brequest\b(?!\s*:)/g, '_request');
            }
            lines.length = 0;
            lines.push(...newLines);
            modified = true;
            
            const funcName = line.match(/function\s+(\w+)/)?.[1] || 'anonymous';
            console.log(`  ✅ ${path.relative(process.cwd(), filePath)}: ${funcName} - request → _request`);
            totalFixed++;
            break; // 每个文件只修复一个函数，避免复杂情况
          }
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
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
