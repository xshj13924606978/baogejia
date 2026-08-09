export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 系统设置 API
 *
 * GET: 获取所有设置（支持按分类筛选）
 * PUT: 批量更新设置
 */

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const category = request.nextUrl.searchParams.get('category');
    const db = getSupabaseServiceClient();

    // 通过 exec_sql 直读（PostgREST 看不到 exec_sql 建的表）
    const sqlOrder = 'ORDER BY category, config_key';
    const sqlWhere = category ? ` WHERE category = '${category.replace(/'/g, "''")}'` : '';
    const { data: rows, error: sqlErr } = await db.rpc('exec_sql', {
      sql_query: `SELECT * FROM site_config${sqlWhere} ${sqlOrder}`,
    });

    if (sqlErr) {
      console.error('[Settings API] exec_sql 查询失败:', sqlErr);
      return NextResponse.json({ success: true, data: {} });
    }

    // 按 category 分组
    const grouped: Record<string, any[]> = {};
    const list = Array.isArray(rows) ? rows : [];
    list.forEach((item: any) => {
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

    return NextResponse.json({ success: true, data: grouped });
  } catch (error: any) {
    console.error('[Settings API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取设置失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

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
      const safeKey = key.replace(/'/g, "''");
      const configType = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';

      // 检查是否存在
      const { data: checkRows } = await db.rpc('exec_sql', {
        sql_query: `SELECT id FROM site_config WHERE config_key = '${safeKey}'`,
      });
      const existingId = Array.isArray(checkRows) && checkRows.length > 0 ? checkRows[0].id : null;

      if (existingId) {
        const descSql = description !== undefined ? `, description = '${(description || '').replace(/'/g, "''")}'` : '';
        const { error } = await db.rpc('exec_sql', {
          sql_query: `UPDATE site_config SET config_value = '${stringValue.replace(/'/g, "''")}', updated_at = '${now}'${descSql} WHERE id = '${existingId}'`,
        });
        if (!error) updated++;
      } else {
        const { error } = await db.rpc('exec_sql', {
          sql_query: `INSERT INTO site_config (config_key, config_value, config_type, category, label, description, updated_at) VALUES ('${safeKey}', '${stringValue.replace(/'/g, "''")}', '${configType}', '${guessCategory(key)}', '${safeKey}', '${(description || '').replace(/'/g, "''")}', '${now}')`,
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
