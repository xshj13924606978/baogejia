#!/usr/bin/env node

/**
 * ESLint 警告阈值检查脚本
 *
 * 功能：
 * - 检查当前警告数量是否超过设定阈值
 * - 如果超过阈值，以错误码 1 退出
 * - 可用于 CI/CD 流程中阻止警告过多的代码合并
 */

const { execSync } = require('child_process');

// 警告阈值配置
const WARNING_THRESHOLD = 600; // 设置允许的最大警告数
const ERROR_THRESHOLD = 10;    // 设置允许的最大错误数

console.log('🔍 正在检查 ESLint 警告数量...');

try {
  // 运行 ESLint 并获取输出
  const output = execSync('npx eslint --ext .ts,.tsx src 2>&1', { encoding: 'utf8' });

  // 解析警告数量
  const warningMatch = output.match(/(\d+) warnings?/);
  const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;

  // 解析错误数量
  const errorMatch = output.match(/(\d+) errors?/);
  const errors = errorMatch ? parseInt(errorMatch[1]) : 0;

  console.log(`\n📊 当前状态:`);
  console.log(`   警告数: ${warnings}`);
  console.log(`   错误数: ${errors}`);
  console.log(`   警告阈值: ${WARNING_THRESHOLD}`);
  console.log(`   错误阈值: ${ERROR_THRESHOLD}`);

  // 检查错误数量
  if (errors > ERROR_THRESHOLD) {
    console.error(`\n❌ 错误数 (${errors}) 超过阈值 (${ERROR_THRESHOLD})`);
    console.error('请先修复错误再提交代码！');
    process.exit(1);
  }

  // 检查警告数量
  if (warnings > WARNING_THRESHOLD) {
    console.error(`\n⚠️  警告数 (${warnings}) 超过阈值 (${WARNING_THRESHOLD})`);
    console.error(`建议在合并前清理警告！`);
    console.error(`\n可以运行以下命令查看详情:`);
    console.error(`   node scripts/track-eslint-warnings.js`);
    process.exit(1);
  }

  // 检查警告增长情况
  const reportPath = './eslint-warnings-report.json';
  const fs = require('fs');
  if (fs.existsSync(reportPath)) {
    const lastReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const lastWarnings = lastReport.summary?.totalWarnings || 0;
    const diff = warnings - lastWarnings;

    if (diff > 0) {
      console.error(`\n⚠️  警告数增加了 ${diff} (从 ${lastWarnings} 到 ${warnings})`);
      console.error('请检查是否引入了新的警告！');
    } else if (diff < 0) {
      console.log(`\n✅ 警告数减少了 ${Math.abs(diff)} (从 ${lastWarnings} 到 ${warnings})`);
      console.log('👍 干得好！继续保持！');
    }
  }

  console.log(`\n✅ 警告检查通过！`);
  console.log(`   警告数 (${warnings}) 在阈值 (${WARNING_THRESHOLD}) 内`);
  console.log(`   错误数 (${errors}) 在阈值 (${ERROR_THRESHOLD}) 内\n`);

  process.exit(0);

} catch (error) {
  if (error.status === 1) {
    // 已经在上方输出错误信息，直接退出
    process.exit(1);
  }

  console.error('\n❌ 执行 ESLint 检查失败:', error.message);
  console.error('请检查 ESLint 配置是否正确！');
  process.exit(1);
}
