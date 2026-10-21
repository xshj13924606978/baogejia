#!/usr/bin/env node

/**
 * quote-table.tsx 专用修复脚本
 *
 * 功能：
 * - 删除未使用的导入
 * - 清理未使用的组件和图标
 * - 修复格式问题
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/quote-table.tsx');
let content = fs.readFileSync(filePath, 'utf8');
let originalContent = content;
let modified = false;

console.log('🔧 开始修复 quote-table.tsx...\n');

// ============================================
// 1. 删除未使用的 React hooks
// ============================================
const unusedHooks = ['useRef', 'useCallback'];
unusedHooks.forEach(hook => {
  const regex = new RegExp(`,\\s*${hook}\\b|\\b${hook}\\s*,`, 'g');
  if (regex.test(content)) {
    content = content.replace(regex, '');
    modified = true;
    console.log(`✅ 移除未使用的 hook: ${hook}`);
  }
});

// ============================================
// 2. 删除未使用的组件导入
// ============================================
const unusedComponents = [
  'DropdownMenuLabel',
  'Popover',
  'PopoverContent',
  'PopoverTrigger',
  'DialogTrigger',
  'AlertDialog',
  'AlertDialogAction',
  'AlertDialogCancel',
  'AlertDialogContent',
  'AlertDialogDescription',
  'AlertDialogFooter',
  'AlertDialogHeader',
  'AlertDialogTitle',
  'AlertDialogTrigger',
  'Textarea',
  'Collapsible',
  'CollapsibleContent',
  'CollapsibleTrigger',
];

unusedComponents.forEach(comp => {
  const regex = new RegExp(`,\\s*${comp}\\b|\\b${comp}\\s*,`, 'g');
  if (regex.test(content)) {
    content = content.replace(regex, '');
    modified = true;
    console.log(`✅ 移除未使用的组件: ${comp}`);
  }
});

// ============================================
// 3. 删除未使用的图标导入
// ============================================
const unusedIcons = [
  'FileSpreadsheet',
  'Save',
  'ChevronLeft',
  'ChevronRight',
  'MoreHorizontal',
  'Filter',
  'Copy',
  'Printer',
  'Mail',
  'Share2',
  'Link',
  'ExternalLink',
  'Upload',
  'DownloadCloud',
  'FileUp',
  'FileDown',
  'Eye',
  'EyeOff',
  'Lock',
  'Unlock',
  'Shield',
  'AlertCircle',
  'XCircle',
  'HelpCircle',
  'Sparkles',
  'TrendingUp',
  'TrendingDown',
  'DollarSign',
  'Percent',
  'Calendar',
  'Clock',
  'Truck',
  'Package',
  'Building2',
  'Users',
  'User',
  'Phone',
  'MailIcon',
  'MapPin',
  'Globe',
  'CreditCard',
  'Banknote',
  'Receipt',
  'Calculator',
  'PieChart',
  'BarChart3',
  'LineChart',
  'Activity',
  'Zap',
  'Flame',
  'Snowflake',
  'Wind',
  'Sun',
  'Moon',
  'Cloud',
  'CloudRain',
  'CloudSnow',
  'CloudLightning',
  'Droplets',
  'Waves',
  'Mountain',
  'TreePine',
  'Leaf',
  'Flower2',
  'Sprout',
  'Wheat',
  'Coffee',
  'Pizza',
  'Apple',
  'Banana',
  'Citrus',
  'Cherry',
  'Grape',
  'Wine',
  'Beer',
  'CoffeeIcon',
  'Utensils',
  'ChefHat',
  'ShoppingBag',
  'ShoppingCart',
  'Gift',
  'Package2',
  'Box',
  'PackageOpen',
  'PackageCheck',
  'PackageX',
  'PackagePlus',
  'PackageMinus',
  'PackageSearch',
  'Container',
  'FlaskConical',
  'FlaskRound',
  'Beaker',
  'TestTube',
  'Dna',
  'Pill',
  'Tablet',
  'Syringe',
  'Stethoscope',
  'HeartPulse',
  'Thermometer',
  'PillBottle',
  'Hospital',
  'Ambulance',
  'Atom',
  'TestTubes',
  'ThermometerSun',
  'ThermometerSnowflake',
  'Fan',
  'AirVent',
  'Factory',
  'Warehouse',
  'Building',
  'Home',
  'Hotel',
  'School',
  'Church',
  'Landmark',
  'Castle',
  'Tent',
  'Palmtree',
];

unusedIcons.forEach(icon => {
  const regex = new RegExp(`,\\s*${icon}\\b|\\b${icon}\\s*,`, 'g');
  if (regex.test(content)) {
    content = content.replace(regex, '');
    modified = true;
    console.log(`✅ 移除未使用的图标: ${icon}`);
  }
});

// ============================================
// 4. 清理格式问题
// ============================================

// 清理空的导入列表 "{ }"
content = content.replace(/\{\s*\}/g, '{}');

// 清理多余的逗号 ", }"
content = content.replace(/,\s*\}/g, '}');

// 清理连续的逗号 ",,"
content = content.replace(/,+/g, ',');

// 修复 import from 'lucide-react' 后多余的逗号
content = content.replace(/from 'lucide-react';\s*,/g, "from 'lucide-react';");

// ============================================
// 5. 保存文件
// ============================================
if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('\n✅ 文件已保存');
} else {
  console.log('\n⚠️  没有检测到需要修复的问题');
}

// ============================================
// 6. 运行 ESLint 验证
// ============================================
console.log('\n📊 运行 ESLint 验证...');
try {
  const { execSync } = require('child_process');
  const result = execSync('npx eslint --ext .ts,.tsx src/components/quote-table.tsx 2>&1', { encoding: 'utf8' });
  
  const warningMatch = result.match(/(\d+) warnings?/);
  const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;
  
  const errorMatch = result.match(/(\d+) errors?/);
  const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
  
  console.log(`\n📈 验证结果:`);
  console.log(`   错误数: ${errors}`);
  console.log(`   警告数: ${warnings}`);
  
  if (errors > 0) {
    console.log('\n❌ 存在错误，请检查！');
    process.exit(1);
  } else {
    console.log('\n✅ 修复完成，无错误！');
  }
} catch (error) {
  console.error('\n❌ ESLint 检查失败:', error.message);
  process.exit(1);
}

// 统计删除的内容
const removedLines = originalContent.split('\n').length - content.split('\n').length;
const removedChars = originalContent.length - content.length;

console.log(`\n📝 统计信息:`);
console.log(`   减少行数: ${removedLines}`);
console.log(`   减少字符数: ${removedChars}`);
console.log(`   原始大小: ${originalContent.length} 字符`);
console.log(`   修复后大小: ${content.length} 字符`);
