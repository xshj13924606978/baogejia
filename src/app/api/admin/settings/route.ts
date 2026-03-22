import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 系统设置 API
 *
 * GET: 获取所有设置（支持按分类筛选）
 * PUT: 批量更新设置
 */

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const db = getSupabaseServiceClient();

    let query = db.from('site_config').select('*').order('category', { ascending: true });
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      // 表不存在时返回空数据
      console.log('[Settings API] site_config 表不存在:', error.message);
      return NextResponse.json({ success: true, data: {}, raw: [] });
    }

    // 按 category 分组
    const grouped: Record<string, any[]> = {};
    (data || []).forEach((item: any) => {
      const cat = item.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        key: item.config_key,
        value: parseConfigValue(item.config_value, item.config_type),
        type: item.config_type || 'string',
        label: item.label || item.config_key,
        description: item.description || '',
        isPublic: item.is_public || false,
      });
    });

    return NextResponse.json({ success: true, data: grouped, raw: data });
  } catch (error: any) {
    console.error('[Settings API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取设置失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!Array.isArray(settings) || settings.length === 0) {
      return NextResponse.json({ success: false, error: '请提供要更新的设置项' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const now = new Date().toISOString();
    let updated = 0;

    for (const item of settings) {
      const { key, value, description } = item;
      if (!key) continue;

      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      // 尝试更新
      const { data: existing } = await db
        .from('site_config')
        .select('id')
        .eq('config_key', key)
        .single();

      if (existing) {
        const updatePayload: Record<string, any> = {
          config_value: stringValue,
          updated_at: now,
        };
        if (description !== undefined) updatePayload.description = description;

        const { error } = await db.from('site_config').update(updatePayload).eq('id', existing.id);
        if (!error) updated++;
      } else {
        // 不存在则创建
        const { error } = await db.from('site_config').insert({
          config_key: key,
          config_value: stringValue,
          config_type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
          category: guessCategory(key),
          label: key,
          description: description || '',
          updated_at: now,
        });
        if (!error) updated++;
      }
    }

    return NextResponse.json({ success: true, message: `已更新 ${updated} 项设置` });
  } catch (error: any) {
    console.error('[Settings API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '更新设置失败' }, { status: 500 });
  }
}

// 辅助函数
function parseConfigValue(value: any, type: string) {
  if (value === null || value === undefined) return getDefaultForType(type);
  switch (type) {
    case 'number': return Number(value) || 0;
    case 'boolean': return value === true || value === 'true' || value === '1';
    case 'json':
      try { return JSON.parse(value); }
      catch { return value; }
    default: return String(value);
  }
}

function getDefaultForType(type: string) {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    default: return '';
  }
}

function guessCategory(key: string): string {
  if (key.startsWith('site_') || key.startsWith('brand_')) return 'general';
  if (key.startsWith('security_') || key.startsWith('login_')) return 'security';
  if (key.startsWith('points_') || key.startsWith('quota_')) return 'points';
  if (key.startsWith('storage_') || key.startsWith('upload_')) return 'storage';
  if (key.startsWith('notification_') || key.startsWith('email_')) return 'notification';
  return 'general';
}
