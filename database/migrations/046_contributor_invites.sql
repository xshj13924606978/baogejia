-- 资料贡献中心邀请奖励功能
-- 创建时间: 2026-08-12

-- ============================================================================
-- 1. contributors 表新增邀请字段
-- ============================================================================

-- 1.1 贡献者个人邀请码（唯一，分享给他人注册）
ALTER TABLE public.contributors ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);

-- 1.2 被邀请人：记录邀请其注册的贡献者（user_id）
ALTER TABLE public.contributors ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 邀请码唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_contributors_invite_code ON public.contributors(invite_code);

-- ============================================================================
-- 2. 邀请记录表（记录邀请关系与各阶段奖励发放状态）
--    奖励规则：被邀请人注册 +20、提交资料 +30、资料审核通过邀请人 +50
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contributor_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID REFERENCES public.users(id) ON DELETE CASCADE,   -- 邀请人（贡献者）user_id
  invitee_id UUID REFERENCES public.users(id) ON DELETE CASCADE,   -- 被邀请人 user_id
  invite_code VARCHAR(32) NOT NULL,                                -- 使用的邀请码
  status VARCHAR(20) DEFAULT 'pending',                            -- pending/registered/submitted/approved
  register_rewarded BOOLEAN DEFAULT FALSE,                         -- 被邀请人注册奖励已发放
  submit_rewarded BOOLEAN DEFAULT FALSE,                           -- 被邀请人提交资料奖励已发放
  review_rewarded BOOLEAN DEFAULT FALSE,                           -- 邀请人审核通过奖励已发放
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_contributor_invites_inviter ON public.contributor_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_contributor_invites_invitee ON public.contributor_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_contributor_invites_code ON public.contributor_invites(invite_code);

-- RLS 策略（与 contributors 表保持一致：服务角色 + 公开读取）
ALTER TABLE public.contributor_invites ENABLE ROW LEVEL SECURITY;

-- 邀请记录：公开可读取
CREATE POLICY contributor_invites_select ON public.contributor_invites
  FOR SELECT USING (true);

-- 邀请记录：服务端可插入
CREATE POLICY contributor_invites_insert ON public.contributor_invites
  FOR INSERT WITH CHECK (true);

-- 邀请记录：服务端可更新（发放奖励后更新状态）
CREATE POLICY contributor_invites_update ON public.contributor_invites
  FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. 用户下拉菜单「我的账户」新增「资料贡献中心」入口
-- ============================================================================
INSERT INTO public.user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, is_enabled, is_visible, sort_order, badge_type, config) VALUES
    ((SELECT id FROM public.user_menus WHERE menu_key = 'my_account'),
     'contributor_upload', '资料贡献中心', 'Upload', '/contributor/upload', 'navigate', true, true, 6, NULL, '{}')
ON CONFLICT (menu_id, page_key) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    icon = EXCLUDED.icon,
    route_path = EXCLUDED.route_path,
    action_type = EXCLUDED.action_type,
    is_enabled = EXCLUDED.is_enabled,
    is_visible = EXCLUDED.is_visible,
    sort_order = EXCLUDED.sort_order;
