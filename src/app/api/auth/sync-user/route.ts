export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { signSessionToken, verifySessionToken } from '@/lib/session-token';
import bcrypt from 'bcrypt';

/**
 * CORS 预检请求处理
 * 确保浏览器 OPTIONS 预检请求成功，使 POST 请求能正常到达
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-token',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * 简易内存速率限制器 — 防止暴力创建用户
 * 生产环境建议替换为 Redis 方案
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;       // 每个 IP 每分钟最多 10 次
const RATE_LIMIT_WINDOW = 60000; // 60 秒窗口

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // 超限
  }
  entry.count++;
  return true;
}

// 每 5 分钟清理一次过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300000);

/**
 * 用户同步 API
 * 将前端 localStorage 中的用户数据同步到 Supabase 数据库
 * 实现前端/后端用户数据的打通
 *
 * 安全措施：
 * - IP 速率限制（防暴力注册）
 * - 不接受客户端传入的 role 字段（防权限提升）
 * - 已认证用户同步无次数限制
 * - 返回签名 session token 供后续认证
 */
export async function POST(request: NextRequest) {
  try {
    // 0. IP 速率限制
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    // 1. 如果请求携带已有 session token，验证后同步（已认证用户不限额）
    const existingSessionToken = request.headers.get('x-user-token');
    let isAuthenticated = false;
    let authenticatedUserId: string | null = null;
    if (existingSessionToken) {
      const verified = verifySessionToken(existingSessionToken);
      if (!verified) {
        console.warn('[sync-user] token 验证失败，token 已过期或无效');
        return NextResponse.json({ error: '认证已过期，请重新登录' }, { status: 401 });
      }
      isAuthenticated = true;
      authenticatedUserId = verified.userId;
      console.log('[sync-user] 用户已认证:', { userId: authenticatedUserId });
    }

    const body = await request.json();
    // 注意：不再从 body 中解构 role，禁止客户端指定角色
    const { phone, email, username, password, name, clearEmail, clearPhone, supabaseUserId, currentPassword } = body;

    console.log('[sync-user] 请求参数:', {
      hasEmail: !!email,
      hasPhone: !!phone,
      hasUsername: !!username,
      hasPassword: !!password,
      hasCurrentPassword: !!currentPassword,
      hasSupabaseUserId: !!supabaseUserId,
      isAuthenticated,
      passwordLength: password?.length || 0,
    });

    if (!email && !phone && !username) {
      console.warn('[sync-user] 缺少用户标识');
      return NextResponse.json({ error: '缺少用户标识' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseServiceClient();
      console.log('[sync-user] Supabase 客户端创建成功');
    } catch (clientErr) {
      console.error('[sync-user] Supabase 客户端创建失败:', clientErr instanceof Error ? clientErr.message : String(clientErr));
      return NextResponse.json(
        { error: '服务配置错误', detail: clientErr instanceof Error ? clientErr.message : '未知错误' },
        { status: 500 }
      );
    }

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

    console.log('[sync-user] 用户查找结果:', {
      found: !!existingUser,
      userId: existingUser?.id,
      hasPasswordHash: !!existingUser?.password_hash,
    });

    // 2. 准备密码哈希
    let passwordHash: string | null = null;
    let shouldUpdatePassword = false;

    if (password) {
      // 检查是否已经是 bcrypt hash
      if (password.startsWith('$2b$') || password.startsWith('$2a$')) {
        passwordHash = password;
        shouldUpdatePassword = true;
      } else {
        // 判断是否需要验证当前密码
        let canUpdatePassword = false;

        if (isAuthenticated && authenticatedUserId && existingUser && existingUser.id === authenticatedUserId) {
          // 已登录用户修改自己的密码：不需要 currentPassword
          canUpdatePassword = true;
          // 但如果提供了 currentPassword，则验证（用于安全确认）
          if (currentPassword && existingUser.password_hash) {
            const isCurrentValid = await bcrypt.compare(currentPassword, existingUser.password_hash);
            if (!isCurrentValid) {
              return NextResponse.json({ error: '当前密码不正确' }, { status: 403 });
            }
          }
        } else if (existingUser?.password_hash) {
          // 未认证用户修改已存在的账号密码：必须验证 currentPassword
          if (!currentPassword) {
            return NextResponse.json({ error: '修改密码需提供当前密码' }, { status: 403 });
          }
          const isCurrentValid = await bcrypt.compare(currentPassword, existingUser.password_hash);
          if (!isCurrentValid) {
            return NextResponse.json({ error: '当前密码不正确' }, { status: 403 });
          }
          canUpdatePassword = true;
        } else {
          // 新用户创建或用户无密码记录：允许直接设置密码
          canUpdatePassword = true;
        }

        if (canUpdatePassword) {
          passwordHash = await bcrypt.hash(password, 10);
          shouldUpdatePassword = true;
        }
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

      // 密码同步：只存 password_hash（bcrypt 哈希），users 表无 password 列
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
        console.error('[sync-user] 更新用户失败:', {
          userId: existingUser.id,
          errorCode: (error as any)?.code,
          errorMessage: (error as any)?.message || error,
          errorDetails: (error as any)?.details || '',
        });
        return NextResponse.json(
          { error: '同步失败', detail: (error as any)?.message || String(error) },
          { status: 500 }
        );
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
        console.error('[sync-user] 创建用户失败:', {
          errorCode: (error as any)?.code,
          errorMessage: (error as any)?.message || error,
          errorDetails: (error as any)?.details || '',
        });
        return NextResponse.json(
          { error: '同步失败', detail: (error as any)?.message || String(error) },
          { status: 500 }
        );
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
    console.error('[sync-user] 未预期的同步错误:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { error: '服务器错误', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
