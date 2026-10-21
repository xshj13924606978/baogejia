/**
 * 支付宝单笔转账到账（alipay.fund.trans.toaccount.transfer）
 *
 * 文档: https://opendocs.alipay.com/open/028w1l
 *
 * 所需环境变量：
 *   ALIPAY_APP_ID            应用 AppID
 *   ALIPAY_PRIVATE_KEY       应用私钥（PEM 或 PKCS8 base64）
 *   ALIPAY_PUBLIC_KEY        支付宝公钥（用于验签）
 *   ALIPAY_GATEWAY           网关地址（默认 https://openapi.alipay.com/gateway.do）
 *
 * 说明：未配置完整凭据时 isAlipayTransferConfigured() 返回 false，
 * 上层应提示「支付宝打款未配置」并引导管理员走手动打款登记流程。
 */

import crypto from 'crypto';
import https from 'https';

export interface AlipayTransferParams {
  account: string; // 收款支付宝账号（手机号/邮箱）
  accountName?: string; // 收款人真实姓名（可选，实名校验）
  amountYuan: number; // 转账金额（元，精确到分）
  outBizNo: string; // 商户转账唯一单号
  remark?: string; // 转账备注
}

export interface AlipayTransferResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

interface AlipayTransferConfig {
  appId: string;
  privateKey: string;
  publicKey: string;
  gateway: string;
}

function getAlipayTransferConfig(): AlipayTransferConfig | null {
  const appId = process.env.ALIPAY_APP_ID;
  const privateKey = process.env.ALIPAY_PRIVATE_KEY;
  const publicKey = process.env.ALIPAY_PUBLIC_KEY;
  if (!appId || !privateKey || !publicKey) return null;
  return {
    appId,
    privateKey,
    publicKey,
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  };
}

/** 支付宝转账是否已配置 */
export function isAlipayTransferConfigured(): boolean {
  return getAlipayTransferConfig() !== null;
}

/** 规范化私钥（支持 PEM 与裸 base64） */
function normalizePrivateKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key.replace(/\n/g, '').match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
}

/** 规范化支付宝公钥 */
function normalizePublicKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key.replace(/\n/g, '').match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
}

/** 计算 RSA2 签名 */
function sign(content: string, privateKey: string): string {
  return crypto.createSign('RSA-SHA256').update(content, 'utf8').sign(normalizePrivateKey(privateKey), 'base64');
}

/** 校验支付宝响应签名（可选，验签失败视为成功但记录告警） */
function verifySign(publicKey: string, content: string, signStr: string): boolean {
  try {
    return crypto.createVerify('RSA-SHA256').update(content, 'utf8').verify(normalizePublicKey(publicKey), signStr, 'base64');
  } catch {
    return false;
  }
}

function request(url: string): Promise<{ data: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      u,
      { method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ data: JSON.parse(raw) });
          } catch (e) {
            reject(new Error(`支付宝响应解析失败: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('支付宝转账请求超时')));
    req.end();
  });
}

/**
 * 支付宝单笔转账到账
 *
 * 注意：单笔转账到账接口需在支付宝开放平台申请开通「转账到支付宝账户」产品权限。
 */
export async function transferToAlipayAccount(params: AlipayTransferParams): Promise<AlipayTransferResult> {
  const config = getAlipayTransferConfig();
  if (!config) {
    return { success: false, error: '支付宝打款未配置（ALIPAY_APP_ID/PRIVATE_KEY/PUBLIC_KEY）' };
  }
  if (!params.account) {
    return { success: false, error: '缺少收款支付宝账号' };
  }
  if (params.amountYuan <= 0) {
    return { success: false, error: '转账金额必须大于 0' };
  }

  const bizContent: Record<string, any> = {
    out_biz_no: params.outBizNo,
    payee_account: params.account,
    amount: params.amountYuan.toFixed(2),
    payee_type: 'ALIPAY_LOGONID',
    ...(params.accountName ? { payee_real_name: params.accountName } : {}),
    ...(params.remark ? { remark: params.remark } : {}),
  };

  const commonParams: Record<string, string> = {
    app_id: config.appId,
    method: 'alipay.fund.trans.toaccount.transfer',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  };

  // 按 key 字典序拼接待签名串
  const signStr = Object.keys(commonParams)
    .sort()
    .map((k) => `${k}=${commonParams[k]}`)
    .join('&');
  commonParams.sign = sign(signStr, config.privateKey);

  // 拼接查询串
  const query = Object.keys(commonParams)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(commonParams[k])}`)
    .join('&');

  try {
    const { data } = await request(`${config.gateway}?${query}`);
    if (data.alipay_fund_trans_toaccount_transfer_response) {
      const resp = data.alipay_fund_trans_toaccount_transfer_response;
      if (resp.code === '10000') {
        return { success: true, orderId: resp.order_id };
      }
      return { success: false, error: `支付宝打款失败(${resp.code}): ${resp.sub_msg || resp.msg || '未知错误'}` };
    }
    if (data.error_response) {
      return { success: false, error: `支付宝打款失败: ${data.error_response.sub_msg || data.error_response.msg || '未知错误'}` };
    }
    return { success: false, error: '支付宝打款响应异常' };
  } catch (e: any) {
    return { success: false, error: `支付宝打款异常: ${e?.message || e}` };
  }
}
