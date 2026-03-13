#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📊 生成代码质量报告...\n');

console.log('📈 收集数据...');

// 运行 TypeScript 类型检查
let tscErrors = 0;
try {
  execSync('pnpm tsc --noEmit', { stdio: 'pipe' });
  console.log('  ✅ TypeScript 类型检查通过');
} catch (error) {
  const output = error.stdout?.toString() || '';
  tscErrors = (output.match(/error TS/g) || []).length;
  console.log(`  ❌ TypeScript 类型检查失败 (${tscErrors} 个错误)`);
}

// 运行 ESLint 检查
let eslintWarnings = 0;
let filesWithWarnings = [];

try {
  const output = execSync('pnpm lint', { encoding: 'utf8' });
  
  // 统计警告数
  const warningLines = output.split('\n').filter(line => 
    line.includes('warning') && !line.includes('ESLintIgnoreWarning')
  );
  eslintWarnings = warningLines.length;
  
  // 提取有警告的文件 - 重新设计逻辑
  const lines = output.split('\n');
  const fileMap = new Map();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检测是否是文件路径行
    if (line.startsWith('/workspace/projects/src/') && (line.endsWith('.ts') || line.endsWith('.tsx'))) {
      // 提取相对路径
      const filePath = line.replace('/workspace/projects/', '');
      
      // 查看接下来的行，统计这个文件有多少个警告
      let warningCount = 0;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        
        // 空行或新文件路径行，停止
        if (nextLine.trim() === '' || nextLine.startsWith('/workspace/projects/src/')) {
          break;
        }
        
        // 如果包含 warning，计数
        if (nextLine.includes('warning')) {
          warningCount++;
        }
        
        j++;
      }
      
      if (warningCount > 0) {
        fileMap.set(filePath, warningCount);
      }
    }
  }
  
  filesWithWarnings = Array.from(fileMap.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // 只取 Top 10
  
  console.log(`  📊 ESLint 发现 ${eslintWarnings} 个警告`);
  console.log(`  📁 有警告的文件数: ${fileMap.size}`);
} catch (error) {
  console.log('  ⚠️ ESLint 检查失败');
  console.error(error.message);
}

// 读取历史数据
const historyFile = 'eslint-history.json';
let history = [];
if (fs.existsSync(historyFile)) {
  history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
}

// 计算趋势
const today = new Date().toISOString().split('T')[0];
const yesterday = history.length > 0 ? history[history.length - 1].warnings : eslintWarnings;
const trend = eslintWarnings - yesterday;

// 保存到历史
history.push({
  date: today,
  warnings: eslintWarnings,
  errors: 0
});

// 只保留最近30天
if (history.length > 30) history = history.slice(-30);
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

// 创建报告目录
const reportDir = 'reports';
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir);
}

// 生成 Markdown 报告
const date = today;
const reportFile = path.join(reportDir, `quality-report-${date}.md`);

const topFilesSection = filesWithWarnings.length > 0 
  ? filesWithWarnings.slice(0, 10).map((f, i) => `${i+1}. \`${f.file}\` (${f.count} 警告)`).join('\n')
  : '✅ 无警告文件';

// 获取最近7天的历史
const last7Days = history.slice(-7);

const historySection = last7Days.map(h => 
  `| ${h.date} | ${h.warnings} | ${h.errors} |`
).join('\n');

const report = `# 📊 每日代码质量报告 - ${date}

## 📈 总体概况

| 指标 | 数值 | 趋势 |
|------|------|------|
| ESLint 警告 | ${eslintWarnings} | ${trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️'} ${Math.abs(trend)} |
| TypeScript 错误 | ${tscErrors} | ${tscErrors === 0 ? '✅' : '❌'} |

## 🔝 警告最多的文件

${topFilesSection}

## 📉 历史趋势

| 日期 | 警告数 | 错误数 |
|------|--------|--------|
${historySection}

## ✅ 质量检查结果

- [x] TypeScript 类型检查${tscErrors === 0 ? '通过' : `失败 (${tscErrors} 个错误)`}
- [x] ESLint 检查完成
- [x] 报告生成成功

## 🚀 建议行动

${eslintWarnings > 100 ? '⚠️ **警告数较多**，建议运行 `pnpm run maintain` 查看详细报告' : '✅ 质量良好，继续保持'}

---
*报告生成时间: ${new Date().toLocaleString()}*
*报告版本: v1.0*
`;

fs.writeFileSync(reportFile, report, 'utf8');

// 也保存 JSON 版本
const jsonReport = {
  date,
  eslintWarnings,
  tscErrors,
  trend,
  topFiles: filesWithWarnings.slice(0, 10),
  history: history.slice(-30)
};

fs.writeFileSync(path.join(reportDir, `quality-report-${date}.json`), JSON.stringify(jsonReport, null, 2));

console.log(`✅ 📝 报告已生成: ${reportFile}`);
console.log(`✅ 📝 JSON 报告已生成: ${path.join(reportDir, `quality-report-${date}.json`)}`);
console.log(`\n📊 当前状态:`);
console.log(`  ESLint 警告: ${eslintWarnings}`);
console.log(`  TypeScript 错误: ${tscErrors}`);
console.log(`  趋势: ${trend > 0 ? '+' : ''}${trend}`);
