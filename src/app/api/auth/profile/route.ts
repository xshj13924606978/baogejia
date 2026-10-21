export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getSiteConfigValues } from '@/lib/site-config';

/**
 * PUT /api/auth/profile - 设置用户名 / 姓名 / 设置密码（#20260820-1600，#[20260829-1700] 支持 name）
 * - 设置密码无需旧密码（完善信息引导场景）
 * - 用户名校验格式与唯一性；姓名存 metadata.name + full_name
 * Body: { username?, name?, password? }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { username, name, password } = body;

    const hasAny =
      (typeof username === 'string' && username.trim()) ||
      (typeof name === 'string' && name.trim()) ||
      (typeof password === 'string' && password);
    if (!hasAny) {
      return NextResponse.json({ error: '请提供用户名、姓名或密码' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const updates: Record<string, unknown> = {};

    // 用户名校验
    if (username && typeof username === 'string') {
      const name = username.trim();
      if (!/^[\w\u4e00-\u9fa5]{2,30}$/.test(name)) {
        return NextResponse.json(
          { error: '用户名需为2-30位字母、数字、下划线或中文' },
          { status: 400 }
        );
      }
      // 唯一性（排除自己）
      const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('username', name)
        .neq('id', user.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: '用户名已被占用，请换一个' }, { status: 409 });
      }
      updates.username = name;
    }

    // 姓名：存 metadata.name + full_name（#[20260829-1700]）
    if (name && typeof name === 'string') {
      const trimmedName = name.trim();
      if (trimmedName.length < 1 || trimmedName.length > 30) {
        return NextResponse.json({ error: '姓名长度需为1-30个字符' }, { status: 400 });
      }
      const { data: currentForMeta } = await db
        .from('users')
        .select('metadata, full_name')
        .eq('id', user.id)
        .maybeSingle();
      const metadata = { ...(currentForMeta?.metadata || {}), name: trimmedName };
      updates.metadata = metadata;
      updates.full_name = trimmedName;
    }

    // 密码校验
    if (password && typeof password === 'string') {
      const securityConfig = await getSiteConfigValues(['password_min_length']);
      const minLength = Math.max(1, parseInt(securityConfig.password_min_length || '6', 10));
      if (password.length < minLength) {
        return NextResponse.json({ error: `密码长度不能少于${minLength}位` }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedUser, error: updateError } = await db
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError || !updatedUser) {
      console.error('[Auth] 更新用户资料失败:', updateError);
      return NextResponse.json({ error: '保存失败，请重试' }, { status: 500 });
    }

    // 剔除敏感字段
    const { password: _pw, password_hash: _ph, ...safeUser } = updatedUser;

    return NextResponse.json({ success: true, user: safeUser });
  } catch (error) {
    console.error('[Auth] 更新资料请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
