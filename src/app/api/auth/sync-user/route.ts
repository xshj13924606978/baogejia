import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionToken } from '@/lib/session-token';
import bcrypt from 'bcrypt';

/**
 * 用户同步 API
 * 将前端 localStorage 中的用户数据同步到 Supabase 数据库
 * 实现前端/后端用户数据的打通
 *
 * 安全措施：
 * - 不接受客户端传入的 role 字段（防权限提升）
 * - 返回签名 session token 供后续认证
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 注意：不再从 body 中解构 role，禁止客户端指定角色
    const { phone, email, username, password, name, clearEmail, clearPhone, supabaseUserId, currentPassword } = body;

    if (!email && !phone && !username) {
      return NextResponse.json({ error: '缺少用户标识' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

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
      // 安全：已有用户修改密码时，必须验证当前密码（如果 DB 中已存密码）
      if (existingUser?.password_hash) {
        if (!currentPassword) {
          return NextResponse.json({ error: '修改密码需提供当前密码' }, { status: 403 });
        }
        const isCurrentValid = await bcrypt.compare(currentPassword, existingUser.password_hash);
        if (!isCurrentValid) {
          return NextResponse.json({ error: '当前密码不正确' }, { status: 403 });
        }
      }
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

    let syncUser: any;

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
        return NextResponse.json({ error: '同步失败' }, { status: 500 });
      }

      syncUser = updatedUser;
    } else {
      // 4b. 创建新用户
      // 生成一个唯一的 username（基于手机号后4位或时间戳）
      const generatedUsername = username || `user_${phone ? phone.slice(-4) : Date.now().toString(36)}`;
      const displayEmail = email || `local_${Date.now()}@sync.local`;

      const insertData: Record<string, unknown> = {
        username: generatedUsername,
        email: displayEmail,
        // 安全：固定为 'free' 角色，不接受客户端传入
        role: 'free',
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
        return NextResponse.json({ error: '同步失败' }, { status: 500 });
      }

      syncUser = newUser;
    }

    // 签发 session token
    const sessionToken = signSessionToken(
      syncUser.id,
      syncUser.email || '',
      syncUser.role || 'free',
      7 * 24 * 3600
    );

    return NextResponse.json({
      success: true,
      sessionToken,
      user: { id: syncUser.id, email: syncUser.email, username: syncUser.username, role: syncUser.role },
      synced: true,
    });
  } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
