/**
 * PPT 生成器（#[20260827-1030]-2）
 *
 * 使用 pptxgenjs 将完整技术方案渲染为 .pptx 文件。
 * - 封面 + 目录 + 10 章节 + 流程图 + 图表 + 报价表 + 备品备件 + 条款
 * - 支持嵌入客户端渲染的图表/流程图 PNG
 */

import type {
  EnhancedProposalResult,
  ProposalExportAssets,
} from '@/types/proposal';

// ============================================================================
// 常量
// ============================================================================

const W = 13.33; // 16:9 宽屏
const H = 7.5;
const M = 0.5; // 页边距
const ACCENT = '1D4ED8'; // 主色（深蓝）
const ACCENT_LIGHT = 'DBEAFE';
const TEXT = '1F2937';
const GRAY = '6B7280';

interface PptSectionSlide {
  section: { id: string; title: string; summary: string; content: string };
  sectionIndex: number;
  totalSections: number;
}

// ============================================================================
// 主入口
// ============================================================================

export async function generateProposalPpt(
  proposal: EnhancedProposalResult,
  assets?: ProposalExportAssets
): Promise<Buffer> {
  // 动态引入，避免 SSR 构建问题
  const pptxgen = (await import('pptxgenjs')).default;
  const pptx = new pptxgen();

  pptx.defineLayout({ name: 'WIDE', width: W, height: H });
  pptx.layout = 'WIDE';
  pptx.author = proposal.supplierInfo?.companyName || '方案系统';
  pptx.title = proposal.title;
  pptx.subject = proposal.projectName;

  // 封面
  addCoverSlide(pptx, proposal);
  // 目录
  addAgendaSlide(pptx, proposal);
  // 章节（前 8 章正文 + 报价 + 附件）
  proposal.sections.forEach((section, idx) => {
    addSectionSlide(pptx, { section, sectionIndex: idx + 1, totalSections: proposal.sections.length }, proposal);
  });
  // 流程图
  addDiagramSlide(pptx, proposal, assets);
  // 图表
  addChartsSlide(pptx, proposal, assets);
  // 报价明细表
  addQuoteTableSlide(pptx, proposal);
  // 备品备件
  addSparePartsSlide(pptx, proposal);
  // 条款
  addTermsSlide(pptx, proposal);

  const result = await pptx.write({ outputType: 'nodebuffer' });
  const bytes = result instanceof Uint8Array ? result : new Uint8Array(result as ArrayBuffer);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// ============================================================================
// 辅助
// ============================================================================

function addCoverSlide(pptx: any, proposal: EnhancedProposalResult) {
  const slide = pptx.addSlide();
  slide.background = { color: '0F2A6B' };
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.18, fill: { color: ACCENT } });
  slide.addText(proposal.title || '技术方案', {
    x: 0.9, y: 2.2, w: 11.5, h: 1.6,
    fontSize: 34, bold: true, color: 'FFFFFF', fontFace: 'Microsoft YaHei',
  });
  slide.addText(proposal.projectName || '污水处理项目', {
    x: 0.9, y: 3.7, w: 11.5, h: 0.7,
    fontSize: 18, color: 'BFDBFE', fontFace: 'Microsoft YaHei',
  });
  slide.addText(
    [
      { text: `设计规模：${proposal.capacity} m³/d　　`, options: { color: 'DBEAFE' } },
      { text: `编制：${proposal.supplierInfo?.companyName || ''}`, options: { color: 'DBEAFE' } },
    ],
    { x: 0.9, y: 4.5, w: 11.5, h: 0.5, fontSize: 14, fontFace: 'Microsoft YaHei' }
  );
  slide.addText(proposal.generatedAt || '', {
    x: 0.9, y: 6.6, w: 11.5, h: 0.4, fontSize: 12, color: '93C5FD', align: 'right',
  });
}

