import { NextRequest, NextResponse } from 'next/server';
import { createDuplicateChecker, DuplicateCheckResult } from '@/lib/duplicate-checker';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  getContributorDuplicateConfig,
  buildDuplicateRuleDescription,
  expandUploadEntries,
  isEntryDuplicate,
} from '@/lib/contributor/duplicate-configs';

interface CheckProduct {
  name?: string;
  model?: string;
  brand?: string;
  [key: string]: string | undefined;
}

interface DuplicateItem {
  index: number;
  input: Record<string, string>;
  existing: Record<string, unknown> | null;
  matchedFields: string[];
}

/**
 * 非产品资料库（技术文档库/案例库/标准规范库/图纸图片库/定额库）批量判重
 * 判重规则来自数据库 contributor_duplicate_configs，与已通过（approved）的同类贡献资料比较。
 */
async function handleNonProductDuplicateCheck(type: string, items: Record<string, string>[]) {
  const config = await getContributorDuplicateConfig(type);
  if (!config) {
    return NextResponse.json({
      success: true,
      total: items.length,
      duplicateCount: 0,
      duplicates: [],
      ruleDescription: '',
    });
  }

  const db = getSupabaseClient();
  const { data: approvedUploads } = await db
    .from('contributor_uploads')
    .select('id, data')
    .eq('type', type)
    .eq('status', 'approved');

  const duplicates: DuplicateItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let matched = false;
    for (const upload of approvedUploads || []) {
      for (const entry of expandUploadEntries(upload)) {
        if (isEntryDuplicate(item, entry.fields, config.duplicateFields)) {
          duplicates.push({
            index: i,
            input: item,
            existing: entry.fields || null,
            matchedFields: config.duplicateFields,
          });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return NextResponse.json({
    success: true,
    total: items.length,
    duplicateCount: duplicates.length,
    duplicates,
    ruleDescription: buildDuplicateRuleDescription(config),
  });
}

function buildRuleDescription(config: { fields: string[] }): string {
  const labelMap: Record<string, string> = {
    name: '产品名称',
    model: '规格型号',
    brand: '品牌',
    parameter_description: '参数描述',
    unit: '单位',
    supplier: '供应商',
    category: '产品分类',
  };
  const labels = config.fields.map((f) => labelMap[f] || f);
  return `当${labels.join('、')}都相同时，视为重复产品`;
}

/**
 * POST /api/contributor/check-duplicates
 * 公开接口：上传价格表/贡献资料前，按后台判重配置预检产品与现有产品是否重复。
 * 不返回敏感字段，不依赖登录状态。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const products = (body.products || []) as CheckProduct[];
    const type = (body.type || '') as string;
    const items = (body.items || []) as Record<string, string>[];

    // 非产品资料库批量判重（技术文档库/案例库/标准规范库/图纸图片库/定额库）
    if (type && type !== 'product' && Array.isArray(items) && items.length > 0) {
      return handleNonProductDuplicateCheck(type, items);
    }

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ success: true, total: 0, duplicateCount: 0, duplicates: [] });
    }

    const db = getSupabaseClient();
    const checker = await createDuplicateChecker(db);
    const duplicates: DuplicateItem[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const result: DuplicateCheckResult = await checker.checkDuplicate(product);
      if (result.isDuplicate && result.duplicateProduct) {
        duplicates.push({
          index: i,
          input: product as Record<string, string>,
          existing: (result.duplicateProduct as Record<string, unknown>) || null,
          matchedFields: result.matchedFields || [],
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: products.length,
      duplicateCount: duplicates.length,
      duplicates,
      ruleDescription: buildRuleDescription(checker.getConfig()),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
