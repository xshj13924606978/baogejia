export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { AuditLogService, extractClientIp } from '@/lib/audit-log-service';
import { captureException } from '@/lib/error-log-service';

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

    // #[20260831-1700] P1-12：改为参数化查询（ORM），避免 SQL 字符串拼接导致的注入风险。
    // exec_sql 直读方案仅作为 ORM 不可用的兜底。
    let query = db
      .from('site_config')
      .select('id, config_key, config_value, config_type, category, label, description, is_public, updated_at')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });
    if (category) {
      query = query.eq('category', category);
    }
    const { data: rows, error: ormErr } = await query;

    if (ormErr) {
      console.error('[Settings API] ORM 查询失败，降级为 exec_sql:', ormErr);
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
  const { user: admin, errorResponse } = await requireAdmin(request);
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
      const { key, value, description, category, label } = item;
      if (!key) continue;

      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const configType = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';

      // #[20260831-1700] P1-12：参数化查询，不再拼接 SQL 字符串
      const { data: existing } = await db
        .from('site_config')
        .select('id, config_value, config_type, description, category, label')
        .eq('config_key', key)
        .maybeSingle();

      if (existing) {
        const updatePayload: Record<string, unknown> = {
          config_value: stringValue,
          config_type: configType,
          updated_at: now,
        };
        if (description !== undefined) updatePayload.description = description;
        if (category !== undefined) updatePayload.category = category;
        if (label !== undefined) updatePayload.label = label;

        const { error } = await db.from('site_config').update(updatePayload).eq('id', existing.id);
        if (!error) {
          updated++;
          // P0-4：配置变更审计
          await AuditLogService.log({
            userId: admin.id,
            userEmail: admin.email,
            userRole: admin.role,
            action: 'UPDATE',
            resourceType: 'site_config',
            resourceId: key,
            oldValue: {
              config_value: existing.config_value,
              config_type: existing.config_type,
              description: existing.description,
            },
            newValue: {
              config_value: stringValue,
              config_type: configType,
              description: description !== undefined ? description : existing.description,
            },
            changes: {
              config_value: { old: existing.config_value, new: stringValue },
              ...(existing.config_type !== configType
                ? { config_type: { old: existing.config_type, new: configType } }
                : {}),
            },
            reason: '管理员更新系统配置',
            ipAddress: extractClientIp(request) ?? undefined,
            userAgent: request.headers.get('user-agent') ?? undefined,
          });
        }
      } else {
        const { error } = await db.from('site_config').insert({
          config_key: key,
          config_value: stringValue,
          config_type: configType,
          category: category || guessCategory(key),
          label: label || key,
          description: description || '',
          updated_at: now,
        });
        if (!error) {
          updated++;
          await AuditLogService.log({
            userId: admin.id,
            userEmail: admin.email,
            userRole: admin.role,
            action: 'CREATE',
            resourceType: 'site_config',
            resourceId: key,
            newValue: {
              config_value: stringValue,
              config_type: configType,
              category: category || guessCategory(key),
              label: label || key,
              description: description || '',
            },
            reason: '管理员新建系统配置',
            ipAddress: extractClientIp(request) ?? undefined,
            userAgent: request.headers.get('user-agent') ?? undefined,
          });
        }
      }
    }

    return NextResponse.json({ success: true, message: `已更新 ${updated} 项设置` });
  } catch (error: any) {
    captureException(error, {
      source: 'api.admin.settings.PUT',
      message: '更新系统配置未处理异常',
      requestMethod: 'PUT',
      requestPath: '/api/admin/settings',
      statusCode: 500,
    });
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
