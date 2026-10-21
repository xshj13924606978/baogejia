import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';
import { safeErrorMessage } from '@/lib/error-handler';
import { formatDate } from '@/lib/date-utils';

// HTML转义函数，防止XSS攻击
const escapeHtml = (unsafe: string): string => {
  if (!unsafe) return '-';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 格式化普通文本
const formatText = (text: string): string => {
  if (!text) return '-';
  return escapeHtml(String(text));
};

// 格式化日期

// 金额转中文大写
const formatAmountToChinese = (amount: number): string => {
  const digitUppercase = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = ['', '拾', '佰', '仟'];
  const bigUnit = ['', '万', '亿', '万亿'];

  const amountStr = (amount || 0).toFixed(2);
  const [integerPart, decimalPart] = amountStr.split('.');

  if (parseInt(integerPart) === 0 && parseInt(decimalPart) === 0) {
    return '零元整';
  }

  const integer = parseInt(integerPart);
  if (integer === 0) {
    return '零元' + (parseInt(decimalPart) > 0 ? '' : '整');
  }

  const integerStr = integer.toString();
  const len = integerStr.length;
  let result = '';
  let zeroFlag = false;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(integerStr[i]);
    const pos = len - i - 1;
    const section = Math.floor(pos / 4);
    const unitPos = pos % 4;

    if (digit !== 0) {
      if (zeroFlag) {
        result += '零';
        zeroFlag = false;
      }
      result += digitUppercase[digit] + unit[unitPos];
    } else {
      zeroFlag = true;
    }

    if (unitPos === 0 && pos > 0) {
      result += bigUnit[section];
      zeroFlag = false;
    }
  }

  result += '元';

  const jiao = parseInt(decimalPart[0]);
  const fen = parseInt(decimalPart[1]);

  if (jiao === 0 && fen === 0) {
    result += '整';
  } else {
    if (jiao > 0) {
      result += digitUppercase[jiao] + '角';
    }
    if (fen > 0) {
      result += digitUppercase[fen] + '分';
    }
  }

  return result;
};

