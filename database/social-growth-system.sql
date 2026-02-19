-- 社交增长系统 - 数据库表结构

-- 用户渠道绑定表
CREATE TABLE IF NOT EXISTS user_channels (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  channel_type VARCHAR(20) NOT NULL, -- wechat/qq/phone/email
  channel_id VARCHAR(100) UNIQUE, -- openid/手机号/邮箱
  channel_name VARCHAR(100), -- 微信昵称/QQ昵称
  avatar VARCHAR(500), -- 头像URL
  bind_time TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_primary BOOLEAN DEFAULT FALSE
);

-- 邀请关系表（多级）
CREATE TABLE IF NOT EXISTS invite_relations (
  id SERIAL PRIMARY KEY,
  inviter_id INT REFERENCES users(id) ON DELETE CASCADE,
  invitee_id INT REFERENCES users(id) ON DELETE CASCADE,
  level INT DEFAULT 1, -- 1/2/3级
  points_awarded INT DEFAULT 0,
  channel_type VARCHAR(20), -- 通过哪个渠道注册
  created_at TIMESTAMP DEFAULT NOW()
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) DEFAULT 'link', -- link/qrcode/password
  scan_count INT DEFAULT 0,
  register_count INT DEFAULT 0,
  expire_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 邀请排行榜
CREATE TABLE IF NOT EXISTS invite_rankings (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL, -- day/week/month/total
  invite_count INT DEFAULT 0,
  points_earned INT DEFAULT 0,
  rank INT,
  update_time TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, period)
);

-- 海报记录表
CREATE TABLE IF NOT EXISTS invite_posters (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  poster_url VARCHAR(500),
  qrcode_url VARCHAR(500),
  background VARCHAR(200), -- 背景图
  style VARCHAR(50), -- 风格
  download_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_user_channels_user_id ON user_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_channels_channel_type ON user_channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_user_channels_channel_id ON user_channels(channel_id);

CREATE INDEX IF NOT EXISTS idx_invite_relations_inviter_id ON invite_relations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_invitee_id ON invite_relations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_level ON invite_relations(level);

CREATE INDEX IF NOT EXISTS idx_invite_codes_user_id ON invite_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

CREATE INDEX IF NOT EXISTS idx_invite_rankings_user_period ON invite_rankings(user_id, period);
CREATE INDEX IF NOT EXISTS idx_invite_rankings_period_rank ON invite_rankings(period, rank);

CREATE INDEX IF NOT EXISTS idx_invite_posters_user_id ON invite_posters(user_id);
