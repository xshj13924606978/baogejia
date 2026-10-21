import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 产品列元数据（来自 Migration A 视图 public.products_columns）
 *
 * 该 helper 是 E1_APPLICATION_EXEC_SQL_CALLER_CLOSURE 的核心：用稳定的
 * view 替代原先依赖 exec_sql + information_schema 的任意 SQL 通道。
 *
 * 边界（严格固定）：
 *  - 只接受注入的 SupabaseClient，绝不自行创建 client 或读取 env；
 *  - 不接受 SQL / 表名 / schema / 列标识符 / where / order 等任意参数；
 *  - 永远只查询 public.products_columns，固定 select 三列并显式按
 *    ordinal_position 升序；
 *  - 响应 fail-closed 校验，任何异常 / 畸形 / 未知类别 / 重复一律拒绝。
 */
export type ProductColumnCategory = 'text' | 'non_text';

export interface ProductColumnMetadata {
  column_name: string;
  data_category: ProductColumnCategory;
  ordinal_position: number;
}

const VALID_CATEGORIES = new Set<string>(['text', 'non_text']);

/**
 * 简单列标识符规则（PostgREST .select() / 过滤表达式的安全前提）。
 * products 表的真实列名均满足该规则；任何不满足的列名一律拒绝，
 * 避免其进入 .select(column) 或 .or(`column...`) 后破坏表达式结构。
 */
const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 元数据查询 / 校验失败（fail-closed）。错误信息不含 SQL、DB URI、
 * credential 或原始 Supabase error detail。
 */
export class ProductSchemaMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductSchemaMetadataError';
  }
}

/**
 * 读取并校验 public.products_columns。
 *
 * @param db 注入的 SupabaseClient（anon 或 service，取决于调用方 ACL）
 * @returns 按 ordinal_position 升序排列、已通过 fail-closed 校验的列元数据
 * @throws ProductSchemaMetadataError 查询失败或响应不满足契约
 */
export async function getProductSchemaMetadata(
  db: SupabaseClient,
): Promise<ProductColumnMetadata[]> {
  const { data, error } = await db
    .from('products_columns')
    .select('column_name, data_category, ordinal_position')
    .order('ordinal_position', { ascending: true });

  if (error) {
    throw new ProductSchemaMetadataError('产品列元数据查询失败');
  }

  return validateProductSchemaMetadata(data);
}

function validateProductSchemaMetadata(raw: unknown): ProductColumnMetadata[] {
  if (!Array.isArray(raw)) {
    throw new ProductSchemaMetadataError('产品列元数据格式错误：期望数组');
  }
  if (raw.length === 0) {
    throw new ProductSchemaMetadataError('产品列元数据为空，无法构建字段契约');
  }

  const seenColumns = new Set<string>();
  const seenOrdinals = new Set<number>();
  const rows: ProductColumnMetadata[] = [];

  for (const row of raw) {
    if (row === null || typeof row !== 'object') {
      throw new ProductSchemaMetadataError('产品列元数据行格式错误');
    }
    const record = row as Record<string, unknown>;
    const columnName = record.column_name;
    const dataCategory = record.data_category;
    const ordinal = record.ordinal_position;

    if (typeof columnName !== 'string' || columnName.length === 0) {
      throw new ProductSchemaMetadataError('产品列 column_name 非法');
    }
    // APP-R07：列名必须是简单标识符，才能安全进入 PostgREST .select() / 过滤表达式。
    if (!SIMPLE_IDENTIFIER.test(columnName)) {
      throw new ProductSchemaMetadataError(`产品列 column_name 非法标识符: ${columnName}`);
    }
    if (typeof dataCategory !== 'string' || !VALID_CATEGORIES.has(dataCategory)) {
      throw new ProductSchemaMetadataError(`产品列 data_category 非法: ${String(dataCategory)}`);
    }
    if (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal <= 0) {
      throw new ProductSchemaMetadataError(`产品列 ordinal_position 非法: ${String(ordinal)}`);
    }
    if (seenColumns.has(columnName)) {
      throw new ProductSchemaMetadataError(`产品列 column_name 重复: ${columnName}`);
    }
    if (seenOrdinals.has(ordinal)) {
      throw new ProductSchemaMetadataError(`产品列 ordinal_position 重复: ${ordinal}`);
    }

    seenColumns.add(columnName);
    seenOrdinals.add(ordinal);
    rows.push({
      column_name: columnName,
      data_category: dataCategory as ProductColumnCategory,
      ordinal_position: ordinal,
    });
  }

  return rows;
}
