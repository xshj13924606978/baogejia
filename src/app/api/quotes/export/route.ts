import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { data, format } = await request.json();

    console.log('[Export] Received request:', { format, quoteNumber: data?.quoteNumber });

    if (format === 'excel') {
      return generateExcel(data);
    } else if (format === 'pdf') {
      return NextResponse.json(
        { error: 'PDF导出已移至前端，请使用页面上的下载PDF按钮' },
        { status: 400 }
      );
    } else {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Export] Export error:', error);
    return NextResponse.json(
      {
        error: 'Failed to export quote',
        details: error instanceof Error ? error.message : 'Unknown error'},
      { status: 500 }
    );
  }
}

// 动态生成报价单标题
function getQuoteTitle(data: any): string {
  const products = data.products || [];
  const productCount = products.length || 0;
  if (productCount === 0) return '报价单';

  // 获取主要产品类别（如果有）
  const categories = new Set(
    products.map((p: any) => p.category).filter((c: any) => c && c !== '未分类')
  );

  // 获取主要品牌（如果有）
  const brands = new Set(
    products.map((p: any) => p.brand).filter((b: any) => b && b.trim() !== '')
  );

  // 计算总价
  const totalAmount = products.reduce((sum: number, p: any) => sum + (p.totalPrice || 0), 0);

  // 根据产品数量、类别、品牌和总价生成智能标题
  if (productCount === 1) {
    // 单个产品
    const product = products[0];
    if (product.category && product.category !== '未分类') {
      return `${product.category}报价单`;
    }
    return '产品报价单';
  }

  // 多个产品，根据内容生成更精准的标题
  let titlePrefix = '';

  // 优先使用类别作为前缀
  if (categories.size === 1) {
    const category = Array.from(categories)[0] as string;
    titlePrefix = category;
  } else if (categories.size > 1 && categories.size <= 3) {
    // 有2-3个类别，可以组合显示
    titlePrefix = Array.from(categories).join('+');
  } else if (brands.size === 1) {
    // 类别多但品牌单一，使用品牌
    const brand = Array.from(brands)[0] as string;
    titlePrefix = `${brand}品牌`;
  }

  // 根据总价和产品数量判断是小型、中型还是大型项目
  if (totalAmount < 10000) {
    // 小型项目
    if (titlePrefix) {
      return `${titlePrefix}报价单`;
    }
    return '产品报价单';
  } else if (totalAmount < 100000) {
    // 中型项目
    if (titlePrefix) {
      return `${titlePrefix}项目报价单`;
    }
    return '工程项目报价单';
  } else {
    // 大型项目
    if (titlePrefix) {
      return `${titlePrefix}整体解决方案报价单`;
    }
    return '完整解决方案报价单';
  }
}

// 动态生成总价标题
function getTotalTitle(data: any): string {
  const products = data.products || [];
  const productCount = products.length || 0;
  if (productCount === 0) return '总价';
  if (productCount === 1) return '产品总价';

  // 计算总价
  const totalAmount = products.reduce((sum: number, p: any) => sum + (p.totalPrice || 0), 0);

  if (totalAmount < 10000) {
    return '产品总价';
  } else {
    return '工程总价';
  }
}

// 数字转中文大写
function formatAmountToChinese(amount: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿', '拾', '佰', '仟'];
  const _smallUnits = ['角', '分'];

  const yuan = Math.floor(amount);
  const jiao = Math.floor((amount - yuan) * 10);
  const fen = Math.floor(((amount - yuan) * 100) % 10);

  let result = '';

  // 处理整数部分
  if (yuan === 0) {
    result = '零元';
  } else {
    const yuanStr = yuan.toString();
    let yuanResult = '';
    let zeroFlag = false;

    for (let i = 0; i < yuanStr.length; i++) {
      const digit = parseInt(yuanStr[i]);
      const unit = units[yuanStr.length - i - 1];

      if (digit === 0) {
        zeroFlag = true;
      } else {
        if (zeroFlag && i > 0) {
          yuanResult += '零';
        }
        yuanResult += digits[digit] + unit;
        zeroFlag = false;
      }
    }

    result = yuanResult + '元';
  }

  // 处理小数部分
  if (jiao > 0 || fen > 0) {
    if (jiao > 0) {
      result += digits[jiao] + '角';
    }
    if (fen > 0) {
      result += digits[fen] + '分';
    }
  } else {
    result += '整';
  }

  return result;
}

