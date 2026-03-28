import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';

/**
 * 知识库文件下载 API
 *
 * POST /api/knowledge/download
 * Body: { entryId: string }
 *
 * 1. 检查用户等级权限（knowledge.download）
 * 2. 检查积分余额
 * 3. 扣减积分
 * 4. 返回文件下载 URL
 */

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser?.id) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json({ success: false, error: '缺少 entryId' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 1. 获取条目信息
    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, title, file_url, file_name, status, user_id, type')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    if (entry.status !== 'approved') {
      return NextResponse.json({ success: false, error: '该条目尚未通过审核' }, { status: 403 });
    }

    // 自己上传的文件不扣积分
    if (entry.user_id === currentUser.id) {
      return NextResponse.json({
        success: true,
        file_url: entry.file_url,
        file_name: entry.file_name,
        points_deducted: 0,
        message: '下载自己的文件不消耗积分',
      });
    }

    // 2. 检查用户等级下载权限
    let canDownload = true; // 默认允许
    try {
      const { data: userRecord } = await db
        .from('users')
        .select('metadata')
        .eq('id', currentUser.id)
        .single();
      const userLevel = userRecord?.metadata?.level || 1;

      const { data: overrides } = await db
        .from('permission_overrides')
        .select('is_visible')
        .eq('target_type', 'level')
        .eq('target_id', String(userLevel))
        .eq('permission_type', 'action')
        .eq('permission_key', 'knowledge.download')
        .limit(1);

      if (overrides && overrides.length > 0) {
        canDownload = overrides[0].is_visible !== false;
      }
    } catch { /* ignore */ }

    if (!canDownload) {
      return NextResponse.json({ success: false, error: '当前等级无下载权限' }, { status: 403 });
    }

    // 3. 从 points_rules 读取下载积分规则
    const { data: rule } = await db
      .from('points_rules')
      .select('*')
      .eq('rule_key', 'knowledge_download_cost')
      .eq('is_active', true)
      .single();

    const downloadCost = rule
      ? (rule.rule_config?.base_cost || Math.abs(rule.base_points || 5))
      : 5;

    // 4. 扣减积分
    if (downloadCost > 0) {
      const result = await pointsService.deductPoints(
        currentUser.id,
        downloadCost,
        'exchange',
        `下载知识库文件「${entry.title}」`
      );

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.reason || '积分不足',
          required_points: downloadCost,
        }, { status: 402 });
      }
    }

    // 5. 更新下载计数
    await db
      .from('knowledge_entries')
      .update({ downloads: (entry as any).downloads ? (entry as any).downloads + 1 : 1 })
      .eq('id', entryId);

    return NextResponse.json({
      success: true,
      file_url: entry.file_url,
      file_name: entry.file_name,
      points_deducted: downloadCost,
      message: downloadCost > 0 ? `消耗 ${downloadCost} 积分` : '免费下载',
    });
  } catch (error: any) {
    console.error('[Knowledge Download API] 异常:', error);
    return NextResponse.json({ success: false, error: '下载失败' }, { status: 500 });
  }
}
