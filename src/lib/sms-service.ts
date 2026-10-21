/**
 * 短信发送服务
 *
 * 通过环境变量切换发送渠道（SMS_PROVIDER）：
 * - mock（默认，开发调试）：不真实发送，验证码打印到服务端日志；
 *   当 SMS_MOCK_RETURN_CODE=true 且非生产环境时，验证码随 API 响应返回，便于本地联调
 * - aliyun：阿里云短信（dysmsapi.aliyuncs.com，RPC 签名 HMAC-SHA1）
 * - tencent：腾讯云短信（sms.tencentcloudapi.com，TC3-HMAC-SHA256）
 *
 * 环境变量兼容双前缀（腾讯云 TENCENT_SMS_* 优先，SMS_* 兼容）：
 * - TENCENT_SMS_*：TENCENT_SMS_SECRET_ID / TENCENT_SMS_SECRET_KEY /
 *   TENCENT_SMS_SDK_APP_ID / TENCENT_SMS_SIGN_NAME（签名内容，如「兴燊环境技术深圳」）/
 *   TENCENT_SMS_TEMPLATE_ID（验证码模板）/ TENCENT_SMS_NOTIFY_TEMPLATE_ID（注册成功通知模板）
 * - SMS_*：SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME /
 *   SMS_TEMPLATE_CODE / SMS_SDK_APP_ID / SMS_NOTIFY_TEMPLATE_CODE
 *
 * 所有敏感配置均从环境变量读取，禁止硬编码。
 * 生产环境若要真正防虚假注册，必须配置阿里云或腾讯云短信渠道。
 */
import { createHash, createHmac, randomBytes } from 'crypto';

/** 依次取第一个非空环境变量（用于 TENCENT_SMS_* / SMS_* 双前缀兼容，前者优先） */
function pickEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return '';
}

const SMS_PROVIDER = (pickEnv('SMS_PROVIDER', 'TENCENT_SMS_PROVIDER') || 'mock').toLowerCase();
const ACCESS_KEY_ID = pickEnv('TENCENT_SMS_SECRET_ID', 'SMS_ACCESS_KEY_ID');
const ACCESS_KEY_SECRET = pickEnv('TENCENT_SMS_SECRET_KEY', 'SMS_ACCESS_KEY_SECRET');
// 腾讯云 SignName 参数要求签名内容（非签名 ID），如「兴燊环境技术深圳」
const SIGN_NAME = pickEnv('TENCENT_SMS_SIGN_NAME', 'SMS_SIGN_NAME');
const TEMPLATE_CODE = pickEnv('TENCENT_SMS_TEMPLATE_ID', 'SMS_TEMPLATE_CODE'); // 验证码模板
const NOTIFY_TEMPLATE_CODE = pickEnv('TENCENT_SMS_NOTIFY_TEMPLATE_ID', 'SMS_NOTIFY_TEMPLATE_CODE'); // 注册成功通知模板
const SDK_APP_ID = pickEnv('TENCENT_SMS_SDK_APP_ID', 'SMS_SDK_APP_ID'); // 腾讯云专用
const REGION = pickEnv('SMS_REGION') || 'cn-hangzhou'; // 阿里云专用
const MOCK_RETURN_CODE = pickEnv('SMS_MOCK_RETURN_CODE') === 'true';

