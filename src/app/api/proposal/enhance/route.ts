/**
 * 方案增强 API 接口（#[20260827-1030]-2 扩展）
 *
 * 提供以下接口：
 * - POST /api/proposal/enhance - 增强技术方案（支持 format 导出：markdown/pdf/word/excel/ppt）
 * - POST /api/proposal/enhance - 自然语言生成方案（action: 'generate'，#[20260827-1030]-6 混合驱动）
 * - GET /api/proposal/enhance/status - 获取增强器状态
 *
 * 请求体（EnhanceProposalRequest）：
 * - action: 'enhance'
 * - context: { projectType, capacity, influentQuality?, effluentStandards?, processType?, location?, budget?, requirements?, supplierInfo? }
 * - originalProposal: string
 * - options: { enhancementLevel?, includeCharts?, includeDiagram? }
 * - format?: 'markdown' | 'pdf' | 'word' | 'excel' | 'ppt'
 * - assets?: { charts?, diagram?, images? } 客户端渲染的图表/流程图图片（用于导出嵌入）
 *
 * 请求体（GenerateProposalRequest，action: 'generate'）：
 * - userInput: string 自然语言需求（如"食品废水100吨/天"）
 * - options?: { useAI?, complexity?, knowledgeLimit? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import MarkdownIt from 'markdown-it';
import * as XLSX from 'xlsx';
import puppeteer from 'puppeteer';
import {
  proposalEnhancer,
  ProposalContext,
  CompleteProposalOptions,
} from '@/lib/proposal-enhancer';
import type {
  EnhancedProposalResult,
  ProposalExportFormat,
  ProposalExportAssets,
  ProposalSupplierInfo,
} from '@/types/proposal';
import { Logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';
// #202608302400 阶段2 P0-4：模块权限拦截网关
import { checkModulePermission } from '@/lib/permission-gate';
import { safeErrorMessage } from '@/lib/error-handler';

// ============================================================================
// Supabase 服务端客户端（供方信息动态获取）
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getServiceSupabase = () =>
  createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/**
 * 从系统用户/客户资料库动态获取供方信息（suppliers 表，按 user_id 关联）
 */
async function fetchSupplierInfo(userId: string): Promise<ProposalSupplierInfo | null> {
  try {
    if (!supabaseUrl || !supabaseKey) return null;
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from('suppliers')
      .select(
        'id,company_name,address,contact_person,phone,email,tax_number,bank_name,bank_account,website'
      )
      .eq('metadata->>user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      Logger.warn('[ProposalEnhancer] 查询供方信息失败:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      companyName: data.company_name || '',
      address: data.address || undefined,
      contactPerson: data.contact_person || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      taxNumber: data.tax_number || undefined,
      bankName: data.bank_name || undefined,
      bankAccount: data.bank_account || undefined,
      website: data.website || undefined,
    };
  } catch (e: any) {
    Logger.warn('[ProposalEnhancer] 供方信息获取异常，降级处理:', e?.message || e);
    return null;
  }
}

/**
 * 合并供方信息：数据库优先，客户端可补充覆盖
 */
function mergeSupplierInfo(
  dbInfo: ProposalSupplierInfo | null,
  clientInfo?: Partial<ProposalSupplierInfo>
): ProposalSupplierInfo {
  return {
    companyName: clientInfo?.companyName || dbInfo?.companyName || '',
    address: clientInfo?.address || dbInfo?.address,
    contactPerson: clientInfo?.contactPerson || dbInfo?.contactPerson,
    phone: clientInfo?.phone || dbInfo?.phone,
    email: clientInfo?.email || dbInfo?.email,
    taxNumber: clientInfo?.taxNumber || dbInfo?.taxNumber,
    bankName: clientInfo?.bankName || dbInfo?.bankName,
    bankAccount: clientInfo?.bankAccount || dbInfo?.bankAccount,
    website: clientInfo?.website || dbInfo?.website,
  };
}

/**
 * 生成请求级稳定 referenceId，用于方案增强扣减幂等
 */
async function generateReferenceId(userId: string, payload: string, level: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${userId}:${level}:${payload}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `enhance_${hashHex.slice(0, 16)}`;
}

