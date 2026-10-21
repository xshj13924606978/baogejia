// scripts/test-points-concurrency.ts
//
// 积分并发压力测试
// 验证 add_points_atomic / deduct_points_atomic 是否正确处理并发请求
//
// 测试场景：
// 1. 并发加分：100个并发请求各加1分，检查最终积分是否正确（原子操作 vs 丢失更新）
// 2. 并发扣分：100个并发请求各扣1分，检查最终积分是否正确，且不会变负
// 3. 并发混合：同时加扣，检查最终一致性
// 4. 余额耗尽：并发扣分直到余额不足，验证不会透支
//
// 用法: npx tsx scripts/test-points-concurrency.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const COLORS = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function getPoints(userId: string): Promise<number> {
  const { data } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  return (data?.metadata as any)?.points || 0;
}

async function setPointsDirect(userId: string, points: number, metadata: any) {
  await supabase
    .from('users')
    .update({
      metadata: { ...metadata, points, last_points_update: new Date().toISOString() },
    })
    .eq('id', userId);
}

function assert(condition: boolean, name: string, detail: string): TestResult {
  const passed = condition;
  console.log(`  ${passed ? COLORS.green('PASS') : COLORS.red('FAIL')} ${name}: ${detail}`);
  return { name, passed, detail };
}

// ── 测试1: 并发加分 ──
async function testConcurrentAdd(userId: string, concurrency: number): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const originalPoints = await getPoints(userId);
  console.log(`\n${COLORS.bold('测试1: 并发加分')} — ${concurrency}个请求各加1分`);
  console.log(`  原始积分: ${originalPoints}`);

  // 先还原到已知状态
  const { data: userBefore } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();

  await setPointsDirect(userId, 0, userBefore?.metadata || {});

  // 并发加1分
  const start = Date.now();
  const promises = Array.from({ length: concurrency }, () =>
    supabase.rpc('add_points_atomic', { p_user_id: userId, p_points: 1 })
  );
  const responses = await Promise.allSettled(promises);
  const elapsed = Date.now() - start;

  const successes = responses.filter(r => {
    if (r.status === 'rejected') return false;
    const val = (r as any).value;
    // add_points_atomic 成功时返回 { new_points, new_total_points }
    // Supabase SDK 将结果放在 data 字段中
    return !val.error && val.data;
  }).length;
  const failures = responses.filter(r => {
    if (r.status === 'rejected') return true;
    const val = (r as any).value;
    return !!val.error;
  }).length;

  const finalPoints = await getPoints(userId);

  console.log(`  并发数: ${concurrency} | 成功: ${successes} | 失败: ${failures} | 耗时: ${elapsed}ms`);
  console.log(`  最终积分: ${finalPoints} (期望: ${concurrency})`);

  results.push(assert(
    finalPoints === concurrency,
    '积分一致性',
    `${concurrency}次并发+1 → 最终 ${finalPoints} (期望 ${concurrency})`
  ));

  results.push(assert(
    failures === 0,
    '无失败请求',
    `${failures} 个请求失败`
  ));

  // 还原
  await setPointsDirect(userId, originalPoints, userBefore?.metadata || {});
  return results;
}

// ── 测试2: 并发扣分 ──
async function testConcurrentDeduct(userId: string, concurrency: number): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const { data: userBefore } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  const originalPoints = (userBefore?.metadata as any)?.points || 0;

  console.log(`\n${COLORS.bold('测试2: 并发扣分')} — ${concurrency}个请求各扣1分`);
  console.log(`  原始积分: ${originalPoints}`);

  // 设置足够积分
  await setPointsDirect(userId, concurrency, userBefore?.metadata || {});
  const verifyBefore = await getPoints(userId);
  console.log(`  设置为: ${verifyBefore}`);

  // 并发扣1分
  const start = Date.now();
  const promises = Array.from({ length: concurrency }, () =>
    supabase.rpc('deduct_points_atomic', { p_user_id: userId, p_points: 1 })
  );
  const responses = await Promise.allSettled(promises);
  const elapsed = Date.now() - start;

  const deductSuccesses = responses.filter(r => {
    if (r.status === 'rejected') return false;
    const val = (r as any).value;
    return val.data?.success === true;
  }).length;
  const deductFailures = responses.filter(r => {
    if (r.status === 'rejected') return true;
    const val = (r as any).value;
    return val.data?.success === false;
  }).length;

  const finalPoints = await getPoints(userId);

  console.log(`  并发数: ${concurrency} | 扣减成功: ${deductSuccesses} | 余额不足: ${deductFailures} | 耗时: ${elapsed}ms`);
  console.log(`  最终积分: ${finalPoints} (期望: 0)`);

  results.push(assert(
    finalPoints === 0,
    '积分一致性',
    `${concurrency}次并发-1 → 最终 ${finalPoints} (期望 0)`
  ));

  results.push(assert(
    finalPoints >= 0,
    '不会透支',
    `最终积分 ${finalPoints} >= 0`
  ));

  // 还原
  await setPointsDirect(userId, originalPoints, userBefore?.metadata || {});
  return results;
}

