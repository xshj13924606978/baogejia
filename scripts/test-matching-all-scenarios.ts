/**
 * 全场景批量测试脚本
 * 验证产品匹配和标准化逻辑覆盖所有应用场景
 *
 * 运行：npx tsx scripts/test-matching-all-scenarios.ts
 */

import { ProductExtractor } from '../src/lib/product-extractor';

// ──────────────────────────── 辅助函数 ────────────────────────────

interface TestCase {
  input: string;
  expectProductName: string;
  expectModel: string;
  category: string;
}

function simulateNormalizeModel(model: string): string {
  let normalized = model;

  // 产量单位保留
  const ratePattern = /(\d+(?:\.\d+)?)\s*(g|kg|t|ml|l)\s*(\/\s*(h|min|s|d|hr))?/i;
  const rateMatch = normalized.match(ratePattern);
  if (rateMatch) {
    const num = rateMatch[1];
    const unit = rateMatch[2].toLowerCase();
    const rate = rateMatch[3] ? rateMatch[3].replace(/\s/g, '').toLowerCase() : '';
    return `${num}${unit}${rate}`;
  }

  // 容量单位标准化
  const volumeNorm: [RegExp, string][] = [
    [/(\d+(?:\.\d+)?)\s*立方米/i, '$1m³'],
    [/(\d+(?:\.\d+)?)\s*立方/i, '$1m³'],
    [/(\d+(?:\.\d+)?)\s*方/i, '$1m³'],
    [/(\d+(?:\.\d+)?)\s*m3\b/i, '$1m³'],
  ];
  for (const [pat, repl] of volumeNorm) {
    if (pat.test(normalized)) {
      normalized = normalized.replace(pat, repl);
      return normalized;
    }
  }

  return normalized.trim().replace(/\s+/g, '') || normalized;
}

// ──────────────────────────── 测试用例 ────────────────────────────

const testCases: TestCase[] = [
  // === 容量类产品（化粪池） ===
  { input: '5方化粪池', expectProductName: '化粪池', expectModel: '5m³', category: '容量-方' },
  { input: '5m³化粪池', expectProductName: '化粪池', expectModel: '5m³', category: '容量-m³' },
  { input: '5立方化粪池', expectProductName: '化粪池', expectModel: '5m³', category: '容量-立方' },
  { input: '5立方米化粪池', expectProductName: '化粪池', expectModel: '5m³', category: '容量-立方米' },
  { input: '10方化粪池多少钱', expectProductName: '化粪池', expectModel: '10m³', category: '容量-10方' },
  { input: '100m³化粪池', expectProductName: '化粪池', expectModel: '100m³', category: '容量-100m³' },
  { input: '1.5m³化粪池', expectProductName: '化粪池', expectModel: '1.5m³', category: '容量-小数' },
  { input: '两方化粪池', expectProductName: '化粪池', expectModel: '2m³', category: '容量-中文2' },
  { input: '十方化粪池', expectProductName: '化粪池', expectModel: '10m³', category: '容量-中文10' },
  { input: '十五方化粪池', expectProductName: '化粪池', expectModel: '15m³', category: '容量-中文15' },
  { input: '二十方化粪池', expectProductName: '化粪池', expectModel: '20m³', category: '容量-中文20' },
  { input: '一百方化粪池', expectProductName: '化粪池', expectModel: '100m³', category: '容量-中文100' },

  // === 产量类产品（二氧化氯发生器） ===
  { input: '100g/h二氧化氯发生器', expectProductName: '二氧化氯发生器', expectModel: '100g/h', category: '产量-g/h' },
  { input: '500g/h二氧化氯发生器', expectProductName: '二氧化氯发生器', expectModel: '500g/h', category: '产量-500g/h' },
  { input: '1000g/h二氧化氯发生器', expectProductName: '二氧化氯发生器', expectModel: '1000g/h', category: '产量-1000g/h' },
  { input: '2kg/h二氧化氯发生器', expectProductName: '二氧化氯发生器', expectModel: '2kg/h', category: '产量-kg/h' },

  // === 字母数字组合型号 ===
  { input: 'HFC-13化粪池多少钱', expectProductName: '化粪池', expectModel: 'HFC-13', category: '字母数字' },
  { input: 'PW-100氩弧焊枪', expectProductName: '氩弧焊枪', expectModel: 'PW-100', category: '字母数字2' },
];

// ──────────────────────────── 执行测试 ────────────────────────────

async function runTests() {
  console.log('='.repeat(80));
  console.log('全场景产品匹配测试');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const tc of testCases) {
    // 用规则提取测试（LLM 测试太慢，只测试规则引擎）
    const result = ProductExtractor.extractWithRules(tc.input);
    if (!result) {
      console.log(`  ❌ [${tc.category}] "${tc.input}" → 规则提取返回 null`);
      failed++;
      failures.push(`[${tc.category}] "${tc.input}" → null`);
      continue;
    }

    const actualName = result.productName;
    const actualModel = result.model || '';

    // 标准化后的 model
    const normalizedModel = simulateNormalizeModel(actualModel);

    const nameOk = actualName === tc.expectProductName;
    const modelOk = normalizedModel === tc.expectModel;

    if (nameOk && modelOk) {
      console.log(`  ✅ [${tc.category}] "${tc.input}" → name="${actualName}", model="${normalizedModel}"`);
      passed++;
    } else {
      const issues: string[] = [];
      if (!nameOk) issues.push(`name: 期望"${tc.expectProductName}" 实际"${actualName}"`);
      if (!modelOk) issues.push(`model: 期望"${tc.expectModel}" 实际"${normalizedModel}"(原始:"${actualModel}")`);
      console.log(`  ❌ [${tc.category}] "${tc.input}" → ${issues.join(', ')}`);
      failed++;
      failures.push(`[${tc.category}] "${tc.input}" → ${issues.join(', ')}`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log(`测试结果：${passed} 通过 / ${failed} 失败 / ${testCases.length} 总计`);
  if (failures.length > 0) {
    console.log('\n失败列表：');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('='.repeat(80));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
