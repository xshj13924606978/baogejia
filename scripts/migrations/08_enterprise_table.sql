-- 08_enterprise_table.sql
-- 企业信息表
-- 创建时间: 2026-03-25

CREATE TABLE IF NOT EXISTS enterprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,                  -- 企业名称
  credit_code VARCHAR(18),                    -- 统一社会信用代码
  legal_person VARCHAR(100),                  -- 法人代表
  contact_person VARCHAR(100),                -- 联系人
  contact_phone VARCHAR(50),                  -- 联系电话
  email VARCHAR(255),                         -- 企业邮箱
  address TEXT,                               -- 企业地址
  industry VARCHAR(100),                      -- 所属行业
  scale VARCHAR(50),                          -- 企业规模
  description TEXT,                           -- 企业简介
  logo_url TEXT,                              -- 企业Logo
  status VARCHAR(50) DEFAULT 'active',        -- 状态: active/disabled/pending
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 关联管理员
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_enterprises_user_id ON enterprises(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_status ON enterprises(status);
CREATE INDEX IF NOT EXISTS idx_enterprises_name ON enterprises(name);
CREATE INDEX IF NOT EXISTS idx_enterprises_credit_code ON enterprises(credit_code);

COMMENT ON TABLE enterprises IS '企业信息表';
COMMENT ON COLUMN enterprises.credit_code IS '统一社会信用代码(18位)';
COMMENT ON COLUMN enterprises.user_id IS '关联的企业管理员用户ID';
