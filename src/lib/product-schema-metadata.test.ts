import { describe, it, expect, vi } from 'vitest';
import {
  getProductSchemaMetadata,
  ProductSchemaMetadataError,
} from '@/lib/product-schema-metadata';

// 行为 mock：真实链 from('products_columns').select(...).order(...) 然后 await。
function makeMockDb(resolveValue: { data: unknown; error: unknown }) {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: any, reject: any) =>
      Promise.resolve(resolveValue).then(resolve, reject),
  };
  return {
    from: vi.fn(() => builder),
    _builder: builder,
  };
}

describe('getProductSchemaMetadata', () => {
  it('helper API 只接受 injected client，无 table/sql/column 参数', () => {
    // 函数形参数量必须为 1（仅 db），不得暴露 table/sql/column/where/order 参数。
    expect(getProductSchemaMetadata.length).toBe(1);
  });

  it('查询错误 → 拒绝 ProductSchemaMetadataError', async () => {
    const db = makeMockDb({ data: null, error: { message: 'boom' } });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('非数组响应 → 拒绝', async () => {
    const db = makeMockDb({ data: { not: 'array' }, error: null });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('空数组 → 拒绝（不允许 error→[]）', async () => {
    const db = makeMockDb({ data: [], error: null });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('畸形行（column_name 非字符串）→ 拒绝', async () => {
    const db = makeMockDb({
      data: [{ column_name: 123, data_category: 'text', ordinal_position: 1 }],
      error: null,
    });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('未知 data_category → 拒绝（不允许 unknown→non_text 降级）', async () => {
    const db = makeMockDb({
      data: [
        { column_name: 'a', data_category: 'blob', ordinal_position: 1 },
      ],
      error: null,
    });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('重复 column_name → 拒绝', async () => {
    const db = makeMockDb({
      data: [
        { column_name: 'a', data_category: 'text', ordinal_position: 1 },
        { column_name: 'a', data_category: 'text', ordinal_position: 2 },
      ],
      error: null,
    });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('重复 ordinal_position → 拒绝', async () => {
    const db = makeMockDb({
      data: [
        { column_name: 'a', data_category: 'text', ordinal_position: 1 },
        { column_name: 'b', data_category: 'text', ordinal_position: 1 },
      ],
      error: null,
    });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('非法 ordinal（0/负数/非整数）→ 拒绝', async () => {
    const bad = [0, -1, 1.5, 'x'];
    for (const ord of bad) {
      const db = makeMockDb({
        data: [{ column_name: 'a', data_category: 'text', ordinal_position: ord }],
        error: null,
      });
      await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
        ProductSchemaMetadataError,
      );
    }
  });

  it('非法标识符 column_name（APP-R07）→ 拒绝', async () => {
    const db = makeMockDb({
      data: [
        { column_name: 'bad;name', data_category: 'text', ordinal_position: 1 },
      ],
      error: null,
    });
    await expect(getProductSchemaMetadata(db as any)).rejects.toBeInstanceOf(
      ProductSchemaMetadataError,
    );
  });

  it('合法（已按 ordinal_position 有序）结果返回 typed 行', async () => {
    // helper 信任 DB 的 .order('ordinal_position')，不负责重排；mock 必须返回有序行。
    const db = makeMockDb({
      data: [
        { column_name: 'a', data_category: 'non_text', ordinal_position: 1 },
        { column_name: 'b', data_category: 'text', ordinal_position: 2 },
      ],
      error: null,
    });
    const rows = await getProductSchemaMetadata(db as any);
    expect(rows).toHaveLength(2);
    expect(rows[0].column_name).toBe('a');
    expect(rows[0].data_category).toBe('non_text');
    expect(rows[0].ordinal_position).toBe(1);
    expect(rows[1].column_name).toBe('b');
    expect(db.from).toHaveBeenCalledWith('products_columns');
    expect(db._builder.order).toHaveBeenCalledWith('ordinal_position', {
      ascending: true,
    });
  });

  it('已校验：helper 不做额外排序（逆序输入按原序返回，排序职责在 DB）', async () => {
    const db = makeMockDb({
      data: [
        { column_name: 'b', data_category: 'text', ordinal_position: 2 },
        { column_name: 'a', data_category: 'non_text', ordinal_position: 1 },
      ],
      error: null,
    });
    const rows = await getProductSchemaMetadata(db as any);
    // 未重排：保持返回顺序
    expect(rows[0].column_name).toBe('b');
    expect(rows[1].column_name).toBe('a');
  });
});
