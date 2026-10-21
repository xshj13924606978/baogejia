-- ============================================================
-- 迁移: 121_wechat_pay_db_config
-- 说明: 微信支付配置迁移至 trade_config（#[20260831-1648]）
-- 微信支付 APIv3 凭据（appid / mchid / 私钥 / 证书 / 回调地址等）
-- 从硬编码 .env 迁移到 trade_config 持久化存储，管理员可在
-- 「管理后台 / 交易配置」实时修改并立即生效。
--
-- 读取顺序（src/lib/wechat-payment.ts）：
--   1) trade_config.payment.wechat.config（字段非空则优先使用）
--   2) 缺失字段 fallback 到 process.env（WECHAT_* 兼容历史配置）
--
-- 字段说明：
--   appid            商户绑定的公众号/小程序 AppID
--   mchid            商户号
--   apiV3Key         APIv3 密钥（32 位）
--   serialNo         商户证书序列号
--   privateKey       商户 API 私钥（PEM，支持 \n 转义换行）
--   notifyUrl        回调地址（留空则用 BASE_URL + /api/payment/wechat/notify）
--   platformPublicKey 微信支付平台证书公钥（PEM，可选，回调验签用）
-- ============================================================

INSERT INTO trade_config (config_key, config_value, config_type, description, category) VALUES
  (
    'payment.wechat.config',
    jsonb_build_object(
      'appid', '',
      'mchid', '',
      'apiV3Key', '',
      'serialNo', '',
      'privateKey', '',
      'notifyUrl', '',
      'platformPublicKey', ''
    ),
    'json',
    '微信支付 APIv3 配置（appid/mchid/APIv3 密钥/证书序列号/商户私钥/回调地址/平台证书公钥），修改后实时生效；留空的字段会自动回退到 .env 的 WECHAT_* 兼容历史配置',
    'payment'
  )
ON CONFLICT (config_key) DO NOTHING;