function generateExcel(data: any) {
  try {
    console.log('[Export] Generating Excel...');

    const workbook = XLSX.utils.book_new();
    const quoteTitle = getQuoteTitle(data);
    const totalTitle = getTotalTitle(data);

    // 使用新的数据结构
    const products = data.products || [];
    const projectFields = data.projectFields || [];
    const feeConfig = data.feeConfig || { taxRate: 13 };
    const feeSummary = data.feeSummary || { subtotal: 0, taxAmount: 0, totalAmount: 0 };
    const terms = data.terms || {};
    const supplierInfo = data.supplierInfo || {};

    // 创建报价单数据 - 按照对话框格式
    const quoteData: any[][] = [];

    // 标题行（单独一行，居中）
    quoteData.push([quoteTitle]);

    // 报价单编号行
    quoteData.push(['报价单编号', data.quoteNumber]);

    // 空行
    quoteData.push(['']);

    // 项目概况
    if (projectFields.length > 0) {
      projectFields.forEach((field: any) => {
        quoteData.push([field.label, field.value || '']);
      });
      // 空行
      quoteData.push(['']);
    }

    // 产品清单
    quoteData.push(['序号', '产品名称', '规格型号', '品牌', '单位', '数量', '单价', '总价']);
    products.forEach((p: any, i: number) => {
      quoteData.push([
        i + 1,
        p.name,
        p.specifications || p.model || '',
        p.brand || '',
        p.unit || '件',
        p.quantity,
        p.unitPrice,
        p.totalPrice,
      ]);
    });

    // 费用汇总
    quoteData.push(['']);
    quoteData.push(['小计', feeSummary.subtotal]);
    quoteData.push([`税费(${feeConfig.taxRate}%)`, feeSummary.taxAmount]);
    quoteData.push([totalTitle, feeSummary.totalAmount]);
    quoteData.push(['大写金额', formatAmountToChinese(feeSummary.totalAmount)]);

    // 空行
    quoteData.push(['']);

    // 商务条款
    quoteData.push(['商务条款']);
    quoteData.push(['付款方式', terms.payment || '预付30%，发货前付清']);
    quoteData.push(['质保期', terms.warranty || '12个月']);
    quoteData.push(['交货期', terms.delivery || '7个工作日']);
    quoteData.push(['报价有效期', terms.validity || '15天']);

    // 空行
    quoteData.push(['']);

    // 账户信息
    quoteData.push(['账户信息']);
    quoteData.push(['开户银行', supplierInfo.bankName || '']);
    quoteData.push(['银行账号', supplierInfo.bankAccount || '']);
    quoteData.push(['统一社会信用代码', supplierInfo.taxNumber || '']);

    const worksheet = XLSX.utils.aoa_to_sheet(quoteData);

    // 设置列宽
    worksheet['!cols'] = [
      { wch: 8 }, // 序号/标签
      { wch: 25 }, // 产品名称/值
      { wch: 15 }, // 规格型号
      { wch: 10 }, // 品牌
      { wch: 6 }, // 单位
      { wch: 8 }, // 数量
      { wch: 12 }, // 单价
      { wch: 12 }, // 总价
    ];

    // 合并单元格 - 标题合并到整行
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // 标题合并
    ];

    // 设置标题行样式（居中、加粗）
    if (worksheet['A1']) {
      worksheet['A1'].s = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center' }};
    }

    // 设置产品清单表头样式（居中、加粗）
    const headerRow = projectFields.length > 0 ? projectFields.length + 4 : 4;
    const headerCells = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    headerCells.forEach((cell) => {
      const cellKey = `${cell}${headerRow + 1}`;
      if (worksheet[cellKey]) {
        worksheet[cellKey].s = {
          font: { bold: true },
          alignment: { horizontal: 'center' }};
      }
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, quoteTitle);

    // 使用 Uint8Array 来处理二进制数据
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const uint8Array = new Uint8Array(buffer);

    console.log('[Export] Excel generated successfully, size:', uint8Array.length);

    return new Response(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(quoteTitle + '_' + data.quoteNumber)}.xlsx"`}});
  } catch (error) {
    console.error('[Export] Excel generation error:', error);
    throw error;
  }
}