function addAgendaSlide(pptx: any, proposal: EnhancedProposalResult) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, '目录', proposal.sections.length);
  const headerCell = (text: string) => ({
    text,
    options: { bold: true, color: 'FFFFFF', fill: { color: ACCENT } },
  });
  const rows = proposal.sections.map((s, i) => [
    { text: s.id, options: { bold: true, color: ACCENT } },
    { text: s.title, options: { color: TEXT } },
    { text: s.summary.slice(0, 40), options: { color: GRAY } },
  ]);
  rows.unshift([headerCell('章节'), headerCell('标题'), headerCell('摘要')]);
  slide.addTable(rows, {
    x: M, y: 1.5, w: W - M * 2,
    colW: [0.9, 3.6, 7.8],
    fontSize: 12, fontFace: 'Microsoft YaHei',
    border: { pt: 0.5, color: 'E5E7EB' },
    fill: { color: 'FFFFFF' },
  });
}

function addSectionSlide(
  pptx: any,
  ctx: PptSectionSlide,
  proposal: EnhancedProposalResult
) {
  const { section } = ctx;
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, `第 ${section.id} 章　${section.title}`, ctx.totalSections);

  // 章节摘要
  if (section.summary) {
    slide.addText(section.summary, {
      x: M, y: 1.25, w: W - M * 2, h: 0.7,
      fontSize: 12, color: GRAY, italic: true, fontFace: 'Microsoft YaHei',
    });
  }

  // 正文精简为要点（markdown -> 纯文本要点）
  const bullets = markdownToBullets(section.content, 12);
  slide.addText(bullets, {
    x: M, y: 1.95, w: W - M * 2, h: 5.0,
    fontSize: 12, color: TEXT, fontFace: 'Microsoft YaHei', valign: 'top',
    lineSpacing: 16,
  });
}

function addDiagramSlide(pptx: any, proposal: EnhancedProposalResult, assets?: ProposalExportAssets) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, '工艺流程图', proposal.sections.length);

  const diagramPng = assets?.diagram?.png;
  if (diagramPng) {
    slide.addImage({
      data: stripDataPrefix(diagramPng),
      x: 0.8, y: 1.6, w: W - 1.6, h: 4.9,
      sizing: { type: 'contain', w: W - 1.6, h: 4.9 },
    });
  } else {
    // 无图片时展示文字版工艺路线
    const steps = extractProcessSteps(proposal.mermaidSource);
    const bullets = steps.map((s) => ({ text: s, options: { bullet: true, color: TEXT } }));
    slide.addText(bullets, {
      x: M, y: 1.6, w: W - M * 2, h: 5.0,
      fontSize: 15, color: TEXT, fontFace: 'Microsoft YaHei', valign: 'top', lineSpacing: 24,
    });
  }
}

function addChartsSlide(pptx: any, proposal: EnhancedProposalResult, assets?: ProposalExportAssets) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, '投资构成与设备参数可视化', proposal.sections.length);

  const quotePng = assets?.charts?.quoteBreakdown;
  const eqPng = assets?.charts?.equipmentCompare;
  const hasAny = !!(quotePng || eqPng);

  if (!hasAny) {
    // 无图表图片时，用报价分类表格
    const data = proposal.chartData?.quoteBreakdown || [];
    const rows = data.map((d) => [
      { text: d.name, options: { color: TEXT } },
      { text: `${d.value.toLocaleString('zh-CN')} 元`, options: { color: TEXT } },
      { text: `${proposal.totalAmount > 0 ? ((d.value / proposal.totalAmount) * 100).toFixed(1) : 0}%`, options: { color: ACCENT, bold: true } },
    ]);
    rows.unshift([
      { text: '投资分类', options: { bold: true, color: 'FFFFFF' } },
      { text: '金额（元）', options: { bold: true, color: 'FFFFFF' } },
      { text: '占比', options: { bold: true, color: 'FFFFFF' } },
    ]);
    slide.addTable(rows, {
      x: 1.5, y: 1.8, w: W - 3,
      colW: [4.0, 3.0, 2.5],
      fontSize: 12, fontFace: 'Microsoft YaHei',
      border: { pt: 0.5, color: 'E5E7EB' },
      fill: { color: 'FFFFFF' },
    });
    return;
  }

  const imgW = (W - 1.6) / 2;
  if (quotePng) {
    slide.addText('报价占比', { x: 0.8, y: 1.35, w: imgW, h: 0.35, fontSize: 12, bold: true, color: ACCENT, fontFace: 'Microsoft YaHei' });
    slide.addImage({ data: stripDataPrefix(quotePng), x: 0.8, y: 1.7, w: imgW, h: 4.9, sizing: { type: 'contain', w: imgW, h: 4.9 } });
  }
  if (eqPng) {
    slide.addText('设备参数对比', { x: 0.8 + imgW, y: 1.35, w: imgW, h: 0.35, fontSize: 12, bold: true, color: ACCENT, fontFace: 'Microsoft YaHei' });
    slide.addImage({ data: stripDataPrefix(eqPng), x: 0.8 + imgW, y: 1.7, w: imgW, h: 4.9, sizing: { type: 'contain', w: imgW, h: 4.9 } });
  }
}