// ============================================================================
// POST - 增强技术方案
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const userId = currentUser.id;

    const body = await request.json();
    const { action } = body;

    // 路由到不同的处理器
    switch (action) {
      case 'enhance':
        return await handleEnhance(body, userId, currentUser);
      case 'generate':
        return await handleGenerate(body, userId, currentUser);
      default:
        return NextResponse.json(
          {
            success: false,
            error: '未知的操作类型',
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    Logger.error('Proposal API 请求失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '请求处理失败'),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - 获取增强器状态
// ============================================================================

export async function GET() {
  try {
    const deepseekAvailable = !!process.env.DEEPSEEK_API_KEY;
    const cozeStatus = {
      enabled: process.env.ENABLE_COZE_TOOLS === 'true',
      webSearch: process.env.ENABLE_COZE_WEB_SEARCH === 'true',
      embedding: process.env.ENABLE_COZE_EMBEDDING === 'true',
      imageGeneration: process.env.ENABLE_COZE_IMAGE_GENERATION === 'true',
    };

    return NextResponse.json({
      success: true,
      data: {
        available: deepseekAvailable || cozeStatus.enabled,
        deepseekAvailable,
        cozeStatus,
        message: deepseekAvailable
          ? '方案增强器已就绪（DeepSeek）'
          : '方案增强器需要配置 DeepSeek API Key',
      },
    });
  } catch (error: any) {
    Logger.error('获取增强器状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取状态失败'),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 处理器函数
// ============================================================================

/**
 * 处理方案增强
 */
async function handleEnhance(body: any, userId: string, currentUser: any) {
  const { context, originalProposal, options, format, assets, preGeneratedResult } = body;

  // #202608302400 阶段2 P0-4：模块权限拦截（方案增强 → enhance_proposal）
  // 判定顺序：管理员直通 → 既有 RBAC → member_module_permissions → 默认矩阵
  const permResult = await checkModulePermission({
    userId,
    moduleKey: 'enhance_proposal',
    role: currentUser?.role,
  });
  if (!permResult.allowed) {
    Logger.warn('[ProposalEnhancer] 模块权限不足:', {
      userId,
      level: permResult.level,
      source: permResult.source,
      required: permResult.requiredLevel,
    });
    return NextResponse.json(
      {
        success: false,
        error: permResult.reason || '无权限使用方案增强',
        code: 'MODULE_PERMISSION_DENIED',
        module: 'enhance_proposal',
        moduleLabel: permResult.moduleLabel,
        currentLevel: permResult.level,
        currentLevelName: permResult.levelName,
        requiredLevel: permResult.requiredLevel,
        requiredLevelName: permResult.requiredLevelName,
        upgradeHint: permResult.upgradeHint,
      },
      { status: 403 }
    );
  }

  const exportFormat: ProposalExportFormat | undefined = ['markdown', 'pdf', 'word', 'excel', 'ppt'].includes(
    format
  )
    ? format
    : undefined;

  // 快速导出路径：客户端已生成结果，直接导出（不重新生成、不重复扣分）
  if (preGeneratedResult && exportFormat) {
    const result = normalizePreGeneratedResult(preGeneratedResult);
    Logger.info('[ProposalEnhancer] 快速导出（不重新生成）', {
      format: exportFormat,
      章节数量: result.sections?.length || 0,
    });
    return handleExportWithResult(result, exportFormat, assets);
  }

  // 验证必要参数
  if (!context || !originalProposal) {
    return NextResponse.json(
      {
        success: false,
        error: '缺少必要参数：context 和 originalProposal',
      },
      { status: 400 }
    );
  }

  // 验证 context
  if (!context.projectType || !context.capacity) {
    return NextResponse.json(
      {
        success: false,
        error: 'context 必须包含 projectType 和 capacity 字段',
      },
      { status: 400 }
    );
  }

  // 估算 Token 数量（基于方案内容)
  const proposalText = JSON.stringify(originalProposal);
  const estimatedTokens = Math.ceil(proposalText.length / 4) + 500; // 估算 tokens

  // 按档位差异化定价 + Token 动态消耗
  const enhancementLevel = options?.enhancementLevel || 'standard';
  const basePoints = Math.abs(await pointsService.getEnhanceProposalPoints(enhancementLevel));
  const tokenPoints = await pointsService.calculatePointsForTokens(userId, estimatedTokens);
  const requiredPoints = Math.max(1, basePoints + tokenPoints);

  // 生成幂等 referenceId
  const referenceId = await generateReferenceId(
    userId,
    `${context.projectType}:${context.capacity}:${proposalText}`,
    enhancementLevel
  );

  // 积分预检查
  const hasEnough = await pointsService.checkPointsBalance(userId, requiredPoints);
  if (!hasEnough) {
    const pointsInfo = await pointsService.getUserPoints(userId);
    return NextResponse.json(
      {
        success: false,
        error: '积分不足',
        message: `方案增强需要 ${requiredPoints} 积分，当前余额: ${pointsInfo?.points} 积分`,
        required: requiredPoints,
        balance: pointsInfo?.points,
      },
      { status: 402 }
    );
  }

  try {
    Logger.info('[ProposalEnhancer] 开始处理增强请求', {
      projectType: context.projectType,
      capacity: context.capacity,
      enhancementLevel,
      format: exportFormat || 'json',
    });

    // 动态获取供方信息（系统用户/客户资料库）
    const dbSupplier = await fetchSupplierInfo(userId);
    const supplierInfo = mergeSupplierInfo(dbSupplier, context.supplierInfo);

    // 调用增强器（完整 10 章节方案）
    const completeOptions: CompleteProposalOptions = {
      ...options,
      supplierInfo,
      includeCharts: options?.includeCharts !== false,
      includeDiagram: options?.includeDiagram !== false,
    };

    const result: EnhancedProposalResult = await proposalEnhancer.generateCompleteProposal(
      context as ProposalContext,
      originalProposal,
      completeOptions
    );

    Logger.info('[ProposalEnhancer] 增强完成', {
      章节数量: result.sections.length,
      报价条目数量: result.quoteItems.length,
      备品备件数量: result.spareParts.length,
      计算书条目: result.designCalculations.length,
      总金额: result.totalAmount,
    });

    // 扣除积分（referenceId 幂等）
    const deductResult = await pointsService.deductPoints(
      userId,
      requiredPoints,
      'enhance_proposal',
      `方案增强[${enhancementLevel}]: ${context.projectType} ${context.capacity}`,
      referenceId
    );

    if (!deductResult.success) {
      Logger.error('[ProposalEnhancer] 扣除积分失败:', deductResult.reason);
      return NextResponse.json(
        {
          success: false,
          error: '积分扣除失败: ' + (deductResult.reason || '未知错误'),
        },
        { status: 500 }
      );
    }

    Logger.info('[ProposalEnhancer] 扣除积分成功:', requiredPoints);
    const newPointsInfo = await pointsService.getUserPoints(userId);

    // 按 format 返回对应导出文件
    return await handleExportWithResult(result, exportFormat, assets, {
      pointsConsumed: requiredPoints,
      newBalance: newPointsInfo?.points || 0,
    });
  } catch (error: any) {
    Logger.error('[ProposalEnhancer] 增强失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '方案增强失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 处理自然语言方案生成（#[20260827-1030]-6 混合驱动：规则层+知识层+AI，
 *                       #[20260827-1030]-7 数据决策链路+持久化）
 * 无需上传方案，仅凭一句话需求即可生成完整、有据的技术方案。
 * 传入用户上下文（userId）以启用：产品价格库/定额库按用户匹配、
 * 公司信息库供方信息、方案历史持久化。
 */
async function handleGenerate(body: any, userId: string, currentUser: any) {
  const { userInput, options } = body;

  if (!userInput || typeof userInput !== 'string' || !userInput.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: '缺少必要参数：userInput',
      },
      { status: 400 }
    );
  }

  try {
    Logger.info('[ProposalGenerator] 开始生成方案', {
      userInput: userInput.slice(0, 80),
      options,
      userId,
    });

    const { generateProposal } = await import('@/lib/proposal-generator');
    const result = await generateProposal(userInput, {
      useAI: options?.useAI !== false,
      complexity: options?.complexity,
      knowledgeLimit: options?.knowledgeLimit,
      userId,
      enableOnlineSearch: options?.enableOnlineSearch,
      saveToHistory: options?.saveToHistory,
    });

    Logger.info('[ProposalGenerator] 生成完成', {
      method: result.method,
      设备数量: result.equipment.items.length,
      设备费小计: result.equipment.equipmentTotal,
      预算总价: result.cost.total,
      标准数量: result.standards.length,
      知识条目: result.knowledge.length,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    Logger.error('[ProposalGenerator] 生成失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '方案生成失败'),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 格式导出处理器（#[20260827-1030]-2）
// ============================================================================

/** 按格式导出统一入口（生成路径与快速导出路径共用） */
async function handleExportWithResult(
  result: EnhancedProposalResult,
  exportFormat: ProposalExportFormat | undefined,
  assets?: ProposalExportAssets,
  meta?: { pointsConsumed?: number; newBalance?: number }
): Promise<NextResponse> {
  switch (exportFormat) {
    case 'ppt':
      return await handlePptExport(result, assets);
    case 'markdown':
      return await handleMarkdownExport(result);
    case 'word':
      return await handleWordExport(result, assets);
    case 'excel':
      return await handleExcelExport(result);
    case 'pdf':
      return await handlePdfExport(result, assets);
    default:
      return NextResponse.json({
        success: true,
        data: result,
        pointsConsumed: meta?.pointsConsumed || 0,
        newBalance: meta?.newBalance || 0,
      });
  }
}

/**
 * 归一化客户端回传的预生成结果（字段容错，避免导出时崩溃）
 */
function normalizePreGeneratedResult(raw: any): EnhancedProposalResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('preGeneratedResult 格式无效');
  }
  return {
    proposalId: raw.proposalId || `FA-${Date.now().toString(36).toUpperCase()}`,
    title: raw.title || '技术方案',
    projectName: raw.projectName || '技术方案项目',
    projectType: raw.projectType || '',
    capacity: Number(raw.capacity) || 0,
    supplierInfo: raw.supplierInfo || { companyName: '' },
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    markdown: raw.markdown || '',
    mermaidSource: raw.mermaidSource || '',
    chartData: raw.chartData || { quoteBreakdown: [], equipmentCompare: [], totalAmount: 0 },
    images: Array.isArray(raw.images) ? raw.images : [],
    quoteItems: Array.isArray(raw.quoteItems) ? raw.quoteItems : [],
    spareParts: Array.isArray(raw.spareParts) ? raw.spareParts : [],
    designCalculations: Array.isArray(raw.designCalculations) ? raw.designCalculations : [],
    paymentTerms: Array.isArray(raw.paymentTerms) ? raw.paymentTerms : [],
    serviceTerms: Array.isArray(raw.serviceTerms) ? raw.serviceTerms : [],
    warrantyTerms: Array.isArray(raw.warrantyTerms) ? raw.warrantyTerms : [],
    totalAmount: Number(raw.totalAmount) || 0,
    confidence: Number(raw.confidence) || 0,
    generatedAt: raw.generatedAt || new Date().toISOString(),
  };
}

/** PPT 导出 */
async function handlePptExport(result: EnhancedProposalResult, assets?: ProposalExportAssets) {
  const { generateProposalPpt } = await import('@/lib/export/ppt-exporter');
  const buffer = await generateProposalPpt(result, assets || {});
  const safeName = (result.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        `${safeName}-技术方案.pptx`
      )}`,
      'Content-Length': String(buffer.length),
    },
  });
}

/** Markdown 导出 */
async function handleMarkdownExport(result: EnhancedProposalResult) {
  const content = `# ${result.title}\n\n${result.markdown}`;
  const safeName = (result.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_');
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        `${safeName}-技术方案.md`
      )}`,
    },
  });
}

/** Word 导出（HTML .doc 兼容模式，与报价单导出一致） */
async function handleWordExport(result: EnhancedProposalResult, assets?: ProposalExportAssets) {
  const html = buildProposalHtml(result, assets);
  const safeName = (result.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_');
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        `${safeName}-技术方案.doc`
      )}`,
    },
  });
}

/** Excel 导出（报价明细 + 备品备件） */
async function handleExcelExport(result: EnhancedProposalResult) {
  const quoteRows = result.quoteItems.map((it, i) => ({
    序号: i + 1,
    名称: it.name,
    规格型号: it.model,
    品牌产地: it.brand,
    数量: it.quantity,
    单位: it.unit,
    单价元: it.unitPrice,
    小计元: it.totalPrice,
    质保期: it.warranty,
    技术参数: it.techParams,
    备注: it.remark || '',
  }));
  const spareRows = result.spareParts.map((p, i) => ({
    序号: i + 1,
    名称: p.name,
    规格型号: p.model,
    品牌: p.brand,
    数量: p.quantity,
    单位: p.unit,
    单价元: p.unitPrice,
    小计元: p.totalPrice,
    备注: p.remark || '',
  }));

  const wb = XLSX.utils.book_new();
  const wsQuote = XLSX.utils.json_to_sheet(quoteRows);
  XLSX.utils.book_append_sheet(wb, wsQuote, '报价明细');

  const wsSpare = XLSX.utils.json_to_sheet(spareRows);
  XLSX.utils.book_append_sheet(wb, wsSpare, '备品备件');

  const wsSummary = XLSX.utils.json_to_sheet([
    {
      项目名称: result.projectName,
      供方单位: result.supplierInfo.companyName,
      报价合计元: result.totalAmount,
      生成时间: result.generatedAt,
    },
  ]);
  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeName = (result.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        `${safeName}-报价明细.xlsx`
      )}`,
      'Content-Length': String(buffer.length),
    },
  });
}

/** PDF 导出（Puppeteer 渲染 HTML） */
async function handlePdfExport(result: EnhancedProposalResult, assets?: ProposalExportAssets) {
  const html = buildProposalHtml(result, assets);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
    const safeName = (result.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_');
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
          `${safeName}-技术方案.pdf`
        )}`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// ============================================================================
// Markdown -> HTML（用于 Word/PDF 导出）
// ============================================================================

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

function escapeHtmlStr(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildProposalHtml(result: EnhancedProposalResult, assets?: ProposalExportAssets): string {
  const supplier = result.supplierInfo || ({} as ProposalSupplierInfo);
  const chartImgs: string[] = [];
  if (assets?.charts?.quoteBreakdown) {
    chartImgs.push(
      `<figure><figcaption>报价占比</figcaption><img src="${assets.charts.quoteBreakdown}" style="max-width:640px;"/></figure>`
    );
  }
  if (assets?.charts?.equipmentCompare) {
    chartImgs.push(
      `<figure><figcaption>设备参数对比</figcaption><img src="${assets.charts.equipmentCompare}" style="max-width:640px;"/></figure>`
    );
  }

  const bodyHtml = md.render(result.markdown);
  const supplierBlock = [
    supplier.companyName && `<div class="supplier">供方单位：${escapeHtmlStr(supplier.companyName)}</div>`,
    supplier.address && `<div class="supplier">地　　址：${escapeHtmlStr(supplier.address)}</div>`,
    supplier.contactPerson && `<div class="supplier">联 系 人：${escapeHtmlStr(supplier.contactPerson)}</div>`,
    supplier.phone && `<div class="supplier">联系电话：${escapeHtmlStr(supplier.phone)}</div>`,
    supplier.email && `<div class="supplier">电子邮箱：${escapeHtmlStr(supplier.email)}</div>`,
  ]
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtmlStr(result.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "DejaVu Sans", "WenQuanYi Micro Hei", "Microsoft YaHei", "SimSun", Arial, sans-serif;
    font-size: 12pt; line-height: 1.7; color: #1f2937; background: #fff; margin: 0; padding: 20px;
  }
  h1 { font-size: 22pt; color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
  h2 { font-size: 16pt; color: #1e3a8a; border-left: 4px solid #1d4ed8; padding-left: 8px; margin-top: 28px; }
  h3 { font-size: 14pt; color: #1e3a8a; margin-top: 20px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #dbeafe; color: #1e3a8a; font-weight: bold; }
  tr:nth-child(even) td { background: #f8fafc; }
  blockquote { border-left: 4px solid #93c5fd; background: #eff6ff; margin: 12px 0; padding: 8px 14px; color: #334155; }
  code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 10.5pt; }
  .supplier { font-size: 11pt; color: #475569; margin: 2px 0; }
  figure { text-align: center; margin: 16px 0; page-break-inside: avoid; }
  figcaption { font-size: 11pt; color: #475569; margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  .title-page { text-align: center; margin-bottom: 30px; }
</style>
</head>
<body>
<div class="title-page">
  <h1>${escapeHtmlStr(result.title)}</h1>
  ${supplierBlock}
  <div style="margin-top:8px;color:#64748b;">项目：${escapeHtmlStr(result.projectName)}｜规模：${result.capacity} m³/d｜日期：${result.generatedAt.slice(0, 10)}</div>
</div>
<hr>
${chartImgs.join('')}
${bodyHtml}
</body>
</html>`;
}
