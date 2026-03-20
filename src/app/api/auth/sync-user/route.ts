import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';

/**
 * 用户同步 API
 * 将前端 localStorage 中的用户数据同步到 Supabase 数据库
 * 实现前端/后端用户数据的打通
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, email, username, password, name, role, clearEmail, clearPhone, supabaseUserId } = body;

    if (!email && !phone && !username) {
      return NextResponse.json({ error: '缺少用户标识' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. 尝试在 Supabase 中查找已有用户
    let existingUser: any = null;

    // 如果有 supabaseUserId 直接按 ID 查找（最精确）
    if (!existingUser && supabaseUserId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 按 email 查找（仅在非清空场景）
    if (email) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 按 username 查找
    if (!existingUser && username) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 按 metadata.phone 查找（仅在非清空场景）
    if (!existingUser && phone) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .filter('metadata->>phone', 'eq', phone)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 2. 准备密码哈希
    let passwordHash = null;
    if (password) {
      // 检查是否已经是 bcrypt hash
      if (password.startsWith('$2b$') || password.startsWith('$2a$')) {
        passwordHash = password;
      } else {
        passwordHash = await bcrypt.hash(password, 10);
      }
    }

    // 3. 准备 metadata（合并已有 metadata + 绑定信息）
    const existingMeta = existingUser?.metadata || {};
    const newMeta = { ...existingMeta };
    if (phone) newMeta.phone = phone;
    if (clearPhone) delete newMeta.phone;
    if (email) newMeta.email = email;
    if (clearEmail) delete newMeta.email;
    if (name) newMeta.name = name;

    if (existingUser) {
      // 4a. 更新已有用户
      const updateData: Record<string, unknown> = {
        metadata: newMeta,
        updated_at: new Date().toISOString(),
      };

      // 仅在有新密码时更新（localStorage 是密码的真实来源，总是同步）
      if (passwordHash) {
        updateData.password_hash = passwordHash;
      }

      // 如果已有用户缺少 email/username 但本次提供了，则补充
      if (email && !existingUser.email) {
        updateData.email = email;
      }
      if (username && !existingUser.username) {
        updateData.username = username;
      }

      // 支持清空 Supabase 的 email 字段（解绑邮箱场景）
      if (clearEmail && existingUser.email) {
        // email 是 unique 字段不能为空，用占位值标识已解绑
        updateData.email = `unbound_${existingUser.id}@local.invalid`;
      }

      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (error) {
        console.error('[SyncUser] 更新失败:', error);
        return NextResponse.json({ error: '同步失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        user: { id: updatedUser.id, email: updatedUser.email, username: updatedUser.username },
        synced: true,
      });
    } else {
      // 4b. 创建新用户
      // 生成一个唯一的 username（基于手机号后4位或时间戳）
      const generatedUsername = username || `user_${phone ? phone.slice(-4) : Date.now().toString(36)}`;
      const displayEmail = email || `local_${Date.now()}@sync.local`;

      const insertData: Record<string, unknown> = {
        username: generatedUsername,
        email: displayEmail,
        role: role || 'free',
        status: 'active',
        metadata: newMeta,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: newUser, error } = await supabase
        .from('users')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[SyncUser] 创建失败:', error);
        return NextResponse.json({ error: '同步失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        user: { id: newUser.id, email: newUser.email, username: newUser.username },
        synced: true,
      });
    }
  } catch (error) {
    console.error('[SyncUser] 同步异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
