-- ============================================================
-- 050: 资料中心积分扣费配置 + 积分分成记录
-- 需求：#20260816001 资料中心权限控制与积分分成机制
-- 积分扣费规则：技术文档下载 10 / 标准规范下载 10 / 图纸图片下载 15 / 定额库查看详情 5
-- 积分分成：下载者扣积分 70% 给上传者、30% 归平台（比例可后台配置）
-- ============================================================

-- 1. 积分扣费配置表
--    resource_type: document(技术文档) / standard(标准规范) / drawing(图纸图片) / quota(定额库)
--    action_type:   download(下载) / view(查看详情)
--    role:          NULL=所有角色通用；否则按角色覆盖（free/vip/premium/admin/...）
CREATE TABLE IF NOT EXISTS points_download_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(20)  NOT NULL,
    action_type   VARCHAR(20)  NOT NULL DEFAULT 'download',
    role          VARCHAR(30)  DEFAULT NULL,
    cost          INTEGER      NOT NULL DEFAULT 0,
    is_enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
    description   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 同一资源类型/动作下，每种角色仅允许一条配置（NULL role 表示全局默认）
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_download_config ON points_download_config (resource_type, action_type, COALESCE(role, ''));

-- 2. 积分分成记录表（每次资料下载/查看详情产生的分成流水）
CREATE TABLE IF NOT EXISTS points_split_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type       VARCHAR(20)  NOT NULL,
    resource_id         UUID         NOT NULL,             -- knowledge_entries.id
    action_type         VARCHAR(20)  NOT NULL DEFAULT 'download',
    uploader_id         UUID         NOT NULL,             -- 上传者 users.id
    downloader_id       UUID         DEFAULT NULL,         -- 消费方 users.id
    total_points        INTEGER      NOT NULL,             -- 本次扣费积分数
    creator_share       INTEGER      NOT NULL,             -- 上传者分成积分
    platform_share      INTEGER      NOT NULL,             -- 平台分成积分
    creator_share_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.7000,
    platform_share_rate NUMERIC(5,4) NOT NULL DEFAULT 0.3000,
    split_reference_id  VARCHAR(160) UNIQUE,               -- 幂等键 split:{downloaderId}:{entryId}:{action}
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_split_records_uploader   ON points_split_records (uploader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_split_records_resource   ON points_split_records (resource_id);
CREATE INDEX IF NOT EXISTS idx_points_download_config_enabled  ON points_download_config (resource_type, action_type, is_enabled);

-- 3. 默认扣费配置（按资源类型）
INSERT INTO points_download_config (resource_type, action_type, role, cost, description) VALUES
    ('document', 'download', NULL, 10, '技术文档下载积分数'),
    ('standard', 'download', NULL, 10, '标准规范下载积分数'),
    ('drawing',  'download', NULL, 15, '图纸图片下载积分数'),
    ('quota',    'view',     NULL,  5, '定额库查看详情积分数'),
    ('quota',    'download', NULL,  0, '定额库下载积分数（查看详情已扣费，下载免费）')
ON CONFLICT (resource_type, action_type, COALESCE(role, '')) DO NOTHING;

-- 4. 分成比例配置（写入 site_config，后台可改，实时生效）
INSERT INTO site_config (config_key, config_value, config_type, category, label, description, is_public) VALUES
    ('points_split_creator_rate',  '0.7', 'number', 'points', '上传者分成比例', '资料被下载/查看时，上传者获得的积分分成比例（默认 0.7）', FALSE),
    ('points_split_platform_rate', '0.3', 'number', 'points', '平台分成比例', '资料被下载/查看时，平台获得的积分分成比例（默认 0.3）', FALSE)
ON CONFLICT (config_key) DO NOTHING;
