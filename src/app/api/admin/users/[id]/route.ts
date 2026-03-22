import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * GET - 获取单个用户详情
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        name: data.full_name || data.username,
        email: data.email,
        username: data.username,
        role: data.role,
        status: data.status,
        phone: data.metadata?.phone || '',
        avatar: data.avatar_url || '',
        points: data.metadata?.points || 0,
        createdAt: data.created_at,
        lastLogin: data.last_login,
        metadata: data.metadata || {},
      },
    });
  } catch (error: any) {
    console.error('[User Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取用户详情失败' }, { status: 500 });
  }
}

/**
 * PUT - 更新用户信息
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = await request.json();
    const db = getSupabaseServiceClient();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.full_name !== undefined) updateData.full_name = body.full_name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.username !== undefined) updateData.username = body.username;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url;

    // 处理 metadata 字段
    const metadataUpdate: Record<string, any> = {};
    if (body.phone !== undefined) metadataUpdate.phone = body.phone;
    if (body.points !== undefined) metadataUpdate.points = body.points;

    if (Object.keys(metadataUpdate).length > 0) {
      // 获取当前 metadata 并合并
      const { data: currentUser } = await db
        .from('users')
        .select('metadata')
        .eq('id', params.id)
        .single();

      const currentMetadata = currentUser?.metadata || {};
      updateData.metadata = { ...currentMetadata, ...metadataUpdate };
    }

    const { data, error } = await db
      .from('users')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[User Update API] 更新失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '用户信息更新成功',
      data,
    });
  } catch (error: any) {
    console.error('[User Update API] 异常:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

/**
 * DELETE - 删除用户
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { error } = await db.from('users').delete().eq('id', params.id);

    if (error) {
      console.error('[User Delete API] 删除失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '用户已删除' });
  } catch (error: any) {
    console.error('[User Delete API] 异常:', error);
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}
