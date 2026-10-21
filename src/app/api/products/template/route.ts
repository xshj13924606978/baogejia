import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import {
  getProductFieldVisibility,
  SENSITIVE_PRODUCT_FIELDS,
} from '@/lib/product-visibility';
import { getProductSchemaMetadata, type ProductColumnMetadata } from '@/lib/product-schema-metadata';

// 系统级字段（products 表列，非用户可编辑的导入字段，模板中不展示）
const SYSTEM_COLUMNS = new Set([
  'id',
  'created_at',
  'updated_at',
  'search_vector',
  'creator_id',
  'created_by',
  'updated_by',
]);

// 敏感字段集合（与生产 product-visibility 的 SENSITIVE_PRODUCT_FIELDS 同成员）。
// 用 ReadonlySet<string> 替代 readonly 字面量元组的 .includes(string)，消除 TS2345；
// 敏感字段实际集合、configured path、metadata fallback、字段顺序、response shape 均不变。
const SENSITIVE_PRODUCT_FIELD_SET: ReadonlySet<string> = new Set<string>(SENSITIVE_PRODUCT_FIELDS);

export async function GET(request: NextRequest) {
  try {
    // 敏感字段隔离（基线 #42 ✅ 正常）：非管理员下载模板不包含厂家/联系人/电话/进价/最低售价
    const canViewSensitive = await getProductFieldVisibility(request);
    const db = getSupabaseServiceClient();

    // 1. 动态读取产品字段配置（全局「字段必填配置」共享同一数据源，#20260824-1716）
    const { data: fieldConfigs, error: cfgError } = await db
      .from('product_field_configs')
      .select('*')
      .order('display_order', { ascending: true });

    if (cfgError) {
      console.error('[Product Template] 查询字段配置失败:', cfgError);
      return NextResponse.json({ error: '查询字段配置失败' }, { status: 500 });
    }

    // 2. 动态读取真实产品作为示例行（不写死示例数据）
    const { data: sampleProducts, error: prodError } = await db
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    if (prodError) {
      console.error('[Product Template] 查询示例产品失败:', prodError);
      return NextResponse.json({ error: '查询示例产品失败' }, { status: 500 });
    }

    // 3. 组装模板列：优先使用字段配置；若配置为空则按 products 表真实列动态生成兜底
    interface TemplateColumn {
      key: string;
      label: string;
      required: boolean;
      width: number;
    }
    let columns: TemplateColumn[];

    if (fieldConfigs && fieldConfigs.length > 0) {
      columns = fieldConfigs
        .filter((c: any) => c.is_visible !== false)
        .filter((c: any) => canViewSensitive || !SENSITIVE_PRODUCT_FIELD_SET.has(c.field_key))
        .map((c: any) => ({
          key: c.field_key,
          label: c.field_label || c.field_name || c.field_key,
          required: !!c.is_required,
          width: Math.max(10, Math.min(40, ((c.field_label || c.field_key)?.length || 4) + 6)),
        }));
    } else {
      // #[E1 caller closure] 用 public.products_columns 元数据视图替代 exec_sql/info_schema 任意 SQL 通道
      let productColumns: ProductColumnMetadata[];
      try {
        productColumns = await getProductSchemaMetadata(db);
      } catch (err) {
        console.error('[Product Template] 查询产品列元数据失败:', err);
        return NextResponse.json({ error: '查询产品列元数据失败' }, { status: 500 });
      }
      const realColumns: string[] = productColumns
        .map((c) => c.column_name)
        .filter((c: string) => !SYSTEM_COLUMNS.has(c))
        .filter((c: string) => canViewSensitive || !SENSITIVE_PRODUCT_FIELD_SET.has(c));
      columns = realColumns.map((c) => ({
        key: c,
        label: c,
        required: false,
        width: Math.max(10, Math.min(40, c.length + 6)),
      }));
    }

    if (columns.length === 0) {
      return NextResponse.json({ error: '未找到可导出的产品字段' }, { status: 500 });
    }

    // 4. 生成表格数据：表头（必填标注）+ 真实示例行
    const header = columns.map((c) => (c.required ? `${c.label}（必填）` : c.label));
    const rows: any[][] = [];
    for (const product of sampleProducts || []) {
      rows.push(
        columns.map((c) => {
          const v = (product as Record<string, unknown>)[c.key];
          return v === null || v === undefined ? '' : String(v);
        })
      );
    }
    if (rows.length === 0) {
      // 库中暂无产品时输出空模板行，由用户填写（不注入虚假示例）
      rows.push(columns.map(() => ''));
    }

    const data = [header, ...rows];

    // 5. 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = columns.map((c) => ({ wch: c.width }));
    XLSX.utils.book_append_sheet(wb, ws, '产品模板');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="产品导入模板.xlsx"',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Product Template] 生成模板失败:', error);
    return NextResponse.json({ error: '生成模板失败' }, { status: 500 });
  }
}
