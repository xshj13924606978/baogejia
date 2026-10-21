#!/usr/bin/env node

/**
 * ESLint 警告跟踪脚本
 *
 * 功能：
 * - 运行 ESLint 并获取警告数量
 * - 统计每个文件的警告数
 * - 生成报告并保存到 JSON 文件
 * - 输出摘要信息
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📊 正在运行 ESLint 检查...');

try {
  // 运行 ESLint 并获取输出
  const output = execSync('npx eslint --ext .ts,.tsx src 2>&1', { encoding: 'utf8' });

  // 解析警告数量
  const warningMatch = output.match(/(\d+) warnings?/);
  const warningCount = warningMatch ? parseInt(warningMatch[1]) : 0;

  // 解析错误数量
  const errorMatch = output.match(/(\d+) errors?/);
  const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;

  // 解析每个文件的警告数
  const fileWarnings = {};
  let currentFile = null;
  
  // 按行解析输出
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 匹配文件路径
    const fileMatch = line.match(/\/workspace\/projects\/(src\/[^\s:]+\.tsx?)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    
    // 如果当前有文件且这行包含警告，计数
    if (currentFile && line.includes('warning')) {
      fileWarnings[currentFile] = (fileWarnings[currentFile] || 0) + 1;
    }
    
    // 如果遇到空行或新文件标识，重置当前文件
    if (line.trim() === '' || fileMatch) {
      // 如果是空行，不清除 currentFile，因为可能同一个文件有多行警告
      // 如果是新文件，在上面的 fileMatch 已经设置了新的 currentFile
    }
  }

  // 排序文件（按警告数降序）
  const sortedFiles = Object.entries(fileWarnings)
    .sort((a, b) => b[1] - a[1]);

  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalWarnings: warningCount,
      totalErrors: errorCount,
      filesWithWarnings: Object.keys(fileWarnings).length,
    },
    topFiles: sortedFiles.slice(0, 20).map(([file, count]) => ({
      file,
      count,
      percentage: ((count / warningCount) * 100).toFixed(2)
    })),
    allFiles: sortedFiles.map(([file, count]) => ({
      file,
      count,
      percentage: ((count / warningCount) * 100).toFixed(2)
    }))
  };

  // 保存报告
  const reportDir = path.join(__dirname, '..');
  const reportPath = path.join(reportDir, 'eslint-warnings-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 输出摘要
  console.log('\n' + '='.repeat(60));
  console.log('📊 ESLint 警告报告');
  console.log('='.repeat(60));
  console.log(`⏰ 时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`\n📈 统计信息:`);
  console.log(`   总警告数: ${report.summary.totalWarnings}`);
  console.log(`   总错误数: ${report.summary.totalErrors}`);
  console.log(`   有警告的文件数: ${report.summary.filesWithWarnings}`);
  
  if (report.topFiles.length > 0) {
    console.log(`\n🔝 前 20 个文件 (警告数):`);
    report.topFiles.forEach((f, i) => {
      const fileShort = f.file.replace('/workspace/projects/', '');
      console.log(`   ${i + 1}. ${fileShort} (${f.count} 警告, ${f.percentage}%)`);
    });
  }

  console.log(`\n💾 报告已保存到: ${reportPath}`);
  console.log('='.repeat(60) + '\n');

  // 退出码：如果有错误则返回 1
  process.exit(errorCount > 0 ? 1 : 0);

} catch (error) {
  console.error('❌ 执行 ESLint 检查失败:', error.message);
  process.exit(1);
}
