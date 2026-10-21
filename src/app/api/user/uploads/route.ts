export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

// 获取用户上传记录
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // 优先使用服务端 session 解析的数据库 UUID（user_uploads.user_id 存的是 UUID），
    // 前端 localStorage 中的 user.id 可能是本地 id（如 user-xxx），与数据库不匹配导致查不到
    const currentUser = await getCurrentUser(request);
    const userId = currentUser?.id || searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    // user_uploads.user_id 为 UUID 类型，非 UUID 值（如本地 id user-xxx）查询会报错，
    // 统一返回空列表（正常路径走服务端 session 的 UUID，此处仅兜底）
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      return NextResponse.json({ success: true, records: [] });
    }

    const db = getSupabaseServiceClient();

    const { data: records, error } = await db
      .from('user_uploads')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null) // 软删除记录对普通用户隐藏（管理员视图仍可见）
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[User] 查询上传记录失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      records: records || [],
    });
  } catch (error) {
    console.error('[User] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 创建上传记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, type, title, file_url } = body;

    if (!user_id || !type || !title) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 检查今日是否已上传相同类型（限制每日上传次数）
    const today = new Date().toISOString().split('T')[0];
    const { data: todayUploads } = await db
      .from('user_uploads')
      .select('id')
      .eq('user_id', user_id)
      .eq('type', type)
      .gte('created_at', today)
      .limit(10);

    if (todayUploads && todayUploads.length >= 10) {
      return NextResponse.json({ error: '今日上传次数已达上限' }, { status: 429 });
    }

    // 创建上传记录
    const { data: record, error } = await db
      .from('user_uploads')
      .insert({
        user_id,
        type,
        title,
        file_url: file_url || '',
        status: 'pending',
      })
      .select()
      .single();

    if (error || !record) {
      console.error('[User] 创建上传记录失败:', error);
      return NextResponse.json({ error: '创建失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      record,
    });
  } catch (error) {
    console.error('[User] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 删除上传记录（仅限本人记录，支持单选/批量）
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const body = await request.json();
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少要删除的记录ID' }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ error: '单次删除数量不能超过200条' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 仅允许删除本人记录：先按归属查询（含未删除状态过滤），再做软删除
    const { data: owned, error: queryError } = await db
      .from('user_uploads')
      .select('id')
      .in('id', ids)
      .eq('user_id', currentUser.id)
      .is('deleted_at', null);

    if (queryError) {
      console.error('[User] 查询待删除记录失败:', queryError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    const ownedIds = (owned || []).map((r) => r.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // 软删除：标记删除者与删除时间，记录保留在管理员最近记录中并标注「xx用户已删除」
    // （管理员硬删除时才物理删除；软删除不清理存储文件，避免管理员视图记录无法访问）
    const { error: deleteError } = await db
      .from('user_uploads')
      .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser.id })
      .in('id', ownedIds);
    if (deleteError) {
      console.error('[User] 删除上传记录失败:', deleteError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedCount: ownedIds.length });
  } catch (error) {
    console.error('[User] 删除请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