function addQuoteTableSlide(pptx: any, proposal: EnhancedProposalResult) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, `报价单　合计：¥ ${proposal.totalAmount.toLocaleString('zh-CN')}`, proposal.sections.length);

  const items = proposal.quoteItems || [];
  if (items.length === 0) {
    slide.addText('报价明细为空', { x: M, y: 2, w: W - M * 2, h: 1, fontSize: 14, color: GRAY });
    return;
  }

  const rows = items.map((it) => [
    { text: it.name, options: { color: TEXT } },
    { text: it.model || '-', options: { color: TEXT } },
    { text: it.brand || '-', options: { color: TEXT } },
    { text: String(it.quantity), options: { color: TEXT } },
    { text: it.unitPrice.toLocaleString('zh-CN'), options: { color: TEXT } },
    { text: it.totalPrice.toLocaleString('zh-CN'), options: { color: ACCENT, bold: true } },
  ]);
  rows.unshift([
    { text: '名称', options: { bold: true, color: 'FFFFFF' } },
    { text: '规格型号', options: { bold: true, color: 'FFFFFF' } },
    { text: '品牌/产地', options: { bold: true, color: 'FFFFFF' } },
    { text: '数量', options: { bold: true, color: 'FFFFFF' } },
    { text: '单价(元)', options: { bold: true, color: 'FFFFFF' } },
    { text: '小计(元)', options: { bold: true, color: 'FFFFFF' } },
  ]);

  slide.addTable(rows, {
    x: 0.3, y: 1.5, w: W - 0.6,
    colW: [2.6, 2.5, 2.2, 0.8, 1.6, 2.0],
    fontSize: 10, fontFace: 'Microsoft YaHei',
    border: { pt: 0.5, color: 'E5E7EB' },
    fill: { color: 'FFFFFF' },
    rowH: 0.34,
  });
}

function addSparePartsSlide(pptx: any, proposal: EnhancedProposalResult) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, '首年推荐备品备件清单', proposal.sections.length);

  const parts = proposal.spareParts || [];
  if (parts.length === 0) {
    slide.addText('备品备件清单为空', { x: M, y: 2, w: W - M * 2, h: 1, fontSize: 14, color: GRAY });
    return;
  }

  const rows = parts.map((p) => [
    { text: p.name, options: { color: TEXT } },
    { text: p.model || '-', options: { color: TEXT } },
    { text: p.brand || '-', options: { color: TEXT } },
    { text: String(p.quantity), options: { color: TEXT } },
    { text: p.unitPrice.toLocaleString('zh-CN'), options: { color: TEXT } },
    { text: p.totalPrice.toLocaleString('zh-CN'), options: { color: ACCENT, bold: true } },
  ]);
  rows.unshift([
    { text: '名称', options: { bold: true, color: 'FFFFFF' } },
    { text: '规格型号', options: { bold: true, color: 'FFFFFF' } },
    { text: '品牌', options: { bold: true, color: 'FFFFFF' } },
    { text: '数量', options: { bold: true, color: 'FFFFFF' } },
    { text: '单价(元)', options: { bold: true, color: 'FFFFFF' } },
    { text: '小计(元)', options: { bold: true, color: 'FFFFFF' } },
  ]);

  slide.addTable(rows, {
    x: 0.5, y: 1.5, w: W - 1.0,
    colW: [2.8, 2.6, 2.2, 0.9, 1.6, 2.0],
    fontSize: 11, fontFace: 'Microsoft YaHei',
    border: { pt: 0.5, color: 'E5E7EB' },
    fill: { color: 'FFFFFF' },
  });
}

