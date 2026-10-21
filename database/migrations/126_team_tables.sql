-- ============================================================
-- #[20260902-0900] 团队协作模块持久化表结构
--
-- 背景（修复前）：
--   src/lib/team-service.ts 完全使用进程内存 Map 存储（源码注释即写明"演示用"），
--   且所有 /api/teams/** 路由均以 `x-user-id || 'demo_user_1'` 兜底取身份，导致：
--     1. 数据不持久 —— PM2 重启即全部丢失；
--     2. 无隔离     —— 所有用户共享同一 demo 身份，团队/成员/共享报价互相可见；
--     3. 无权限     —— 前端可伪造 x-user-id 请求头。
--
-- 本迁移建立持久化表结构，配合 service 层改造实现：
--   - 身份一律由服务端校验的 session 解析（requireAuth），不再信任请求头
--   - 数据按团队成员关系隔离（非成员不可见）
--   - 角色分级：admin（管理员）/ member（成员）/ guest（访客），团队创建者即 owner
--   - 邀请机制：生成一次性 token，受邀人凭 token 接受邀请
--
-- 幂等：全部使用 IF NOT EXISTS / DO 块，可重复执行。
-- ============================================================

-- ---------- 1. 团队 ----------
CREATE TABLE IF NOT EXISTS teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avatar       TEXT,
  settings     JSONB NOT NULL DEFAULT '{"allowGuestInvite":false,"quoteVisibility":"team","requireApproval":true,"maxMembers":50}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. 团队成员 ----------
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','guest')),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一团队内同一用户只能有一条成员记录
  CONSTRAINT team_members_team_user_unique UNIQUE (team_id, user_id)
);

-- ---------- 3. 团队邀请 ----------
CREATE TABLE IF NOT EXISTS team_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','guest')),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  -- 一次性邀请令牌，受邀人凭此接受邀请（避免仅凭 email 被冒领）
  token         VARCHAR(64) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同一团队对同一邮箱仅保留一条 pending 邀请
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_pending_unique
  ON team_invites (team_id, invitee_email)
  WHERE status = 'pending';

-- ---------- 4. 团队共享报价单 ----------
CREATE TABLE IF NOT EXISTS team_shared_quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  quote_id    VARCHAR(100) NOT NULL,
  shared_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{"canEdit":false,"canComment":true,"canExport":true}'::jsonb,
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一团队内同一报价单只共享一次
  CONSTRAINT team_shared_quotes_team_quote_unique UNIQUE (team_id, quote_id)
);

-- ---------- 5. 团队评论 ----------
CREATE TABLE IF NOT EXISTS team_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  target_id   VARCHAR(100) NOT NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('quote','team','proposal')),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  parent_id   UUID REFERENCES team_comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6. 团队活动日志 ----------
CREATE TABLE IF NOT EXISTS team_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(200) NOT NULL,
  target_id   VARCHAR(100),
  target_type VARCHAR(20),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 索引（按团队维度的常规查询） ----------
CREATE INDEX IF NOT EXISTS idx_teams_owner            ON teams (owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team      ON team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user      ON team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_team      ON team_invites (team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token     ON team_invites (token);
CREATE INDEX IF NOT EXISTS idx_team_shared_quotes_team ON team_shared_quotes (team_id);
CREATE INDEX IF NOT EXISTS idx_team_comments_team     ON team_comments (team_id);
CREATE INDEX IF NOT EXISTS idx_team_comments_target   ON team_comments (target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_team_comments_parent   ON team_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_team_activities_team   ON team_activities (team_id, created_at DESC);

-- ---------- 行级安全 ----------
-- 本项目服务端统一使用 service role 客户端（绕过 RLS），鉴权在 API 层完成
-- （requireAuth + service 层成员校验）。此处开启 RLS 用于阻断 anon key 的直连访问，
-- 防止表被未经服务端鉴权的渠道读取。
ALTER TABLE teams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_shared_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_activities    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 说明：不创建任何面向 anon/authenticated 的 SELECT/INSERT/UPDATE/DELETE 策略，
--       即默认全部拒绝；所有访问必须经由服务端 service role 客户端，
--       并在 API 与 service 层完成身份与成员关系校验。
-- ============================================================