// ── 测试3: 并发混合（同时加扣） ──
async function testConcurrentMixed(userId: string, adds: number, deducts: number): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const { data: userBefore } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  const originalPoints = (userBefore?.metadata as any)?.points || 0;

  console.log(`\n${COLORS.bold('测试3: 并发混合')} — ${adds}个加分 + ${deducts}个扣分同时执行`);
  console.log(`  原始积分: ${originalPoints}`);

  // 设置足够积分
  await setPointsDirect(userId, deducts, userBefore?.metadata || {});

  const start = Date.now();
  const allPromises = [
    ...Array.from({ length: adds }, () =>
      supabase.rpc('add_points_atomic', { p_user_id: userId, p_points: 1 })
    ),
    ...Array.from({ length: deducts }, () =>
      supabase.rpc('deduct_points_atomic', { p_user_id: userId, p_points: 1 })
    ),
  ];
  const responses = await Promise.allSettled(allPromises);
  const elapsed = Date.now() - start;

  const finalPoints = await getPoints(userId);
  const expected = adds; // deducts 次扣1，adds 次加1，净增 adds

  console.log(`  总请求: ${adds + deducts} | 耗时: ${elapsed}ms`);
  console.log(`  最终积分: ${finalPoints} (期望: ${expected})`);

  results.push(assert(
    finalPoints === expected,
    '混合一致性',
    `${adds}次加1 + ${deducts}次扣1 → 最终 ${finalPoints} (期望 ${expected})`
  ));

  results.push(assert(
    finalPoints >= 0,
    '不会透支',
    `最终积分 ${finalPoints} >= 0`
  ));

  // 还原
  await setPointsDirect(userId, originalPoints, userBefore?.metadata || {});
  return results;
}

// ── 测试4: 余额耗尽（并发透支测试） ──
async function testOverdraftProtection(userId: string, concurrency: number): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const { data: userBefore } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  const originalPoints = (userBefore?.metadata as any)?.points || 0;

  console.log(`\n${COLORS.bold('测试4: 透支保护')} — 积分仅10，${concurrency}个并发请求各扣1分`);
  console.log(`  原始积分: ${originalPoints}`);

  await setPointsDirect(userId, 10, userBefore?.metadata || {});

  const start = Date.now();
  const promises = Array.from({ length: concurrency }, () =>
    supabase.rpc('deduct_points_atomic', { p_user_id: userId, p_points: 1 })
  );
  const responses = await Promise.allSettled(promises);
  const elapsed = Date.now() - start;

  let successCount = 0;
  let rejectedCount = 0;
  let insufficientCount = 0;

  for (const r of responses) {
    if (r.status === 'rejected') {
      rejectedCount++;
    } else {
      const val = (r as any).value;
      if (val.data?.success === true) successCount++;
      else if (val.data?.success === false) insufficientCount++;
    }
  }

  const finalPoints = await getPoints(userId);

  console.log(`  并发数: ${concurrency} | 扣减成功: ${successCount} | 余额不足: ${insufficientCount} | 网络失败: ${rejectedCount} | 耗时: ${elapsed}ms`);
  console.log(`  最终积分: ${finalPoints}`);

  results.push(assert(
    finalPoints >= 0,
    '不会透支',
    `最终积分 ${finalPoints} >= 0`
  ));

  results.push(assert(
    successCount <= 10,
    '成功扣减不超过余额',
    `${successCount} 次成功扣减 (余额仅10)`
  ));

  results.push(assert(
    successCount + insufficientCount === concurrency,
    '所有请求都有明确结果',
    `成功${successCount} + 拒绝${insufficientCount} = ${concurrency}`
  ));

  // 还原
  await setPointsDirect(userId, originalPoints, userBefore?.metadata || {});
  return results;
}

