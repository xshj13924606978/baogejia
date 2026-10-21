import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { safeErrorMessage } from '@/lib/error-handler';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('points_rules')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: '获取积分规则失败: ' + safeErrorMessage(error) },
        { status: 500 }
      );
    }

    const grouped = {
      earn: data?.filter(r => r.operation_type === 'earn' || r.operation_type === 'reward') || [],
      spend: data?.filter(r => r.operation_type === 'spend' || r.operation_type === 'consume' || r.operation_type === 'exchange') || [],
      reward: data?.filter(r => r.operation_type === 'reward') || [],
      token: data?.filter(r => r.rule_type === 'token') || [],
    };

    return NextResponse.json({
      success: true,
      data: data || [],
      grouped,
    });
  } catch (error) {
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
