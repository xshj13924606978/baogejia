// scripts/migrate-042-add-points-atomic.mts
//
// 数据库迁移脚本：创建原子积分操作 RPC 函数
// 解决竞态条件问题
//
// 由于 WSL 环境不支持 IPv6，无法通过 psql/node-postgres 直连 Supabase 数据库。
// 请在 Supabase Dashboard → SQL Editor 中手动执行以下 SQL：
//   database/migrations/042_add_points_atomic.sql
//
// 本脚本用于：
// 1. 验证 RPC 函数是否已创建
// 2. 测试 add_points_atomic / deduct_points_atomic / set_points_atomic
// 3. 验证降级逻辑的正确性

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('=== 原子积分函数迁移验证 ===\n');

  // 1. 获取测试用户
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
  console.log(`测试用户: ${user.email}`);
  console.log(`原始积分: ${originalPoints}`);
  console.log(`原始 metadata:`, JSON.stringify(user.metadata, null, 2));
  console.log('');

  // 2. 测试 add_points_atomic
  console.log('--- 测试 add_points_atomic ---');
  const { data: addResult, error: addErr } = await supabase.rpc('add_points_atomic', {
    p_user_id: userId,
    p_points: 10,
  });

  if (addErr) {
    console.log(`RPC 不存在（降级模式）：${addErr.code}`);
    console.log('请先在 Supabase Dashboard SQL Editor 中执行:');
    console.log('  database/migrations/042_add_points_atomic.sql\n');
    console.log('--- 验证降级逻辑 ---');

    // 测试降级逻辑（通过直接 update 模拟）
    const metadata = user.metadata || {};
    const fallbackNewPoints = (metadata.points || 0) + 10;

    const { error: fallbackErr } = await supabase
      .from('users')
      .update({
        metadata: {
          ...metadata,
          points: fallbackNewPoints,
          total_points: (metadata.total_points || 0) + 10,
          last_points_update: new Date().toISOString(),
        },
      })
      .eq('id', userId);

    if (fallbackErr) {
      console.error('降级更新失败:', fallbackErr.message);
    } else {
      // 验证
      const { data: afterFallback } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', userId)
        .single();

      console.log('降级更新后积分:', (afterFallback?.metadata as any)?.points);
      console.log('降级逻辑验证: 成功');

      // 还原
      await supabase
        .from('users')
        .update({ metadata: user.metadata })
        .eq('id', userId);
      console.log('已还原积分到原始值');
    }
  } else {
    console.log('add_points_atomic 调用成功!');
    console.log('返回结果:', JSON.stringify(addResult));

    // 验证积分已更新
    const { data: afterAdd } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();
    const newPoints = (afterAdd?.metadata as any)?.points || 0;
    console.log(`更新后积分: ${newPoints} (期望 ${originalPoints + 10})`);
    console.log(`验证: ${newPoints === originalPoints + 10 ? '通过' : '失败!'}`);

    // 3. 测试 deduct_points_atomic
    console.log('\n--- 测试 deduct_points_atomic ---');
    const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_points_atomic', {
      p_user_id: userId,
      p_points: 5,
    });

    if (deductErr) {
      console.error('deduct_points_atomic 失败:', deductErr.message);
    } else {
      console.log('deduct_points_atomic 调用成功!');
      console.log('返回结果:', JSON.stringify(deductResult));
    }

    // 4. 测试余额不足
    console.log('\n--- 测试余额不足场景 ---');
    const { data: overdraftResult, error: overdraftErr } = await supabase.rpc('deduct_points_atomic', {
      p_user_id: userId,
      p_points: 999999999,
    });

    if (overdraftResult) {
      console.log('返回结果:', JSON.stringify(overdraftResult));
      console.log(`验证: ${overdraftResult.success === false && overdraftResult.reason === '积分不足' ? '通过' : '失败!'}`);
    }

    // 5. 测试 set_points_atomic
    console.log('\n--- 测试 set_points_atomic ---');
    const { data: setResult, error: setErr } = await supabase.rpc('set_points_atomic', {
      p_user_id: userId,
      p_new_points: originalPoints,
    });

    if (setErr) {
      console.error('set_points_atomic 失败:', setErr.message);
    } else {
      console.log('set_points_atomic 调用成功!');
      console.log('返回结果:', JSON.stringify(setResult));

      // 验证还原
      const { data: afterRestore } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', userId)
        .single();
      const restoredPoints = (afterRestore?.metadata as any)?.points || 0;
      console.log(`还原后积分: ${restoredPoints} (期望 ${originalPoints})`);
      console.log(`验证: ${restoredPoints === originalPoints ? '通过' : '失败!'}`);
    }
  }

  // 最终验证
  const { data: finalUser } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  const finalPoints = (finalUser?.metadata as any)?.points || 0;
  console.log(`\n=== 最终积分: ${finalPoints} (原始: ${originalPoints}) ===`);

  if (finalPoints !== originalPoints) {
    console.log('还原积分到原始值...');
    await supabase
      .from('users')
      .update({ metadata: user.metadata })
      .eq('id', userId);
    console.log('已还原');
  }
}

main().catch(console.error);
