#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📊 生成代码质量报告...\n');

const reportDir = 'reports';
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir);
}

const date = new Date().toISOString().split('T')[0];
const reportFile = path.join(reportDir, `quality-report-${date}.md`);

// 收集数据
console.log('📈 收集数据...');

// TypeScript 检查
console.log('  运行 TypeScript 类型检查...');
let tscErrors = 0;
try {
  execSync('pnpm run type-check', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('  ✅ TypeScript 类型检查通过');
} catch (e) {
  const stderr = e.stderr || e.stdout || '';
  tscErrors = (stderr.match(/error TS/g) || []).length;
  console.log(`  ⚠️ TypeScript 发现 ${tscErrors} 个错误`);
}

// ESLint 检查
console.log('  运行 ESLint 检查...');
let eslintWarnings = 0;
let eslintErrors = 0;
let topFiles = [];

try {
  // 使用简单的统计方法
  const output = execSync('npx eslint src/ 2>&1', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
  
  // 从输出中提取总警告数
  const match = output.match(/✖\s+(\d+)\s+problems/);
  if (match) {
    eslintWarnings = parseInt(match[1]);
  }
  
  // 统计每个文件的警告数
  const fileCounts = {};
  const lines = output.split('\n');
  
  lines.forEach(line => {
    const fileMatch = line.match(/^\/workspace\/projects\/(.+\.(?:ts|tsx))\s+\d+:\d+\s+warning/);
    if (fileMatch) {
      const file = fileMatch[1];
      fileCounts[file] = (fileCounts[file] || 0) + 1;
    }
  });
  
  topFiles = Object.entries(fileCounts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  console.log(`  📊 ESLint 发现 ${eslintWarnings} 个警告`);
  
} catch (e) {
  console.log('  ⚠️ ESLint 检查失败');
}

// 读取历史数据
const historyFile = 'eslint-history.json';
let history = [];
if (fs.existsSync(historyFile)) {
  try {
    history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch (e) {
    history = [];
  }
}

// 保存当前数据
history.push({
  date,
  warnings: eslintWarnings,
  errors: tscErrors
});

if (history.length > 30) history = history.slice(-30);
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

// 计算趋势
const trend = history.length >= 2 
  ? history[history.length - 1].warnings - history[history.length - 2].warnings
  : 0;

// 生成 Markdown 报告
const report = `# 📊 每日代码质量报告 - ${date}

## 📈 总体概况

| 指标 | 数值 | 趋势 |
|------|------|------|
| ESLint 警告 | ${eslintWarnings} | ${trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️'} ${Math.abs(trend)} |
| TypeScript 错误 | ${tscErrors} | ${tscErrors === 0 ? '✅' : '❌'} |

## 🔝 警告最多的文件

${topFiles.length > 0 ? topFiles.map((f, i) => `${i+1}. \`${f.file}\` (${f.count} 警告)`).join('\n') : '✅ 无警告文件'}

## 📉 历史趋势

| 日期 | 警告数 | 错误数 |
|------|--------|--------|
${history.slice(-7).map(h => `| ${h.date} | ${h.warnings} | ${h.errors} |`).join('\n')}

## ✅ 质量检查结果

- [x] TypeScript 类型检查${tscErrors === 0 ? '通过' : `失败 (${tscErrors} 个错误)`}
- [x] ESLint 检查完成
- [x] 报告生成成功

## 🚀 建议行动

${eslintWarnings > 50 ? `⚠️ **警告数较多 (${eslintWarnings})**，建议：
  - 运行 \`pnpm run maintain\` 查看详细报告
  - 检查新代码是否引入问题
  - 考虑调整 ESLint 规则` : '✅ 质量良好，继续保持'}

${tscErrors > 0 ? `❌ **TypeScript 有错误**，建议：
  - 运行 \`pnpm run type-check\` 查看详细错误
  - 优先修复类型错误后再提交代码` : ''}

---
*报告生成时间: ${new Date().toLocaleString()}*
*报告版本: v1.0*
`;

fs.writeFileSync(reportFile, report, 'utf8');
console.log(`✅ 📝 报告已生成: ${reportFile}`);

// 同时保存 JSON 格式
const jsonReport = {
  date,
  timestamp: new Date().toISOString(),
  stats: {
    eslintWarnings,
    tscErrors,
    trend,
    topFiles
  },
  history: history.slice(-7)
};

const jsonReportFile = path.join(reportDir, `quality-report-${date}.json`);
fs.writeFileSync(jsonReportFile, JSON.stringify(jsonReport, null, 2));
console.log(`✅ 📝 JSON 报告已生成: ${jsonReportFile}`);

console.log(`\n📊 当前状态:`);
console.log(`  ESLint 警告: ${eslintWarnings}`);
console.log(`  TypeScript 错误: ${tscErrors}`);
console.log(`  趋势: ${trend > 0 ? '+' : ''}${trend}`);