export interface SendSmsVerificationCodeResult {
  success: boolean;
  provider: string;
  /** mock 模式（非生产 + SMS_MOCK_RETURN_CODE=true）时返回验证码 */
  mockReturnCode?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// 阿里云：RPC 签名（HMAC-SHA1）
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function aliyunSign(params: Record<string, string>): string {
  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const stringToSign = `POST&%2F&${percentEncode(canonicalizedQuery)}`;
  return createHmac('sha1', `${ACCESS_KEY_SECRET}&`)
    .update(stringToSign, 'utf8')
    .digest('base64');
}

async function sendByAliyun(phone: string, templateCode: string, templateParam?: string): Promise<void> {
  const params: Record<string, string> = {
    AccessKeyId: ACCESS_KEY_ID,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: REGION,
    SignName: SIGN_NAME,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomBytes(16).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  };
  // 模板含占位符时传参数（如验证码模板 {code}），无变量模板不传
  if (templateParam) params.TemplateParam = JSON.stringify({ code: templateParam });
  params.Signature = aliyunSign(params);

  const body = new URLSearchParams(params).toString();
  const res = await fetch('https://dysmsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { Code?: string; Message?: string };
  if (data.Code !== 'OK') {
    throw new Error(`阿里云短信发送失败: ${data.Code || res.status} ${data.Message || ''}`);
  }
}

// ---------------------------------------------------------------------------
// 腾讯云：TC3-HMAC-SHA256 签名
// ---------------------------------------------------------------------------

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

async function sendByTencent(phone: string, templateId: string, templateParams: string[]): Promise<void> {
  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const version = '2019-07-11';
  const action = 'SendSms';
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000);
  const date = now.toISOString().slice(0, 10);

  const payloadBody: Record<string, unknown> = {
    PhoneNumberSet: [`+86${phone}`],
    // 腾讯云 API 参数名为 SmsSdkAppid（小写 d），大小写敏感
    SmsSdkAppid: SDK_APP_ID,
    // 腾讯云 API 签名参数名为 Sign（非 SignName），大小写敏感；国内短信必填
    Sign: SIGN_NAME,
    // 腾讯云 API 参数名为 TemplateID（全大写），大小写敏感
    TemplateID: templateId,
  };
  // 模板含占位符时传参数（如验证码模板 {1}），无变量模板（如通知短信）不传
  if (templateParams.length > 0) payloadBody.TemplateParamSet = templateParams;
  const payload = JSON.stringify(payloadBody);

  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${sha256Hex(canonicalRequest)}`;

  const secretDate = hmacSha256(`TC3${ACCESS_KEY_SECRET}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${date}/${service}/tc3_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
    },
    body: payload,
  });

  const data = (await res.json().catch(() => ({}))) as {
    Response?: {
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  if (data.Response?.Error) {
    throw new Error(`腾讯云短信发送失败: ${data.Response.Error.Code} ${data.Response.Error.Message}`);
  }
  // 腾讯云 SendSms 在签名/模板未过审、号码频率受限、黑名单等场景返回 HTTP 200
  // 且 Response 无 Error，但 SendStatusSet[].Code 非 'Ok'——必须检查，
  // 否则会误判成功（返回 success），前端显示"已发送"而用户收不到短信
  const sendStatusSet = data.Response?.SendStatusSet ?? [];
  const failedStatus = sendStatusSet.find((s) => s.Code && s.Code !== 'Ok');
  if (failedStatus) {
    throw new Error(
      `腾讯云短信发送失败: ${failedStatus.Code} ${failedStatus.Message || ''}`
    );
  }
}

// ---------------------------------------------------------------------------
// Mock 模式（开发调试）
// ---------------------------------------------------------------------------

async function sendByMock(phone: string, code: string): Promise<string | undefined> {
  console.log(`[SMS-MOCK] 向 ${phone} 发送验证码：${code}`);
  const isProd = process.env.NODE_ENV === 'production';
  // 生产环境绝不把验证码随响应返回
  return !isProd && MOCK_RETURN_CODE ? code : undefined;
}

// ---------------------------------------------------------------------------
// 统一入口
// ---------------------------------------------------------------------------

export async function sendSmsVerificationCode(
  phone: string,
  code: string
): Promise<SendSmsVerificationCodeResult> {
  try {
    if (SMS_PROVIDER === 'aliyun') {
      if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !SIGN_NAME || !TEMPLATE_CODE) {
        throw new Error('阿里云短信配置缺失（SMS_ACCESS_KEY_ID/SMS_ACCESS_KEY_SECRET/SMS_SIGN_NAME/SMS_TEMPLATE_CODE）');
      }
      await sendByAliyun(phone, TEMPLATE_CODE, code);
      return { success: true, provider: 'aliyun' };
    }

    if (SMS_PROVIDER === 'tencent') {
      if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !SIGN_NAME || !TEMPLATE_CODE || !SDK_APP_ID) {
        throw new Error('腾讯云短信配置缺失（TENCENT_SMS_SECRET_ID/TENCENT_SMS_SECRET_KEY/TENCENT_SMS_SIGN_NAME/TENCENT_SMS_TEMPLATE_ID/TENCENT_SMS_SDK_APP_ID）');
      }
      await sendByTencent(phone, TEMPLATE_CODE, [code]);
      return { success: true, provider: 'tencent' };
    }

    // 默认 mock
    const mockReturnCode = await sendByMock(phone, code);
    return { success: true, provider: 'mock', mockReturnCode };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '短信发送失败';
    console.error('[SMS] 短信发送失败:', message);
    return { success: false, provider: SMS_PROVIDER, error: message };
  }
}

// ---------------------------------------------------------------------------
// 注册成功通知短信（模板通常无占位符）
// ---------------------------------------------------------------------------

export interface SendSmsNotificationResult {
  success: boolean;
  provider: string;
  /** 未配置通知模板/通道密钥时标记跳过，便于调用方区分「未配置」与「发送失败」 */
  skipped?: boolean;
  error?: string;
}

/**
 * 注册成功通知短信
 * - tencent/aliyun：真实下发（模板 ID 由 TENCENT_SMS_NOTIFY_TEMPLATE_ID / SMS_NOTIFY_TEMPLATE_CODE 读取）
 * - mock：仅打印日志、不真实发送（返回 success，不阻塞业务流程）
 */
export async function sendSmsNotification(phone: string): Promise<SendSmsNotificationResult> {
  try {
    if (SMS_PROVIDER === 'tencent') {
      if (!NOTIFY_TEMPLATE_CODE) {
        return { success: false, provider: 'tencent', skipped: true, error: '通知短信模板未配置（TENCENT_SMS_NOTIFY_TEMPLATE_ID/SMS_NOTIFY_TEMPLATE_CODE）' };
      }
      if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !SIGN_NAME || !SDK_APP_ID) {
        return { success: false, provider: 'tencent', skipped: true, error: '腾讯云短信配置缺失（TENCENT_SMS_SECRET_ID/TENCENT_SMS_SECRET_KEY/TENCENT_SMS_SIGN_NAME/TENCENT_SMS_SDK_APP_ID）' };
      }
      await sendByTencent(phone, NOTIFY_TEMPLATE_CODE, []);
      return { success: true, provider: 'tencent' };
    }

    if (SMS_PROVIDER === 'aliyun') {
      if (!NOTIFY_TEMPLATE_CODE) {
        return { success: false, provider: 'aliyun', skipped: true, error: '通知短信模板未配置（SMS_NOTIFY_TEMPLATE_CODE）' };
      }
      await sendByAliyun(phone, NOTIFY_TEMPLATE_CODE);
      return { success: true, provider: 'aliyun' };
    }

    // mock：仅记录日志，不真实发送
    console.log(`[SMS-MOCK] 向 ${phone} 发送注册成功通知短信`);
    return { success: true, provider: 'mock' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '通知短信发送失败';
    console.error('[SMS] 通知短信发送失败:', message);
    return { success: false, provider: SMS_PROVIDER, error: message };
  }
}
