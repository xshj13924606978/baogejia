import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// HTML转义函数，防止XSS攻击
const escapeHtml = (unsafe: string): string => {
  if (!unsafe) return '-';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 处理产品名称，将换行符转换为空格
const formatProductName = (name: string): string => {
  if (!name) return '-';
  return escapeHtml(name.replace(/[\n\r\t]/g, ' ').trim());
};

// 格式化普通文本
const formatText = (text: string): string => {
  if (!text) return '-';
  return escapeHtml(text);
};

// 格式化日期
const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'});
};

// 金额转中文大写
const formatAmountToChinese = (amount: number) => {
  const digitUppercase = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = ['', '拾', '佰', '仟'];
  const bigUnit = ['', '万', '亿', '万亿'];

  const amountStr = amount.toFixed(2);
  const [integerPart, decimalPart] = amountStr.split('.');

  if (parseInt(integerPart) === 0 && parseInt(decimalPart) === 0) {
    return '零元整';
  }

  // 处理整数部分
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

    // 处理万、亿等单位
    if (unitPos === 0 && pos > 0) {
      result += bigUnit[section];
      zeroFlag = false;
    }
  }

  result += '元';

  // 处理小数部分
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
  const startTime = Date.now();

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
      notes} = data;

    // 数据验证
    if (!quoteNumber) {
      throw new Error('报价单号不能为空');
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      throw new Error('产品清单不能为空');
    }


    // 获取联系人信息
    const contactPerson =
      projectFields?.find((f: any) => f.name === '联系人')?.value ||
      customerInfo.contactPerson ||
      '';
    const phone =
      projectFields?.find((f: any) => f.name === '电话')?.value || customerInfo.phone || '';

    // 预处理产品数据
    const processedProducts = products.map((product: any, index: number) => {
      const processed = {
        ...product,
        name: formatProductName(product.name),
        specifications: formatText(product.parameter_description || product.specifications || product.model || ''),
        brand: formatText(product.brand),
        unit: formatText(product.unit) || '个',
        quantity: product.quantity || 0,
        unitPrice: product.unitPrice || 0,
        totalPrice: product.totalPrice || 0};
      return processed;
    });


    // 生成优化的 HTML 模板
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>报价单 - ${formatText(quoteNumber)}</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    
    body {
      font-family: "DejaVu Sans", "WenQuanYi Micro Hei", "Microsoft YaHei", "SimSun", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      padding: 10px;
    }
    
    /* 优化的页眉样式 - 使用渐变色 */
    .pdf-header {
      background: linear-gradient(135deg, #0a4a7a 0%, #1e6a9f 100%);
      color: white;
      padding: 25px 20px;
      margin-bottom: 25px;
      border-radius: 10px 10px 10px 10px;
      box-shadow: 0 4px 15px rgba(10, 74, 122, 0.3);
      position: relative;
      overflow: hidden;
      page-break-inside: avoid;
    }
    
    .pdf-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      transform: rotate(30deg);
    }
    
    .pdf-header h1 {
      font-size: 28px;
      font-weight: bold;
      margin: 0 0 5px 0;
      letter-spacing: 2px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
      position: relative;
      z-index: 1;
    }
    
    .pdf-header .header-sub {
      font-size: 14px;
      opacity: 0.95;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      position: relative;
      z-index: 1;
      border-top: 1px solid rgba(255,255,255,0.3);
      padding-top: 8px;
    }
    
    .pdf-header .quotation-info {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 10px;
      font-size: 12px;
      position: relative;
      z-index: 1;
    }
    
    .pdf-header .quotation-info span {
      background: rgba(255,255,255,0.15);
      padding: 4px 12px;
      border-radius: 20px;
      backdrop-filter: blur(5px);
    }
    
    /* 章节标题 */
    .section-title {
      font-size: 16pt;
      font-weight: bold;
      color: #0a4a7a;
      margin: 25px 0 15px 0;
      padding-bottom: 8px;
      border-bottom: 3px solid #0a4a7a;
      position: relative;
      page-break-after: avoid;
    }
    
    .section-title::before {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 0;
      width: 60px;
      height: 3px;
      background: #1e6a9f;
    }
    
    /* 信息卡片 */
    .info-card {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 25px;
      border: 1px solid #dee2e6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      page-break-inside: avoid;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    
    .info-item {
      display: flex;
      flex-direction: column;
    }
    
    .info-item .label {
      font-size: 10px;
      color: #6c757d;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-item .value {
      font-size: 13px;
      font-weight: 500;
      color: #212529;
      background: white;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }
    
    /* 优化的表格样式 */
    .products-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 10.5pt;
      page-break-inside: auto;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      border-radius: 10px;
      overflow: hidden;
    }
    
    .products-table thead {
      display: table-header-group;
    }
    
    .products-table tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    
    .products-table th {
      background: linear-gradient(135deg, #0a4a7a 0%, #1e6a9f 100%);
      color: white;
      font-weight: 600;
      padding: 12px 8px;
      text-align: center;
      font-size: 11pt;
      letter-spacing: 0.5px;
      white-space: nowrap;
      border: 1px solid #0a4a7a;
    }
    
    .products-table td {
      padding: 10px 8px;
      border: 1px solid #dee2e6;
      vertical-align: top;
      background-color: white;
    }
    
    .products-table tbody tr:nth-child(even) td {
      background-color: #f8f9fa;
    }
    
    .products-table tbody tr:hover td {
      background-color: #e9ecef;
    }
    
    /* 序号列 */
    .products-table td:first-child {
      text-align: center;
      font-weight: 500;
      color: #0a4a7a;
      width: 5%;
    }
    
    /* 产品名称样式 */
    .product-name {
      font-weight: 600;
      color: #212529;
      margin-bottom: 4px;
      font-size: 11pt;
    }
    
    .product-spec {
      font-size: 9.5pt;
      color: #6c757d;
      line-height: 1.4;
      margin-top: 3px;
    }
    
    /* 金额列右对齐 */
    .products-table td:nth-child(6),
    .products-table td:nth-child(7) {
      text-align: right;
      font-family: 'Courier New', monospace;
      font-weight: 500;
    }
    
    .products-table td:nth-child(5) {
      text-align: center;
    }
    
    /* 汇总表格 */
    .summary-table {
      width: 50%;
      margin-left: auto;
      border-collapse: collapse;
      page-break-inside: avoid;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    
    .summary-table td {
      padding: 10px 15px;
      border: 1px solid #dee2e6;
    }
    
    .summary-table .label {
      background: #f8f9fa;
      font-weight: 500;
      color: #495057;
      width: 120px;
    }
    
    .summary-table .value {
      font-weight: 600;
      color: #212529;
      text-align: right;
      font-family: 'Courier New', monospace;
    }
    
    .summary-table .total-row {
      background: linear-gradient(135deg, #0a4a7a 0%, #1e6a9f 100%);
      color: white;
    }
    
    .summary-table .total-row td {
      color: white;
      font-weight: bold;
      border: none;
    }
    
    .summary-table .total-row .value {
      font-size: 14pt;
      color: white;
    }
    
    /* 大写金额 */
    .amount-in-words {
      background: #f0f4f8;
      padding: 15px 20px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 12pt;
      border-left: 4px solid #0a4a7a;
      page-break-inside: avoid;
      clear: both;
    }
    
    .amount-in-words .label {
      color: #495057;
      margin-right: 10px;
      font-weight: 500;
    }
    
    .amount-in-words .value {
      font-weight: bold;
      color: #0a4a7a;
      letter-spacing: 1px;
    }
    
    /* 商务条款 */
    .terms-box {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-top: 25px;
      border: 1px solid #dee2e6;
      page-break-inside: avoid;
    }
    
    .terms-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    
    .term-item {
      display: flex;
      flex-direction: column;
    }
    
    .term-item .term-label {
      font-size: 10px;
      color: #6c757d;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .term-item .term-value {
      font-size: 12pt;
      font-weight: 500;
      color: #212529;
      background: white;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }
    
    /* 备注 */
    .note-box {
      margin: 15px 0;
      padding: 15px;
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 6px;
      font-size: 11pt;
      page-break-inside: avoid;
    }
    
    /* 页脚 */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px dashed #0a4a7a;
      text-align: center;
      color: #6c757d;
      font-size: 9pt;
      page-break-inside: avoid;
    }
    
    /* 确保分页不会切断重要内容 */
    .keep-together {
      page-break-inside: avoid;
    }
    
    /* 响应式调整 */
    @media print {
      body {
        padding: 0;
      }
      
      .pdf-header,
      .products-table th,
      .summary-table .total-row {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- 优化的页眉 -->
    <div class="pdf-header">
      <h1>报价单</h1>
      <div class="quotation-info">
        <span>编号：${formatText(quoteNumber)}</span>
        <span>日期：${formatDate(createdAt)}</span>
        <span>有效期：${formatDate(feeConfig?.validUntil)}</span>
      </div>
      <div class="header-sub">
        <span>电话：${formatText(supplierInfo?.phone || '-')}</span>
        <span>邮箱：${formatText(supplierInfo?.email || '-')}</span>
        <span>地址：${formatText(supplierInfo?.address || '-')}</span>
      </div>
    </div>
    
    <!-- 项目概况 -->
    <h2 class="section-title">项目概况</h2>
    <div class="info-card">
      <div class="info-grid">
        <div class="info-item">
          <span class="label">客户名称</span>
          <span class="value">${formatText(customerInfo?.name || '兴梁')}</span>
        </div>
        <div class="info-item">
          <span class="label">项目名称</span>
          <span class="value">${formatText(customerInfo?.projectName || '-')}</span>
        </div>
        <div class="info-item">
          <span class="label">联系人</span>
          <span class="value">${formatText(contactPerson || '1')}</span>
        </div>
        <div class="info-item">
          <span class="label">联系电话</span>
          <span class="value">${formatText(phone || '1')}</span>
        </div>
        <div class="info-item">
          <span class="label">地址</span>
          <span class="value">${formatText(customerInfo?.address || '1')}</span>
        </div>
      </div>
    </div>
    
    <!-- 产品清单 -->
    <h2 class="section-title">产品清单</h2>
    <table class="products-table">
      <thead>
        <tr>
          <th style="width: 5%">序号</th>
          <th style="width: 25%">产品名称</th>
          <th style="width: 20%">参数描述</th>
          <th style="width: 12%">品牌</th>
          <th style="width: 8%">单位</th>
          <th style="width: 10%">数量</th>
          <th style="width: 10%">单价(元)</th>
          <th style="width: 10%">总价(元)</th>
        </tr>
      </thead>
      <tbody>
        ${processedProducts
          .map(
            (product: any, index: number) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <div class="product-name">${product.name}</div>
              ${product.specifications ? `<div class="product-spec">${product.specifications}</div>` : ''}
            </td>
            <td>${product.specifications || '-'}</td>
            <td>${product.brand || '-'}</td>
            <td>${product.unit}</td>
            <td>${product.quantity}</td>
            <td>¥${product.unitPrice.toFixed(2)}</td>
            <td>¥${product.totalPrice.toFixed(2)}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    
    <!-- 费用汇总 -->
    <h2 class="section-title">费用汇总</h2>
    <table class="summary-table">
      <tr>
        <td class="label">小计</td>
        <td class="value">¥${(subtotal || 0).toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">税费 (${feeConfig?.taxRate || 13}%)</td>
        <td class="value">¥${(taxAmount || 0).toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">运费</td>
        <td class="value">¥${(feeConfig?.shipping || 1).toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">安装调试费</td>
        <td class="value">¥${(feeConfig?.installation || 1).toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">其他费用</td>
        <td class="value">¥${(feeConfig?.otherFees || 1).toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td class="label">总计（含税）</td>
        <td class="value">¥${(totalAmount || 0).toFixed(2)}</td>
      </tr>
    </table>
    
    <!-- 大写金额 -->
    <div class="amount-in-words">
      <span class="label">大写金额：</span>
      <span class="value">${formatAmountToChinese(totalAmount || 0)}</span>
    </div>
    
    <!-- 备注 -->
    ${
      notes
        ? `
    <div class="note-box">
      <strong>备注：</strong> ${formatText(notes)}
    </div>
    `
        : ''
    }
    
    <!-- 商务条款 -->
    <h2 class="section-title">商务条款</h2>
    <div class="terms-box">
      <div class="terms-grid">
        <div class="term-item">
          <span class="term-label">付款方式</span>
          <span class="term-value">${formatText(feeConfig?.paymentTerms || '1')}</span>
        </div>
        <div class="term-item">
          <span class="term-label">质保期</span>
          <span class="term-value">${formatText(feeConfig?.warrantyTerms || '1')}</span>
        </div>
        <div class="term-item">
          <span class="term-label">交货期</span>
          <span class="term-value">${formatText(feeConfig?.deliveryTerms || '1')}</span>
        </div>
        <div class="term-item">
          <span class="term-label">报价有效期</span>
          <span class="term-value">${formatDate(feeConfig?.validUntil) || '2026/03/10'}</span>
        </div>
      </div>
    </div>
    
    <!-- 页脚 -->
    <div class="footer">
      <p>本报价单由报价管理系统自动生成</p>
      <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
    </div>
  </div>
</body>
</html>
    `;


    // 使用 Puppeteer 生成 PDF
    const browserLaunchStart = Date.now();

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--disable-features=IsolateOrigins,site-per-process',
      ]});

    const browserLaunchTime = Date.now() - browserLaunchStart;

    const page = await browser.newPage();

    // 设置视口
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

    const setContentStart = Date.now();
    await page.setContent(htmlTemplate, {
      waitUntil: 'networkidle0',
      timeout: 30000});
    const setContentTime = Date.now() - setContentStart;

    const pdfStart = Date.now();
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm'},
      preferCSSPageSize: true});
    const pdfTime = Date.now() - pdfStart;

    await browser.close();

    const totalTime = Date.now() - startTime;

    const fileName = `报价单_${formatText(quoteNumber)}_${new Date().getTime()}.pdf`;


    // 返回PDF文件
    const response = new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0'}});

    return response;
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error('[ExportPDF] ==========================================');
    console.error('[ExportPDF] PDF生成失败！');
    console.error('[ExportPDF] 耗时:', errorTime, 'ms');
    console.error('[ExportPDF] 错误信息:', error instanceof Error ? error.message : '未知错误');
    console.error('[ExportPDF] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
    console.error('[ExportPDF] ==========================================');

    return NextResponse.json(
      {
        error: 'PDF生成失败',
        message: error instanceof Error ? error.message : '未知错误'},
      { status: 500 }
    );
  }
}
