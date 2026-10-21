/**
 * 产品某列 distinct 值 + 计数（#[20260824-1807] 列头下拉筛选）
 * GET /api/tables/products/distinct?column=brand&search=xxx&limit=200
 *
 * - 仅返回当前可见（is_visible=true）字段对应的列值；
 * - 按出现频次降序，最多 limit 条（默认 200）；
 * - 鉴权：withAdmin（管理后台使用）
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { safeErrorMessage } from '@/lib/error-handler';
import { getProductSchemaMetadata, type ProductColumnMetadata } from '@/lib/product-schema-metadata';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const column = request.nextUrl.searchParams.get('column');
    const search = (request.nextUrl.searchParams.get('search') || '').trim().toLowerCase();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '200'), 500);

    if (!column) {
      return NextResponse.json({ success: false, error: '缺少 column 参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 1) 校验列存在且属于可见字段（基于 product_field_configs + products_columns 元数据）
    //   #[E1 caller closure] 用 public.products_columns exact-membership 替代 exec_sql 任意 SQL 通道
    let meta: ProductColumnMetadata[];
    try {
      meta = await getProductSchemaMetadata(db);
    } catch (err) {
      console.error('[Product Distinct] 查询产品列元数据失败:', err);
      return NextResponse.json({ success: false, error: '查询产品列元数据失败' }, { status: 500 });
    }
    const metaRow = meta.find((c) => c.column_name === column);
    if (!metaRow) {
      return NextResponse.json({ success: false, error: `列 ${column} 不存在` }, { status: 400 });
    }

    const { data: pfcRow, error: pfcError } = await db
      .from('product_field_configs')
      .select('field_key, is_visible')
      .eq('field_key', column)
      .maybeSingle();

    if (pfcError) {
      return NextResponse.json({ success: false, error: '查询字段配置失败' }, { status: 500 });
    }
    if (pfcRow && pfcRow.is_visible === false) {
      return NextResponse.json({ success: false, error: `列 ${column} 不可见` }, { status: 400 });
    }

    // 2) 取该列全量非空值（去重 + 计数）
    const { data: rows, error } = await db.from('products').select(column);
    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const r of rows || []) {
      // r 的静态类型为 Supabase 行类型（无索引签名），不能直接 as Record<string, unknown>（TS2352）。
      // 通过 object 桥接：GenericStringError 可断言为 object，object 可断言为 Record<string, unknown>；
      // 运行期取值与原来一致，metadata 可见性安全门（行 36-52）未改动。
      const v = (r as object as Record<string, unknown>)[column];
      if (v === null || v === undefined || v === '') continue;
      const key = String(v);
      if (search && !key.toLowerCase().includes(search)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const result = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: result,
      column,
      total: counts.size,
    });
  } catch (err) {
    console.error('[Product Distinct API] ❌', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message || '获取列筛选项失败' },
      { status: 500 }
    );
  }
});