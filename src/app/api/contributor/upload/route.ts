export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { CONTRIBUTOR_TYPES, ContributorType } from '@/lib/contributor/types';
import { getCurrentUser } from '@/lib/auth-utils';
import { findUserByIdentifier, submitUpload } from '@/lib/contributor/service';
import { establishUserSession } from '@/lib/auth-session';

// 注：不再导出弃用的 config.api.bodyParser。文件大小限制由
// /api/contributor/upload-file（MAX_FILE_SIZE=500MB，#20260823-1900 由 50MB 调大）独立校验，
// 此处仅接收 JSON（files 为文件路径引用数组），body 很小。
/**
 * 公开接口：提交资料（无需登录）
 * 已登录用户：复用现有账号直接提交审核，不触发注册流程
 * 未登录用户：自动注册贡献者账号，返回账号信息与初始积分
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, name, type, data, files, inviteCode, password } = body;

    // 校验必填项
    if (!identifier) {
      return NextResponse.json({ error: '请填写手机号或邮箱' }, { status: 400 });
    }
    if (!type || !CONTRIBUTOR_TYPES.some((t) => t.id === type)) {
      return NextResponse.json({ error: '请选择有效的资料类型' }, { status: 400 });
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: '表单数据不能为空' }, { status: 400 });
    }

    // 识别登录用户（公开路径下可能无 header，但 httpOnly cookie 可直接恢复认证）
    let currentUser: { id: string; email?: string; username?: string; role?: string } | null = null;
    try {
      currentUser = await getCurrentUser(request);
    } catch (error) {
      // 数据库连接故障时按未登录处理，不阻断公开上传
      console.error('[Contributor] 登录态识别失败，按未登录处理:', error instanceof Error ? error.message : error);
    }

    // #[20260829-1500]-1：未登录时实时判断联系方式是否已注册——
    // 已注册用户复用账号直接提交（自动带账号联系方式，无需再次设置密码/验证码）；
    // 未注册用户必须完成账号三要素绑定（手机号/邮箱+密码+验证码）。
    let existingByIdentifier: unknown = null;
    if (!currentUser) {
      // 未登录：简单校验手机号或邮箱格式
      const isEmail = identifier.includes('@');
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (isEmail && !emailRegex.test(identifier)) {
        return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
      }
      if (!isEmail && !phoneRegex.test(identifier)) {
        return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
      }

      existingByIdentifier = await findUserByIdentifier(identifier);

      // 未注册用户才要求设置密码（已注册用户走「自动带账号联系方式」流程）
      if (!existingByIdentifier) {
        // #20260828-1230：未登录首次提交必须同时完成"手机号/邮箱+密码+验证码"账号绑定。
        // 验证码校验已在调用本接口前完成（/api/auth/verify-sms-code），此处只校验密码非空。
        // 密码强度由 registerContributor 内部按 password_min_length 校验。
        if (!password || typeof password !== 'string' || password.length === 0) {
          return NextResponse.json(
            { error: '请设置账号密码（提交资料即注册账号，密码用于后续登录）' },
            { status: 400 }
          );
        }
      }
    }

    // 已登录用户：直接提交审核（复用账号，不触发注册）；未登录：自动注册 + 提交
    const uploadResult = await submitUpload({
      identifier,
      name,
      type: type as ContributorType,
      data,
      files: Array.isArray(files) ? files : [],
      inviteCode,
      userId: currentUser?.id,
      // #20260828-1230：仅未登录分支使用密码；已登录用户忽略
      password: currentUser ? undefined : password,
    });

    if (!uploadResult.success) {
      return NextResponse.json({ error: uploadResult.error || '提交资料失败' }, { status: 500 });
    }

    // #20260828-2156：未登录首次提交流程中，registerContributor 已在 users 表创建账号。
    // 此前签发登录 cookie 的环节缺失，导致用户看到「提交成功」但仍停留在登录页，无法真正进入系统。
    // 现在为该新账号签发 HMAC session token + httpOnly cookie，让用户「提交即登录」，与
    // /api/auth/register、/api/auth/oauth-link 保持一致。
    let autoLoginUser = null;
    // #[20260829-1500]-1：仅「真正新建的账号」自动登录（未登录 + 联系方式未注册时 registerContributor
    // 新建用户）。未登录但联系方式已注册时复用旧账号提交，不签发会话——避免未经验证冒用他人账号登录。
    if (!currentUser && uploadResult.user && !existingByIdentifier) {
      autoLoginUser = uploadResult.user;
    }

    const responseBody: Record<string, unknown> = {
      success: true,
      message: '资料提交成功，待审核',
      contributor: {
        identifier: uploadResult.contributor?.phone || uploadResult.contributor?.email || identifier,
        name: uploadResult.contributor?.name,
        isNew: currentUser ? false : (uploadResult.isNew ?? false),
      },
      upload: uploadResult.upload,
      // 新增字段：是否为新用户；若为 true，前端应刷新页面让 UserContext 重新读取 cookie
      autoLogin: Boolean(autoLoginUser),
      // #[20260829-1500]-1：用户是否「新建账号」——未登录且联系方式未注册时 registerContributor 新建用户；
      // 未登录但联系方式已注册时复用旧账号（不触发注册、不发注册积分），前端据此区分「注册成功」与
      // 「已注册账号提交成功」两种成功页文案（contributor.isNew 是贡献者记录新建，语义不同）。
      isNewUser: currentUser ? false : !existingByIdentifier,
    };

    let response = NextResponse.json(responseBody);

    if (autoLoginUser) {
      try {
        // 调用统一会话签发入口（与 register/oauth-link 共用），拿到带 cookie 的响应，复制 cookie。
        const sessionResp = await establishUserSession(
          request,
          autoLoginUser,
          'register-and-contributor'
        );
        const sessionCookies = sessionResp.cookies.getAll();
        for (const c of sessionCookies) {
          response.cookies.set(c);
        }
      } catch (sessionError) {
        // 会话签发失败不应阻塞资料提交流程；记录错误、降级返回，依赖旧流程的回退登录
        console.error(
          '[Contributor] 未登录首次提交后签发会话失败:',
          sessionError instanceof Error ? sessionError.message : sessionError
        );
        response = NextResponse.json(
          {
            ...responseBody,
            autoLogin: false,
            warning: '账号已注册但自动登录失败，请使用手机号+密码登录',
          },
          { status: 200 }
        );
      }
    }

    return response;
  } catch (error) {
    console.error('[Contributor] 提交资料异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