// ── 测试5: 对比测试（非原子 vs 原子） ──
async function testCompareAtomicVsNonAtomic(userId: string, concurrency: number): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const { data: userBefore } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  const originalPoints = (userBefore?.metadata as any)?.points || 0;
  const metadata = userBefore?.metadata || {};

  console.log(`\n${COLORS.bold('测试5: 原子 vs 非原子对比')} — ${concurrency}个并发请求各加1分`);

  // 非原子方式（模拟旧代码的 read-modify-write）
  console.log('  --- 非原子方式 (read-modify-write) ---');
  await setPointsDirect(userId, 0, metadata);

  const startNonAtomic = Date.now();
  const nonAtomicPromises = Array.from({ length: concurrency }, async () => {
    // 模拟旧代码: 读取 -> 计算 -> 写回
    const { data: user } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();
    const current = (user?.metadata as any)?.points || 0;
    const newPoints = current + 1;
    await supabase
      .from('users')
      .update({ metadata: { ...user?.metadata, points: newPoints } })
      .eq('id', userId);
    return newPoints;
  });
  await Promise.allSettled(nonAtomicPromises);
  const elapsedNonAtomic = Date.now() - startNonAtomic;

  const nonAtomicResult = await getPoints(userId);
  const nonAtomicLost = concurrency - nonAtomicResult;

  console.log(`  并发数: ${concurrency} | 耗时: ${elapsedNonAtomic}ms`);
  console.log(`  最终积分: ${nonAtomicResult} (期望: ${concurrency})`);
  console.log(`  ${COLORS.yellow(`丢失更新: ${nonAtomicLost} 次`)}`);

  // 原子方式
  console.log('  --- 原子方式 (RPC) ---');
  await setPointsDirect(userId, 0, metadata);

  const startAtomic = Date.now();
  const atomicPromises = Array.from({ length: concurrency }, () =>
    supabase.rpc('add_points_atomic', { p_user_id: userId, p_points: 1 })
  );
  await Promise.allSettled(atomicPromises);
  const elapsedAtomic = Date.now() - startAtomic;

  const atomicResult = await getPoints(userId);

  console.log(`  并发数: ${concurrency} | 耗时: ${elapsedAtomic}ms`);
  console.log(`  最终积分: ${atomicResult} (期望: ${concurrency})`);

  results.push(assert(
    nonAtomicResult < concurrency,
    '非原子操作存在丢失更新',
    `非原子结果 ${nonAtomicResult} < ${concurrency}，丢失 ${nonAtomicLost} 次`
  ));

  results.push(assert(
    atomicResult === concurrency,
    '原子操作无丢失更新',
    `原子结果 ${atomicResult} = ${concurrency}，零丢失`
  ));

  // 还原
  await setPointsDirect(userId, originalPoints, userBefore?.metadata || {});
  return results;
}

// ── 主函数 ──
async function main() {
  const concurrency = parseInt(process.argv[2] || '50');
  const concurrencyArg = parseInt(process.argv[2] || '50');

  console.log(COLORS.bold('╔══════════════════════════════════════════════╗'));
  console.log(COLORS.bold('║       积分并发压力测试                        ║'));
  console.log(COLORS.bold('╚══════════════════════════════════════════════╝'));
  console.log(`  并发数: ${concurrency}`);
  console.log(`  时间: ${new Date().toISOString()}\n`);

  // 获取测试用户
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, metadata')
    .limit(1)
    .single();

  if (userErr || !user) {
    console.error('获取用户失败:', userErr?.message);
    process.exit(1);
  }

  const userId = user.id;
  const originalPoints = (user.metadata as any)?.points || 0;
  console.log(COLORS.cyan(`测试用户: ${user.email} (${userId.substring(0, 8)}...)`));
  console.log(COLORS.cyan(`原始积分: ${originalPoints}`));

  const allResults: TestResult[] = [];

  allResults.push(...await testConcurrentAdd(userId, concurrency));
  allResults.push(...await testConcurrentDeduct(userId, concurrency));
  allResults.push(...await testConcurrentMixed(userId, 25, 25));
  allResults.push(...await testOverdraftProtection(userId, 50));
  allResults.push(...await testCompareAtomicVsNonAtomic(userId, concurrency));

  // 汇总
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;

  console.log(`\n${COLORS.bold('══════════════════════════════════════════════')}`);
  console.log(COLORS.bold('                  测试结果汇总'));
  console.log(COLORS.bold('══════════════════════════════════════════════'));
  console.log(`  总计: ${allResults.length} 项`);
  console.log(`  ${COLORS.green(`通过: ${passed}`)}`);
  if (failed > 0) {
    console.log(`  ${COLORS.red(`失败: ${failed}`)}`);
    console.log('\n  失败项:');
    allResults.filter(r => !r.passed).forEach(r => {
      console.log(`    ${COLORS.red('✗')} ${r.name}: ${r.detail}`);
    });
  }
  console.log(`\n  最终积分: ${await getPoints(userId)} (原始: ${originalPoints})`);
  console.log(COLORS.bold('══════════════════════════════════════════════\n'));

  // 还原积分
  const { data: finalMeta } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  if ((finalMeta?.metadata as any)?.points !== originalPoints) {
    await setPointsDirect(userId, originalPoints, finalMeta?.metadata || {});
    console.log(COLORS.yellow('积分已还原到原始值'));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
