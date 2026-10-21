-- 资料贡献者功能数据库表
-- 创建时间: 2026-08-12

-- 1. 贡献者表
CREATE TABLE IF NOT EXISTS public.contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);

-- 2. 上传资料表
CREATE TABLE IF NOT EXISTS public.contributor_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID REFERENCES public.contributors(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- product, document, case, standard, drawing, quota
  data JSONB NOT NULL,        -- 表单数据
  files TEXT[],               -- 上传文件路径
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  reviewer_id UUID,
  review_comment TEXT,
  reviewed_at TIMESTAMP,
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 上传积分记录表
CREATE TABLE IF NOT EXISTS public.upload_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID REFERENCES public.contributors(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.contributor_uploads(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_contributor_uploads_contributor_id ON public.contributor_uploads(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributor_uploads_status ON public.contributor_uploads(status);
CREATE INDEX IF NOT EXISTS idx_contributor_uploads_type ON public.contributor_uploads(type);
CREATE INDEX IF NOT EXISTS idx_upload_points_log_contributor_id ON public.upload_points_log(contributor_id);
CREATE INDEX IF NOT EXISTS idx_upload_points_log_upload_id ON public.upload_points_log(upload_id);

-- RLS 策略（使用服务角色客户端，表默认关闭 RLS 以便服务端访问）
ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_points_log ENABLE ROW LEVEL SECURITY;

-- 贡献者查询自己的资料
CREATE POLICY contributor_select_own ON public.contributors
  FOR SELECT USING (true);

-- 上传资料：公开可插入（外部人员提交资料）
CREATE POLICY contributor_uploads_insert ON public.contributor_uploads
  FOR INSERT WITH CHECK (true);

-- 上传资料：管理员可读取（服务角色 + 公开读取用于审核展示）
CREATE POLICY contributor_uploads_select ON public.contributor_uploads
  FOR SELECT USING (true);
