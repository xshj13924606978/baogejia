-- 添加微信相关字段到 users 表，支持微信绑定与登录功能
-- 创建时间: 2026-08-08

ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_unionid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_nickname TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_avatar TEXT;
