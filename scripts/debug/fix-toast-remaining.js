const fs = require('fs');
const path = require('path');

const filePath = 'src/components/ui/use-toast.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 修复 reducer 函数的返回类型
content = content.replace(
  /export const reducer = \(state: State, action: Action\): State => \{/,
  'export const reducer = (state: State, action: Action): State => {'
);

// 确保所有分支都有返回
if (!content.includes('default:\n      return state')) {
  content = content.replace(
    /}\s*};/,
    '    default:\n      return state;\n  };\n};'
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ use-toast.ts 剩余问题修复完成');