function addTermsSlide(pptx: any, proposal: EnhancedProposalResult) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  addSlideHeader(pptx, slide, '付款、质保与服务条款', proposal.sections.length);

  const sections = [
    { title: '付款方式', lines: proposal.paymentTerms || [] },
    { title: '质保条款', lines: proposal.warrantyTerms || [] },
    { title: '技术服务', lines: proposal.serviceTerms || [] },
  ];

  let y = 1.5;
  sections.forEach((sec) => {
    slide.addText(sec.title, { x: M, y, w: 3, h: 0.4, fontSize: 15, bold: true, color: ACCENT, fontFace: 'Microsoft YaHei' });
    const bullets = sec.lines.map((l) => ({ text: l, options: { bullet: true, color: TEXT } }));
    slide.addText(bullets, {
      x: M + 0.2, y: y + 0.42, w: W - M * 2 - 0.2, h: Math.min(1.6, sec.lines.length * 0.36 + 0.2),
      fontSize: 12, color: TEXT, fontFace: 'Microsoft YaHei', valign: 'top', lineSpacing: 18,
    });
    y += 0.42 + Math.min(1.6, sec.lines.length * 0.36 + 0.2);
  });
}

// ============================================================================
// 工具
// ============================================================================

function addSlideHeader(pptx: any, slide: any, title: string, total: number) {
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.9, fill: { color: 'F8FAFC' } });
  slide.addShape('rect', { x: 0, y: 0.86, w: W, h: 0.04, fill: { color: ACCENT } });
  slide.addText(title, {
    x: M, y: 0.18, w: W - M * 2, h: 0.55,
    fontSize: 20, bold: true, color: '0F172A', fontFace: 'Microsoft YaHei',
  });
}

/** markdown 转 PPT 要点列表 */
function markdownToBullets(markdown: string, max: number): any[] {
  const lines = (markdown || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('---') && !l.startsWith('```'))
    .map((l) => l.replace(/^[-*+]\s+/, '').replace(/\*\*/g, '').replace(/`/g, ''))
    .filter((l) => l.length > 0)
    .slice(0, max);

  return lines.map((l) => ({ text: l.length > 60 ? l.slice(0, 60) + '…' : l, options: { bullet: true, color: TEXT } }));
}

/** 从 mermaid 源码提取步骤名（无图时的文字版工艺路线） */
function extractProcessSteps(mermaidSource: string): string[] {
  if (!mermaidSource) return [];
  const steps: string[] = [];
  const nodeRe = /\bS(\d+)\["([^"]+)"\]/g;
  let m: RegExpExecArray | null;
  const nodes: { step: number; name: string }[] = [];
  while ((m = nodeRe.exec(mermaidSource)) !== null) {
    nodes.push({ step: parseInt(m[1], 10), name: m[2] });
  }
  nodes.sort((a, b) => a.step - b.step);
  nodes.forEach((n) => steps.push(`${n.step}. ${n.name}`));
  if (steps.length === 0) {
    return ['预处理 → 主处理 → 深度处理 → 消毒 → 出水'].concat((mermaidSource.match(/\["([^"]+)"\]/g) || []).slice(0, 6).map((s) => s.replace(/\["|"\]/g, '')));
  }
  return steps;
}

/** 去掉 dataURL 前缀，pptxgenjs 的 data 参数需要纯 base64 */
function stripDataPrefix(dataUrl: string): string {
  if (!dataUrl) return '';
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}
