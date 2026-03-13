import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 批量删除产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '产品ID列表不能为空',
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 批量删除产品
    const { error } = await db.from('products').delete().in('id', ids);

    if (error) {
      console.error('批量删除产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `成功删除 ${ids.length} 条产品数据`,
      deletedCount: ids.length,
    });
  } catch (error) {
    console.error('批量删除产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '批量删除产品失败',
      },
      { status: 500 }
    );
  }
}
