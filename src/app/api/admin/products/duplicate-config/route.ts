import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// GET: 获取判重配置
export async function GET() {
  try {
    const db = getSupabaseServiceClient();

    // 并行查询两张表
    const [settingsRes, fieldConfigsRes] = await Promise.all([
      db.from('duplicate_check_settings').select('*').order('display_order', { ascending: true }),
      db.from('product_field_configs').select('*').order('id', { ascending: true }),
    ]);

    const settings = settingsRes.data || [];
    const allFields = fieldConfigsRes.data || [];
    const duplicateCheckFields = allFields.filter(f => f.is_duplicate_check);

    // 确保 duplicate_check_settings 与 product_field_configs 同步
    const settingsKeys = new Set(settings.map(s => s.field_key));
    const fieldKeys = allFields.map(f => f.field_key);

    return NextResponse.json({
      success: true,
      data: {
        duplicateCheckSettings: settings,
        allFields,
        duplicateCheckFields,
        stats: {
          totalFields: allFields.length,
          enabledChecks: settings.filter(s => s.is_enabled).length,
          duplicateCheckFieldCount: duplicateCheckFields.length,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: 更新判重配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getSupabaseServiceClient();

    // 模式 A: 更新 duplicate_check_settings（{ fieldKey, isEnabled }[]）
    if (body.settings) {
      const { settings } = body;
      if (!Array.isArray(settings)) {
        return NextResponse.json({ success: false, error: 'settings 必须是数组' }, { status: 400 });
      }

      const updates = settings.map(({ fieldKey, isEnabled }: { fieldKey: string; isEnabled: boolean }) =>
        db.from('duplicate_check_settings')
          .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
          .eq('field_key', fieldKey)
      );
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: `部分更新失败: ${errors.map(e => e.error?.message).join(', ')}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: `已更新 ${settings.length} 项判重配置` });
    }

    // 模式 B: 批量更新 product_field_configs.is_duplicate_check（{ duplicateCheckFields: string[] }）
    if (body.duplicateCheckFields) {
      const { duplicateCheckFields } = body;
      if (!Array.isArray(duplicateCheckFields) || duplicateCheckFields.length === 0) {
        return NextResponse.json({ success: false, error: '至少需要选择一个判重字段' }, { status: 400 });
      }

      // 先全部重置
      const { error: resetErr } = await db
        .from('product_field_configs')
        .update({ is_duplicate_check: false, updated_at: new Date().toISOString() })
        .neq('field_key', '');
      if (resetErr) {
        return NextResponse.json({ success: false, error: '重置失败: ' + resetErr.message }, { status: 500 });
      }

      // 设置选中字段
      const updates = duplicateCheckFields.map((fieldKey: string) =>
        db.from('product_field_configs')
          .update({ is_duplicate_check: true, updated_at: new Date().toISOString() })
          .eq('field_key', fieldKey)
      );
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: `部分更新失败: ${errors.map(e => e.error?.message).join(', ')}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: `已设置 ${duplicateCheckFields.length} 个判重字段` });
    }

    // 模式 C: 单个字段更新
    if (body.field_key) {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.is_duplicate_check !== undefined) updateData.is_duplicate_check = body.is_duplicate_check;
      if (body.is_enabled !== undefined) updateData.is_enabled = body.is_enabled;

      const { data, error } = await db
        .from('product_field_configs')
        .update(updateData)
        .eq('field_key', body.field_key)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '更新成功', data });
    }

    return NextResponse.json({ success: false, error: '无效的请求参数，需要 settings / duplicateCheckFields / field_key' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
