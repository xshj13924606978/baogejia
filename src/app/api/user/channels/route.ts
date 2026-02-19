import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 绑定渠道账号
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      channel_type, // wechat/qq/phone/email
      channel_id, // openid/手机号/邮箱
      channel_name, // 昵称
      avatar, // 头像
      is_primary = false,
    } = body;

    if (!user_id || !channel_type || !channel_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 检查channel_id是否已被绑定
    const { data: existingChannel } = await db
      .from('user_channels')
      .select('*')
      .eq('channel_type', channel_type)
      .eq('channel_id', channel_id)
      .single();

    if (existingChannel) {
      return NextResponse.json({ error: '该账号已被绑定' }, { status: 400 });
    }

    // 如果设置为默认，先取消其他相同类型的默认绑定
    if (is_primary) {
      await db
        .from('user_channels')
        .update({ is_primary: false })
        .eq('user_id', parseInt(user_id))
        .eq('channel_type', channel_type);
    }

    // 创建绑定记录
    const { data, error } = await db
      .from('user_channels')
      .insert({
        user_id: parseInt(user_id),
        channel_type,
        channel_id,
        channel_name,
        avatar,
        is_primary,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: '绑定成功',
    });
  } catch (error) {
    console.error('[UserChannel] 绑定渠道失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 获取用户绑定的渠道
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { data, error } = await db
      .from('user_channels')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .order('bind_time', { ascending: false });

    if (error) throw error;

    // 按类型分组
    const channels = {
      wechat: data?.filter((c: any) => c.channel_type === 'wechat')[0] || null,
      qq: data?.filter((c: any) => c.channel_type === 'qq')[0] || null,
      phone: data?.filter((c: any) => c.channel_type === 'phone')[0] || null,
      email: data?.filter((c: any) => c.channel_type === 'email')[0] || null,
    };

    return NextResponse.json({
      success: true,
      data: channels,
    });
  } catch (error) {
    console.error('[UserChannel] 获取绑定渠道失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 解绑渠道账号
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');
    const channel_type = searchParams.get('channel_type');

    if (!user_id || !channel_type) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { error } = await db
      .from('user_channels')
      .delete()
      .eq('user_id', parseInt(user_id))
      .eq('channel_type', channel_type);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '解绑成功',
    });
  } catch (error) {
    console.error('[UserChannel] 解绑渠道失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新最后登录时间
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_type, channel_id } = body;

    if (!channel_type || !channel_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { error } = await db
      .from('user_channels')
      .update({ last_login: new Date() })
      .eq('channel_type', channel_type)
      .eq('channel_id', channel_id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '更新成功',
    });
  } catch (error) {
    console.error('[UserChannel] 更新登录时间失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
