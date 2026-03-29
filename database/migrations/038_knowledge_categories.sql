-- ============================================================
-- 038_knowledge_categories.sql
-- 资料中心分类管理 - 分类表创建 + 默认数据初始化
-- ============================================================

-- 1. 创建分类表
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,              -- document, case, standard, drawing, quota
  name VARCHAR(100) NOT NULL,             -- 分类名称
  name_en VARCHAR(100),                   -- 英文名称
  icon VARCHAR(50),                       -- 图标
  metadata_key VARCHAR(50) NOT NULL,      -- 对应 knowledge_entries.metadata 中的 key
  sort_order INTEGER DEFAULT 0,           -- 排序
  is_default BOOLEAN DEFAULT false,       -- 系统默认分类（不可删除）
  is_active BOOLEAN DEFAULT true,         -- 是否启用
  created_by UUID,                        -- 创建者
  status VARCHAR(20) DEFAULT 'approved',  -- pending/approved/rejected
  reject_reason TEXT,                     -- 拒绝原因
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_type ON knowledge_categories(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_status ON knowledge_categories(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_type_active ON knowledge_categories(type, is_active, status);

-- 2. 初始化默认分类（与现有硬编码保持一致）
-- 技术文档库 (metadata_key = 'category')
INSERT INTO knowledge_categories (type, name, metadata_key, sort_order, is_default, status) VALUES
  ('document', '产品说明书', 'category', 1, true, 'approved'),
  ('document', '技术文档', 'category', 2, true, 'approved'),
  ('document', '操作手册', 'category', 3, true, 'approved'),
  ('document', '维护指南', 'category', 4, true, 'approved'),
  ('document', '其他', 'category', 5, true, 'approved');

-- 案例库 (metadata_key = 'project_type')
INSERT INTO knowledge_categories (type, name, metadata_key, sort_order, is_default, status) VALUES
  ('case', '污水处理', 'project_type', 1, true, 'approved'),
  ('case', '供水工程', 'project_type', 2, true, 'approved'),
  ('case', '设备安装', 'project_type', 3, true, 'approved'),
  ('case', '工业废水', 'project_type', 4, true, 'approved'),
  ('case', '给排水', 'project_type', 5, true, 'approved'),
  ('case', '其他', 'project_type', 6, true, 'approved');

-- 标准规范库 (metadata_key = 'standard_type')
INSERT INTO knowledge_categories (type, name, metadata_key, sort_order, is_default, status) VALUES
  ('standard', '国标', 'standard_type', 1, true, 'approved'),
  ('standard', '行标', 'standard_type', 2, true, 'approved'),
  ('standard', '地标', 'standard_type', 3, true, 'approved'),
  ('standard', '企标', 'standard_type', 4, true, 'approved');

-- 图纸图片库 (metadata_key = 'drawing_type')
INSERT INTO knowledge_categories (type, name, metadata_key, sort_order, is_default, status) VALUES
  ('drawing', 'CAD', 'drawing_type', 1, true, 'approved'),
  ('drawing', '工艺流程图', 'drawing_type', 2, true, 'approved'),
  ('drawing', '布置图', 'drawing_type', 3, true, 'approved'),
  ('drawing', '安装图', 'drawing_type', 4, true, 'approved'),
  ('drawing', '其他', 'drawing_type', 5, true, 'approved');

-- 定额库 (metadata_key = 'quota_type')
INSERT INTO knowledge_categories (type, name, metadata_key, sort_order, is_default, status) VALUES
  ('quota', '全国', 'quota_type', 1, true, 'approved'),
  ('quota', '地方', 'quota_type', 2, true, 'approved'),
  ('quota', '行业', 'quota_type', 3, true, 'approved'),
  ('quota', '企业', 'quota_type', 4, true, 'approved');

-- 3. RLS 策略
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;

-- 所有人可读取已审核+启用的分类
CREATE POLICY "Anyone can view active approved categories"
  ON knowledge_categories FOR SELECT
  USING (is_active = true AND status = 'approved');

-- 登录用户可读取自己的待审核申请
CREATE POLICY "Users can view their own pending categories"
  ON knowledge_categories FOR SELECT
  USING (auth.uid() = created_by);

-- 登录用户可申请新分类
CREATE POLICY "Authenticated users can create categories"
  ON knowledge_categories FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 超管可编辑/删除/审核所有分类
CREATE POLICY "Super admins can update all categories"
  ON knowledge_categories FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));

CREATE POLICY "Super admins can delete all categories"
  ON knowledge_categories FOR DELETE
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));
