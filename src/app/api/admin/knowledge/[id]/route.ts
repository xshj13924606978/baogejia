import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';

/**
 * 知识条目详情/审核/删除 API（管理员）
 */

// GET: 获取单个知识条目详情
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('knowledge_entries')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 获取上传者信息
    let uploaderName = data.user_id || '未知';
    if (data.user_id) {
      try {
        const { data: user } = await db.from('users').select('username, full_name').eq('id', data.user_id).single();
        if (user) uploaderName = user.full_name || user.username || data.user_id;
      } catch { /* ignore */ }
    }

    // 获取 tags
    let tags: string[] = [];
    try {
      const { data: tagRelations } = await db
        .from('knowledge_entry_tags')
        .select('knowledge_tags(name)')
        .eq('entry_id', params.id);
      if (tagRelations) {
        tags = tagRelations
          .map((r: any) => r.knowledge_tags?.name)
          .filter(Boolean);
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        type: data.type,
        title: data.title,
        description: data.description || '',
        fileName: data.file_name,
        fileKey: data.file_key,
        fileUrl: data.file_url,
        fileSize: data.file_size,
        fileType: data.file_type,
        content: data.content,
        metadata: data.metadata || {},
        status: data.status,
        uploaderName,
        tags,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[Knowledge Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取详情失败' }, { status: 500 });
  }
}

// PATCH: 更新条目（审核/编辑）
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = await request.json();
    const db = getSupabaseServiceClient();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.reject_reason !== undefined) updateData.reject_reason = body.reject_reason;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    // 验证状态值
    if (body.status && !['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ success: false, error: '无效的状态值' }, { status: 400 });
    }

    // 审核通过时奖励上传者积分
    if (body.status === 'approved') {
      // 先获取条目的上传者（审核前查询）
      const { data: before } = await db
        .from('knowledge_entries')
        .select('status, user_id, title')
        .eq('id', params.id)
        .single();

      // 只有从非 approved 变为 approved 时才奖励（避免重复奖励）
      if (before && before.status !== 'approved' && before.user_id) {
        try {
          const { data: rule } = await db
            .from('points_rules')
            .select('*')
            .eq('rule_key', 'knowledge_upload_reward')
            .eq('is_active', true)
            .single();

          const rewardPoints = rule
            ? (rule.rule_config?.points || rule.base_points || 20)
            : 20;

          await pointsService.addPoints(
            before.user_id,
            rewardPoints,
            'task_reward',
            `知识库文件「${before.title}」审核通过奖励`
          );
        } catch (rewardErr: any) {
          console.warn('[Knowledge Update API] 积分奖励失败（不影响审核）:', rewardErr?.message);
        }
      }
    }

    const { data, error } = await db
      .from('knowledge_entries')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[Knowledge Update API] 更新失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '更新成功', data });
  } catch (error: any) {
    console.error('[Knowledge Update API] 异常:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

// DELETE: 删除知识条目（同时删除 Storage 中的文件）
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    // 先获取条目信息（需要 file_key 来删除存储文件）
    const { data: item, error: fetchError } = await db
      .from('knowledge_entries')
      .select('file_key, file_name')
      .eq('id', params.id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 删除数据库记录
    const { error: deleteError } = await db.from('knowledge_entries').delete().eq('id', params.id);

    if (deleteError) {
      console.error('[Knowledge Delete API] 删除记录失败:', deleteError);
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
    }

    // 尝试删除存储文件（不阻塞，失败只记录日志）
    if (item.file_key) {
      try {
        await db.storage.from('knowledge-base').remove([item.file_key]);
      } catch (storageErr: any) {
        console.warn('[Knowledge Delete API] 删除存储文件失败（已忽略）:', storageErr.message);
      }
    }

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error: any) {
    console.error('[Knowledge Delete API] 异常:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}