function generatePDF(data: any): Response {
  try {
    console.log('[Export] Generating PDF with jsPDF...');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'});

    // 加载中文字体
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'font_0.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    doc.addFileToVFS('font_0.ttf', fontBuffer.toString('base64'));
    doc.addFont('font_0.ttf', 'font_0', 'normal');
    doc.addFont('font_0.ttf', 'font_0', 'bold');
    doc.setFont('font_0');

    // 配色方案（与前端完全一致）
    const primaryBlue: [number, number, number] = [10, 74, 122]; // #0a4a7a
    const accentGreen: [number, number, number] = [44, 140, 153]; // #2c8c99
    const accentOrange: [number, number, number] = [249, 168, 37]; // #f9a825
    const amountRed: [number, number, number] = [211, 47, 47]; // #d32f2f
    const slate100: [number, number, number] = [241, 245, 249]; // #f1f5f9
    const slate400: [number, number, number] = [148, 163, 184]; // #94a3b8
    const yellowBg: [number, number, number] = [255, 243, 205]; // #fff3cd

    const quoteTitle = getQuoteTitle(data);
    const totalTitle = getTotalTitle(data);

    // 使用新的数据结构
    const products = data.products || [];
    const projectFields = data.projectFields || [];
    const feeConfig = data.feeConfig || { taxRate: 13 };
    const feeSummary = data.feeSummary || { subtotal: 0, taxAmount: 0, totalAmount: 0 };
    const terms = data.terms || {};
    const supplierInfo = data.supplierInfo || {};

    let yPos = 0;
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    let _pageCount = 1;

    // 蓝渐变页眉
    doc.setFillColor(...primaryBlue);
    doc.rect(0, 0, pageWidth, 30, 'F');

    // 标题
    doc.setFont('font_0', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(quoteTitle, pageWidth / 2, 20, { align: 'center' });

    // 报价单号和日期
    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    const quoteDate =
      projectFields.find((f: any) => f.label === '报价日期')?.value ||
      new Date().toLocaleDateString('zh-CN');
    doc.text(`报价单号：${data.quoteNumber} | 日期：${quoteDate}`, pageWidth / 2, 26, {
      align: 'center'});

    yPos = 40;

    // 项目概况
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('项目概况', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // 项目概况内容（两列布局）
    doc.setFont('font_0', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // #475569

    for (let i = 0; i < projectFields.length; i += 2) {
      const field1 = projectFields[i];
      const field2 = projectFields[i + 1];

      // 第一列
      doc.setFont('font_0', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(field1.label, margin, yPos);
      doc.text(':', margin + 35, yPos);
      doc.setFont('font_0', 'bold');
      doc.setTextColor(15, 23, 42); // #0f172a
      doc.text(field1.value || '-', margin + 40, yPos);

      // 第二列
      if (field2) {
        doc.setFont('font_0', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(field2.label, margin + 100, yPos);
        doc.text(':', margin + 135, yPos);
        doc.setFont('font_0', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(field2.value || '-', margin + 140, yPos);
      }

      yPos += 6;
    }

    yPos += 5;

    // 产品清单标题
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('产品清单', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // 产品表格
    const _tableData = products.map((product: any, index: number) => [
      index + 1,
      product.name,
      product.specifications || product.model || '-',
      product.brand || '-',
      product.unit || '件',
      product.quantity,
      `¥${product.unitPrice.toFixed(2)}`,
      `¥${product.totalPrice.toFixed(2)}`,
    ]);

    // 注释掉autoTable调用，因为API路由不再支持PDF导出
    // PDF导出已移至前端组件（quote-table.tsx的handleDownloadPDF函数）
    /* 
    autoTable(doc, {
      startY: yPos,
      head: [['序号', '产品名称', '规格型号', '品牌', '单位', '数量', '单价', '总价']],
      body: _tableData,
      theme: 'grid',
      styles: {
        fontSize: 9,
        font: 'font_0',
        cellPadding: 2},
      headStyles: {
        fillColor: primaryBlue,
        textColor: [255, 255, 255],
        font: 'font_0',
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3},
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', valign: 'middle' },  // 序号居中
        1: { cellWidth: 45, valign: 'middle' },  // 产品名称
        2: { cellWidth: 30, valign: 'middle' },  // 规格型号
        3: { cellWidth: 20, valign: 'middle' },  // 品牌
        4: { cellWidth: 12, halign: 'center', valign: 'middle' },  // 单位居中
        5: { cellWidth: 12, halign: 'center', valign: 'middle' },  // 数量居中
        6: { cellWidth: 25, halign: 'right', valign: 'middle', textColor: amountRed, fontStyle: 'bold' },  // 单价右对齐，红色
        7: { cellWidth: 25, halign: 'right', valign: 'middle', textColor: amountRed, fontStyle: 'bold' },  // 总价右对齐，红色
      },
      alternateRowStyles: {
        fillColor: slate100},
      didDrawPage: (data) => {
        // 添加页码
        pageCount = data.pageNumber;
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `第 ${pageCount} 页`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }});

    // 由于autoTable已注释，这里也注释掉lastAutoTable的使用
    // PDF导出已移至前端组件
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // 检查是否需要新页面
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = 20;
    }

    // 费用汇总
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('费用汇总', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // 费用汇总背景
    doc.setFillColor(...slate100);
    */
    doc.roundedRect(margin, yPos - 2, pageWidth - margin * 2, 70, 2, 2, 'F');

    doc.setFont('font_0', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);

    // 小计
    doc.text('小计', margin + 5, yPos + 8);
    doc.setTextColor(15, 23, 42);
    doc.text(`¥${feeSummary.subtotal.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, {
      align: 'right'});
    yPos += 8;

    // 税费
    doc.setTextColor(71, 85, 105);
    doc.text(`税费（${feeConfig.taxRate}%）`, margin + 5, yPos + 8);
    doc.setTextColor(15, 23, 42);
    doc.text(`¥${feeSummary.taxAmount.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, {
      align: 'right'});
    yPos += 8;

    // 运费
    if (feeSummary.shippingFee > 0) {
      doc.setTextColor(71, 85, 105);
      doc.text('运费', margin + 5, yPos + 8);
      doc.setTextColor(15, 23, 42);
      doc.text(`¥${feeSummary.shippingFee.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, {
        align: 'right'});
      yPos += 8;
    }

    // 安装调试费
    if (feeSummary.installationFee > 0) {
      doc.setTextColor(71, 85, 105);
      doc.text('安装调试费', margin + 5, yPos + 8);
      doc.setTextColor(15, 23, 42);
      doc.text(`¥${feeSummary.installationFee.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, {
        align: 'right'});
      yPos += 8;
    }

    // 其他费用
    if (feeSummary.otherFee > 0) {
      doc.setTextColor(71, 85, 105);
      doc.text('其他费用', margin + 5, yPos + 8);
      doc.setTextColor(15, 23, 42);
      doc.text(`¥${feeSummary.otherFee.toFixed(2)}`, pageWidth - margin - 5, yPos + 8, {
        align: 'right'});
      yPos += 8;
    }

    // 总价
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text(`${totalTitle}（含税）`, margin + 5, yPos + 10);
    doc.setTextColor(...amountRed);
    doc.setFontSize(16);
    doc.text(`¥${feeSummary.totalAmount.toFixed(2)}`, pageWidth - margin - 5, yPos + 10, {
      align: 'right'});
    yPos += 12;

    // 大写金额（黄色背景）
    doc.setFillColor(...yellowBg);
    doc.roundedRect(margin, yPos - 2, pageWidth - margin * 2, 20, 2, 2, 'F');
    doc.setDrawColor(...accentOrange);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, yPos - 2, pageWidth - margin * 2, 20, 2, 2, 'S');

    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('大写金额', margin + 5, yPos + 6);
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text(formatAmountToChinese(feeSummary.totalAmount), margin + 5, yPos + 15);

    yPos += 28;

    // 检查是否需要新页面
    if (yPos > pageHeight - 70) {
      doc.addPage();
      yPos = 20;
    }

    // 商务条款
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('商务条款', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // 商务条款卡片（2x2网格）
    const termsData = [
      { label: '付款方式', value: terms.payment || '预付30%，发货前付清' },
      { label: '质保期', value: terms.warranty || '12个月' },
      { label: '交货期', value: terms.delivery || '7个工作日' },
      { label: '报价有效期', value: terms.validity || '15天' },
    ];

    const cardWidth = (pageWidth - margin * 2 - 10) / 2;
    const cardHeight = 25;

    termsData.forEach((term, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * (cardWidth + 10);
      const y = yPos + row * (cardHeight + 10);

      // 卡片背景
      doc.setFillColor(...slate100);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');

      // 标签
      doc.setFont('font_0', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...accentGreen);
      doc.text(term.label, x + 5, y + 8);

      // 值
      doc.setFont('font_0', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(term.value, x + 5, y + 18);
    });

    yPos += 50 + 10; // 2行卡片 + 间距

    // 检查是否需要新页面
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }

    // 备注
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('备注', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // 备注背景（灰色 + 左侧边条）
    const remarksHeight = 40;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, remarksHeight, 2, 2, 'F');
    doc.setFillColor(...slate400);
    doc.rect(margin, yPos, 3, remarksHeight, 'F');

    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('1. 本报价单仅供参考，最终价格以双方签订的合同为准。', margin + 6, yPos + 10);
    doc.text('2. 产品规格如有变更，价格将相应调整。', margin + 6, yPos + 20);
    doc.text(`3. 如有疑问，请联系我们：${supplierInfo?.phone || ''}`, margin + 6, yPos + 30);

    yPos += remarksHeight + 8;

    // 检查是否需要新页面
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }

    // 账户信息
    doc.setFont('font_0', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryBlue);
    doc.text('账户信息', margin, yPos);
    yPos += 3;

    // 分割线
    doc.setDrawColor(...primaryBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // 账户信息卡片（彩色边条）
    const accountCardHeight = 20;

    // 开户银行（青色边条）
    doc.setFillColor(...slate100);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, accountCardHeight, 2, 2, 'F');
    doc.setFillColor(...accentGreen);
    doc.rect(margin, yPos, 3, accountCardHeight, 'F');
    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('开户银行', margin + 6, yPos + 8);
    doc.setFont('font_0', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(supplierInfo?.bankName || '中国工商银行', margin + 6, yPos + 16);
    yPos += accountCardHeight + 5;

    // 银行账号（橙色边条）
    doc.setFillColor(...slate100);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, accountCardHeight, 2, 2, 'F');
    doc.setFillColor(...accentOrange);
    doc.rect(margin, yPos, 3, accountCardHeight, 'F');
    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('银行账号', margin + 6, yPos + 8);
    doc.setFont('font_0', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(supplierInfo?.bankAccount || '6222 0000 0000 0000', margin + 6, yPos + 16);
    yPos += accountCardHeight + 5;

    // 统一社会信用代码（红色边条）
    doc.setFillColor(...slate100);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, accountCardHeight, 2, 2, 'F');
    doc.setFillColor(...amountRed);
    doc.rect(margin, yPos, 3, accountCardHeight, 'F');
    doc.setFont('font_0', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('统一社会信用代码', margin + 6, yPos + 8);
    doc.setFont('font_0', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(supplierInfo?.taxNumber || '91000000000000000X', margin + 6, yPos + 16);
    yPos += accountCardHeight + 10;

    // 检查是否需要新页面
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 20;
    }

    // 页脚（感谢语和联系方式）
    doc.setFillColor(...slate100);
    doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');

    // 感谢语
    doc.setFont('font_0', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('感谢您的信任，期待与您合作！', pageWidth / 2, pageHeight - 18, { align: 'center' });

    // 联系方式
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const contactInfo = [];
    if (supplierInfo?.address) contactInfo.push(`地址：${supplierInfo.address}`);
    if (supplierInfo?.phone) contactInfo.push(`电话：${supplierInfo.phone}`);
    if (supplierInfo?.email) contactInfo.push(`邮箱：${supplierInfo.email}`);

    if (contactInfo.length > 0) {
      const contactText = contactInfo.join('  |  ');
      doc.text(contactText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    // 添加印章（模拟圆形印章）
    const sealX = pageWidth - 40;
    const sealY = pageHeight - 40;
    const sealRadius = 20;

    doc.setDrawColor(...amountRed);
    doc.setLineWidth(0.5);
    doc.circle(sealX, sealY, sealRadius, 'S');
    doc.circle(sealX, sealY, sealRadius - 2, 'S');

    doc.setFont('font_0', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...amountRed);
    doc.text('正式报价', sealX, sealY - 8, { align: 'center' });
    doc.text(supplierInfo?.companyName || '报价专用章', sealX, sealY, { align: 'center' });
    doc.setFontSize(6);
    doc.text('仅供参考', sealX, sealY + 8, { align: 'center' });

    // 添加水印
    addWatermark(
      doc,
      data.customerInfo?.name ||
        data.projectFields?.find((f: any) => f.label === '客户名称')?.value ||
        ''
    );

    const pdfBytes = doc.output('arraybuffer');
    const buffer = Buffer.from(pdfBytes);

    console.log('[Export] PDF generated successfully, size:', buffer.length);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(quoteTitle + '_' + data.quoteNumber)}.pdf"`}});
  } catch (error) {
    console.error('[Export] PDF generation error:', error);
    throw error;
  }
}

function addWatermark(doc: jsPDF, customerName: string) {
  const watermarkText = `本报价专属：${customerName}`;

  doc.saveGraphicsState();
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.setFontSize(50);
  doc.setTextColor(150, 150, 150);
  doc.setFont('font_0');
  doc.text(watermarkText, 105, 150, {
    align: 'center',
    angle: 30});
  doc.restoreGraphicsState();
}
