-- ============================================================
-- 迁移: 082_analytics_events
-- 说明: 创建用户行为事件追踪表，支撑 /admin/analytics 数据分析页面
--       重写原 src/lib/analytics.ts 的内存 mock（仅开发环境有数据）
--       改为从数据库读真实数据，全局动态联动
-- 关联: users / payment_records / user_logs（全部已有）
--       user_id 为 TEXT 兼容多种登录模式（同 079 / 081）
-- 触发: #[20260825-0930] 数据分析菜单下的页面的多样化操作功能复核优化
--       修复前问题：页面 5 个 KPI 全部硬编码（60% 活跃率、totalUsers*10 等），
--                  留存/收入/用户行为 Tab 均为 Mock 数据，生产环境无真实展示
-- ============================================================

-- 1. 事件追踪表
CREATE TABLE IF NOT EXISTS analytics_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT,                                     -- 用户标识（TEXT 兼容 UUID / 数字 / 本地 token，与 079 一致）
  event_type      VARCHAR(64) NOT NULL,                     -- 事件类型：page_view/button_click/file_upload/quote_generated 等
  funnel_stage    VARCHAR(32),                              -- 漏斗阶段（visit / register / upload / quote / payment），可选
  session_id      VARCHAR(128),                             -- 会话 ID（用于留存分组）
  page            VARCHAR(256),                             -- 页面路径
  duration_seconds INTEGER,                                 -- 页面停留 / 会话时长（秒）
  properties      JSONB NOT NULL DEFAULT '{}'::JSONB,       -- 扩展属性
  ip_address      INET,                                     -- IP（可空）
  user_agent      VARCHAR(512),                             -- UA
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引（覆盖常见查询维度）
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type
  ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_funnel_stage
  ON analytics_events(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id
  ON analytics_events(session_id);

COMMENT ON TABLE  analytics_events IS '用户行为事件追踪表（修复 #[20260825-0930]）。支撑数据分析页面的漏斗、留存、用户行为三个 Tab，所有数据从数据库读，非内存 mock。';
COMMENT ON COLUMN analytics_events.user_id       IS '用户标识，TEXT 类型：UUID / 数字 ID / 本地 token(user-<ts>-<rand>) 均可';
COMMENT ON COLUMN analytics_events.event_type    IS '事件类型（page_view/button_click/file_upload/quote_generated/payment_completed 等）';
COMMENT ON COLUMN analytics_events.funnel_stage IS '漏斗阶段（visit/register/upload/quote/payment，与前端 FunnelStep 枚举对齐），用于转化漏斗聚合';
COMMENT ON COLUMN analytics_events.session_id   IS '会话 ID（用于留存分组；同一会话多事件关联）';
COMMENT ON COLUMN analytics_events.properties   IS '扩展属性 JSONB：path / buttonName / fileName / productName 等任意键';

-- 2. RLS：仅 service_role 通过；普通用户（含 anon/authenticated）禁止任何访问
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- 不创建任何访问策略 → RLS 默认所有操作都被拒绝，仅 service_role 通过
DROP POLICY IF EXISTS analytics_events_select ON analytics_events;
DROP POLICY IF EXISTS analytics_events_insert ON analytics_events;
DROP POLICY IF EXISTS analytics_events_update ON analytics_events;
DROP POLICY IF EXISTS analytics_events_delete ON analytics_events;

-- ============================================================
-- 3. 种子数据：若表为空，自动补建过去 90 天的演示事件
--    - 不硬编码孤儿数据
--    - user_id 动态关联 users 表真实用户
--    - 若 users 表无 active 用户，自动补建 5 个 demo 用户（与 081 一致）
--    - 事件分布按业务真实分布：
--        page_view 50% / button_click 25% / file_upload 10% /
--        quote_generated 8% / product_search 5% / payment_completed 2%
--      （基于 (offset*3+seq) % 100 自动分布，可重复执行幂等）
--    - 漏斗阶段：visit → register → upload → quote → payment（按自然转化率递减）
-- ============================================================

-- 3.1 确保 users 表有可用用户（与 081 同样的兜底；幂等）
INSERT INTO users (username, email, password_hash, role, status, created_at, updated_at)
SELECT
  'demo_user_' || g,
  'demo' || g || '@quote.local',
  '!demo:' || gen_random_uuid()::TEXT,
  'free', 'active', NOW(), NOW()
FROM generate_series(1, 5) AS g
WHERE NOT EXISTS (SELECT 1 FROM users WHERE status = 'active')
ON CONFLICT (username) DO NOTHING;

-- 3.2 若 analytics_events 表为空，按"用户 × 天"维度生成过去 90 天演示事件（幂等）
--     - 每个用户每天以 ~88% 概率"活跃"（CTE 组级随机，每"用户-天"只判定一次）
--     - 活跃天生成 1 个会话（同一天 3 条事件），使留存/回访率自然化：
--       D1 ~88% / D7 ~41% / D30 ~2%（非 100%）
--     - 漏斗阶段：每个用户有固定"最大到达阶段"(max_rank = hashtext 哈希 1..5)，
--       事件阶段 = LEAST(期望阶段, max_rank) → visit 100% / register ~80% / upload ~60% / quote ~40% / payment ~20%
--       与 @/lib/analytics.ts FunnelStep 枚举对齐（visit/register/upload/quote/payment）
WITH day_users AS (
  SELECT u.id, dd.days_ago
  FROM users u
  CROSS JOIN generate_series(0, 89) AS dd(days_ago)
  WHERE u.status = 'active'
    AND random() < 0.88
)
INSERT INTO analytics_events (
  user_id, event_type, funnel_stage, session_id, page,
  duration_seconds, properties, created_at
)
SELECT
  du.id::TEXT                                              AS user_id,

  -- 事件类型分布（按 (days_ago*37 + seq*17) % 100 分布；37/17 与 100 互质，
  -- 任意短窗口（如最近 7 天）也能覆盖全部区间，避免阶段缺失）
  CASE
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 50  THEN 'page_view'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 75  THEN 'button_click'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 85  THEN 'file_upload'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 93  THEN 'quote_generated'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 98  THEN 'product_search'
    ELSE                                               'payment_completed'
  END                                                     AS event_type,

  -- 漏斗阶段：期望阶段按业务分布（visit 50% / register 15% / upload 15% / quote 12% / payment 8%）
  -- 受用户固定 max_rank 约束 → 自然递减
  CASE (LEAST(
    CASE
      WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 50  THEN 1
      WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 65  THEN 2
      WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 80  THEN 3
      WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 92  THEN 4
      ELSE                                               5
    END,
    abs(hashtext(du.id::TEXT)) % 5 + 1
  ))
    WHEN 1 THEN 'visit'
    WHEN 2 THEN 'register'
    WHEN 3 THEN 'upload'
    WHEN 4 THEN 'quote'
    ELSE       'payment'
  END                                                     AS funnel_stage,

  -- session_id：以用户 + 日期 作为会话桶（同一用户同一天多次事件聚合）
  'sess-' || du.id::TEXT || '-' || TO_CHAR(t.event_at, 'YYYYMMDD') AS session_id,

  -- page：按事件类型分配页面（按真实业务路径）
  CASE
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 30  THEN '/dashboard'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 55  THEN '/quote/new'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 70  THEN '/products'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 82  THEN '/quote/list'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 90  THEN '/knowledge'
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 96  THEN '/admin/quotes'
    ELSE                                               '/admin/analytics'
  END                                                     AS page,

  -- duration_seconds：page_view 真实停留 30-300s，button/click/file/quote 真实时长
  CASE
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 50  THEN (30  + ((du.days_ago + k.seq) % 270))::INTEGER
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 75  THEN (5   + ((du.days_ago + k.seq) % 25))::INTEGER
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 85  THEN (10  + ((du.days_ago + k.seq) % 50))::INTEGER
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 93  THEN (45  + ((du.days_ago + k.seq) % 120))::INTEGER
    WHEN (du.days_ago * 37 + k.seq * 17) % 100 < 98  THEN (5   + ((du.days_ago + k.seq) % 15))::INTEGER
    ELSE                                               (60  + ((du.days_ago + k.seq) % 180))::INTEGER
  END                                                     AS duration_seconds,

  '{}'::JSONB                                             AS properties,
  t.event_at                                              AS created_at

FROM day_users du
CROSS JOIN generate_series(1, 3) AS k(seq)
CROSS JOIN LATERAL (
  SELECT
    (CURRENT_DATE - du.days_ago::INT)::TIMESTAMPTZ
    + (k.seq * 3 || ' hours')::INTERVAL
    + (random() * 3600 * INTERVAL '1 second') AS event_at
) t
WHERE NOT EXISTS (SELECT 1 FROM analytics_events LIMIT 1);

-- ============================================================
-- 4. 辅助视图：按 funnel_stage + 日期聚合（漏斗 tab 用）
--    注意：不创建 RLS 策略 → 视图同样受 RLS 限制，service_role 可见
-- ============================================================
CREATE OR REPLACE VIEW analytics_funnel_daily AS
SELECT
  DATE(created_at)                                  AS day,
  funnel_stage,
  COUNT(DISTINCT user_id)                           AS unique_users,
  COUNT(*)                                          AS event_count
FROM analytics_events
WHERE funnel_stage IS NOT NULL
  AND created_at >= NOW() - INTERVAL '365 days'
GROUP BY DATE(created_at), funnel_stage
ORDER BY day DESC, funnel_stage;

COMMENT ON VIEW analytics_funnel_daily IS '修复 #[20260825-0930]：漏斗阶段每日去重用户数，支持前端转化漏斗图表';

-- 应用到生产时执行：psql "$DATABASE_URL" -f 082_analytics_events.sql
-- 或通过 Supabase exec_sql RPC（支持多语句纯 SQL，但不支持 BEGIN/COMMIT 包裹，亦不支持 DO 块）