export async function POST(request: NextRequest) {
  // 1. 鉴权：仅登录用户可导出
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const data = await request.json();

    const {
      quoteNumber,
      supplierInfo,
      customerInfo,
      products,
      feeConfig,
      projectFields,
      createdAt,
      subtotal,
      taxAmount,
      totalAmount,
      notes,
    } = data;

    // 2. 按 export_quote 规则扣减积分（按报价单+日期幂等），余额不足返回 402
    const rule = await pointsService.getPointRule('export_quote');
    const exportCost = Math.abs(rule.points);
    const dateStr = new Date().toISOString().split('T')[0];
    const referenceId = `export_word_${user.id}_${quoteNumber || 'unknown'}_${dateStr}`;

    const deductResult = await pointsService.deductPoints(
      user.id,
      exportCost,
      'export_quote',
      `导出报价单 Word: ${quoteNumber || 'unknown'}`,
      referenceId
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: deductResult.reason || '积分不足' },
        { status: 402 }
      );
    }

    // 3. 数据验证
    if (!quoteNumber) {
      throw new Error('报价单号不能为空');
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      throw new Error('产品清单不能为空');
    }

    // 获取联系人信息
    const contactPerson =
      projectFields?.find((f: any) => f.name === '联系人')?.value ||
      customerInfo?.contactPerson ||
      '';
    const phone =
      projectFields?.find((f: any) => f.name === '电话')?.value || customerInfo?.phone || '';

    // 预处理产品数据
    const processedProducts = products.map((product: any) => ({
      ...product,
      name: escapeHtml(String(product.name || '').replace(/[\n\r\t]/g, ' ').trim() || '-'),
      specifications: escapeHtml(product.parameter_description || product.specifications || product.model || ''),
      brand: escapeHtml(product.brand || ''),
      unit: escapeHtml(product.unit || '') || '个',
      quantity: product.quantity || 0,
      unitPrice: product.unitPrice || 0,
      totalPrice: product.totalPrice || 0,
    }));

    // 4. 生成 Word 兼容 HTML（application/msword，Word 可直接打开）
    const wordHtml = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <title>报价单 - ${formatText(quoteNumber)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
      font-size: 11pt;
      color: #333;
      line-height: 1.6;
      margin: 20px;
    }
    h1 {
      font-size: 22pt;
      text-align: center;
      color: #0a4a7a;
      margin: 10px 0;
    }
    h2 {
      font-size: 14pt;
      color: #0a4a7a;
      border-bottom: 2px solid #0a4a7a;
      padding-bottom: 4px;
      margin: 20px 0 10px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    th, td {
      border: 1px solid #999;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #e8eef4;
      font-weight: bold;
      text-align: center;
    }
    .info-table td:first-child {
      width: 120px;
      font-weight: bold;
      background-color: #f5f7fa;
    }
    .summary-table {
      width: 60%;
      margin-left: auto;
    }
    .summary-table td:first-child {
      background-color: #f5f7fa;
      font-weight: bold;
      width: 140px;
    }
    .summary-table .total-row td {
      background-color: #0a4a7a;
      color: #fff;
      font-weight: bold;
    }
    .amount-words {
      margin: 15px 0;
      padding: 10px 15px;
      background-color: #f0f4f8;
      border-left: 4px solid #0a4a7a;
      font-size: 12pt;
    }
    .note-box {
      margin: 15px 0;
      padding: 10px 15px;
      background-color: #fff3cd;
      border: 1px solid #ffc107;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      color: #888;
      font-size: 9pt;
      border-top: 1px dashed #aaa;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <h1>报 价 单</h1>
  <table style="width:100%;border:none;margin-bottom:5px;">
    <tr>
      <td style="border:none;width:50%;">编号：${formatText(quoteNumber)}</td>
      <td style="border:none;width:50%;text-align:right;">日期：${formatDate(createdAt)}</td>
    </tr>
    <tr>
      <td style="border:none;">有效期：${formatDate(feeConfig?.validUntil)}</td>
      <td style="border:none;text-align:right;">电话：${formatText(supplierInfo?.phone || '-')}</td>
    </tr>
    <tr>
      <td style="border:none;" colspan="2">邮箱：${formatText(supplierInfo?.email || '-')}　地址：${formatText(supplierInfo?.address || '-')}</td>
    </tr>
  </table>

  <h2>一、项目概况</h2>
  <table class="info-table">
    <tr>
      <td>客户名称</td>
      <td>${formatText(customerInfo?.name || '兴梁')}</td>
      <td>项目名称</td>
      <td>${formatText(customerInfo?.projectName || '-')}</td>
    </tr>
    <tr>
      <td>联系人</td>
      <td>${formatText(contactPerson || '-')}</td>
      <td>联系电话</td>
      <td>${formatText(phone || '-')}</td>
    </tr>
    <tr>
      <td>地址</td>
      <td colspan="3">${formatText(customerInfo?.address || '-')}</td>
    </tr>
  </table>

  <h2>二、产品清单</h2>
  <table>
    <thead>
      <tr>
        <th style="width:5%">序号</th>
        <th style="width:22%">产品名称</th>
        <th style="width:22%">参数描述</th>
        <th style="width:12%">品牌</th>
        <th style="width:8%">单位</th>
        <th style="width:9%">数量</th>
        <th style="width:11%">单价(元)</th>
        <th style="width:11%">总价(元)</th>
      </tr>
    </thead>
    <tbody>
      ${processedProducts
        .map(
          (product: any, index: number) => `
      <tr>
        <td style="text-align:center;">${index + 1}</td>
        <td>${product.name}</td>
        <td>${product.specifications || '-'}</td>
        <td>${product.brand || '-'}</td>
        <td style="text-align:center;">${product.unit}</td>
        <td style="text-align:center;">${product.quantity}</td>
        <td style="text-align:right;">¥${(product.unitPrice || 0).toFixed(2)}</td>
        <td style="text-align:right;">¥${(product.totalPrice || 0).toFixed(2)}</td>
      </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <h2>三、费用汇总</h2>
  <table class="summary-table">
    <tr>
      <td>小计</td>
      <td style="text-align:right;">¥${(subtotal || 0).toFixed(2)}</td>
    </tr>
    <tr>
      <td>税费 (${feeConfig?.taxRate || 13}%)</td>
      <td style="text-align:right;">¥${(taxAmount || 0).toFixed(2)}</td>
    </tr>
    <tr>
      <td>运费</td>
      <td style="text-align:right;">¥${(feeConfig?.shipping || 0).toFixed(2)}</td>
    </tr>
    <tr>
      <td>安装调试费</td>
      <td style="text-align:right;">¥${(feeConfig?.installation || 0).toFixed(2)}</td>
    </tr>
    <tr>
      <td>其他费用</td>
      <td style="text-align:right;">¥${(feeConfig?.otherFees || 0).toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td>总计（含税）</td>
      <td style="text-align:right;">¥${(totalAmount || 0).toFixed(2)}</td>
    </tr>
  </table>

  <div class="amount-words">
    <strong>大写金额：</strong>${formatAmountToChinese(totalAmount || 0)}
  </div>

  ${
    notes
      ? `
  <div class="note-box">
    <strong>备注：</strong>${formatText(notes)}
  </div>
  `
      : ''
  }

  <h2>四、商务条款</h2>
  <table class="info-table">
    <tr>
      <td>付款方式</td>
      <td>${formatText(feeConfig?.paymentTerms || '-')}</td>
    </tr>
    <tr>
      <td>质保期</td>
      <td>${formatText(feeConfig?.warrantyTerms || '-')}</td>
    </tr>
    <tr>
      <td>交货期</td>
      <td>${formatText(feeConfig?.deliveryTerms || '-')}</td>
    </tr>
    <tr>
      <td>报价有效期</td>
      <td>${formatDate(feeConfig?.validUntil) || '-'}</td>
    </tr>
  </table>

  <div class="footer">
    <p>本报价单由报价管理系统自动生成</p>
    <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
  </div>
</body>
</html>
    `;

    const fileName = `报价单_${formatText(quoteNumber)}_${new Date().getTime()}.doc`;

    // 5. 返回 Word 文件（application/msword，Word 可打开）
    const buffer = Buffer.from(wordHtml, 'utf-8');
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('[ExportWord] ==========================================');
    console.error('[ExportWord] Word导出失败！');
    console.error('[ExportWord] 错误信息:', error instanceof Error ? error.message : '未知错误');
    console.error('[ExportWord] ==========================================');

    return NextResponse.json(
      {
        error: 'Word导出失败',
        message: error instanceof Error ? safeErrorMessage(error) : '未知错误',
      },
      { status: 500 }
    );
  }
}
