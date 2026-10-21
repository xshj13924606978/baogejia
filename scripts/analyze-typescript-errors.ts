import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

interface TypeError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

async function analyzeErrors() {
  console.log('🔍 开始分析 TypeScript 类型错误...\n');

  try {
    // 运行 TypeScript 编译检查
    const { stdout, stderr } = await execAsync('npx tsc --noEmit');

    // 解析错误输出
    const errorLines = stderr.split('\n').filter((line) => line.includes('error TS'));

    const errors: TypeError[] = [];
    const errorCounts: Record<string, number> = {};

    for (const line of errorLines) {
      // 解析错误行格式: src/app/api/admin/users/route.ts(73,1): error TS1005: ';' expected.
      const match = line.match(/(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/);

      if (match) {
        const [, file, lineStr, colStr, code, message] = match;

        errors.push({
          file,
          line: parseInt(lineStr),
          column: parseInt(colStr),
          code,
          message: message.trim(),
        });

        errorCounts[code] = (errorCounts[code] || 0) + 1;
      }
    }

    // 生成分析报告
    console.log('📊 类型错误统计报告');
    console.log('='.repeat(60));
    console.log(`总错误数: ${errors.length}`);

    console.log('\n📈 按错误类型统计:');
    Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([code, count]) => {
        console.log(`  ${code}: ${count} 个`);
      });

    console.log('\n📁 按文件统计:');
    const fileCounts: Record<string, number> = {};
    errors.forEach((e) => {
      fileCounts[e.file] = (fileCounts[e.file] || 0) + 1;
    });

    Object.entries(fileCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([file, count]) => {
        console.log(`  ${file}: ${count} 个`);
      });

    // 保存详细报告
    const report = {
      total: errors.length,
      byType: errorCounts,
      byFile: fileCounts,
      errors: errors,
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'typescript-errors.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ 详细报告已保存到: typescript-errors.json');
  } catch (error) {
    console.error('分析失败:', error);
  }
}

analyzeErrors();
