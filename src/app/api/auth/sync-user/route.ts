export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { verifySessionToken } from '@/lib/session-token';
import { signSessionTokenForUser, isSessionRevoked, SessionStateUnavailableError } from '@/lib/session-version';
import bcrypt from 'bcrypt';
import { safeErrorMessage } from '@/lib/error-handler';

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
    // #20260827-XXXX 修复：增加 httpOnly session_token cookie 兜底，
    // 扫码登录（OAuth）用户 localStorage 无 x-user-token 也能以已认证身份同步，
    // 否则解绑邮箱/手机等写操作走"未认证"路径，存在误匹配/持久化失败风险
    const existingSessionToken = request.headers.get('x-user-token') || request.cookies.get('session_token')?.value;
    let isAuthenticated = false;
    let authenticatedUserId: string | null = null;
    if (existingSessionToken) {
      const verified = verifySessionToken(existingSessionToken);
      if (!verified) {
        console.warn('[sync-user] token 验证失败，token 已过期或无效');
        return NextResponse.json({ error: '认证已过期，请重新登录' }, { status: 401 });
      }
      if (await isSessionRevoked(verified.userId, verified.sessionVersion)) {
        return NextResponse.json({ error: '认证已撤销，请重新登录' }, { status: 401 });
      }
      isAuthenticated = true;
      authenticatedUserId = verified.userId;
      console.log('[sync-user] 用户已认证:', { userId: authenticatedUserId });
    }

    const body = await request.json();
    // 注意：不再从 body 中解构 role，禁止客户端指定角色
    const { phone, email, username, password, name, avatar, company, address, clearEmail, clearPhone, supabaseUserId, currentPassword } = body;

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

    // 已认证用户直接按 session token 中的 userId 定位，
    // 防止 email/phone 被其他账号占用时误更新到他人账号
    // #20260827-0826-2 修复
    if (isAuthenticated && authenticatedUserId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authenticatedUserId)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 未认证场景：按 supabaseUserId / email / username / phone 查找
    if (!existingUser && supabaseUserId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (data) existingUser = data;
    }

    // 按 email 查找（仅在非清空场景）
    if (!existingUser && email) {
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

    // A caller-supplied identifier locates an account; it is not proof of ownership.
    // Enforce ownership before metadata/password writes or issuing a fresh session.
    if (isAuthenticated && (!existingUser || existingUser.id !== authenticatedUserId)) {
      return NextResponse.json({ error: '账号不存在或身份不匹配' }, { status: 401 });
    }
    if (existingUser) {
      if (existingUser.deleted_at || (existingUser.status && existingUser.status !== 'active')) {
        return NextResponse.json({ error: '账号不可用' }, { status: 403 });
      }
      if (!isAuthenticated) {
        if (typeof currentPassword !== 'string' || !currentPassword || !existingUser.password_hash
            || !await bcrypt.compare(currentPassword, existingUser.password_hash)) {
          return NextResponse.json({ error: '请先登录或验证当前密码' }, { status: 401 });
        }
      }
    }

    // 已认证用户更新 email/phone 前检查是否被其他账号占用
    // #20260827-0826-2 修复
    if (isAuthenticated && existingUser && existingUser.id === authenticatedUserId) {
      if (email && !clearEmail) {
        const { data: emailDup } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .neq('id', authenticatedUserId)
          .maybeSingle();
        if (emailDup) {
          return NextResponse.json(
            { error: '该邮箱已被其他账号使用' },
            { status: 409 }
          );
        }
      }
      if (phone && !clearPhone) {
        const { data: phoneDup } = await supabase
          .from('users')
          .select('id')
          .filter('metadata->>phone', 'eq', phone)
          .neq('id', authenticatedUserId)
          .maybeSingle();
        if (phoneDup) {
          return NextResponse.json(
            { error: '该手机号已被其他账号使用' },
            { status: 409 }
          );
        }
      }
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
          // 已登录用户修改自己的密码：session token 本身就是登录凭证，不需要 currentPassword 强校验
          // （用户可能通过会话恢复/手机验证码/本地兜底登录，其"旧密码"与服务端 hash 未必一致，
          //   强校验会导致已登录用户永远无法改密——见 HEALTH_BASELINE 问题4修复记录）
          canUpdatePassword = true;
          // 软校验：若提供了 currentPassword 且匹配则通过；不匹配仅记录日志，不阻止修改
          if (currentPassword && existingUser.password_hash) {
            try {
              const isCurrentValid = await bcrypt.compare(currentPassword, existingUser.password_hash);
              if (!isCurrentValid) {
                console.warn('[sync-user] 已认证用户提供的当前密码与数据库不匹配（软校验，不阻止修改）:', {
                  userId: existingUser.id,
                });
              }
            } catch (bcryptErr) {
              console.warn('[sync-user] currentPassword bcrypt 校验异常（忽略，不阻止）:', bcryptErr);
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
    if (avatar) newMeta.avatar = avatar;
    if (company) newMeta.company = company;
    if (address) newMeta.address = address;

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
      // 姓名同步到 full_name 列（users 表使用 full_name 而非 name）
      if (name && existingUser.full_name !== name) {
        updateData.full_name = name;
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
          { error: '同步失败', detail: safeErrorMessage(error, '同步失败') },
          { status: 500 }
        );
      }

      syncUser = updatedUser;
    } else {
      // 修改密码场景（携带 currentPassword）找不到已有用户：禁止创建新用户，
      // 否则会把新密码写到新账号上，原账号密码不变（旧密码仍可登录）
      if (currentPassword) {
        console.warn('[sync-user] 修改密码但用户不存在，拒绝创建新用户:', {
          hasSupabaseUserId: !!supabaseUserId,
          username: username || null,
          email: email || null,
        });
        return NextResponse.json({ error: '用户不存在或已被删除，无法修改密码' }, { status: 404 });
      }

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
          { error: '同步失败', detail: safeErrorMessage(error, '同步失败') },
          { status: 500 }
        );
      }

      syncUser = newUser;
    }

    // 签发 session token（嵌入会话版本号，支持「全部设备登出」）
    const sessionToken = await signSessionTokenForUser(
      syncUser.id,
      syncUser.email || '',
      syncUser.role || 'free',
      7 * 24 * 3600
    );

    return NextResponse.json({
      success: true,
      sessionToken,
      user: {
        id: syncUser.id,
        email: syncUser.email,
        username: syncUser.username,
        role: syncUser.role,
        phone: syncUser.metadata?.phone || '',
        name: syncUser.metadata?.name || syncUser.full_name || '',
        avatar: syncUser.metadata?.avatar || syncUser.avatar_url || '',
        company: syncUser.metadata?.company || '',
        address: syncUser.metadata?.address || '',
      },
      synced: true,
    });
  } catch (error) {
    if (error instanceof SessionStateUnavailableError) {
      return NextResponse.json({ error: '服务暂不可用，请稍后重试' }, { status: 503 });
    }
    console.error('[sync-user] 未预期的同步错误:', {
      error: error instanceof Error ? safeErrorMessage(error) : String(error),
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { error: '服务器错误', detail: error instanceof Error ? safeErrorMessage(error) : String(error) },
      { status: 500 }
    );
  }
}
