#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  warningThreshold: 50,        // 警告阈值
  errorThreshold: 5,           // 错误阈值
  autoFixEnabled: true,        // 是否自动修复
  notifyOnExceed: true,        // 超过阈值时通知
  historyFile: 'eslint-history.json',
  reportFile: 'eslint-report.json'
};

class ESLintMonitor {
  constructor() {
    this.history = this.loadHistory();
  }

  loadHistory() {
    if (fs.existsSync(CONFIG.historyFile)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
      } catch (e) {
        console.warn('读取历史文件失败，创建新的历史记录');
        return [];
      }
    }
    return [];
  }

  saveHistory() {
    fs.writeFileSync(CONFIG.historyFile, JSON.stringify(this.history, null, 2));
  }

  runCheck() {
    console.log('🔍 开始 ESLint 检查...');
    
    // 运行 ESLint
    const output = execSync('npx eslint src/ --format json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const results = JSON.parse(output);
    
    const stats = {
      timestamp: new Date().toISOString(),
      totalWarnings: results.reduce((sum, r) => sum + r.messages.length, 0),
      totalErrors: results.reduce((sum, r) => sum + r.messages.filter(m => m.severity === 2).length, 0),
      filesWithIssues: results.filter(r => r.messages.length > 0).length,
      topFiles: results
        .filter(r => r.messages.length > 0)
        .map(r => ({
          file: path.relative(process.cwd(), r.filePath),
          warnings: r.messages.length,
          errors: r.messages.filter(m => m.severity === 2).length
        }))
        .sort((a, b) => b.warnings - a.warnings)
        .slice(0, 10)
    };

    // 自动修复
    if (CONFIG.autoFixEnabled && stats.totalWarnings > 0) {
      console.log('🔄 运行自动修复...');
      try {
        execSync('npx eslint src/ --fix', { stdio: ['pipe', 'pipe', 'pipe'] });
        
        // 重新检查
        const newOutput = execSync('npx eslint src/ --format json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const newResults = JSON.parse(newOutput);
        stats.afterFix = {
          totalWarnings: newResults.reduce((sum, r) => sum + r.messages.length, 0),
          totalErrors: newResults.reduce((sum, r) => sum + r.messages.filter(m => m.severity === 2).length, 0),
          fixedWarnings: stats.totalWarnings - newResults.reduce((sum, r) => sum + r.messages.length, 0),
          fixedErrors: stats.totalErrors - newResults.reduce((sum, r) => sum + r.messages.filter(m => m.severity === 2).length, 0)
        };
      } catch (e) {
        console.log('  自动修复完成（可能有未修复的问题）');
      }
    }

    // 计算趋势
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      stats.trend = {
        warnings: stats.totalWarnings - last.totalWarnings,
        errors: stats.totalErrors - last.totalErrors
      };
    }

    // 保存到历史
    this.history.push({
      date: new Date().toISOString().split('T')[0],
      totalWarnings: stats.totalWarnings,
      totalErrors: stats.totalErrors
    });
    
    if (this.history.length > 30) this.history = this.history.slice(-30);
    this.saveHistory();

    // 保存报告
    fs.writeFileSync(CONFIG.reportFile, JSON.stringify(stats, null, 2));

    return stats;
  }

  checkThreshold(stats) {
    const exceeded = [];
    
    if (stats.totalWarnings > CONFIG.warningThreshold) {
      exceeded.push(`警告数 ${stats.totalWarnings} > ${CONFIG.warningThreshold}`);
    }
    if (stats.totalErrors > CONFIG.errorThreshold) {
      exceeded.push(`错误数 ${stats.totalErrors} > ${CONFIG.errorThreshold}`);
    }

    return exceeded;
  }

  printReport(stats) {
    console.log('\n📊 ESLint 监控报告');
    console.log('='.repeat(50));
    console.log(`时间: ${new Date(stats.timestamp).toLocaleString()}`);
    console.log(`\n📈 当前状态:`);
    console.log(`  警告数: ${stats.totalWarnings}`);
    console.log(`  错误数: ${stats.totalErrors}`);
    console.log(`  问题文件数: ${stats.filesWithIssues}`);
    
    if (stats.afterFix) {
      console.log(`\n🔄 自动修复效果:`);
      console.log(`  修复警告: ${stats.afterFix.fixedWarnings}`);
      console.log(`  修复错误: ${stats.afterFix.fixedErrors}`);
      console.log(`  剩余警告: ${stats.afterFix.totalWarnings}`);
    }
    
    if (stats.trend) {
      console.log(`\n📉 趋势分析:`);
      console.log(`  警告变化: ${stats.trend.warnings > 0 ? '+' : ''}${stats.trend.warnings}`);
      console.log(`  错误变化: ${stats.trend.errors > 0 ? '+' : ''}${stats.trend.errors}`);
    }
    
    if (stats.topFiles.length > 0) {
      console.log(`\n🔝 Top 问题文件:`);
      stats.topFiles.forEach((f, i) => {
        console.log(`  ${i+1}. ${f.file} (警告: ${f.warnings}, 错误: ${f.errors})`);
      });
    }
    
    console.log('='.repeat(50));
  }

  async run() {
    try {
      const stats = this.runCheck();
      this.printReport(stats);
      
      const exceeded = this.checkThreshold(stats);
      if (exceeded.length > 0) {
        console.log('\n⚠️  阈值超限警告:');
        exceeded.forEach(e => console.log(`  • ${e}`));
      }

      return stats;
    } catch (error) {
      console.error('❌ 监控失败:', error.message);
      throw error;
    }
  }
}

// 运行监控
if (require.main === module) {
  const monitor = new ESLintMonitor();
  monitor.run().catch(console.error);
}

module.exports = ESLintMonitor;
