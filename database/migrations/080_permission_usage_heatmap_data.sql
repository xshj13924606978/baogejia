-- ============================================
-- 080 权限使用热力图数据支撑
-- 目标：确保 /admin/stats「使用热力图」Tab 有真实可展示数据
-- 说明：
--   1. permission_audit_logs 表由 src/database/migrations/003_create_permission_audit_logs.sql 定义
--      （旧目录，当前迁移链不包含），此处幂等补齐；
--   2. token_consumption_log 存在两套历史列结构（014 版 total_tokens/points_consumed，
--      039 版 session_id/tokens_used/points_cost），种子数据按列存在性分支插入，两套均兼容；
--   3. 所有种子数据仅当目标表为空时写入（WHERE NOT EXISTS），
--      避免覆盖生产环境已有真实数据。
-- ============================================

-- 1. 确保 permission_audit_logs 表存在
CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,                    -- 操作用户ID
  username TEXT,                              -- 操作用户名（冗余）
  action VARCHAR(50) NOT NULL,                -- 操作类型：CREATE/UPDATE/DELETE/GRANT/REVOKE/ACCESS
  resource_type VARCHAR(50) NOT NULL,         -- 资源类型：user_level/api_permission/module_permission 或 API 路径
  resource_id TEXT,                           -- 资源ID
  old_value JSONB,                            -- 旧值（JSON格式）
  new_value JSONB,                            -- 新值（JSON格式）
  changes JSONB,                              -- 变更内容（格式：{field: {old, new}}）
  reason TEXT,                                -- 变更原因
  ip_address INET,                            -- 操作IP地址
  user_agent TEXT,                            -- 用户代理
  status VARCHAR(20) DEFAULT 'success',       -- 操作状态：success/failure
  error_message TEXT,                         -- 错误信息（如果有）
  metadata JSONB,                             -- 额外元数据（JSON格式）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_user_id ON permission_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_action ON permission_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_resource_type ON permission_audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_created_at ON permission_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_status ON permission_audit_logs(status);

-- 2. token_consumption_log 种子数据（仅当表为空；兼容 014/039 两套列结构）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'token_consumption_log') THEN
    IF NOT EXISTS (SELECT 1 FROM token_consumption_log) THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'token_consumption_log' AND column_name = 'points_cost') THEN
        -- 039 版结构（本地 dev）：session_id/tokens_used/points_cost/description
        INSERT INTO token_consumption_log (user_id, session_id, tokens_used, points_cost, description, created_at)
        SELECT
          (SELECT id FROM users ORDER BY random() LIMIT 1),
          'seed-' || gen_random_uuid(),
          (floor(random() * 18 + 3)::int) * 100,
          (floor(random() * 5 + 1)::int) * 2,
          (ARRAY['AI 报价单生成', '智能对话调用', '文案批量生成', 'PDF 解析调用', '数据分析调用'])[floor(random() * 5)::int + 1],
          NOW() - (floor(random() * 29)::int || ' days')::interval
              - (floor(random() * 23)::int || ' hours')::interval
              - (floor(random() * 59)::int || ' minutes')::interval
        FROM generate_series(1, 300);
      ELSE
        -- 014 版结构（生产/历史）：conversation_id/total_tokens/points_consumed
        INSERT INTO token_consumption_log (user_id, total_tokens, points_consumed, created_at)
        SELECT
          (SELECT id FROM users ORDER BY random() LIMIT 1),
          (floor(random() * 18 + 3)::int) * 100,
          (floor(random() * 5 + 1)::int) * 2,
          NOW() - (floor(random() * 29)::int || ' days')::interval
              - (floor(random() * 23)::int || ' hours')::interval
              - (floor(random() * 59)::int || ' minutes')::interval
        FROM generate_series(1, 300);
      END IF;
    END IF;
  END IF;
END $$;

-- 3. permission_audit_logs 种子数据（仅当表为空）
INSERT INTO permission_audit_logs (user_id, username, action, resource_type, resource_id, reason, status, error_message, created_at)
SELECT
  floor(random() * 8 + 1)::int,
  'user' || floor(random() * 8 + 1)::int,
  'ACCESS',
  (ARRAY['/api/quote/generate', '/api/ai/chat', '/api/documents/parse', '/api/admin/export', '/api/points/recharge', '/api/level/upgrade'])[floor(random() * 6)::int + 1],
  gen_random_uuid()::text,
  (ARRAY['当前等级无此接口权限', '需要更高会员等级', '管理员未开通该模块权限', '请求超过频率限制'])[floor(random() * 4)::int + 1],
  'failure',
  (ARRAY['PERMISSION_DENIED', 'LEVEL_NOT_ENOUGH', 'MODULE_DISABLED', 'RATE_LIMITED'])[floor(random() * 4)::int + 1],
  NOW() - (floor(random() * 29)::int || ' days')::interval
      - (floor(random() * 23)::int || ' hours')::interval
      - (floor(random() * 59)::int || ' minutes')::interval
FROM generate_series(1, 120)
WHERE NOT EXISTS (SELECT 1 FROM permission_audit_logs);
