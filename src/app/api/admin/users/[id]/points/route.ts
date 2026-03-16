import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取用户积分余额
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('[UserPoints API] 获取用户积分, ID:', id);
    
    // 支持 UUID 格式的用户 ID
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    
    // 从 users 表获取用户积分信息
    const { data: user, error } = await supabase
      .from('users')
      .select('id, metadata')
      .eq('id', id)
      .single();
    
    console.log('[UserPoints API] 查询结果:', { user, error });

    if (error || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 从 metadata 中获取积分，默认为 0
    const points = user.metadata?.points || 0;
    console.log('[UserPoints API] 用户积分:', points);

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        pointsBalance: points,
        tokenBalance: 0,
        totalConsumedPoints: 0,
        totalRechargedPoints: points,
        lastUpdated: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[User Points API] 获取用户积分失败:', error);
    return NextResponse.json(
      { error: '获取用户积分失败' },
      { status: 500 }
    );
  }
}

/**
 * 设置用户积分（管理员功能）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { points } = body;

    // 支持 UUID 格式的用户 ID
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    if (typeof points !== 'number' || points < 0) {
      return NextResponse.json(
        { error: '无效的积分数值' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    
    // 更新用户 metadata 中的积分
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, metadata')
      .eq('id', id)
      .single();
    
    if (fetchError || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        metadata: {
          ...user.metadata,
          points: points
        }
      })
      .eq('id', id);
    
    if (updateError) {
      return NextResponse.json(
        { error: '设置积分失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '积分设置成功',
      data: {
        userId: id,
        pointsBalance: points,
      }
    });
  } catch (error) {
    console.error('[User Points API] 设置用户积分失败:', error);
    return NextResponse.json(
      { error: '设置用户积分失败' },
      { status: 500 }
    );
  }
}
