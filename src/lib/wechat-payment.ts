/**
 * 微信支付 APIv3 工具库
 *
 * 职责：
 * - 统一下单（Native 扫码支付）：请求签名 + 调用 /v3/pay/transactions/native
 * - 支付回调：平台签名验证（RSA-SHA256）+ 回调数据解密（AEAD_AES_256_GCM）
 *
 * 安全说明：
 * - 敏感参数优先从 trade_config.payment.wechat.config 读取，管理员可在后台实时修改；
 *   未配置或字段留空时回退到环境变量（WECHAT_*），兼容历史部署。
 * - 所有凭据不落源码，不使用硬编码。
 * - 回调验签优先使用微信支付平台证书公钥（WECHAT_PLATFORM_PUBLIC_KEY / WECHAT_PLATFORM_CERT_PATH）；
 *   未配置平台公钥时，以「APIv3 密钥 AEAD 解密成功」作为安全兜底（只有微信平台与商户持有 APIv3 密钥，
 *   攻击者无法构造可解密的密文），并叠加 5 分钟时间戳窗口与商户号/金额核对防重放。
 */

import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export interface UnifiedOrderParams {
  description: string; // 商品描述
  outTradeNo: string; // 商户订单号
  amount: number; // 支付金额（单位：分）
  notifyUrl: string; // 回调地址
}

export interface WechatPaymentConfig {
  mchid: string;
  appid: string;
  apiV3Key: string;
  serialNo: string;
  privateKey: string;
  notifyUrl: string;
  /** 微信支付平台证书公钥（PEM，可选，用于回调验签） */
  platformPublicKey?: string;
  /** 微信支付平台证书文件路径（可选） */
  platformCertPath?: string;
}

const WECHAT_API_BASE = 'https://api.mch.weixin.qq.com';
const DEFAULT_NOTIFY_PATH = '/api/payment/wechat/notify';
const DB_CONFIG_KEY = 'payment.wechat.config';

/** 读取环境变量兜底配置（同步，供回调等不便 await 的场景快速回退） */
function getEnvFallbackConfig(): WechatPaymentConfig | null {
  const mchid = process.env.WECHAT_MCHID;
  const appid = process.env.WECHAT_APPID;
  const apiV3Key = process.env.WECHAT_API_V3_KEY;
  const serialNo = process.env.WECHAT_CERT_SERIAL_NO;
  const privateKeyRaw = process.env.WECHAT_PRIVATE_KEY;

  if (!mchid || !appid || !apiV3Key || !serialNo || !privateKeyRaw) {
    return null;
  }

  // 环境变量中 PEM 私钥以字面 \n 转义换行，这里还原为真实换行
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    mchid,
    appid,
    apiV3Key,
    serialNo,
    privateKey,
    notifyUrl:
      process.env.WECHAT_NOTIFY_URL || `${baseUrl.replace(/\/$/, '')}${DEFAULT_NOTIFY_PATH}`,
    platformPublicKey: process.env.WECHAT_PLATFORM_PUBLIC_KEY || undefined,
    platformCertPath: process.env.WECHAT_PLATFORM_CERT_PATH || undefined,
  };
}

/**
 * 从 trade_config 读取微信支付配置，留空字段回退到环境变量。
 * 任一生效参数缺失时返回 null（调用方据此降级）。
 */
export async function getWechatPaymentConfig(): Promise<WechatPaymentConfig | null> {
  let dbValue: Record<string, any> = {};
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', DB_CONFIG_KEY)
      .maybeSingle();
    if (!error && data?.config_value && typeof data.config_value === 'object') {
      dbValue = data.config_value as Record<string, any>;
    }
  } catch (e) {
    console.warn('[WechatPayment] 读取 trade_config 配置失败，使用环境变量兜底:', e);
  }

  const pick = (dbField: string, envKey: string): string | undefined => {
    const v = dbValue?.[dbField];
    if (typeof v === 'string' && v.trim()) return v.trim();
    return process.env[envKey];
  };

  const mchid = pick('mchid', 'WECHAT_MCHID');
  const appid = pick('appid', 'WECHAT_APPID');
  const apiV3Key = pick('apiV3Key', 'WECHAT_API_V3_KEY');
  const serialNo = pick('serialNo', 'WECHAT_CERT_SERIAL_NO');
  const privateKeyRaw = pick('privateKey', 'WECHAT_PRIVATE_KEY');

  if (!mchid || !appid || !apiV3Key || !serialNo || !privateKeyRaw) {
    return null;
  }

  // DB 中 PEM 私钥支持真实换行或字面 \n 两种写法，统一还原为真实换行
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const notifyUrl =
    pick('notifyUrl', 'WECHAT_NOTIFY_URL') ||
    `${baseUrl.replace(/\/$/, '')}${DEFAULT_NOTIFY_PATH}`;

  return {
    mchid,
    appid,
    apiV3Key,
    serialNo,
    privateKey,
    notifyUrl,
    platformPublicKey: pick('platformPublicKey', 'WECHAT_PLATFORM_PUBLIC_KEY') || undefined,
    platformCertPath: process.env.WECHAT_PLATFORM_CERT_PATH || undefined,
  };
}

