import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 资料中心积分扣费配置 API
 *
 * GET  - 获取扣费配置列表 + 分成比例（points_download_config / site_config）
 * POST - 新增或更新一条扣费配置（有 id 则更新，无 id 则按 资源类型+动作+角色 匹配后新增）
 * DELETE（body 传 id） - 删除一条配置
 *
 * 权限要求: super_admin / admin（admin.manage_points_rules）
 * 配置实时生效（下载/查看详情时直接读取该表）
 */

const RESOURCE_TYPES = ['document', 'standard', 'drawing', 'quota'];
const ACTION_TYPES = ['download', 'view'];
const VALID_ROLES = ['super_admin', 'admin', 'vip', 'premium', 'free', 'contributor', 'enterprise_admin'];

export async function GET(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();

    const { data, error } = await supabase
      .from('points_download_config')
      .select('*')
      .order('resource_type')
      .order('action_type')
      .order('role', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('[DownloadConfigAPI] 获取配置失败:', error);
      return NextResponse.json({ success: false, error: '获取配置失败' }, { status: 500 });
    }

    // #202608302200 配置数据动态同步：分成比例以统一数据源 trade_config 为准
    // （points.split_rates），site_config 仅作兼容回退。
    let creatorRate: number | null = null;
    let platformRate: number | null = null;
    const { data: tcSplit } = await supabase
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.split_rates')
      .maybeSingle();
    if (tcSplit?.config_value && typeof tcSplit.config_value === 'object') {
      const c = Number(tcSplit.config_value.creator_rate);
      const p = Number(tcSplit.config_value.platform_rate);
      if (Number.isFinite(c) && c >= 0 && c <= 1) creatorRate = c;
      if (Number.isFinite(p) && p >= 0 && p <= 1) platformRate = p;
    }
    if (creatorRate === null || platformRate === null) {
      const { data: splitData } = await supabase
        .from('site_config')
        .select('config_key, config_value')
        .in('config_key', ['points_split_creator_rate', 'points_split_platform_rate']);
      const splitMap: Record<string, string> = {};
      (splitData || []).forEach((row: any) => {
        splitMap[row.config_key] = row.config_value;
      });
      creatorRate = parseFloat(splitMap['points_split_creator_rate']);
      platformRate = parseFloat(splitMap['points_split_platform_rate']);
      if (Number.isNaN(creatorRate)) creatorRate = 0.7;
      if (Number.isNaN(platformRate)) platformRate = 0.3;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      split: {
        creator_rate: String(creatorRate),
        platform_rate: String(platformRate),
      },
    });
  } catch (error) {
    console.error('[DownloadConfigAPI] 获取配置异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const supabase = getSupabaseServiceClient();

    // 更新分成比例
    if (body.action === 'update_split') {
      const creatorRate = parseFloat(body.creator_rate);
      // 平台比例自动联动：未显式传 platform_rate 时按 1 - creator_rate 计算（前端只读展示）
      const platformRate =
        body.platform_rate !== undefined && body.platform_rate !== null && body.platform_rate !== ''
          ? parseFloat(body.platform_rate)
          : Number((1 - creatorRate).toFixed(4));
      if (Number.isNaN(creatorRate) || creatorRate < 0 || creatorRate > 1 ||
          Number.isNaN(platformRate) || platformRate < 0 || platformRate > 1 ||
          Math.abs(creatorRate + platformRate - 1) > 0.0001) {
        return NextResponse.json({ success: false, error: '分成比例需为 0~1 之间且两者之和为 1' }, { status: 400 });
      }
      // #202608302200 配置数据动态同步：写入统一数据源 trade_config（points.split_rates）
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const { error: tcErr } = await supabase.from('trade_config').upsert(
        {
          config_key: 'points.split_rates',
          config_value: { creator_rate: creatorRate, platform_rate: platformRate },
          config_type: 'json',
          description: '资料下载积分分成比例（创作者/平台）',
          category: 'system',
          is_active: true,
          updated_by: UUID_REGEX.test(currentUser?.id || '') ? currentUser.id : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'config_key' }
      );
      if (tcErr) {
        console.error('[DownloadConfigAPI] 更新分成比例(trade_config)失败:', tcErr.message);
        return NextResponse.json({ success: false, error: '更新分成比例失败' }, { status: 500 });
      }
      // 兼容回退源同步（迁移过渡期，消费端已优先读 trade_config）
      const { error: up1 } = await supabase
        .from('site_config')
        .update({ config_value: String(creatorRate), updated_at: new Date().toISOString() })
        .eq('config_key', 'points_split_creator_rate');
      const { error: up2 } = await supabase
        .from('site_config')
        .update({ config_value: String(platformRate), updated_at: new Date().toISOString() })
        .eq('config_key', 'points_split_platform_rate');
      if (up1 || up2) {
        console.error('[DownloadConfigAPI] 同步 site_config 分成比例失败:', up1 || up2);
      }
      return NextResponse.json({ success: true, message: '分成比例已更新' });
    }

    // 新增/更新扣费配置
    let resourceType = body.resource_type;
    const actionType = body.action_type || 'download';
    let role = body.role ?? null;
    let cost = Number.isFinite(Number(body.cost)) ? Math.max(0, Math.floor(Number(body.cost))) : null;

    // 更新已有配置（body.id）：缺失字段从数据库现有记录补齐，支持仅传部分字段的部分更新
    let existing: any = null;
    if (body.id) {
      const { data: current, error: fetchErr } = await supabase
        .from('points_download_config')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (fetchErr) {
        console.error('[DownloadConfigAPI] 查询配置失败:', fetchErr);
        return NextResponse.json({ success: false, error: '查询配置失败' }, { status: 500 });
      }
      if (!current) {
        return NextResponse.json({ success: false, error: '配置不存在或已被删除' }, { status: 404 });
      }
      existing = current;
      resourceType = resourceType ?? existing.resource_type;
      role = role ?? existing.role;
      cost = cost ?? existing.cost;
    }

    if (!RESOURCE_TYPES.includes(resourceType)) {
      return NextResponse.json({ success: false, error: `无效的资源类型，可选：${RESOURCE_TYPES.join('/')}` }, { status: 400 });
    }
    if (!ACTION_TYPES.includes(actionType)) {
      return NextResponse.json({ success: false, error: `无效的动作类型，可选：${ACTION_TYPES.join('/')}` }, { status: 400 });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: `无效的角色：${role}` }, { status: 400 });
    }

    const payload: Record<string, any> = {
      resource_type: resourceType,
      action_type: actionType,
      role,
      cost,
      updated_at: new Date().toISOString(),
    };
    // 仅更新显式传入的字段，避免部分更新误重置其他字段
    if (body.is_enabled !== undefined && body.is_enabled !== null) payload.is_enabled = body.is_enabled;
    if (body.description !== undefined && body.description !== null) payload.description = body.description;

    let result: any;
    if (body.id) {
      const { data, error } = await supabase
        .from('points_download_config')
        .update(payload)
        .eq('id', body.id)
        .select()
        .single();
      if (error) {
        console.error('[DownloadConfigAPI] 更新配置失败:', error);
        return NextResponse.json({ success: false, error: `更新失败: ${safeErrorMessage(error)}` }, { status: 500 });
      }
      result = data;
    } else {
      // 存在相同 类型+动作+角色 时更新，否则新增
      const { data: existing } = await supabase
        .from('points_download_config')
        .select('id')
        .eq('resource_type', resourceType)
        .eq('action_type', actionType)
        .is('role', role)
        .maybeSingle();

      if (existing) {
        payload.is_enabled = body.is_enabled ?? true;
        payload.description = body.description || null;
        const { data, error } = await supabase
          .from('points_download_config')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) {
          console.error('[DownloadConfigAPI] 更新配置失败:', error);
          return NextResponse.json({ success: false, error: `更新失败: ${safeErrorMessage(error)}` }, { status: 500 });
        }
        result = data;
      } else {
        const { data, error } = await supabase
          .from('points_download_config')
          .insert({
            ...payload,
            is_enabled: body.is_enabled ?? true,
            description: body.description || null,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) {
          console.error('[DownloadConfigAPI] 新增配置失败:', error);
          return NextResponse.json({ success: false, error: `新增失败: ${safeErrorMessage(error)}` }, { status: 500 });
        }
        result = data;
      }
    }

    return NextResponse.json({ success: true, data: result, message: body.id ? '配置已更新' : '配置已保存' });
  } catch (error: any) {
    console.error('[DownloadConfigAPI] 操作异常:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '服务器错误') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    if (!hasPermission(currentUser, 'admin.manage_points_rules')) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    // 支持 query 参数 ?id=xxx 或 body 传 id（兼容旧调用）
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id') || null;
    if (!id) {
      const body = await request.json().catch(() => null);
      id = body?.id || null;
    }
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少配置 id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: target, error: fetchError } = await supabase
      .from('points_download_config')
      .select('id, resource_type, action_type, role, cost')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) {
      console.error('[DownloadConfigAPI] 查询配置失败:', fetchError);
      return NextResponse.json({ success: false, error: '查询配置失败' }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ success: false, error: '配置不存在或已被删除' }, { status: 404 });
    }

    const { error } = await supabase.from('points_download_config').delete().eq('id', id);
    if (error) {
      console.error('[DownloadConfigAPI] 删除配置失败:', error);
      return NextResponse.json({ success: false, error: `删除失败: ${safeErrorMessage(error)}` }, { status: 500 });
    }
    console.log(
      `[DownloadConfigAPI] 已删除配置 id=${id} (${target.resource_type}/${target.action_type}/${target.role || 'all'}, cost=${target.cost}) by ${currentUser.email || currentUser.id}`
    );
    return NextResponse.json({ success: true, message: '配置已删除' });
  } catch (error: any) {
    console.error('[DownloadConfigAPI] 删除异常:', error);
    return NextResponse.json({ success: false, error: safeErrorMessage(error, '服务器错误') }, { status: 500 });
  }
}
