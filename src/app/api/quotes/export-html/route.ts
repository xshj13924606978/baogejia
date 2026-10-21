import { NextRequest, NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/error-handler';
import { formatDate } from '@/lib/date-utils';

// 格式化日期

export async function POST(request: NextRequest) {
  try {
    // 解析前端发送的数据
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

    // 格式化金额为中文大写
    const formatAmountToChinese = (amount: number) => {
      const digitUppercase = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
      const unit = ['', '拾', '佰', '仟'];
      const bigUnit = ['', '万', '亿'];

      const amountStr = amount.toFixed(2);
      const [integerPart, decimalPart] = amountStr.split('.');

      if (parseInt(integerPart) === 0 && parseInt(decimalPart) === 0) {
        return '零元整';
      }

      let result = '';

      // 处理整数部分
      const integer = parseInt(integerPart);
      if (integer > 0) {
        const integerStr = integer.toString();
        const len = integerStr.length;

        for (let i = 0; i < len; i++) {
          const digit = parseInt(integerStr[i]);
          const pos = len - i - 1;

          if (digit !== 0) {
            result += digitUppercase[digit] + unit[pos % 4];
          } else {
            if (i > 0 && integerStr[i - 1] !== '0') {
              result += '零';
            }
          }

          if (pos % 4 === 0 && pos > 0) {
            result += bigUnit[Math.floor(pos / 4)];
          }
        }
        result += '元';
      } else {
        result = '零元';
      }

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

    // 直接使用原始数据
    const companyName = supplierInfo?.companyName || '报价单';
    const phone = supplierInfo?.phone || '-';
    const email = supplierInfo?.email || '-';
    const address = supplierInfo?.address || '-';

    const customerName = customerInfo?.name || '-';
    const projectName = customerInfo?.projectName || '-';
    const contactPerson = customerInfo?.contactPerson || '-';
    const customerPhone = customerInfo?.phone || '-';

    // 构建产品表格行
    let productRows = '';
    if (products && Array.isArray(products) && products.length > 0) {
      products.forEach((product: any, index: number) => {
        const name = product?.name || '未知产品';
        const specs = product?.parameter_description || product?.specifications || product?.model || '-';
        const brand = product?.brand || '-';
        const unit = product?.unit || '个';
        const quantity = product?.quantity || 0;
        const unitPrice = product?.unitPrice || 0;
        const totalPrice = product?.totalPrice || 0;

        productRows += `
            <tr>
                <td>${index + 1}</td>
                <td>${name}</td>
                <td>${specs}</td>
                <td>${brand}</td>
                <td>${unit}</td>
                <td>${quantity}</td>
                <td>¥${unitPrice.toFixed(2)}</td>
                <td>¥${totalPrice.toFixed(2)}</td>
            </tr>
        `;
      });
    }

    // 构建项目字段行
    let projectRows = '';
    if (projectFields && Array.isArray(projectFields) && projectFields.length > 0) {
      projectFields.forEach((field: any) => {
        const fieldName = field?.name || '字段';
        const fieldValue = field?.value || '-';
        projectRows += `
        <div class="info-item">
            <span class="info-label">${fieldName}：</span>
            <span class="info-value">${fieldValue}</span>
        </div>
        `;
      });
    }

    // 构建完整的 HTML
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>报价单 - ${quoteNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Microsoft YaHei', '微软雅黑', 'PingFang SC', 'SimHei', 'Arial', sans-serif;
            background: #ffffff;
            color: #333333;
            font-size: 14px;
            line-height: 1.6;
            padding: 30px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #0a4a7a;
        }
        .company-info h1 {
            color: #0a4a7a;
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .company-info p {
            color: #666;
            font-size: 14px;
            margin: 5px 0;
        }
        .quote-number {
            text-align: right;
        }
        .quote-number h2 {
            color: #0a4a7a;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .quote-number p {
            color: #666;
            font-size: 14px;
            margin: 5px 0;
        }
        h3 {
            color: #0a4a7a;
            font-size: 20px;
            font-weight: bold;
            margin: 30px 0 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            background: #f8f9fa;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .info-item {
            display: flex;
            line-height: 2;
        }
        .info-label {
            font-weight: bold;
            color: #555;
            width: 100px;
        }
        .info-value {
            color: #333;
            flex: 1;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            font-size: 14px;
        }
        th {
            background: #0a4a7a;
            color: white;
            padding: 15px;
            text-align: center;
            font-weight: bold;
        }
        td {
            padding: 12px;
            border: 1px solid #e0e0e0;
            text-align: left;
        }
        td:nth-child(6), td:nth-child(7), td:nth-child(8) {
            text-align: right;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        .summary {
            margin-top: 40px;
            text-align: right;
            font-size: 16px;
        }
        .summary-item {
            margin: 10px 0;
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }
        .summary-label {
            font-weight: normal;
            color: #666;
            width: 150px;
        }
        .summary-value {
            font-weight: bold;
            color: #333;
            width: 200px;
            text-align: right;
        }
        .summary-total {
            font-size: 20px;
            font-weight: bold;
            color: #d32f2f;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #0a4a7a;
        }
        .summary-total .summary-value {
            color: #d32f2f;
            font-size: 24px;
        }
        .chinese-amount {
            font-size: 14px;
            color: #666;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px dashed #ddd;
        }
        .terms {
            margin-top: 50px;
            padding: 25px;
            background: #f8f9fa;
            border-radius: 8px;
            font-size: 14px;
            color: #666;
        }
        .terms p {
            margin: 8px 0;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #999;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .product-name {
            max-width: 250px;
            word-wrap: break-word;
        }
        @media print {
            body { padding: 20mm; }
            .no-print { display: none; }
        }
        .print-button {
            text-align: center;
            margin: 30px 0;
        }
        .print-button button {
            background: #0a4a7a;
            color: white;
            border: none;
            padding: 12px 30px;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
        }
        .print-button button:hover {
            background: #083d63;
        }
    </style>
</head>
<body>
    <div class="print-button no-print">
        <button onclick="window.print()">打印报价单 / 另存为PDF</button>
    </div>

    <div class="header">
        <div class="company-info">
            <h1>${companyName}</h1>
            <p>电话：${phone} | 邮箱：${email}</p>
            <p>地址：${address}</p>
        </div>
        <div class="quote-number">
            <h2>报价单</h2>
            <p>编号：${quoteNumber}</p>
            <p>日期：${formatDate(createdAt)}</p>
        </div>
    </div>

    <h3>项目概况</h3>
    <div class="info-grid">
        <div class="info-item">
            <span class="info-label">客户名称：</span>
            <span class="info-value">${customerName}</span>
        </div>
        <div class="info-item">
            <span class="info-label">项目名称：</span>
            <span class="info-value">${projectName}</span>
        </div>
        <div class="info-item">
            <span class="info-label">联系人：</span>
            <span class="info-value">${contactPerson}</span>
        </div>
        <div class="info-item">
            <span class="info-label">电话：</span>
            <span class="info-value">${customerPhone}</span>
        </div>
        ${projectRows}
    </div>

    <h3>产品清单</h3>
    <table>
        <thead>
            <tr>
                <th>序号</th>
                <th>产品名称</th>
                <th>参数描述</th>
                <th>品牌</th>
                <th>单位</th>
                <th>数量</th>
                <th>单价(元)</th>
                <th>总价(元)</th>
            </tr>
        </thead>
        <tbody>
            ${productRows || '<tr><td colspan="8" style="text-align: center; padding: 30px;">暂无产品数据</td></tr>'}
        </tbody>
    </table>

    <div class="summary">
        <div class="summary-item">
            <span class="summary-label">小计：</span>
            <span class="summary-value">¥${(subtotal || 0).toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">税费 (${feeConfig?.taxRate || 13}%)：</span>
            <span class="summary-value">¥${(taxAmount || 0).toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">运费：</span>
            <span class="summary-value">¥${(feeConfig?.shipping || 0).toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">安装调试费：</span>
            <span class="summary-value">¥${(feeConfig?.installation || 0).toFixed(2)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">其他费用：</span>
            <span class="summary-value">¥${(feeConfig?.otherFees || 0).toFixed(2)}</span>
        </div>
        <div class="summary-item summary-total">
            <span class="summary-label">总计（含税）：</span>
            <span class="summary-value">¥${(totalAmount || 0).toFixed(2)}</span>
        </div>
        <div class="chinese-amount">
            （大写：${formatAmountToChinese(totalAmount || 0)}）
        </div>
    </div>

    <h3>商务条款</h3>
    <div class="terms">
        <p><strong>付款方式：</strong> ${feeConfig?.paymentTerms || '预付30%，发货前付清'}</p>
        <p><strong>质保期：</strong> ${feeConfig?.warrantyTerms || '12个月'}</p>
        <p><strong>交货期：</strong> ${feeConfig?.deliveryTerms || '7个工作日'}</p>
        <p><strong>报价有效期：</strong> ${formatDate(feeConfig?.validUntil)}</p>
        ${notes ? `<p><strong>备注：</strong> ${notes}</p>` : ''}
    </div>

    <div class="footer">
        <p>本报价单由系统自动生成，如有疑问请联系我们</p>
        <p>电话：${phone} | 邮箱：${email}</p>
    </div>
</body>
</html>
    `;


    // 返回 HTML 页面
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[ExportHTML] HTML生成失败:', error);
    return NextResponse.json(
      {
        error: 'HTML生成失败',
        message: error instanceof Error ? safeErrorMessage(error) : '未知错误',
      },
      { status: 500 }
    );
  }
}
