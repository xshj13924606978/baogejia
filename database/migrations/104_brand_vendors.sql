-- ============================================================
-- 迁移: 104_brand_vendors
-- 说明: 品牌厂商表（阶段三 #202608292600-厂商付费推广）
-- ⚠️ 注意：旧演示版 brand_vendors 表（payment_level/payment_status/
--   display_weight 结构，无 user_id）与本表结构完全不兼容，
--   因此先 DROP 旧表再重建。如生产环境存在旧品牌数据请先备份。
-- 状态机: pending(待审核) → approved(已通过) / rejected(已拒绝)
--                           └ suspended(已暂停)
-- 付费权益: priority_level + priority_expire_at（过期自动降级）
-- 关联: brand_payments（付费记录）、brand_packages（套餐）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. 清理旧演示结构（如存在）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS brand_vendors CASCADE;

-- ------------------------------------------------------------
-- 1. 品牌厂商表
-- ------------------------------------------------------------
CREATE TABLE brand_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  brand_name VARCHAR(200) NOT NULL,
  brand_logo VARCHAR(500),
  brand_desc TEXT,
  category VARCHAR(100), -- 行业分类
  contact_person VARCHAR(100),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(200),
  website VARCHAR(500),
  address TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  -- 付费排行相关
  ranking_score INTEGER DEFAULT 0, -- 排行权重分（付费+评价）
  total_paid DECIMAL(10,2) DEFAULT 0, -- 累计付费金额
  priority_level INTEGER DEFAULT 0, -- 优先匹配等级（0=免费，1=白银，2=黄金，3=铂金）
  priority_expire_at TIMESTAMPTZ, -- 优先匹配过期时间
  is_verified BOOLEAN DEFAULT false, -- 认证标识
  view_count INTEGER DEFAULT 0, -- 曝光次数
  match_count INTEGER DEFAULT 0, -- 匹配次数
  order_count INTEGER DEFAULT 0, -- 成单次数
  rating DECIMAL(3,2) DEFAULT 0, -- 评分
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brand_vendors_user_id ON brand_vendors(user_id);
CREATE INDEX idx_brand_vendors_status ON brand_vendors(status);
CREATE INDEX idx_brand_vendors_priority_level ON brand_vendors(priority_level);
CREATE INDEX idx_brand_vendors_ranking_score ON brand_vendors(ranking_score DESC);
CREATE INDEX idx_brand_vendors_category ON brand_vendors(category);

COMMENT ON TABLE brand_vendors IS '品牌厂商表（入驻品牌）';
COMMENT ON COLUMN brand_vendors.priority_level IS '0=免费，1=白银，2=黄金，3=铂金';
COMMENT ON COLUMN brand_vendors.priority_expire_at IS '优先匹配权益过期时间';
COMMENT ON COLUMN brand_vendors.status IS '审核状态：pending/approved/rejected/suspended';

COMMIT;
