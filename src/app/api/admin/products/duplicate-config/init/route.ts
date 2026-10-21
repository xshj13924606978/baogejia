import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

// POST /api/admin/products/duplicate-config/init - 初始化判重配置数据
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const results: { table: string; action: string; success: boolean; detail?: string }[] = [];

    // 1. 检查/初始化 duplicate_check_settings
    const { data: existingSettings, error: settingsCheckErr } = await db
      .from('duplicate_check_settings')
      .select('field_key');

    if (settingsCheckErr && settingsCheckErr.message?.includes('does not exist')) {
      results.push({ table: 'duplicate_check_settings', action: '检查', success: false, detail: '表不存在，请在 Dashboard 执行 CREATE_DUPLICATE_SETTINGS_TABLE.sql' });
    } else {
      const settingsCount = existingSettings?.length || 0;
      if (settingsCount === 0) {
        // 插入默认配置
        const defaults = [
          { field_key: 'product_name', field_name: '产品名称', is_enabled: true, display_order: 1 },
          { field_key: 'model', field_name: '规格型号', is_enabled: true, display_order: 2 },
          { field_key: 'brand', field_name: '品牌', is_enabled: false, display_order: 3 },
        ];
        const { error: insertErr } = await db.from('duplicate_check_settings').insert(defaults);
        results.push({
          table: 'duplicate_check_settings', action: '初始化', success: !insertErr,
          detail: insertErr ? insertErr.message : '已插入 3 条默认配置',
        });
      } else {
        results.push({ table: 'duplicate_check_settings', action: '跳过', success: true, detail: `已有 ${settingsCount} 条配置` });
      }
    }

    // 2. 检查/初始化 product_field_configs
    const { data: existingFields, error: fieldsCheckErr } = await db
      .from('product_field_configs')
      .select('field_key');

    if (fieldsCheckErr && fieldsCheckErr.message?.includes('does not exist')) {
      results.push({ table: 'product_field_configs', action: '检查', success: false, detail: '表不存在，请在 Dashboard 执行 004_create_product_field_configs.sql' });
    } else {
      const fieldsCount = existingFields?.length || 0;
      if (fieldsCount === 0) {
        const defaults = [
          { field_key: 'name', field_name: '产品名称', field_label: 'product_name', field_type: 'text', is_required: true, is_duplicate_check: true, is_visible: true, display_order: 1 },
          { field_key: 'model', field_name: '规格型号', field_label: 'model', field_type: 'text', is_required: false, is_duplicate_check: true, is_visible: true, display_order: 2 },
          { field_key: 'brand', field_name: '品牌', field_label: 'brand', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 3 },
          { field_key: 'price', field_name: '指导价', field_label: 'price', field_type: 'number', is_required: true, is_duplicate_check: false, is_visible: true, display_order: 4 },
          { field_key: 'cost_price', field_name: '成本价', field_label: 'cost_price', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: false, display_order: 5 },
          { field_key: 'min_price', field_name: '最低售价', field_label: 'min_price', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: false, display_order: 6 },
          { field_key: 'parameter_description', field_name: '参数描述', field_label: 'parameter_description', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 7 },
          { field_key: 'unit', field_name: '单位', field_label: 'unit', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 8 },
          { field_key: 'category', field_name: '分类', field_label: 'category', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 9 },
          { field_key: 'supplier', field_name: '供应商', field_label: 'supplier', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 10 },
          { field_key: 'contact_person', field_name: '联系人', field_label: 'contact_person', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 11 },
          { field_key: 'contact_phone', field_name: '联系电话', field_label: 'contact_phone', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 12 },
          { field_key: 'image_url', field_name: '图片', field_label: 'image_url', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 13 },
          { field_key: 'stock', field_name: '库存', field_label: 'stock', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 14 },
        ];
        const { error: insertErr } = await db.from('product_field_configs').insert(defaults);
        results.push({
          table: 'product_field_configs', action: '初始化', success: !insertErr,
          detail: insertErr ? insertErr.message : `已插入 ${defaults.length} 条字段配置`,
        });
      } else {
        results.push({ table: 'product_field_configs', action: '跳过', success: true, detail: `已有 ${fieldsCount} 条字段配置` });
      }
    }

    const allSuccess = results.every(r => r.success);
    return NextResponse.json({
      success: allSuccess,
      message: allSuccess ? '初始化完成' : '部分初始化失败，请查看详情',
      data: { results },
    }, { status: allSuccess ? 200 : 207 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
