-- 062_contributor_duplicate_configs.sql
-- 贡献中心非产品资料库（技术文档库/案例库/标准规范库/图纸图片库/定额库）批量导入判重配置
-- 目的：让 5 个非产品资料库在贡献中心批量导入时，与产品价格库一致具备判重能力。
-- 判重规则存数据库，可管理，不硬编码。

CREATE TABLE IF NOT EXISTS contributor_duplicate_configs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL UNIQUE,
  duplicate_fields TEXT[] NOT NULL DEFAULT '{}',
  field_labels JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contributor_duplicate_configs IS '贡献中心各资料类型的批量导入判重配置（与产品价格库判重逻辑对齐）';
COMMENT ON COLUMN contributor_duplicate_configs.duplicate_fields IS '判重字段列表，全部相等则视为重复资料';
COMMENT ON COLUMN contributor_duplicate_configs.field_labels IS '判重字段的中文标签映射，用于规则描述展示';

-- Seed 初始判重配置（真实业务规则）
INSERT INTO contributor_duplicate_configs (type, duplicate_fields, field_labels)
VALUES
  ('document', ARRAY['doc_title', 'doc_type'], '{"doc_title":"文档标题","doc_type":"文档类型"}'),
  ('case',     ARRAY['case_name', 'industry'], '{"case_name":"案例名称","industry":"行业类型"}'),
  ('standard', ARRAY['standard_no'], '{"standard_no":"标准编号"}'),
  ('drawing',  ARRAY['drawing_no'], '{"drawing_no":"图纸编号"}'),
  ('quota',    ARRAY['quota_no'], '{"quota_no":"定额编号"}')
ON CONFLICT (type) DO NOTHING;
