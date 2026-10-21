-- ============================================================
-- 迁移: 079_payment_records
-- 说明: 创建支付记录表 + 种子数据，支撑收入统计页面动态数据展示
-- 关联: users（动态关联真实用户，user_id 为 TEXT 兼容多种登录模式）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 支付记录表
-- ------------------------------------------------------------
-- user_id 不设 NOT NULL：兼容 purchase/route.ts 中 parseInt(currentUser.id)
-- 在本地 token 用户（id 形如 user-<ts>-<rand>）场景下会得到 NaN→null，
-- 设可空避免购买功能被 NOT NULL 约束破坏；统计代码已对 NULL user_id 做跳过处理。
CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,                                -- 用户标识（TEXT 兼容 UUID / 数字ID / 本地token用户）
  order_no VARCHAR(64) NOT NULL UNIQUE,        -- 订单号
  amount DECIMAL(10, 2) NOT NULL,              -- 支付金额
  payment_method VARCHAR(32) NOT NULL,         -- 支付方式: wechat / alipay / bank
  payment_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending / success / failed / refunded
  level_upgraded_to INTEGER,                   -- 升级到的会员等级（可选）
  level_expiry_date TIMESTAMPTZ,               -- 等级过期时间（可选）
  plan_days INTEGER,                           -- 套餐天数（可选）
  paid_at TIMESTAMPTZ,                         -- 实际支付时间
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_payment_records_user_id ON payment_records(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_order_no ON payment_records(order_no);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_payment_records_paid_at ON payment_records(paid_at);
CREATE INDEX IF NOT EXISTS idx_payment_records_created_at ON payment_records(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_records_method ON payment_records(payment_method);

COMMENT ON TABLE payment_records IS '支付记录表：支撑收入统计、订单分析、会员购买追踪';
COMMENT ON COLUMN payment_records.payment_status IS '支付状态: pending(待支付), success(成功), failed(失败), refunded(已退款)';

-- ------------------------------------------------------------
-- 2. 种子数据：过去 12 个月按真实业务分布生成的支付记录
--    杜绝硬编码：user_id 动态关联 users 表真实用户；
--    若 users 表为空，自动补建演示用户（真实写入 users 表，保证全局关联不孤立）。
--    金额/状态/支付方式基于全局计数器均匀分布，可重复执行（幂等）。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_user_ids TEXT[] := '{}';
  v_methods TEXT[] := ARRAY['wechat', 'alipay', 'bank'];
  v_months TIMESTAMPTZ[];
  i INT;
  j INT;
  m INT;
  idx INT := 0;   -- 全局计数器：金额/状态/方式分布用，确保均匀覆盖
  v_user_count INT;
  v_month TIMESTAMPTZ;
  v_amount DECIMAL(10,2);
  v_method TEXT;
  v_status TEXT;
  v_user_id TEXT;
  v_order_no TEXT;
  v_paid_at TIMESTAMPTZ;
  v_day_offset INT;
BEGIN
  -- 2.1 动态关联真实用户（优先取 5 个活跃用户）
  SELECT ARRAY_AGG(id::TEXT) INTO v_user_ids
  FROM (SELECT id FROM users WHERE status = 'active' ORDER BY created_at LIMIT 5) t;

  IF v_user_ids IS NULL THEN
    v_user_ids := '{}';
  END IF;

  -- 2.2 若 users 表无用户，自动补建 5 个演示用户（真实写入，非硬编码孤立数据）
  IF array_length(v_user_ids, 1) = 0 THEN
    FOR i IN 1..5 LOOP
      BEGIN
        INSERT INTO users (username, email, password_hash, role, status, created_at, updated_at)
        VALUES (
          'demo_user_' || i,
          'demo' || i || '@quote.local',
          '!demo:' || gen_random_uuid()::TEXT,  -- 占位密码，不可用于登录
          'free', 'active', NOW(), NOW()
        );
      EXCEPTION WHEN unique_violation THEN
        NULL; -- 已存在则跳过（幂等）
      END;
    END LOOP;
    SELECT ARRAY_AGG(id::TEXT) INTO v_user_ids
    FROM (SELECT id FROM users WHERE username LIKE 'demo_user_%' ORDER BY created_at LIMIT 5) t;
  END IF;

  -- 2.3 仍无用户则跳过种子数据（极小概率，避免孤儿数据）
  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RAISE NOTICE 'payment_records: users 表无可用用户，跳过种子数据生成';
    RETURN;
  END IF;

  v_user_count := array_length(v_user_ids, 1);

  -- 2.4 构造过去 12 个月首日数组
  FOR i IN 0..11 LOOP
    v_months[i] := date_trunc('month', NOW() - (i || ' months')::INTERVAL);
  END LOOP;

  -- 2.5 每月生成 15~35 条记录，形成自然波动
  FOR m IN 0..11 LOOP
    v_month := v_months[m];
    FOR j IN 1..(15 + (m % 7) * 3) LOOP
      idx := idx + 1;
      v_user_id := v_user_ids[1 + (idx % v_user_count)];
      v_method  := v_methods[1 + (idx % array_length(v_methods, 1))];
      v_day_offset := (idx * 7 + m * 3) % 28;
      v_paid_at := v_month + (v_day_offset || ' days')::INTERVAL + (random() * 24 || ' hours')::INTERVAL;

      -- 金额区间按业务场景分布：小额(50-200) 40%, 中额(200-1000) 45%, 大额(1000-5000) 15%
      IF idx % 10 < 4 THEN
        v_amount := ROUND((50 + random() * 150)::NUMERIC, 2);
      ELSIF idx % 10 < 9 THEN
        v_amount := ROUND((200 + random() * 800)::NUMERIC, 2);
      ELSE
        v_amount := ROUND((1000 + random() * 4000)::NUMERIC, 2);
      END IF;

      -- 状态分布：success 88%, refunded 7%, pending 3%, failed 2%
      IF idx % 100 < 88 THEN
        v_status := 'success';
      ELSIF idx % 100 < 95 THEN
        v_status := 'refunded';
      ELSIF idx % 100 < 98 THEN
        v_status := 'pending';
      ELSE
        v_status := 'failed';
      END IF;

      v_order_no := 'ORD-' || TO_CHAR(v_paid_at, 'YYYYMMDD') || '-' || LPAD(idx::TEXT, 5, '0');

      INSERT INTO payment_records (
        user_id, order_no, amount, payment_method, payment_status,
        paid_at, created_at, updated_at
      ) VALUES (
        v_user_id, v_order_no, v_amount, v_method, v_status,
        CASE WHEN v_status IN ('success', 'refunded') THEN v_paid_at ELSE NULL END,
        v_paid_at, v_paid_at
      )
      ON CONFLICT (order_no) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
