import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// GET /api/collection/history - 获取采集历史记录
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const { data, error } = await supabase
      .from('collection_logs')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Collection History API] 查询失败:', error);
      return NextResponse.json({ error: 'Failed to fetch collection history' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Collection History API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
