-- 邀请相关表
-- 在 Supabase Dashboard → SQL Editor 中执行

-- 1. 邀请记录表
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invite_code VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invites_user_id ON invites(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_invite_code ON invites(invite_code);

-- 2. 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(20) DEFAULT 'link',
  is_active BOOLEAN DEFAULT true,
  scan_count INTEGER DEFAULT 0,
  register_count INTEGER DEFAULT 0,
  expire_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_user_id ON invite_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- 3. 邀请关系表（多级）
CREATE TABLE IF NOT EXISTS invite_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  level INTEGER DEFAULT 1,
  points_awarded INTEGER DEFAULT 0,
  channel_type VARCHAR(20) DEFAULT 'link',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_relations_inviter ON invite_relations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_invitee ON invite_relations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_level ON invite_relations(level);

-- 4. 邀请排行榜表
CREATE TABLE IF NOT EXISTS invite_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period VARCHAR(20) NOT NULL,
  invite_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  rank INTEGER DEFAULT 0,
  update_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, period)
);
CREATE INDEX IF NOT EXISTS idx_invite_rankings_period ON invite_rankings(period);
CREATE INDEX IF NOT EXISTS idx_invite_rankings_rank ON invite_rankings(period, rank);
