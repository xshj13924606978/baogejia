import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json();

    console.log('[Proposal] Received request:', { quoteNumber: data?.quoteNumber });

    return await generateProposal(data);
  } catch (error) {
    console.error('[Proposal] Generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate proposal', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function generateProposal(data: any): Response {
  try {
    console.log('[Proposal] Generating proposal PDF with jsPDF...');

    const doc = new jsPDF();

    // 加载中文字体
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'font_0.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    doc.addFileToVFS('font_0.ttf', fontBuffer.toString('base64'));
    doc.addFont('font_0.ttf', 'font_0', 'normal');
    doc.addFont('font_0.ttf', 'font_0', 'bold');
    doc.setFont('font_0');

    let yPos = 20;

    // === 封面 ===
    doc.setFontSize(24);
    doc.text('完整解决方案', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(16);
    doc.text(data.customerInfo.projectName || '项目方案书', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(12);
    doc.text(`致：${data.customerInfo.name}`, 105, yPos, { align: 'center' });
    yPos += 8;
    doc.text(`报价单号：${data.quoteNumber}`, 105, yPos, { align: 'center' });
    yPos += 8;
    doc.text(new Date().toLocaleDateString('zh-CN'), 105, yPos, { align: 'center' });

    // 添加水印
    addWatermark(doc, data.customerInfo.name);

    // 新页面 - 目录
    doc.addPage();
    yPos = 20;
    doc.setFontSize(22);
    doc.text('目录', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(14);
    const tocItems = [
      { title: '一、项目背景', page: 3 },
      { title: '二、解决方案', page: 4 },
      { title: '三、产品明细', page: 5 },
      { title: '四、服务承诺', page: 7 },
      { title: '五、商务条款', page: 8 },
    ];

    tocItems.forEach((item) => {
      doc.text(item.title, 20, yPos);
      doc.text(`第 ${item.page} 页`, 170, yPos);
      yPos += 8;
    });

    // 新页面 - 项目背景
    doc.addPage();
    yPos = 20;
    addWatermark(doc, data.customerInfo.name);

    doc.setFontSize(22);
    doc.text('一、项目背景', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(12);
    const backgroundText = '本项目旨在为客户提供专业的产品解决方案，满足客户在业务发展中的实际需求。通过深入的需求分析和专业的产品选型，我们为您制定了以下详细的解决方案。';
    const splitBackground = doc.splitTextToSize(backgroundText, 170);
    doc.text(splitBackground, 20, yPos);
    yPos += 20;

    const backgroundText2 = '本方案书将详细介绍项目的解决方案、产品配置、服务承诺以及商务条款，帮助您全面了解我们的服务内容和合作方式。';
    const splitBackground2 = doc.splitTextToSize(backgroundText2, 170);
    doc.text(splitBackground2, 20, yPos);

    // 新页面 - 解决方案
    doc.addPage();
    yPos = 20;
    addWatermark(doc, data.customerInfo.name);

    doc.setFontSize(22);
    doc.text('二、解决方案', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(12);
    const solutionText = '基于对客户需求的深入理解，我们为您制定了以下解决方案：';
    const splitSolution = doc.splitTextToSize(solutionText, 170);
    doc.text(splitSolution, 20, yPos);
    yPos += 15;

    const solutionItems = [
      '专业的产品选型：根据您的实际需求，选择最适合的产品型号和配置',
      '优化的成本控制：在保证产品质量的前提下，提供最具竞争力的价格',
      '完善的售后服务：提供全生命周期的技术支持和维护服务',
      '灵活的交付方式：根据您的项目进度，提供灵活的产品交付方案',
    ];

    solutionItems.forEach((item) => {
      const splitItem = doc.splitTextToSize(`• ${item}`, 170);
      doc.text(splitItem, 20, yPos);
      yPos += 10;
    });

    // 新页面 - 产品明细
    doc.addPage();
    yPos = 20;
    addWatermark(doc, data.customerInfo.name);

    doc.setFontSize(22);
    doc.text('三、产品明细', 105, yPos, { align: 'center' });
    yPos += 15;

    // 产品表格
    const tableData = data.products.map((product: any, index: number) => [
      index + 1,
      product.name,
      product.model,
      product.specifications,
      product.quantity,
      `¥${product.unitPrice.toLocaleString()}`,
      `¥${product.totalPrice.toLocaleString()}`,
    ]);

    // 注释掉autoTable调用，因为API路由不再支持PDF导出
    // autoTable相关的整个代码块已被注释
    /*
    autoTable(doc, {
      startY: yPos,
      head: [['序号', '产品名称', '型号', '规格参数', '数量', '单价', '小计']],
      body: tableData,
      theme: 'grid',
      styles: { 
        fontSize: 9,
        font: 'font_0',
      },
      headStyles: { 
        fillColor: [59, 130, 246],
        font: 'font_0',
      },
    });

    // 合计信息
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('font_0');
    doc.text(`小计: ¥${data.subtotal.toLocaleString()}`, 130, yPos);
    yPos += 8;
    doc.text(`税率 (${data.taxRate}%): ¥${data.taxAmount.toLocaleString()}`, 130, yPos);
    yPos += 12;
    doc.setFontSize(18);
    doc.setFont('font_0');
    doc.text(`总计: ¥${data.totalAmount.toLocaleString()}`, 130, yPos);

    // 新页面 - 服务承诺
    doc.addPage();
    yPos = 20;
    addWatermark(doc, data.customerInfo.name);

    doc.setFontSize(22);
    doc.text('四、服务承诺', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(12);

    const serviceItems = [
      {
        title: '技术支持',
        content: '我们提供专业的技术支持团队，7x24小时响应您的技术咨询和问题解决。'
      },
      {
        title: '产品质保',
        content: '所有产品均提供12个月质保期，质保期内免费维修或更换。'
      },
      {
        title: '培训服务',
        content: '为您的操作人员提供专业培训，确保正确使用产品。'
      },
      {
        title: '升级服务',
        content: '提供产品升级服务，确保您的系统始终保持最新状态。'
      },
    ];

    serviceItems.forEach((item) => {
      doc.setFontSize(14);
      doc.text(item.title, 20, yPos);
      yPos += 8;

      doc.setFontSize(12);
      const splitContent = doc.splitTextToSize(item.content, 170);
      doc.text(splitContent, 20, yPos);
      yPos += 15;
    });

    // 新页面 - 商务条款
    doc.addPage();
    yPos = 20;
    addWatermark(doc, data.customerInfo.name);

    doc.setFontSize(22);
    doc.text('五、商务条款', 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(12);

    const terms = [
      { label: '付款方式', value: data.terms?.payment || '预付30%，发货前付清' },
      { label: '质保期', value: data.terms?.warranty || '12个月' },
      { label: '交货期', value: data.terms?.delivery || '7个工作日' },
      { label: '报价有效期', value: data.terms?.validity || '15天' },
    ];

    terms.forEach((term) => {
      doc.setFontSize(14);
      doc.text(term.label, 20, yPos);
      yPos += 8;

      doc.setFontSize(12);
      const splitValue = doc.splitTextToSize(term.value, 170);
      doc.text(splitValue, 20, yPos);
      yPos += 12;
    });

    // 结束语
    yPos += 10;
    doc.setFontSize(14);
    doc.text('感谢您对我们的信任与支持！', 105, yPos, { align: 'center' });
    yPos += 10;

    doc.setFontSize(12);
    doc.text('我们期待与您携手合作，共创美好未来！', 105, yPos, { align: 'center' });

    const pdfBytes = doc.output('arraybuffer');
    const buffer = Buffer.from(pdfBytes);

    console.log('[Proposal] Proposal PDF generated successfully, size:', buffer.length);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent('完整方案书_' + data.quoteNumber)}.pdf"`,
      },
    });
    */
    
    // PDF导出功能已移至前端，返回错误提示
    return new Response(JSON.stringify({ error: 'PDF导出功能已移至前端，请使用网页端的导出PDF功能' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
    
  } catch (error) {
    console.error('[Proposal] PDF generation error:', error);
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
    angle: 30,
  });
  doc.restoreGraphicsState();
}
