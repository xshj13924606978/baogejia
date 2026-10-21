/**
 * 自动删除未使用的导入和变量
 */

const fs = require('fs');

// 需要清理的文件及其未使用的导入
const CLEANUP_MAP = {
  'src/app/api/chat/route.ts': [
    'ServerDatabaseUtils',
    'streamDeepSeekChat',
    'ConversationGenerator',
    'ProfessionalDialogueEngine',
    'IntentResponseGenerator'
  ],
  'src/app/team/[id]/page.tsx': [
    'UserPlus', 'Settings', 'Share2', 'Crown', 'UserMinus', 'MoreVertical',
    'TeamRole', 'Badge', 'Dialog', 'DialogContent', 'DialogDescription',
    'DialogFooter', 'DialogHeader', 'DialogTitle', 'DialogTrigger',
    'Input', 'Label', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger',
    'SelectValue', 'Button', 'TeamMemberList', 'DropdownMenu', 'DropdownMenuContent',
    'DropdownMenuItem', 'DropdownMenuTrigger', 'Send', 'Sparkles', 'Loader2',
    'ChevronDown', 'Brain', 'FileTextIcon', 'ImageIcon', 'QuoteTable', 'IntentSelector'
  ],
  'src/components/chat-area.tsx': [
    'DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger',
    'Send', 'Sparkles', 'Loader2', 'ChevronDown', 'Brain', 'FileTextIcon', 'ImageIcon',
    'QuoteTable', 'IntentSelector', 'Button'
  ],
  'src/lib/payment-service.ts': [
    'crypto',
    'PaymentNotify'
  ]
};

console.log('🧹 清理未使用的导入...\n');

let totalRemoved = 0;

Object.entries(CLEANUP_MAP).forEach(([file, imports]) => {
  console.log(`处理: ${file}`);
  
  try {
    let content = fs.readFileSync(file, 'utf-8');
    let removed = 0;
    
    imports.forEach(imp => {
      // 匹配各种导入格式
      // 1. import { imp } from '...'
      // 2. import { imp, other } from '...'
      // 3. import imp from '...'
      
      // 模式1: 大括号导入
      const bracketImportRegex = new RegExp(`import\\s*\\{([^}]*${imp}[^}]*)\\}\\s+from\\s+['"][^'"]+['"]`, 'g');
      
      content = content.replace(bracketImportRegex, (match, importsStr) => {
        // 移除未使用的导入
        const newImports = importsStr
          .split(',')
          .map(s => s.trim())
          .filter(s => s !== imp)
          .join(', ');
        
        // 如果没有剩下的导入，删除整个导入语句
        if (newImports.trim() === '' || newImports === '{}') {
          removed++;
          return '';
        }
        
        // 否则更新导入语句
        if (newImports !== importsStr.trim()) {
          removed++;
          return `import { ${newImports} } from ${match.match(/from\s+['"][^'"]+['"]/)[0]}`;
        }
        
        return match;
      });
      
      // 模式2: 默认导入
      const defaultImportRegex = new RegExp(`import\\s+${imp}\\s+from\\s+['"][^'"]+['"];?\\s*\\n?`, 'g');
      const beforeLength = content.length;
      content = content.replace(defaultImportRegex, '');
      if (content.length !== beforeLength) {
        removed++;
      }
    });
    
    // 清理空行（连续的空行保留一个）
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // 写回文件
    fs.writeFileSync(file, content, 'utf-8');
    
    console.log(`  ✅ 移除了 ${removed} 个未使用的导入`);
    totalRemoved += removed;
    
  } catch (error) {
    console.error(`  ❌ 处理失败: ${error.message}`);
  }
});

console.log(`\n🎉 清理完成！总共移除了 ${totalRemoved} 个未使用的导入`);
