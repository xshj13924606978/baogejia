// 微信支付回调 API 路由

import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';

/**
 * POST /api/payment/wechat/notify - 微信支付回调
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    console.log('[Wechat Notify] 收到微信支付回调:', body);

    // 解析回调数据
    let notifyData;
    try {
      notifyData = JSON.parse(body);
    } catch (error) {
      // 如果不是 JSON，尝试解析 XML
      notifyData = parseWechatXml(body);
    }

    // 处理支付回调
    const success = await paymentService.handleWechatNotify(notifyData);

    if (success) {
      // 返回微信要求的成功响应
      return new NextResponse(
        `<xml>
          <return_code><![CDATA[SUCCESS]]></return_code>
          <return_msg><![CDATA[OK]]></return_msg>
        </xml>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/xml',
          },
        }
      );
    } else {
      // 返回失败响应
      return new NextResponse(
        `<xml>
          <return_code><![CDATA[FAIL]]></return_code>
          <return_msg><![CDATA[处理失败]]></return_msg>
        </xml>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/xml',
          },
        }
      );
    }
  } catch (error) {
    console.error('[Wechat Notify] 处理微信支付回调失败:', error);
    return new NextResponse(
      `<xml>
        <return_code><![CDATA[FAIL]]></return_code>
        <return_msg><![CDATA[系统错误]]></return_msg>
      </xml>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
        },
      }
    );
  }
}

/**
 * 解析微信 XML 回调数据
 */
function parseWechatXml(xml: string): any {
  // 简化的 XML 解析
  const result: any = {};
  const regex = /<([^>]+)><!\[CDATA\[([^\]]+)\]\]><\/\1>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }

  return result;
}
