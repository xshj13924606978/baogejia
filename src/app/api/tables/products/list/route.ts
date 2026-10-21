import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  buildFullVisibility,
  getProductFieldVisibilityContextMap,
  maskProductFieldsByVisibility,
} from '@/lib/product-visibility';
import { safeErrorMessage } from '@/lib/error-handler';
import { getProductSchemaMetadata, type ProductColumnMetadata } from '@/lib/product-schema-metadata';

// 第 1 层：PostgreSQL ILIKE 字面量转义（使用户输入按字面量子串匹配）。
// 顺序关键：必须先转义用户自带的反斜杠 \ → \\，再转义 LIKE 通配符 % → \%、_ → \_。
// 否则用户反斜杠会重设紧随 %/_ 的 LIKE 转义语义，扩大匹配。
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
// 第 2 层：PostgREST raw filter grammar 字面量编码（仅用于必须保留的 .or()）。
// 整个最终 pattern 包双引号；内部 \ → \\、" → \"。用户输入无法改变表达式结构。
function quotePostgrestLiteral(pattern: string): string {
  return '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
// 字面量子串 ILIKE pattern：代码控制前后通配符 + 先转义用户输入中的 LIKE 元字符。
function buildSubstringPattern(value: string): string {
  return '%' + escapeLikePattern(value) + '%';
}
// POSIX 正则字面量转义：PostgREST 的 ilike 把字面量 `*` 当作 `%` 别名，故含 `*` 的值改走
// imatch（PostgreSQL ~*）；此处把用户输入转义为纯字面量正则文本，与 LIKE 层转义相互独立。
function escapePosixRegexLiteral(value: string): string {
  return value.replace(/[\\.^$|?*+()[\]{}]/g, '\\$&');
}

// 获取产品列表
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 判断当前用户可查看哪些敏感字段（#202608302400 阶段3 P0-5）
    // 管理员全量可见；其余按等级逐字段（member_field_permissions）；
    // 创建者本人可见自己产品的全部敏感字段（#20260821-1545-1）
    const { visibility, currentUserId } = await getProductFieldVisibilityContextMap(request);
    const ownerVisibility = buildFullVisibility();

    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');

    const db = getSupabaseClient();
    let query = db.from('products').select('*', { count: 'exact' });

    // 关键词搜索（固定列 name；字段名代码常量）
    if (keyword) {
      // 含字面量 `*` → imatch（regex 字面量子串）；否则 ilike（LIKE 字面量子串，先转义 \ % _）。
      query = keyword.includes('*')
        ? query.filter('name', 'imatch', escapePosixRegexLiteral(keyword))
        : query.ilike('name', buildSubstringPattern(keyword));
    }

    // 列字段筛选（#[20260824-1716] 需求5：动态跟随 products 表真实列，任意列名均可作为筛选参数）
    // 文本类列（data_category='text'）用 ilike 模糊匹配，非文本列用 eq 精确匹配；未传参的列不影响原有行为
    // 逗号分隔多值：按 `in.(...)` 多选过滤（#[20260824-1807] 列头下拉多选筛选）
    // #[E1 caller closure] 改用 public.products_columns 元数据视图（getProductSchemaMetadata），
    //   移除 exec_sql/info_schema 任意 SQL 通道；元数据查询失败 → fail-closed 500；
    //   未知动态筛选字段 → 拒绝 400（authoritative metadata exact-membership gate）
    // 仅当请求含「候选动态产品列筛选参数」时才查询元数据；元数据查询失败 → fail-closed 500。
    const RESERVED_PARAMS = new Set(['keyword', 'page', 'limit']);
    const candidateEntries: Array<[string, string]> = [];
    for (const [key, rawValue] of searchParams.entries()) {
      if (RESERVED_PARAMS.has(key) || key === 'id') continue;
      const value = (rawValue || '').trim();
      if (!value) continue;
      candidateEntries.push([key, value]);
    }

    // 列字段筛选：仅当请求含候选动态产品列筛选参数时才查询元数据（metadata 失败 fail-closed 500，
    // 未知列拒绝 400）。优先用类型安全的 builder 方法（ilike/eq/in），彻底消除单值/多非文本场景的
    // 原始 PostgREST 过滤语法拼接；仅多文本 OR-ilike 保留 .or()，但每个值经有界编码器 → 不可逃逸字面量。
    if (candidateEntries.length > 0) {
      let meta: ProductColumnMetadata[];
      try {
        meta = await getProductSchemaMetadata(db);
      } catch (err) {
        console.error('[Product List] 查询产品列元数据失败:', err);
        return NextResponse.json(
          { success: false, error: '查询产品列元数据失败', data: [] },
          { status: 500 },
        );
      }
      const columnNameSet = new Set(meta.map((c) => c.column_name));
      const metaByColumn = new Map(meta.map((c) => [c.column_name, c] as const));

      for (const [key, value] of candidateEntries) {
        if (!columnNameSet.has(key)) {
          // 未知动态筛选字段 → 拒绝（authoritative metadata exact-membership gate）
          return NextResponse.json(
            { success: false, error: `不支持的筛选字段: ${key}`, data: [] },
            { status: 400 },
          );
        }
        const colMeta = metaByColumn.get(key)!;
        const isText = colMeta.data_category === 'text';

        if (value.includes(',')) {
          const arr = value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
          if (arr.length === 0) continue;
          if (arr.length === 1) {
            if (isText) {
              // 含 `*` → imatch（regex 字面量子串），否则 ilike（LIKE 字面量子串）。二者 operator 均固定。
              query = value.includes('*')
                ? query.filter(key, 'imatch', escapePosixRegexLiteral(arr[0]))
                : query.ilike(key, buildSubstringPattern(arr[0]));
            } else {
              query = query.eq(key, arr[0]);
            }
          } else if (isText) {
            // 仅多文本 OR 保留 .or()；每个值整体经双引号 literal 编码 → 不可逃逸。
            // 逗号仅作为代码生成的 term 分隔符出现，用户输入的逗号已被 split 为独立值。
            // 含 `*` 的值用 imatch（regex 字面量），其余用 ilike（LIKE 字面量），operator 固定，可混合。
            const orExpr = arr
              .map((v) =>
                v.includes('*')
                  ? `${key}.imatch.${quotePostgrestLiteral(escapePosixRegexLiteral(v))}`
                  : `${key}.ilike.${quotePostgrestLiteral(buildSubstringPattern(v))}`,
              )
              .join(',');
            query = query.or(orExpr);
          } else {
            query = query.in(key, arr);
          }
        } else {
          if (isText) {
            query = value.includes('*')
              ? query.filter(key, 'imatch', escapePosixRegexLiteral(value))
              : query.ilike(key, buildSubstringPattern(value));
          } else {
            query = query.eq(key, value);
          }
        }
      }
    }

    // 分页
    const offset = (page - 1) * limit;
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Product List API] ❌ 查询数据库失败:', error);
      console.error('[Product List API] 错误详情:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
          data: [],
        },
        { status: 500 }
      );
    }


    // 转换为前端需要的格式（统一产品字段规范）
    const formattedProducts = (data || []).map((p: any) => {
      const row: Record<string, unknown> = {
        // 13个标准字段
        category: p.category || '',
        name: p.name || '',
        model: p.model || '',
        parameter_description: p.parameter_description || '',
        brand: p.brand || '',
        unit: p.unit || '台',
        supplier: p.supplier || '',
        contact_person: p.contact_person || '',
        contact_phone: p.contact_phone || '',
        cost_price: parseFloat(p.cost_price) || 0,
        min_price: parseFloat(p.min_price) || 0,
        price: parseFloat(p.price) || 0,
        image_url: p.image_url || '',
        // 系统字段
        id: p.id,
        stock: p.stock || 0,
        creator_id: p.creator_id || null,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
      // 按等级逐字段脱敏（本人创建的产品除外，便于编辑自己贡献的产品）
      const isOwner = !!p.creator_id && !!currentUserId && p.creator_id === currentUserId;
      return maskProductFieldsByVisibility(row, isOwner ? ownerVisibility : visibility);
    });

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      total: formattedProducts.length,
      count: count || 0,
      duration,
    });
  } catch (error) {
    console.error('[Product List API] ❌ 请求异常:', error);
    console.error('[Product List API] 错误堆栈:', error instanceof Error ? error.stack : error);
    return NextResponse.json(
      {
        success: false,
        error: '获取产品列表失败',
        data: [],
      },
      { status: 500 }
    );
  }
}
