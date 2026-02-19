import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取用户上传记录
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: '缺少用户ID' },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    const { data: records, error } = await db
      .from('user_uploads')
      .select('*')
      .eq('user_id', parseInt(userId))
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[User] 查询上传记录失败:', error);
      return NextResponse.json(
        { error: '查询失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      records: records || []
    });
  } catch (error) {
    console.error('[User] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 创建上传记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, type, title, file_url } = body;

    if (!user_id || !type || !title) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

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
      return NextResponse.json(
        { error: '今日上传次数已达上限' },
        { status: 429 }
      );
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
      return NextResponse.json(
        { error: '创建失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      record
    });
  } catch (error) {
    console.error('[User] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
