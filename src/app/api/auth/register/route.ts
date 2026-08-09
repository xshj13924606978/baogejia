export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getSiteConfigValues } from '@/lib/site-config';
import bcrypt from 'bcrypt';

// 默认注册积分奖励
const DEFAULT_REGISTER_POINTS = 10;

async function getRegisterPoints(): Promise<number> {
  try {
    const configs = await getSiteConfigValues(['register_points']);
    const value = configs['register_points'];
    if (value === null || value === undefined || value === '') return DEFAULT_REGISTER_POINTS;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? DEFAULT_REGISTER_POINTS : parsed;
  } catch {
    return DEFAULT_REGISTER_POINTS;
  }
}

// 注册用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, email, phone, company, contact } = body;

    if (!username || !password || !email) {
      return NextResponse.json({ error: '用户名、密码和邮箱不能为空' }, { status: 400 });
    }

    // 读取安全设置配置
    const securityConfig = await getSiteConfigValues([
      'allow_register',
      'password_min_length',
    ]);

    // 检查是否开放注册
    if (securityConfig.allow_register === 'false') {
      return NextResponse.json({ error: '当前已关闭新用户注册' }, { status: 403 });
    }

    // 密码强度校验：使用配置的最小长度
    const minLength = Math.max(1, parseInt(securityConfig.password_min_length || '6', 10));
    if (password.length < minLength) {
      return NextResponse.json({ error: `密码长度不能少于${minLength}位` }, { status: 400 });
    }

    // 邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    const db = getSupabaseServiceClient();

    // 检查用户名是否已存在
    const { data: existingUser, error: _checkError } = await db
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    // 创建用户（字段适配实际数据库 users 表）
    const insertData: Record<string, unknown> = {
      username,
      password_hash: passwordHash,
      email,
      role: 'free', // 注册固定为免费用户，不允许客户端指定
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 可选字段：仅在有值时加入
    if (phone) insertData.phone = phone;
    if (company) insertData.company = company;
    if (contact) insertData.contact = contact;

    const { data: user, error: createError } = await db
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (createError || !user) {
      console.error('[Auth] 注册失败:', createError);
      return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }

    // 注册成功后奖励积分（直接操作数据库，避免 HTTP 自调用认证问题）
    try {
      const pointsRule = await getRegisterPoints();
      if (pointsRule > 0) {
        const { error: pointsError } = await db
          .from('point_records')
          .insert({
            user_id: user.id,
            points: pointsRule,
            type: 'register',
            description: '注册账号奖励'
          })
          .select()
          .single();

        if (!pointsError) {
          // 更新用户积分
          const { data: userPoints } = await db
            .from('users')
            .select('points, total_points')
            .eq('id', user.id)
            .single();

          const newPoints = Math.max(0, (userPoints?.points || 0) + pointsRule);
          const newTotalPoints = (userPoints?.total_points || 0) + Math.max(0, pointsRule);

          await db
            .from('users')
            .update({ points: newPoints, total_points: newTotalPoints })
            .eq('id', user.id);
        }
      }
    } catch (pointsError) {
      console.error('[Auth] 注册积分奖励失败:', pointsError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      message: '注册成功'});
  } catch (error) {
    console.error('[Auth] 注册请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
