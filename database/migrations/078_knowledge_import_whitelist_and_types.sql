-- ============================================================
-- 078_knowledge_import_whitelist_and_types.sql
-- 资料中心导入配置增强：导入来源白名单 + 动态资料类型定义
-- ============================================================

-- ------------------------------------------------------------
-- 1. 导入来源白名单表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_import_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('wechat', 'email')),
  source_value TEXT NOT NULL,
  remark TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 同一来源类型 + 来源值唯一（去重）
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_import_whitelist_unique
  ON knowledge_import_whitelist(source_type, source_value);

CREATE INDEX IF NOT EXISTS idx_knowledge_import_whitelist_type
  ON knowledge_import_whitelist(source_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_import_whitelist_active
  ON knowledge_import_whitelist(source_type, is_active);

-- 更新时间自动维护
CREATE OR REPLACE FUNCTION update_knowledge_import_whitelist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_import_whitelist_updated_at
  ON knowledge_import_whitelist;

CREATE TRIGGER trg_knowledge_import_whitelist_updated_at
  BEFORE UPDATE ON knowledge_import_whitelist
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_import_whitelist_updated_at();

-- 该表仅由服务端 service_role 维护，普通用户/匿名用户不开放直接访问
ALTER TABLE knowledge_import_whitelist ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. 初始化动态资料类型定义（供导入配置页默认入库类型下拉使用）
--    不再写死在前端，而是从这里读取
-- ------------------------------------------------------------
INSERT INTO site_config (
  config_key,
  config_value,
  config_type,
  category,
  label,
  description,
  is_public
) VALUES (
  'knowledge_import_types',
  '[
    {"type":"document","label":"技术文档","description":"产品说明书、操作手册、维护指南等技术资料","icon":"FileText"},
    {"type":"case","label":"案例","description":"工程案例、项目案例","icon":"Briefcase"},
    {"type":"standard","label":"标准规范","description":"国标、行标、地标、企标等规范文件","icon":"Scale"},
    {"type":"drawing","label":"图纸图片","description":"CAD、工艺流程图、布置图、安装图等","icon":"Image"},
    {"type":"quota","label":"定额","description":"全国、地方、行业、企业定额","icon":"Calculator"}
  ]',
  'json',
  'knowledge',
  'knowledge_import_types',
  '知识库导入默认入库类型定义（动态）',
  false
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  config_type = EXCLUDED.config_type,
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_public = EXCLUDED.is_public;

-- ------------------------------------------------------------
-- 3. 初始化导入配置默认值（如尚未配置）
-- ------------------------------------------------------------
INSERT INTO site_config (
  config_key,
  config_value,
  config_type,
  category,
  label,
  description,
  is_public
) VALUES (
  'knowledge_import_config',
  '{
    "wechat_enabled": false,
    "wechat_secret": "",
    "wechat_auto_approve": false,
    "wechat_default_type": "document",
    "wechat_whitelist_enabled": false,
    "email_enabled": false,
    "email_secret": "",
    "email_auto_approve": false,
    "email_default_type": "document",
    "email_whitelist_enabled": false
  }',
  'json',
  'knowledge',
  'knowledge_import_config',
  '知识库导入配置（微信/邮件 webhook）',
  false
)
ON CONFLICT (config_key) DO NOTHING;
