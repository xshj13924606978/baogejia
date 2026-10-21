import { describe, it, expect, vi } from 'vitest';
import { getMergedProductFields } from '@/lib/product-field-merge';
import type { SupabaseClient } from '@supabase/supabase-js';

// 按表返回响应；builder 真实链 select/eq/order/single 后 await。
function makeClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const builders: any[] = [];
  const from = vi.fn((table: string) => {
    const builder: any = {
      _table: table,
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => builder),
      maybeSingle: vi.fn(() => builder),
      then: (resolve: any, reject: any) =>
        Promise.resolve(responses[table] ?? { data: null, error: null }).then(
          resolve,
          reject,
        ),
    };
    builders.push(builder);
    return builder;
  });
  return { from, builders };
}

const COLUMNS = {
  data: [
    { column_name: 'name', data_category: 'text', ordinal_position: 1 },
    { column_name: 'price', data_category: 'non_text', ordinal_position: 2 },
  ],
  error: null,
};

describe('getMergedProductFields', () => {
  it('成功合并 system_fields + pfc + products 真实列', async () => {
    const client = makeClient({
      system_pages: { data: { id: 'p1' }, error: null },
      system_fields: {
        data: [
          {
            field_key: 'name',
            field_type: 'text',
            label_zh: '名称',
            is_visible: true,
            is_editable: true,
            is_required: true,
            group_name: null,
            sort_order: 1,
            config: null,
            validation_rules: null,
            depends_on: null,
            options_config: null,
          },
        ],
        error: null,
      },
      product_field_configs: {
        data: [
          {
            field_key: 'name',
            field_label: '名称',
            is_required: true,
            is_visible: true,
            display_order: 1,
          },
        ],
        error: null,
      },
      products_columns: COLUMNS,
    });
    const fields = await getMergedProductFields(client as unknown as SupabaseClient);
    expect(fields.length).toBeGreaterThan(0);
    const nameField = fields.find((f) => f.field_key === 'name');
    expect(nameField?.is_required).toBe(true);
  });

  it('system_pages 查询错误 → 抛出（fail-closed，不降级为 []）', async () => {
    const client = makeClient({
      system_pages: { data: null, error: { message: 'db down' } },
      system_fields: { data: [], error: null },
      product_field_configs: { data: [], error: null },
      products_columns: COLUMNS,
    });
    await expect(
      getMergedProductFields(client as unknown as SupabaseClient),
    ).rejects.toThrow();
  });

  it('缺失启用页面（prerequisite missing）→ 抛出（不得返回空契约）', async () => {
    const client = makeClient({
      system_pages: { data: null, error: null },
      system_fields: { data: [], error: null },
      product_field_configs: { data: [], error: null },
      products_columns: COLUMNS,
    });
    await expect(
      getMergedProductFields(client as unknown as SupabaseClient),
    ).rejects.toThrow();
  });

  it('system_fields 查询错误 → 抛出', async () => {
    const client = makeClient({
      system_pages: { data: { id: 'p1' }, error: null },
      system_fields: { data: null, error: { message: 'x' } },
      product_field_configs: { data: [], error: null },
      products_columns: COLUMNS,
    });
    await expect(
      getMergedProductFields(client as unknown as SupabaseClient),
    ).rejects.toThrow();
  });

  it('product_field_configs 查询错误 → 抛出', async () => {
    const client = makeClient({
      system_pages: { data: { id: 'p1' }, error: null },
      system_fields: { data: [], error: null },
      product_field_configs: { data: null, error: { message: 'x' } },
      products_columns: COLUMNS,
    });
    await expect(
      getMergedProductFields(client as unknown as SupabaseClient),
    ).rejects.toThrow();
  });

  it('metadata helper 错误 → 抛出（不静默 fallback）', async () => {
    const client = makeClient({
      system_pages: { data: { id: 'p1' }, error: null },
      system_fields: { data: [], error: null },
      product_field_configs: { data: [], error: null },
      products_columns: { data: null, error: { message: 'meta fail' } },
    });
    await expect(
      getMergedProductFields(client as unknown as SupabaseClient),
    ).rejects.toThrow();
  });
});
