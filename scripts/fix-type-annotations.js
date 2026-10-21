/**
 * 批量修复 TypeScript 类型注解
 * 将 _param 修复为 _param: Type
 */

const fs = require('fs');

// 需要修复的文件和参数
const FIXES = {
  'src/app/api/chat/route.ts': [
    { line: 614, param: '_query', type: 'string' },
    { line: 614, param: '_results', type: 'any' },
    { line: 632, param: '_results', type: 'any' },
    { line: 654, param: '_results', type: 'any' },
    { line: 1002, param: '_fileKey', type: 'any' },
    { line: 1517, param: '_message', type: 'any' },
    { line: 1537, param: '_message', type: 'any' },
    { line: 2426, param: '_message', type: 'any' },
    { line: 2505, param: '_message', type: 'any' },
    { line: 2945, param: '_products', type: 'any' },
    { line: 3247, param: '_message', type: 'any' },
    { line: 3266, param: '_scale', type: 'any' },
    { line: 3282, param: '_scale', type: 'any' },
    { line: 3282, param: '_projectInfo', type: 'any' },
  ],
  'src/lib/payment-service.ts': [
    { line: 275, param: '_data', type: 'any' },
    { line: 283, param: '_data', type: 'any' },
  ]
};

console.log('🔧 修复 TypeScript 类型注解...\n');

let totalFixed = 0;

Object.entries(FIXES).forEach(([file, fixes]) => {
  console.log(`处理: ${file}`);
  
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    let fixedCount = 0;
    
    fixes.forEach(fix => {
      const lineIndex = fix.line - 1;
      const line = lines[lineIndex];
      
      // 匹配 _param): 或 _param, 的模式
      const regex = new RegExp(`(${fix.param})(\\)|,)`);
      const newLine = line.replace(regex, `${fix.param}: ${fix.type}$2`);
      
      if (newLine !== line) {
        lines[lineIndex] = newLine;
        fixedCount++;
        console.log(`  修复: 第 ${fix.line} 行 - ${fix.param} → ${fix.param}: ${fix.type}`);
      }
    });
    
    fs.writeFileSync(file, lines.join('\n'), 'utf-8');
    
    console.log(`  ✅ 修复了 ${fixedCount} 个参数`);
    totalFixed += fixedCount;
    
  } catch (error) {
    console.error(`  ❌ 处理失败: ${error.message}`);
  }
});

console.log(`\n🎉 修复完成！总共修复了 ${totalFixed} 个参数`);
