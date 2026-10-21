/**
 * 微信企业付款到零钱（商家转账 APIv3）
 *
 * 文档: 微信支付商家转账到零钱（单笔转账）
 *   POST https://api.mch.weixin.qq.com/v3/fund-app/mch-transfer/transfer-bills
 *
 * 所需环境变量：
 *   WECHAT_MCHID            商户号
 *   WECHAT_API_V3_KEY       APIv3 密钥（32 位）
 *   WECHAT_SERIAL_NO        商户证书序列号
 *   WECHAT_PRIVATE_KEY      商户 API 私钥（PEM）
 *   WECHAT_APPID            商户绑定的公众账号 appid（用于特约商户转账时需特约商户 appid）
 *
 * 说明：未配置完整凭据时 isWechatTransferConfigured() 返回 false，
 * 上层应提示「微信打款未配置」并引导管理员走手动打款登记流程。
 */

import crypto from 'crypto';
import https from 'https';

export interface WechatTransferParams {
  openid: string; // 收款用户 openid
  amountFen: number; // 转账金额（分）
  outBatchNo: string; // 商家批次单号（唯一）
  outDetailNo: string; // 商家明细单号（唯一）
  userName?: string; // 收款用户姓名（可选，校验姓名）
  remark?: string; // 转账备注
}

export interface WechatTransferResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

interface WechatTransferConfig {
  mchid: string;
  apiV3Key: string;
  serialNo: string;
  privateKey: string;
  appid: string;
}

function getWechatTransferConfig(): WechatTransferConfig | null {
  const mchid = process.env.WECHAT_MCHID;
  const apiV3Key = process.env.WECHAT_API_V3_KEY;
  const serialNo = process.env.WECHAT_SERIAL_NO;
  const privateKey = process.env.WECHAT_PRIVATE_KEY;
  const appid = process.env.WECHAT_APPID;
  if (!mchid || !apiV3Key || !serialNo || !privateKey) return null;
  return { mchid, apiV3Key, serialNo, privateKey, appid: appid || '' };
}

/** 微信商家转账是否已配置 */
export function isWechatTransferConfigured(): boolean {
  return getWechatTransferConfig() !== null;
}

/** 构建 APIv3 Authorization 头 */
function buildAuthHeader(method: string, urlPath: string, bodyStr: string, config: WechatTransferConfig): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signatureStr = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signatureStr)
    .sign(config.privateKey, 'base64');
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",nonce_str="${nonce}",` +
    `timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`
  );
}

/** 发起 HTTP 请求 */
function request(method: string, url: string, headers: Record<string, string>, body: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      u,
      {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode || 0, data });
          } catch (e) {
            reject(new Error(`微信转账响应解析失败: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('微信转账请求超时')));
    req.end(body);
  });
}

/**
 * 微信商家转账到零钱（单笔）
 *
 * 注意：企业付款到零钱为商家功能，需要在微信支付商户平台开通
 * 「商家转账到零钱」并完成实名认证。新商户转账金额限制以微信侧为准。
 */
export async function transferToWechatOpenid(params: WechatTransferParams): Promise<WechatTransferResult> {
  const config = getWechatTransferConfig();
  if (!config) {
    return { success: false, error: '微信打款未配置（WECHAT_MCHID/API_V3_KEY/SERIAL_NO/PRIVATE_KEY）' };
  }
  if (!params.openid) {
    return { success: false, error: '缺少收款用户 openid' };
  }
  if (params.amountFen <= 0) {
    return { success: false, error: '转账金额必须大于 0' };
  }

  const urlPath = '/v3/fund-app/mch-transfer/transfer-bills';
  const url = `https://api.mch.weixin.qq.com${urlPath}`;
  const body: Record<string, any> = {
    appid: config.appid,
    mch_id: config.mchid,
    out_batch_no: params.outBatchNo,
    batch_name: '积分提现',
    batch_remark: params.remark || '积分提现到零钱',
    total_amount: params.amountFen,
    total_num: 1,
    transfer_detail_list: [
      {
        out_detail_no: params.outDetailNo,
        transfer_amount: params.amountFen,
        transfer_remark: params.remark || '积分提现',
        openid: params.openid,
        ...(params.userName ? { user_name: crypto.createHash('md5').update(params.userName).digest('hex').toUpperCase() } : {}),
      },
    ],
  };
  const bodyStr = JSON.stringify(body);

  try {
    const { status, data } = await request('POST', url, {
      Authorization: buildAuthHeader('POST', urlPath, bodyStr, config),
      'User-Agent': 'quote-app/1.0',
    }, bodyStr);

    if (status >= 200 && status < 300) {
      return { success: true, transactionId: data.out_batch_no };
    }
    return { success: false, error: `微信打款失败(${status}): ${data?.message || JSON.stringify(data).slice(0, 200)}` };
  } catch (e: any) {
    return { success: false, error: `微信打款异常: ${e?.message || e}` };
  }
}