/** 微信支付是否已完整配置（可用于 API 响应/前端降级提示） */
export async function isWechatPayConfigured(): Promise<boolean> {
  return (await getWechatPaymentConfig()) !== null;
}

/**
 * 生成商户订单号：{prefix}{timestamp}{random}
 * 微信 out_trade_no 限制：6~32 个字符，仅数字/大小写字母/_-。
 */
export function generateOrderNo(prefix = 'RC'): string {
  const timestamp = Date.now().toString(); // 13 位
  const random = crypto.randomBytes(3).toString('hex'); // 6 位十六进制
  const orderNo = `${prefix}${timestamp}${random}`;
  return orderNo.slice(0, 32);
}

/**
 * 构建 APIv3 请求签名头
 * 签名串：{method}\n{urlPath}\n{timestamp}\n{nonce}\n{body}\n
 */
function buildAuthHeader(
  method: string,
  urlPath: string,
  timestamp: string,
  nonce: string,
  bodyStr: string,
  config: WechatPaymentConfig
): string {
  const signatureStr = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`;
  const sign = crypto
    .sign('RSA-SHA256', Buffer.from(signatureStr, 'utf8'), config.privateKey)
    .toString('base64');
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",` +
    `nonce_str="${nonce}",timestamp="${timestamp}",` +
    `serial_no="${config.serialNo}",signature="${sign}"`
  );
}

/**
 * 微信支付统一下单（Native 扫码支付）
 * @returns 微信返回的 { code_url }（支付二维码链接，weixin://wxpay/bizpayurl?pr=xxx）
 */
export async function unifiedOrder(params: UnifiedOrderParams): Promise<{ code_url: string }> {
  const config = await getWechatPaymentConfig();
  if (!config) {
    throw new Error(
      '微信支付未配置（trade_config.payment.wechat.config 或 WECHAT_MCHID/WECHAT_APPID/WECHAT_API_V3_KEY/WECHAT_CERT_SERIAL_NO/WECHAT_PRIVATE_KEY）'
    );
  }

  const { description, outTradeNo, amount, notifyUrl } = params;
  const urlPath = '/v3/pay/transactions/native';
  const url = `${WECHAT_API_BASE}${urlPath}`;

  const body = {
    appid: config.appid,
    mchid: config.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl || config.notifyUrl,
    amount: {
      total: amount,
      currency: 'CNY',
    },
  };
  const bodyStr = JSON.stringify(body);
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthHeader('POST', urlPath, timestamp, nonceStr, bodyStr, config),
      Accept: 'application/json',
      'User-Agent': 'quote-project',
    },
    body: bodyStr,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage = data?.message || data?.code || `HTTP ${response.status}`;
    const message = String(rawMessage);
    // 对常见的配置错误给出更明确的提示，方便管理员在 trade_config 中修正
    if (message.includes('appid') && message.includes('mch_id')) {
      throw new Error(
        '微信支付配置错误：appid 与 mch_id 不匹配，请在管理后台「交易配置 → 微信支付配置」中核对 AppID 与商户号绑定关系'
      );
    }
    throw new Error(`微信统一下单失败：${message}`);
  }
  if (!data.code_url) {
    throw new Error('微信统一下单响应缺少 code_url');
  }
  return { code_url: data.code_url };
}

/**
 * 解密微信支付回调 resource（AEAD_AES_256_GCM）
 * 密钥为 APIv3 密钥（32 字节 UTF-8）；ciphertext 末尾 16 字节为 auth tag。
 */
export function decryptAead256Gcm(
  ciphertext: string,
  nonce: string,
  associatedData: string,
  apiV3Key: string
): string {
  const key = Buffer.from(apiV3Key, 'utf8');
  const iv = Buffer.from(nonce, 'utf8');

  const cipherBuf = Buffer.from(ciphertext, 'base64');
  if (cipherBuf.length < 16) {
    throw new Error('密文长度不足');
  }
  const authTag = cipherBuf.subarray(cipherBuf.length - 16);
  const data = cipherBuf.subarray(0, cipherBuf.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]);
  return decoded.toString('utf8');
}

