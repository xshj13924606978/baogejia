-- ============================================================================
-- 084_data_persistence_quota_prices.sql
-- 数据持久化与动态关联架构（#[20260827-1030]-7 最终版）
-- 产品价格库 / 定额库 / 公司信息库 / 方案历史记录
--
-- 价格查询优先级（用户确认的决策链路）：
--   1️⃣ 产品价格库（product_prices，用户自建/历史成交价）→ 最优先
--   2️⃣ 定额库（quota_prices，国家/行业规范定额价格）→ 次优先
--   3️⃣ 联网搜索（实时市场价）→ 备选
--   4️⃣ 规则估算（内置经验值）→ 兜底，标注"估算价，待核实"
--
-- 说明：
--   - 客户资料库沿用既有 customers 表（id/company_name/contact_person/phone/
--     email/address/bank_name/bank_account/tax_number/metadata(user_id,deleted_at)），
--     不重复建表，仅由 customer-service 封装访问。
--   - 资料库沿用既有 knowledge_entries 表（pgvector 全文/向量检索），
--     本迁移仅新增兼容视图 knowledge_assets，避免双份存储。
--   - 每条语句独立执行（exec_sql RPC 不支持事务块）。
-- ============================================================================

-- 1. 产品价格库（用户自建，最优先）
CREATE TABLE IF NOT EXISTS public.product_prices (
  id BIGSERIAL PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  model VARCHAR(100),
  category VARCHAR(50),
  brand VARCHAR(100),
  spec TEXT,
  price DECIMAL(12,2) NOT NULL,
  unit VARCHAR(20) DEFAULT '台',
  price_date DATE DEFAULT CURRENT_DATE,
  source VARCHAR(100),
  user_id VARCHAR(64),
  is_active BOOLEAN DEFAULT true,
  remark TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_prices_name ON public.product_prices(product_name);
CREATE INDEX IF NOT EXISTS idx_product_prices_user ON public.product_prices(user_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_model ON public.product_prices(model);

-- 2. 定额库（国家/行业规范定额价格）
CREATE TABLE IF NOT EXISTS public.quota_prices (
  id BIGSERIAL PRIMARY KEY,
  quota_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  model VARCHAR(100),
  category VARCHAR(50),
  spec TEXT,
  price DECIMAL(12,2) NOT NULL,
  unit VARCHAR(20) DEFAULT '台',
  quota_year INT,
  standard_name VARCHAR(200),
  standard_code VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  remark TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quota_prices_name ON public.quota_prices(product_name);
CREATE INDEX IF NOT EXISTS idx_quota_prices_code ON public.quota_prices(quota_code);

-- 3. 公司信息库（供方信息，一个用户一个默认公司）
CREATE TABLE IF NOT EXISTS public.company_info (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  tax_id VARCHAR(50),
  bank_name VARCHAR(100),
  bank_account VARCHAR(50),
  website VARCHAR(200),
  logo_url VARCHAR(255),
  is_default BOOLEAN DEFAULT true,
  user_id VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_info_user ON public.company_info(user_id);

-- 4. 方案历史记录（可追溯、可版本管理）
CREATE TABLE IF NOT EXISTS public.proposal_history (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64),
  customer_name VARCHAR(200),
  project_type VARCHAR(100),
  capacity DECIMAL(10,2),
  total_price DECIMAL(12,2),
  content TEXT,
  data_sources JSONB DEFAULT '[]'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'draft',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposal_history_user ON public.proposal_history(user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_history_created ON public.proposal_history(created_at DESC);

-- 5. 资料库兼容视图（映射到既有 knowledge_entries，避免双份存储）
--    knowledge_entries 实际无 source/category/is_public 列，按语义映射：
--      source    → file_type（文件类型，如 pdf/docx）
--      category  → type（price/document/case/standard/drawing/quota/other）
--      is_public → status = 'approved'（审核通过即视为公开）
--    注：本视图仅供只读查询；如需写入请直接操作 knowledge_entries 表。
DROP VIEW IF EXISTS public.knowledge_assets;
CREATE VIEW public.knowledge_assets AS
SELECT
  id::text AS id,
  title,
  content_text AS content,
  file_type::text AS source,
  type AS category,
  keywords,
  summary,
  metadata,
  user_id::text AS user_id,
  (status = 'approved') AS is_public,
  storage_path,
  storage_bucket,
  created_at,
  updated_at
FROM public.knowledge_entries;
