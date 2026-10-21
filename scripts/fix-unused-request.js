#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 开始修复未使用的 request 参数...\n');

// 获取 ESLint JSON 输出
let eslintJson;
try {
  eslintJson = execSync('npx eslint src/app/api/ --format=json 2>/dev/null', { encoding: 'utf8' });
} catch (e) {
  eslintJson = e.stdout;
}

const results = JSON.parse(eslintJson);
const filesToFix = new Map();

// 分析每个文件的警告
results.forEach(result => {
  const messages = result.messages.filter(m => 
    m.ruleId === '@typescript-eslint/no-unused-vars' && 
    m.messageId === 'unusedVar' &&
    m.message.includes('request')
  );
  
  if (messages.length > 0) {
    filesToFix.set(result.filePath, messages);
  }
});

console.log(`📄 找到 ${filesToFix.size} 个文件需要修复\n`);

let totalFixed = 0;
const fixedFiles = [];

// 处理每个文件
for (const [filePath, messages] of filesToFix) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    
    // 按行号降序处理（避免行号偏移）
    const sortedMessages = [...messages].sort((a, b) => b.line - a.line);
    
    for (const msg of sortedMessages) {
      const lineNum = msg.line;
      const line = lines[lineNum - 1];
      
      // 检查这一行是否包含函数参数定义
      if (line.includes('request') && !line.includes('_request')) {
        // 查找函数体的起始位置
        let braceLine = lineNum - 1;
        while (braceLine < lines.length && !lines[braceLine].includes('{')) {
          braceLine++;
        }
        
        if (braceLine >= lines.length) continue;
        
        // 提取函数体（从 { 到对应的 }）
        let braceCount = 0;
        let bodyStart = -1;
        let bodyEnd = -1;
        
        for (let i = braceLine; i < lines.length; i++) {
          const lineContent = lines[i];
          for (let j = 0; j < lineContent.length; j++) {
            const char = lineContent[j];
            if (char === '{') {
              braceCount++;
              if (bodyStart === -1) bodyStart = i;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && bodyStart !== -1) {
                bodyEnd = i;
                break;
              }
            }
          }
          if (bodyEnd !== -1) break;
        }
        
        if (bodyEnd === -1) continue;
        
        // 提取函数体内容
        const functionBody = lines.slice(bodyStart + 1, bodyEnd).join('\n');
        
        // 检查函数体中是否使用了 request
        // 排除类型声明和注释
        const usesRequest = 
          /request\.[a-zA-Z]/.test(functionBody) ||        // request.json(), request.text() 等
          /\bawait\s+request\b/.test(functionBody) ||       // await request
          /=\s*request\b/.test(functionBody) ||             // x = request
          /\brequest\b,/.test(functionBody) ||              // request, 作为参数
          /\(\s*request\b/.test(functionBody) ||            // (request 作为参数
          /\brequest\s*\)/.test(functionBody);              // request)
        
        if (!usesRequest) {
          // 只在函数参数定义行替换 request 为 _request
          lines[lineNum - 1] = line.replace(/\brequest\b/g, '_request');
          modified = true;
          
          const relativePath = path.relative(process.cwd(), filePath);
          console.log(`  ✅ ${relativePath}:${lineNum} - request → _request`);
          totalFixed++;
          
          // 每个文件只修复一处，避免复杂情况
          break;
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
}

console.log(`\n🎉 修复完成！共修复 ${totalFixed} 个参数，${fixedFiles.length} 个文件\n`);

// 验证修复
console.log('🔍 验证修复结果...');
try {
  execSync('pnpm run type-check', { stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('✅ TypeScript 类型检查通过');
} catch (e) {
  console.log('❌ TypeScript 类型检查失败');
  console.log('恢复修改...');
  
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