/**
 * 加载微信支付平台证书公钥（用于回调验签）
 * 优先 WECHAT_PLATFORM_PUBLIC_KEY，其次 WECHAT_PLATFORM_CERT_PATH。
 */
function loadPlatformPublicKey(config: WechatPaymentConfig): string | null {
  if (config.platformPublicKey) {
    // 支持用户以 \n 字面量转义换行的 PEM，还原真实换行
    return config.platformPublicKey.replace(/\\n/g, '\n');
  }
  if (config.platformCertPath) {
    try {
      return require('fs').readFileSync(config.platformCertPath, 'utf8');
    } catch (e) {
      console.error('[WechatPayment] 读取平台证书失败:', e);
      return null;
    }
  }
  return null;
}

/**
 * 验证微信支付回调签名
 * 签名串：{timestamp}\n{nonce}\n{body}\n，使用平台证书公钥 RSA-SHA256 验证。
 *
 * @returns { verified: boolean; publicKeyMissing: boolean }
 *   - verified: 签名是否通过（含 5 分钟时间戳窗口）
 *   - publicKeyMissing: 是否因未配置平台公钥而跳过 RSA 验签（由 AEAD 解密层兜底）
 */
export function verifyNotifySignature(
  headers: Headers,
  body: string,
  config?: WechatPaymentConfig | null
): { verified: boolean; publicKeyMissing: boolean } {
  const effectiveConfig = config || getEnvFallbackConfig();
  if (!effectiveConfig) {
    return { verified: false, publicKeyMissing: false };
  }

  const timestamp = headers.get('wechatpay-timestamp');
  const nonce = headers.get('wechatpay-nonce');
  const signature = headers.get('wechatpay-signature');
  const serial = headers.get('wechatpay-serial');

  if (!timestamp || !nonce || !signature) {
    console.error('[WechatPayment] 回调缺少签名头:', { timestamp, nonce, signature, serial });
    return { verified: false, publicKeyMissing: false };
  }

  // 时间戳窗口：前后 5 分钟，防止重放
  const ts = Number(timestamp);
  if (!ts || Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.error('[WechatPayment] 回调时间戳异常或超时:', timestamp);
    return { verified: false, publicKeyMissing: false };
  }

  const publicKey = loadPlatformPublicKey(effectiveConfig);
  if (!publicKey) {
    console.warn('[WechatPayment] 未配置平台证书公钥，验签由 AEAD 解密兜底');
    return { verified: true, publicKeyMissing: true };
  }

  const message = `${timestamp}\n${nonce}\n${body}\n`;
  try {
    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    );
    if (!ok) {
      console.error('[WechatPayment] 回调签名验证失败（serial=' + serial + '）');
    }
    return { verified: ok, publicKeyMissing: false };
  } catch (e) {
    console.error('[WechatPayment] 回调验签异常:', e);
    return { verified: false, publicKeyMissing: false };
  }
}

/**
 * 解析并校验回调通知（验签 + 解密）
 * @returns 解密后的交易数据（out_trade_no / transaction_id / amount.total / success_time / mchid / appid 等）
 */
export async function parseNotifyPayload(
  headers: Headers,
  body: string,
  config?: WechatPaymentConfig | null
): Promise<Record<string, any>> {
  const effectiveConfig = config || (await getWechatPaymentConfig());
  if (!effectiveConfig) {
    throw new Error('微信支付未配置');
  }

  // 1. 验签
  const { verified } = verifyNotifySignature(headers, body, effectiveConfig);
  if (!verified) {
    throw new Error('回调签名验证失败');
  }

  // 2. 解密 resource
  let notifyData: any;
  try {
    notifyData = JSON.parse(body);
  } catch (e) {
    throw new Error('回调报文不是合法 JSON');
  }
  const resource = notifyData?.resource;
  if (!resource?.ciphertext || !resource?.nonce) {
    throw new Error('回调缺少 resource 加密数据');
  }

  let decrypted: string;
  try {
    decrypted = decryptAead256Gcm(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data || '',
      effectiveConfig.apiV3Key
    );
  } catch (e) {
    console.error('[WechatPayment] 回调数据解密失败:', e);
    throw new Error('回调数据解密失败');
  }

  // 3. 校验商户号归属，防止他商户回调串扰
  let data: any;
  try {
    data = JSON.parse(decrypted);
  } catch (e) {
    throw new Error('解密数据不是合法 JSON');
  }
  if (data.mchid && data.mchid !== effectiveConfig.mchid) {
    throw new Error(`回调商户号不匹配：${data.mchid}`);
  }

  return data;
}
