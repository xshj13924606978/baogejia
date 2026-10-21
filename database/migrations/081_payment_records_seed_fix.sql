-- ============================================================
-- 迁移: 081_payment_records_seed_fix
-- 说明: 修正 079 已应用后的两个问题（增量，安全重复执行）：
--   1. user_id 去掉 NOT NULL —— 兼容 purchase/route.ts 本地 token 用户
--      （parseInt(currentUser.id) 对非数字 ID 得 NaN→null），避免购买被约束阻断
--   2. 种子数据改为「动态关联 users 表真实用户」+「状态均匀分布」
--      —— 删除旧种子（order_no 格式 ORD-YYYYMMDD-xxxxx）后按新逻辑重新生成
--      真实购买记录（order_no 格式 ORD<timestamp><rand>，无连字符）不受影响
-- 注意: 本迁移为纯 SQL（无 DO 块），兼容 exec_sql RPC 逐条执行
-- ============================================================

-- 1. user_id 兼容：去掉 NOT NULL
ALTER TABLE payment_records ALTER COLUMN user_id DROP NOT NULL;

-- 2. 清理旧种子数据（仅种子订单号，真实购买记录保留）
DELETE FROM payment_records WHERE order_no ~ '^ORD-[0-9]{8}-[0-9]{5}$';

-- 3. 若 users 表无 active 用户，自动补建 5 个演示用户（真实写入 users 表，非孤立数据）
INSERT INTO users (username, email, password_hash, role, status, created_at, updated_at)
SELECT
  'demo_user_' || g,
  'demo' || g || '@quote.local',
  '!demo:' || gen_random_uuid()::TEXT,
  'free', 'active', NOW(), NOW()
FROM generate_series(1, 5) AS g
WHERE NOT EXISTS (SELECT 1 FROM users WHERE status = 'active')
ON CONFLICT (username) DO NOTHING;

-- 4. 重新生成种子数据（动态关联 users 表 active 用户，状态/金额/方式均匀分布，可重复执行）
INSERT INTO payment_records (user_id, order_no, amount, payment_method, payment_status, paid_at, created_at, updated_at)
SELECT
  u.id::TEXT,
  'ORD-' || TO_CHAR(t.paid_at, 'YYYYMMDD') || '-' || LPAD(s.idx::TEXT, 5, '0'),
  CASE
    WHEN s.idx % 10 < 4 THEN ROUND((50 + random() * 150)::NUMERIC, 2)
    WHEN s.idx % 10 < 9 THEN ROUND((200 + random() * 800)::NUMERIC, 2)
    ELSE ROUND((1000 + random() * 4000)::NUMERIC, 2)
  END,
  (ARRAY['wechat', 'alipay', 'bank'])[1 + s.idx % 3],
  CASE
    WHEN s.idx % 100 < 88 THEN 'success'
    WHEN s.idx % 100 < 95 THEN 'refunded'
    WHEN s.idx % 100 < 98 THEN 'pending'
    ELSE 'failed'
  END,
  CASE WHEN s.idx % 100 < 95 THEN t.paid_at ELSE NULL END,
  t.paid_at,
  t.paid_at
FROM generate_series(1, 273) AS s(idx)
CROSS JOIN LATERAL (
  SELECT id
  FROM users
  WHERE status = 'active'
  ORDER BY created_at
  LIMIT 1
  OFFSET (s.idx % GREATEST(1, (SELECT COUNT(*)::INT FROM users WHERE status = 'active')))
) u
CROSS JOIN LATERAL (
  SELECT
    date_trunc('month', NOW() - ((s.idx - 1) / 23) * INTERVAL '1 month')
    + (((s.idx - 1) % 23) * 3 + ((s.idx - 1) / 23) * 3) % 28 * INTERVAL '1 day'
    + random() * 24 * INTERVAL '1 hour' AS paid_at
) t
ON CONFLICT (order_no) DO NOTHING;
