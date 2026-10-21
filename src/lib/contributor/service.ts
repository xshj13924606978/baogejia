/**
 * 资料贡献者服务层
 * 负责贡献者账号注册、资料提交、积分奖励等核心逻辑
 * 创建时间: 2026-08-12
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { SENSITIVE_PRODUCT_FIELDS } from '@/lib/product-visibility';
import bcrypt from 'bcrypt';
import type { NextRequest } from 'next/server';
import {
  getContributorDuplicateConfig,
  findDuplicateEntry,
} from '@/lib/contributor/duplicate-configs';
import {
  CONTRIBUTOR_TYPE_LABELS,
  ContributorType,
  UploadStatus,
} from './types';
import {
  getContributorUploadPoints,
  getContributorRegisterPoints,
  getInviteRegisterPoints,
  getInviteSubmitPoints,
  getInviteReviewPoints,
  getUniversalInviteExpiryDays,
} from './points-config';
import { isEmailVerified } from '@/lib/email-verification';

/**
 * 构建邀请链接的基础 URL（如 http://localhost:5000）
 * 优先使用请求 Host header，避免 dev 模式（next dev -H 0.0.0.0）下
 * request.nextUrl.origin 返回非法地址 http://0.0.0.0:PORT 导致链接无法访问
 */
export function getInviteBaseUrl(request: NextRequest): string {
  // x-forwarded-proto 可能为 "http" / "https"；nextUrl.protocol 可能不带冒号，统一规范化
  let proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol || 'http';
  if (!proto.endsWith(':')) proto += ':';
  let host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host ||
    '';
  // 修复 0.0.0.0 监听地址生成的非法链接
  if (host.startsWith('0.0.0.0')) {
    host = 'localhost' + host.slice('0.0.0.0'.length);
  }
  return `${proto}//${host}`;
}

// 邀请奖励积分规则（#[20260827-1030]-8）
//   原硬编码常量已删除，全部从 points_rules 表动态读取：
//     - getInviteRegisterPoints()     → rule_key=invite_register
//     - getInviteSubmitPoints()       → rule_key=invite_submit
//     - getInviteReviewPoints()       → rule_key=invite_review
//     - getUniversalInviteExpiryDays()→ rule_key=contributor_universal_invite_expiry
//   DB 不可达时各函数返回 fallback 默认值（见 ./points-config.ts），保证零停机降级。

// 简单手机号校验
function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 生成邀请码（8 位，去除易混淆字符 0/O/1/I）
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * 根据邀请码查询邀请人（贡献者）
 */
export async function getContributorByInviteCode(inviteCode: string): Promise<any | null> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('contributors')
    .select('id, user_id, name')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (error) {
    console.error('[Contributor] 查询邀请码失败:', error.message);
    return null;
  }
  return data || null;
}

/**
 * 获取贡献者邀请码（不存在则生成）
 */
export async function getOrCreateInviteCode(contributorId: string): Promise<string> {
  const db = getSupabaseServiceClient();
  const { data } = await db
    .from('contributors')
    .select('invite_code')
    .eq('id', contributorId)
    .maybeSingle();

  if (data?.invite_code) {
    return data.invite_code;
  }

  const inviteCode = generateInviteCode();
  await db.from('contributors').update({ invite_code: inviteCode }).eq('id', contributorId);
  return inviteCode;
}

// ============ 通用邀请码（裂变邀请：无需登录生成，人人可转发） ============

// 通用邀请码有效期（天数，从 points_rules 动态读取，fallback=30）
//   由 points-config.ts 的 getUniversalInviteExpiryDays() 提供。

/**
 * 生成通用邀请码（无需登录，人人可转发）
 * 已登录用户生成时绑定为创建者（作为邀请人），未登录则保持未绑定状态
 */
export async function generateUniversalInviteCode(
  creatorId?: string,
  source?: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  const db = getSupabaseServiceClient();
  try {
    const code = generateInviteCode();
    const expiryDays = await getUniversalInviteExpiryDays();
    const { error } = await db.from('universal_invite_codes').insert({
      code,
      creator_id: creatorId || null,
      status: 'active',
      source: source || null,
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) {
      console.error('[Contributor] 生成通用邀请码失败:', error.message);
      return { success: false, error: '生成邀请码失败' };
    }
    return { success: true, code };
  } catch (e) {
    console.error('[Contributor] 生成通用邀请码异常:', e);
    return { success: false, error: '生成邀请码失败' };
  }
}

/**
 * 查询通用邀请码信息（公开）
 * 返回邀请码是否有效及邀请人姓名（用于页面展示）
 */
export async function getUniversalInviteInfo(
  code: string
): Promise<{ valid: boolean; used?: boolean; inviterName?: string | null }> {
  const db = getSupabaseServiceClient();
  try {
    const { data, error } = await db
      .from('universal_invite_codes')
      .select('id, creator_id, status, expires_at')
      .eq('code', code)
      .maybeSingle();

    if (error || !data) {
      return { valid: false };
    }

    // 已使用或已过期
    if (data.status !== 'active') {
      return { valid: false, used: data.status === 'used' };
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, used: true };
    }

    // 有创建者则查询邀请人姓名
    let inviterName: string | null = null;
    if (data.creator_id) {
      const { data: creator } = await db
        .from('contributors')
        .select('name')
        .eq('user_id', data.creator_id)
        .maybeSingle();
      inviterName = creator?.name || null;
    }

    return { valid: true, inviterName };
  } catch (e) {
    console.error('[Contributor] 查询通用邀请码异常:', e);
    return { valid: false };
  }
}

/**
 * 记录通用邀请码访问（点击 +1，首次访问记录渠道来源）
 */
export async function trackUniversalInviteClick(code: string, source?: string): Promise<void> {
  const db = getSupabaseServiceClient();
  try {
    const { data } = await db
      .from('universal_invite_codes')
      .select('click_count, source')
      .eq('code', code)
      .maybeSingle();
    if (!data) return;

    const updateData: Record<string, unknown> = { click_count: (data.click_count || 0) + 1 };
    if (source && !data.source) {
      updateData.source = source;
    }
    await db.from('universal_invite_codes').update(updateData).eq('code', code);
  } catch (e) {
    console.error('[Contributor] 记录通用邀请码访问失败:', e);
  }
}

/**
 * 绑定通用邀请码（首个注册用户使用后标记为已使用）
 * 返回创建者（邀请人）的 user_id；无效/已使用/无创建者时返回 null
 */
export async function bindUniversalInviteCode(code: string, userId: string): Promise<string | null> {
  const db = getSupabaseServiceClient();
  try {
    const { data, error } = await db
      .from('universal_invite_codes')
      .select('id, creator_id, status, expires_at')
      .eq('code', code)
      .maybeSingle();

    if (error || !data || data.status !== 'active') {
      return null;
    }

    // 已过期：标记为 expired 并放弃绑定
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await db.from('universal_invite_codes').update({ status: 'expired' }).eq('id', data.id);
      return null;
    }

    // 标记为已使用（无论是否有创建者，避免被反复使用）
    await db
      .from('universal_invite_codes')
      .update({
        status: 'used',
        used_by: userId,
        used_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    return data.creator_id || null;
  } catch (e) {
    console.error('[Contributor] 绑定通用邀请码失败:', e);
    return null;
  }
}

// 简单邮箱校验
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 根据手机号或邮箱查询贡献者
 */
export async function findContributor(identifier: string): Promise<any | null> {
  const db = getSupabaseServiceClient();
  const isEmail = identifier.includes('@');

  let query = db.from('contributors').select('*');
  if (isEmail) {
    query = query.eq('email', identifier);
  } else {
    query = query.eq('phone', identifier);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('[Contributor] 查询贡献者失败:', error.message);
    return null;
  }
  return data || null;
}

/**
 * 查找已存在的用户（用于自动注册时避免重复）
 */
export async function findUserByIdentifier(identifier: string): Promise<any | null> {
  const db = getSupabaseServiceClient();
  const isEmail = identifier.includes('@');

  // 优先按 email/username 精确匹配，其次按 metadata->>phone 匹配
  let { data, error } = await db
    .from('users')
    .select('id, username, email, role, status, metadata')
    .eq(isEmail ? 'email' : 'username', identifier)
    .maybeSingle();

  if (!data && !isEmail && !error) {
    ({ data, error } = await db
      .from('users')
      .select('id, username, email, role, status, metadata')
      .filter('metadata->>phone', 'eq', identifier)
      .maybeSingle());
  }

  if (error) {
    console.error('[Contributor] 查询用户失败:', error.message);
    return null;
  }
  return data || null;
}

/**
 * 通过服务端客户端原子发放积分（与注册接口相同的实现方式）
 * 避免依赖匿名客户端的 RLS 权限
 */
async function awardPointsToUser(
  userId: string,
  points: number,
  type: string,
  description: string
): Promise<void> {
  const db = getSupabaseServiceClient();
  try {
    const record = {
      user_id: userId,
      points,
      type,
      description,
      created_at: new Date().toISOString(),
    };

    // 同时写入 point_records 与 point_logs，确保两套流水表都有记录
    const [recordsResult, logsResult] = await Promise.all([
      db.from('point_records').insert(record),
      db.from('point_logs').insert(record),
    ]);

    if (recordsResult.error) {
      console.error('[Contributor] 记录 point_records 失败:', recordsResult.error.message);
    }
    if (logsResult.error) {
      console.error('[Contributor] 记录 point_logs 失败:', logsResult.error.message);
    }

    // 更新用户积分（同步 points/total_points 列与 metadata）
    const { data: userPoints } = await db
      .from('users')
      .select('points, total_points, metadata')
      .eq('id', userId)
      .single();

    const metadata = userPoints?.metadata || {};
    const currentPoints = Math.max(userPoints?.points || 0, metadata.points || 0);
    const currentTotalPoints = Math.max(userPoints?.total_points || 0, metadata.total_points || 0);

    const newPoints = Math.max(0, currentPoints + points);
    const newTotalPoints = currentTotalPoints + Math.max(0, points);

    await db
      .from('users')
      .update({
        points: newPoints,
        total_points: newTotalPoints,
        metadata: {
          ...metadata,
          points: newPoints,
          total_points: newTotalPoints,
          last_points_update: new Date().toISOString(),
        },
      })
      .eq('id', userId);
  } catch (e) {
    console.error('[Contributor] 发放积分失败:', e);
  }
}

/**
 * 自动注册贡献者账号
 * 手机号或邮箱作为登录名，默认角色 contributor
 * 首次注册奖励 100 积分
 */
export async function registerContributor(input: {
  identifier: string;
  name?: string;
  password?: string;
  inviteCode?: string;
}): Promise<{ success: boolean; user?: any; contributor?: any; isNew?: boolean; error?: string }> {
  const { identifier, name, password, inviteCode } = input;
  const isEmail = identifier.includes('@');

  // 校验格式
  if (isEmail && !isValidEmail(identifier)) {
    return { success: false, error: '邮箱格式不正确' };
  }
  if (!isEmail && !isValidPhone(identifier)) {
    return { success: false, error: '手机号格式不正确' };
  }

  // #20260828-1345：邮箱场景必须先验证邮箱真实性（防止虚假邮箱注册）
  // 前端 submit 流程已先调用 /api/auth/verify-email-code 通过；
  // 这里做后端冗余校验，即使前端被绕过也能拦得住
  if (isEmail) {
    const emailVerified = await isEmailVerified(identifier);
    if (!emailVerified) {
      return {
        success: false,
        error: '邮箱尚未验证，请先完成邮箱验证码校验后再提交资料',
      };
    }
  }

  const db = getSupabaseServiceClient();

  // 1. 检查是否已有用户
  const existingUser = await findUserByIdentifier(identifier);
  let user = existingUser;

  // 2. 不存在则创建用户
  if (!user) {
    // 生成默认密码（若未提供则使用随机密码，用户可后续通过手机/邮箱找回）
    const passwordHash = await bcrypt.hash(password || `contrib_${Math.random().toString(36).slice(2, 10)}`, 10);

    // 手机号存储在 metadata 中（users 表无独立 phone 列）
    const metadata: Record<string, unknown> = {
      role: 'contributor',
      points: 0,
      total_points: 0,
    };
    if (!isEmail) metadata.phone = identifier;
    if (name) metadata.name = name;

    // users 表 email 列为 NOT NULL，手机号注册时使用占位邮箱
    const email = isEmail ? identifier : `contrib_${Date.now()}@contributor.local`;

    const insertData: Record<string, unknown> = {
      username: identifier,
      email,
      password_hash: passwordHash,
      role: 'contributor',
      status: 'active',
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: createdUser, error: createError } = await db
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (createError || !createdUser) {
      console.error('[Contributor] 创建用户失败:', createError?.message);
      return { success: false, error: '创建账号失败' };
    }
    user = createdUser;

    // 首次注册奖励积分（积分值由 points_rules 动态读取，fallback=100）
    const registerRewardPoints = await getContributorRegisterPoints();
    await awardPointsToUser(user.id, registerRewardPoints, 'register', '注册成为贡献者奖励');
  }

  // 3. 创建或更新贡献者记录
  let contributor = await findContributor(identifier);
  const isNew = !contributor;

  if (!contributor) {
    const contributorData: Record<string, unknown> = {
      user_id: user.id,
      name: name || user.metadata?.name || null,
      invite_code: generateInviteCode(),
    };
    if (isEmail) contributorData.email = identifier;
    else contributorData.phone = identifier;

    const { data: createdContributor, error: contributorError } = await db
      .from('contributors')
      .insert(contributorData)
      .select()
      .single();

    if (contributorError) {
      console.error('[Contributor] 创建贡献者记录失败:', contributorError.message);
      return { success: false, error: '创建贡献者记录失败' };
    }
    contributor = createdContributor;
  } else {
    // 更新活跃时间
    await db.from('contributors').update({ last_active_at: new Date().toISOString() }).eq('id', contributor.id);
  }

  // 4. 邀请关系处理：新注册用户且提供有效邀请码
  if (isNew && inviteCode && inviteCode !== contributor.invite_code) {
    try {
      // 优先匹配贡献者个人邀请码
      const inviter = await getContributorByInviteCode(inviteCode);
      let inviterUserId: string | null = inviter?.user_id || null;

      // 未匹配到个人邀请码时，尝试绑定通用邀请码（首次使用绑定创建者为邀请人）
      if (!inviter) {
        inviterUserId = await bindUniversalInviteCode(inviteCode, user.id);
      }

      if (inviterUserId && inviterUserId !== user.id) {
        // 被邀请人注册奖励（积分值由 points_rules 动态读取，fallback=20）
        const registerPoints = await getInviteRegisterPoints();
        await awardPointsToUser(user.id, registerPoints, 'invite_register', '被邀请注册奖励');
        // 创建邀请记录
        await db.from('contributor_invites').insert({
          inviter_id: inviterUserId,
          invitee_id: user.id,
          invite_code: inviteCode,
          status: 'registered',
          register_rewarded: true,
        });
        // 记录被邀请人信息
        await db.from('contributors').update({ invited_by: inviterUserId }).eq('id', contributor.id);
      }
    } catch (e) {
      console.error('[Contributor] 处理邀请关系失败:', e);
    }
  }

  return { success: true, user, contributor, isNew };
}

/**
 * 提交资料上传
 *
 * 两种场景：
 * 1. 已登录用户（传入 userId）：复用现有账号/贡献者记录，不触发注册流程
 * 2. 未登录用户：自动注册贡献者账号后再提交
 */
export async function submitUpload(input: {
  identifier: string;
  name?: string;
  type: ContributorType;
  data: Record<string, unknown>;
  files: string[];
  inviteCode?: string;
  userId?: string; // 已登录用户直接复用账号，跳过注册
  /** #20260828-1230：未登录首次提交时绑定账号的密码（前端已完成验证码校验）。
   *  已登录用户忽略；未登录用户必须 ≥ password_min_length（与 register 接口一致）。 */
  password?: string;
}): Promise<{
  success: boolean;
  upload?: any;
  contributor?: any;
  isNew?: boolean;
  /** #20260828-2156：未登录首次提交时，registerContributor 创建的 user 记录回传，供外部签发会话 */
  user?: any;
  error?: string;
}> {
  const db = getSupabaseServiceClient();

  let contributor: any;
  let userId: string | undefined;
  let isNew = false;

  if (input.userId) {
    // 已登录用户：不触发注册流程，按 user_id 查找或创建贡献者记录
    userId = input.userId;
    const { data: existingContributor } = await db
      .from('contributors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingContributor) {
      contributor = existingContributor;
      // 更新活跃时间
      await db.from('contributors').update({ last_active_at: new Date().toISOString() }).eq('id', contributor.id);
    } else {
      const isEmail = input.identifier.includes('@');
      const contributorData: Record<string, unknown> = {
        user_id: userId,
        name: input.name || null,
        invite_code: generateInviteCode(),
      };
      if (isEmail) contributorData.email = input.identifier;
      else contributorData.phone = input.identifier;

      const { data: createdContributor, error: contributorError } = await db
        .from('contributors')
        .insert(contributorData)
        .select()
        .single();

      if (contributorError) {
        console.error('[Contributor] 创建贡献者记录失败:', contributorError.message);
        return { success: false, error: '创建贡献者记录失败' };
      }
      contributor = createdContributor;
    }
  } else {
    // 未登录：自动注册
    const regResult = await registerContributor({
      identifier: input.identifier,
      name: input.name,
      inviteCode: input.inviteCode,
      // #20260828-1230：未登录首次提交资料时绑定密码，完成账号三要素（手机号/邮箱+密码+验证码）注册
      password: input.password,
    });

    if (!regResult.success) {
      return { success: false, error: regResult.error };
    }
    contributor = regResult.contributor;
    userId = regResult.user?.id;
    isNew = regResult.isNew ?? false;
  }

  const { data: upload, error } = await db
    .from('contributor_uploads')
    .insert({
      contributor_id: contributor.id,
      type: input.type,
      data: input.data,
      files: input.files,
      status: 'pending',
      points_awarded: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[Contributor] 提交资料失败:', error.message);
    return { success: false, error: '提交资料失败' };
  }

  // 被邀请人提交资料奖励 +30（仅首次提交时发放）
  if (userId) {
    try {
      const { data: inviteRecord } = await db
        .from('contributor_invites')
        .select('id, submit_rewarded')
        .eq('invitee_id', userId)
        .maybeSingle();

      if (inviteRecord && !inviteRecord.submit_rewarded) {
        const submitPoints = await getInviteSubmitPoints();
        await awardPointsToUser(userId, submitPoints, 'invite_submit', '被邀请人提交资料奖励');
        await db
          .from('contributor_invites')
          .update({ submit_rewarded: true, status: 'submitted', updated_at: new Date().toISOString() })
          .eq('id', inviteRecord.id);
      }
    } catch (e) {
      console.error('[Contributor] 发放被邀请人提交奖励失败:', e);
    }
  }

  // #20260828-2156：未登录首次提交流程中，registerContributor 内部已创建 user 记录；
  // 这里把 user 也透传出去，让路由层签发 session_token cookie 完成自动登录闭环。
  // 已登录分支不返回 user（userId 复用现状不需要再签发 cookie）。
  const result: {
    success: boolean;
    upload?: any;
    contributor?: any;
    isNew?: boolean;
    user?: any;
  } = { success: true, upload, contributor, isNew };
  if (!input.userId) {
    // 未登录分支；从数据库按 identifier 取出最新 user 记录（registerContributor 内部已建好）
    try {
      const { data: freshUser } = await db
        .from('users')
        .select('*')
        .eq('id', userId || '')
        .maybeSingle();
      if (freshUser) result.user = freshUser;
    } catch {
      /* 查询失败不影响主流程 */
    }
  }
  return result;
}

// 产品入库字段白名单（与 products 表 13 个标准字段 + 系统字段一致，见 009_unify_product_fields.sql）
const PRODUCT_DB_FIELDS = [
  'category', 'name', 'model', 'parameter_description', 'brand', 'unit',
  'supplier', 'contact_person', 'contact_phone', 'cost_price', 'min_price',
  'price', 'image_url', 'stock',
] as const;

/**
 * 将贡献者上传数据归一化为产品记录列表
 * - 价格表模式：data.products 为数组，逐条入库
 * - 单品模式：data 本身为单条
 */
function normalizeProductRows(data: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const productArray =
    Array.isArray(data.products) && data.products.length > 0
      ? (data.products as Record<string, unknown>[])
      : null;

  const sourceRows: Record<string, unknown>[] = productArray || [data];

  for (const row of sourceRows) {
    const product: Record<string, unknown> = {};
    for (const key of PRODUCT_DB_FIELDS) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        product[key] = value;
      }
    }
    // 仅当包含产品名称时才视为有效产品记录
    if (product.name) {
      rows.push(product);
    }
  }
  return rows;
}

/**
 * 根据扩展名推断 MIME 类型（仅用于 Storage 元数据不可用时兜底）
 */
function inferMimeType(fileName: string): string {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * 从 Supabase Storage 读取文件公开 URL 与元数据
 */
async function resolveStorageFileMeta(
  storagePath: string
): Promise<{ fileUrl: string; fileSize: number | null; fileType: string }> {
  const db = getSupabaseServiceClient();
  let fileUrl = '';
  let fileSize: number | null = null;
  let fileType = '';

  try {
    const { data: urlData } = db.storage.from('knowledge-base').getPublicUrl(storagePath);
    fileUrl = urlData?.publicUrl || '';
  } catch (e) {
    console.warn('[Contributor] 获取 Storage 公开 URL 失败:', e);
  }

  try {
    const normalized = String(storagePath).replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    const prefix = lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
    if (prefix && fileName) {
      const { data: listed, error: listErr } = await db.storage.from('knowledge-base').list(prefix, { limit: 100 });
      if (listErr) {
        console.warn('[Contributor] 列出 Storage 文件失败:', listErr.message);
      } else {
        const meta = listed?.find((f: any) => f.name === fileName);
        if (meta) {
          fileSize = meta.metadata?.size ?? null;
          fileType = meta.metadata?.mimetype ?? '';
        }
      }
    }
  } catch (e) {
    console.warn('[Contributor] 读取 Storage 文件元数据失败:', e);
  }

  if (!fileType) {
    fileType = inferMimeType(storagePath);
  }

  return { fileUrl, fileSize, fileType };
}

/**
 * 将文件名拆分为标题候选与扩展名类型
 */
function parseFileName(fileName: string): { baseName: string; ext: string; mimeType: string } {
  const safeName = String(fileName).replace(/\\/g, '/').split('/').pop() || fileName;
  const dot = safeName.lastIndexOf('.');
  const baseName = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot + 1).toLowerCase() : '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
  };
  return { baseName, ext, mimeType: map[ext] || 'application/octet-stream' };
}

/**
 * 按资料类型从表单数据中提取标题、描述及规范/定额编号
 */
function extractKnowledgeEntryInfo(
  upload: any,
  fileName: string
): { type: string; title: string; description: string } {
  const data = (upload.data || {}) as Record<string, unknown>;
  const { baseName } = parseFileName(fileName);
  const rawType = String(upload.type || '');

  let title = baseName;
  let description = '';

  switch (rawType) {
    case 'document':
      title = String(data.doc_title || baseName);
      description = String(data.description || data.keywords || '');
      break;
    case 'case':
      title = String(data.case_name || baseName);
      description = String(data.case_desc || '');
      break;
    case 'standard':
      // 标准规范库的真实标题字段为 standard_no（必填）/standard_name（如有）
      title = String(data.standard_name || data.standard_no || baseName);
      description = String(data.publisher || data.implement_date || '');
      break;
    case 'drawing':
      title = String(data.drawing_name || data.drawing_no || baseName);
      description = String(data.description || '');
      break;
    case 'quota':
      // 定额库的真实标题字段为 quota_no（必填）/quota_name（如有）
      title = String(data.quota_name || data.quota_no || baseName);
      description = String(data.description || '');
      break;
    default:
      title = baseName;
  }

  return { type: rawType, title: title.trim() || baseName, description: description.trim() };
}

/**
 * 审核通过后：将单条非产品类资料（技术文档/案例/标准规范/图纸/定额）写入 knowledge_entries 表
 * - 非产品批量资料仍保持 contributor_uploads 内数组落地（兼容现有逻辑）
 * - 单条上传时 data 为单个对象，files[0] 对应 Storage 路径
 */
async function insertApprovedKnowledgeEntry(
  upload: any,
  creatorId: string,
  reviewerId: string
): Promise<{ inserted: boolean; skipped: boolean; overwritten: boolean; error?: string }> {
  const db = getSupabaseServiceClient();
  const files = Array.isArray(upload.files) ? upload.files : [];
  const filePath = String(files[0] || '');
  if (!filePath) {
    return { inserted: false, skipped: true, overwritten: false, error: '无文件路径' };
  }

  const { baseName: safeFileName } = parseFileName(filePath);
  const isOverwrite = (upload.data?.duplicateAction as string | undefined) === 'overwrite';
  const { type: entryType, title, description } = extractKnowledgeEntryInfo(upload, filePath);

  // 保留原始文件名：优先取表单记录的真实文件名，否则从安全文件名中去除时间戳前缀还原
  const recordedOriginalFileName =
    (upload.data?.__originalFileNames as Record<string, string> | undefined)?.file ||
    (upload.data?.__originalFileNames as Record<string, string> | undefined)?.[''] ||
    '';
  const originalFileNameFromSafe = safeFileName.replace(/^\d{13,}-/, '');
  const originalFileName = recordedOriginalFileName || originalFileNameFromSafe;
  const displayFileName = originalFileName || safeFileName;

  if (!title) {
    return { inserted: false, skipped: true, overwritten: false, error: '无法提取标题' };
  }

  const { fileUrl, fileSize, fileType } = await resolveStorageFileMeta(filePath);

  // 判重：同一文件 key 或同一 type+title 已存在则跳过或覆盖
  let existingId: string | null = null;
  try {
    // 优先按 file_key 精确匹配
    const { data: byKey, error: keyErr } = await db
      .from('knowledge_entries')
      .select('id')
      .eq('file_key', filePath)
      .maybeSingle();
    if (keyErr) throw keyErr;

    if (byKey?.id) {
      existingId = byKey.id;
    } else {
      const { data: byTitle, error: titleErr } = await db
        .from('knowledge_entries')
        .select('id')
        .eq('type', entryType)
        .eq('title', title)
        .maybeSingle();
      if (titleErr) throw titleErr;
      if (byTitle?.id) existingId = byTitle.id;
    }
  } catch (e: any) {
    console.warn('[Contributor] 知识库判重查询失败:', e.message || e);
  }

  if (existingId) {
    if (isOverwrite) {
      const { error: updateError } = await db
        .from('knowledge_entries')
        .update({
          file_key: filePath,
          file_url: fileUrl,
          file_name: displayFileName,
          file_size: fileSize,
          file_type: fileType,
          description: description || '',
          metadata: {
            ...(upload.data || {}),
            upload_id: upload.id,
            reviewer_id: reviewerId,
            original_file_name: displayFileName,
          },
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId);
      if (updateError) {
        return { inserted: false, skipped: true, overwritten: false, error: updateError.message };
      }
      return { inserted: false, skipped: false, overwritten: true };
    }
    return { inserted: false, skipped: true, overwritten: false };
  }

  const { error } = await db.from('knowledge_entries').insert({
    user_id: creatorId,
    type: entryType,
    title,
    description: description || '',
    file_name: displayFileName,
    file_key: filePath,
    file_url: fileUrl,
    file_size: fileSize,
    file_type: fileType,
    metadata: {
      ...(upload.data || {}),
      upload_id: upload.id,
      reviewer_id: reviewerId,
      original_file_name: displayFileName,
    },
    status: 'approved',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  });

  if (error) {
    return { inserted: false, skipped: true, overwritten: false, error: error.message };
  }
  return { inserted: true, skipped: false, overwritten: false };
}

async function insertApprovedProducts(
  upload: any,
  creatorId: string,
  requesterName?: string
): Promise<{ inserted: number; skipped: number; overwritten: number }> {
  const db = getSupabaseServiceClient();
  const rows = normalizeProductRows(upload.data || {});
  const data = upload.data || {};
  const isOverwrite = data.duplicateAction === 'overwrite';
  const overwriteReason =
    typeof data.duplicateReason === 'string' && data.duplicateReason.trim()
      ? data.duplicateReason.trim()
      : '贡献上传覆盖更新';
  let inserted = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const row of rows) {
    const dbProduct: Record<string, unknown> = { ...row, creator_id: creatorId };
    // 数值字段标准化
    for (const key of ['cost_price', 'min_price', 'price', 'stock'] as const) {
      if (dbProduct[key] !== undefined) {
        const n = Number(dbProduct[key]);
        dbProduct[key] = Number.isFinite(n) ? n : 0;
      }
    }
    // 轻量查重：相同 name + model 已存在则跳过或进入覆盖审批
    const { data: existing } = await db
      .from('products')
      .select('*')
      .eq('name', dbProduct.name)
      .eq('model', dbProduct.model || '')
      .maybeSingle();
    if (existing) {
      if (isOverwrite) {
        // 覆盖模式：删除空值/0 敏感字段，防止 merge 时用 0 覆盖原值
        const newData: Record<string, unknown> = { ...dbProduct };
        for (const key of SENSITIVE_PRODUCT_FIELDS) {
          const v = newData[key];
          if (v === '' || v === null || v === undefined || v === 0) delete newData[key];
        }
        const { success } = await submitProductUpdateRequest({
          productId: existing.id,
          originalData: existing as Record<string, unknown>,
          newData,
          reason: overwriteReason,
          requestType: 'import',
          requesterId: creatorId,
          requesterName,
          sourceId: upload.id,
        });
        if (success) overwritten++;
        else skipped++;
      } else {
        skipped++;
      }
      continue;
    }
    const { error } = await db.from('products').insert(dbProduct);
    if (error) {
      console.error('[Contributor] 产品入库失败:', error.message);
      skipped++;
    } else {
      inserted++;
    }
  }
  return { inserted, skipped, overwritten };
}

/**
 * 审核资料
 * 通过：资料入库 + 积分到账
 * 拒绝：仅更新状态并记录意见
 */
export async function reviewUpload(input: {
  uploadId: string;
  reviewerId: string;
  status: UploadStatus;
  comment?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { uploadId, reviewerId, status, comment } = input;
  const db = getSupabaseServiceClient();

  // 获取上传记录
  const { data: upload, error: fetchError } = await db
    .from('contributor_uploads')
    .select('*')
    .eq('id', uploadId)
    .single();

  if (fetchError || !upload) {
    return { success: false, error: '资料不存在' };
  }

  if (upload.status !== 'pending') {
    return { success: false, error: '该资料已审核，请勿重复操作' };
  }

  let pointsAwarded = 0;
  if (status === 'approved') {
    // 积分值由 points_rules 动态读取，fallback 见 points-config.ts
    pointsAwarded = await getContributorUploadPoints(upload.type as ContributorType);
  }

  // 更新上传记录
  const { error: updateError } = await db
    .from('contributor_uploads')
    .update({
      status,
      reviewer_id: reviewerId,
      review_comment: comment || null,
      reviewed_at: new Date().toISOString(),
      points_awarded: pointsAwarded,
    })
    .eq('id', uploadId);

  if (updateError) {
    console.error('[Contributor] 审核更新失败:', updateError.message);
    return { success: false, error: '审核操作失败' };
  }

  // 审核通过时发放积分
  if (status === 'approved' && pointsAwarded > 0 && upload.contributor_id) {
    try {
      // 获取贡献者对应的用户
      const { data: contributor } = await db
        .from('contributors')
        .select('user_id, id')
        .eq('id', upload.contributor_id)
        .single();

      const userId = contributor?.user_id;
      if (userId) {
        const reasonLabel =
          CONTRIBUTOR_TYPE_LABELS[upload.type as ContributorType] || '资料上传';
        await awardPointsToUser(
          userId,
          pointsAwarded,
          'task_reward',
          `资料贡献奖励：${reasonLabel}`
        );
      }

      // 记录到 upload_points_log
      await db.from('upload_points_log').insert({
        contributor_id: upload.contributor_id,
        upload_id: uploadId,
        points: pointsAwarded,
        reason: `资料审核通过奖励 ${pointsAwarded} 积分`,
      });
    } catch (e) {
      console.error('[Contributor] 发放积分失败:', e);
    }
  }

  // 审核通过 → 产品类资料写入价格库 products 表（贡献者可在价格库看到自己产品）
  if (status === 'approved' && upload.type === 'product' && upload.contributor_id) {
    try {
      const { data: contributor } = await db
        .from('contributors')
        .select('user_id, id, name')
        .eq('id', upload.contributor_id)
        .single();

      const userId = contributor?.user_id;
      if (userId) {
        const result = await insertApprovedProducts(upload, userId, contributor?.name);
        console.log(
          `[Contributor] 产品资料入库完成: upload=${uploadId} 入库=${result.inserted} 跳过=${result.skipped} 覆盖申请=${result.overwritten}`
        );
      } else {
        console.warn('[Contributor] 贡献者无关联用户，产品未入库:', uploadId);
      }
    } catch (e) {
      console.error('[Contributor] 产品入库失败:', e);
    }
  }

  // 审核通过 → 单条非产品类资料（技术文档库/案例库/标准规范库/图纸图片库/定额库）写入 knowledge_entries
  if (
    status === 'approved' &&
    upload.type !== 'product' &&
    !Array.isArray((upload.data as Record<string, unknown> | null)?.items) &&
    Array.isArray(upload.files) &&
    upload.files.length > 0 &&
    upload.contributor_id
  ) {
    try {
      const { data: contributor } = await db
        .from('contributors')
        .select('user_id, id, name')
        .eq('id', upload.contributor_id)
        .single();

      const userId = contributor?.user_id;
      if (userId) {
        const result = await insertApprovedKnowledgeEntry(upload, userId, reviewerId);
        if (result.error) {
          console.error(
            `[Contributor] 非产品单条资料入库异常: upload=${uploadId} type=${upload.type} error=${result.error}`
          );
        } else {
          console.log(
            `[Contributor] 非产品单条资料入库完成: upload=${uploadId} type=${upload.type} 入库=${result.inserted} 跳过=${result.skipped} 覆盖=${result.overwritten}`
          );
        }
      } else {
        console.warn('[Contributor] 贡献者无关联用户，非产品资料未入库:', uploadId);
      }
    } catch (e) {
      console.error('[Contributor] 非产品单条资料入库失败:', e);
    }
  }

  // 审核通过 → 非产品类批量资料（技术文档库/案例库/标准规范库/图纸图片库/定额库）落地：
  // 判重规则来自 contributor_duplicate_configs，与已通过（approved）同类资料比较。
  // - duplicateAction=overwrite：覆盖已通过记录的对应条目
  // - 否则（skip/未指定）：从本次记录中移除重复条目，避免重复采纳
  if (
    status === 'approved' &&
    upload.type !== 'product' &&
    Array.isArray((upload.data as Record<string, unknown> | null)?.items)
  ) {
    try {
      const config = await getContributorDuplicateConfig(upload.type as string);
      if (config) {
        const uploadData = (upload.data as Record<string, unknown>) || {};
        const items = (uploadData.items as Record<string, unknown>[]) || [];
        const { data: approvedList } = await db
          .from('contributor_uploads')
          .select('id, data')
          .eq('type', upload.type)
          .eq('status', 'approved');

        const action = uploadData.duplicateAction === 'overwrite' ? 'overwrite' : 'skip';
        const kept: unknown[] = [];
        let overwrittenCount = 0;

        for (const item of items) {
          const match = findDuplicateEntry(approvedList || [], item, config.duplicateFields);
          if (match) {
            if (action === 'overwrite') {
              const target = (approvedList || []).find((u) => u.id === match.uploadId);
              if (target) {
                const targetData = (target.data ?? {}) as Record<string, unknown>;
                if (Array.isArray(targetData.items)) {
                  const nextItems = [...targetData.items];
                  nextItems[match.index] = item;
                  await db
                    .from('contributor_uploads')
                    .update({ data: { ...targetData, items: nextItems } })
                    .eq('id', target.id);
                } else {
                  await db.from('contributor_uploads').update({ data: item }).eq('id', target.id);
                }
                overwrittenCount++;
              }
            }
            // 覆盖或跳过：该条目不保留在本次记录中，避免与已通过资料重复
            continue;
          }
          kept.push(item);
        }

        if (kept.length !== items.length || overwrittenCount > 0) {
          await db
            .from('contributor_uploads')
            .update({
              data: { ...uploadData, items: kept, duplicateOverwrittenCount: overwrittenCount },
            })
            .eq('id', uploadId);
        }

        console.log(
          `[Contributor] 非产品批量资料落地完成: upload=${uploadId} type=${upload.type} 保留=${kept.length} 覆盖更新=${overwrittenCount}`
        );
      }
    } catch (e) {
      console.error('[Contributor] 非产品批量资料落地失败:', e);
    }
  }

  // 审核通过 → 被邀请人资料通过审核，邀请人获得邀请奖励 +50（不依赖资料类型积分）
  if (status === 'approved' && upload.contributor_id) {
    try {
      const { data: contributor } = await db
        .from('contributors')
        .select('user_id, id')
        .eq('id', upload.contributor_id)
        .single();

      const userId = contributor?.user_id;
      if (userId) {
        const { data: inviteRecord } = await db
          .from('contributor_invites')
          .select('id, inviter_id, review_rewarded')
          .eq('invitee_id', userId)
          .maybeSingle();

        if (inviteRecord && !inviteRecord.review_rewarded) {
          // 邀请人奖励：被邀请人资料审核通过（积分值由 points_rules 动态读取，fallback=50）
          const reviewPoints = await getInviteReviewPoints();
          await awardPointsToUser(inviteRecord.inviter_id, reviewPoints, 'invite_review', '邀请贡献者奖励：被邀请人资料审核通过');
          await db
            .from('contributor_invites')
            .update({ review_rewarded: true, status: 'approved', updated_at: new Date().toISOString() })
            .eq('id', inviteRecord.id);
        }
      }
    } catch (e) {
      console.error('[Contributor] 发放邀请奖励失败:', e);
    }
  }

  return { success: true };
}

/**
 * 获取贡献者列表（管理端）
 */
export async function listContributors() {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('contributors')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Contributor] 获取贡献者列表失败:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 获取上传资料列表（管理端）
 */
export async function listPendingUploads(status?: UploadStatus) {
  const db = getSupabaseServiceClient();
  let query = db
    .from('contributor_uploads')
    .select('*, contributors(name, email, phone)')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[Contributor] 获取上传资料列表失败:', error.message);
    return [];
  }
  return data || [];
}

// ============ 待审核计数（#20260820-1130-2） ============

/** 待审核资料数量（管理端） */
export async function countPendingUploads(): Promise<number> {
  const db = getSupabaseServiceClient();
  const { count, error } = await db
    .from('contributor_uploads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) {
    console.error('[Contributor] 统计待审核资料失败:', error.message);
    return 0;
  }
  return count || 0;
}

/** 待审批产品修改请求数量（管理端） */
export async function countPendingProductRequests(): Promise<number> {
  const db = getSupabaseServiceClient();
  const { count, error } = await db
    .from('product_update_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) {
    console.error('[Contributor] 统计待审批产品修改请求失败:', error.message);
    return 0;
  }
  return count || 0;
}

// ============ 产品修改审批请求（#20260820-1130-2） ============

export type ProductUpdateRequestType = 'edit' | 'import';
export type ProductUpdateRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * 提交产品修改/导入覆盖审批请求
 * 非管理员编辑自有产品、批量导入覆盖已有产品时，不直接写库，
 * 而是创建 pending 请求，由管理员审核通过后才生效。
 * original_data 必须传服务端完整快照（含敏感字段），用于审核对比与通过时保留。
 */
export async function submitProductUpdateRequest(input: {
  productId: string;
  originalData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  reason?: string;
  requestType?: ProductUpdateRequestType;
  requesterId: string;
  requesterName?: string;
  sourceId?: string;
}): Promise<{ success: boolean; request?: any; error?: string }> {
  const db = getSupabaseServiceClient();
  try {
    const { data, error } = await db
      .from('product_update_requests')
      .insert({
        product_id: input.productId,
        original_data: input.originalData,
        new_data: input.newData,
        reason: input.reason || '',
        request_type: input.requestType || 'edit',
        status: 'pending',
        requester_id: input.requesterId,
        requester_name: input.requesterName || null,
        source_id: input.sourceId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Contributor] 提交产品修改请求失败:', error.message);
      return { success: false, error: '提交修改申请失败' };
    }
    return { success: true, request: data };
  } catch (e) {
    console.error('[Contributor] 提交产品修改请求异常:', e);
    return { success: false, error: '提交修改申请失败' };
  }
}

/**
 * 获取产品修改请求列表（管理端）
 * 附加产品基本信息（名称/型号/分类/图片）便于审核展示
 * 自 #20260821-1837 起按 source_id 汇总：同一批次（如同一次导入覆盖）合并为一条记录
 */
export async function listProductUpdateRequests(status?: ProductUpdateRequestStatus) {
  const db = getSupabaseServiceClient();
  let query = db.from('product_update_requests').select('*').order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error('[Contributor] 获取产品修改请求失败:', error.message);
    return [];
  }

  // 关联产品信息（product_update_requests 无 FK 约束，手动批量关联）
  const productIds = [...new Set(data.map((r) => r.product_id))];
  const { data: products } = await db
    .from('products')
    .select('id, name, model, image_url, category, price')
    .in('id', productIds);
  const productMap = new Map((products || []).map((p) => [p.id, p]));

  const withProduct = data.map((r) => ({ ...r, product: productMap.get(r.product_id) || null }));

  // 按 source_id 分组汇总（source_id 为空则按 id 自身作为独立组）
  const groups = new Map<string, any>();
  for (const r of withProduct) {
    const groupKey = r.source_id || r.id;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: r.id,
        source_id: r.source_id,
        request_type: r.request_type,
        status: r.status,
        reason: r.reason,
        requester_id: r.requester_id,
        requester_name: r.requester_name,
        reviewer_id: r.reviewer_id,
        review_comment: r.review_comment,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        product_count: 0,
        products: [],
        items: [],
      });
    }
    const g = groups.get(groupKey);
    g.product_count += 1;
    g.products.push(r.product);
    g.items.push(r);
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * 合并产品新旧数据（审批通过/管理员直接覆盖共用）：
 * - 空字符串/null/undefined 不覆盖（非管理员提交的敏感字段缺失时保留原值）
 * - 保护系统字段（id/created_at/updated_at），归属保持原创建者
 * - 数值字段标准化
 */
export function mergeProductData(
  original: Record<string, unknown> | null,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const originalObj = original || {};
  const finalData: Record<string, unknown> = { ...originalObj };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== '' && v !== null && v !== undefined) finalData[k] = v;
  }
  delete finalData.id;
  delete finalData.created_at;
  delete finalData.updated_at;
  // search_vector 为数据库生成列，不允许直接写入，必须删除
  delete finalData.search_vector;
  if (originalObj.creator_id) finalData.creator_id = originalObj.creator_id;
  finalData.updated_at = new Date().toISOString();
  for (const key of ['cost_price', 'min_price', 'price', 'stock'] as const) {
    if (finalData[key] !== undefined) {
      const n = Number(finalData[key]);
      finalData[key] = Number.isFinite(n) ? n : 0;
    }
  }
  return finalData;
}

/**
 * 审批产品修改请求
 * 通过：合并 original_data + new_data 写入 products（保留敏感字段与归属），标记 approved
 * 拒绝：仅更新状态与意见，原数据保持不变
 */
export async function reviewProductUpdateRequest(input: {
  requestId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
}): Promise<{ success: boolean; error?: string; productId?: string }> {
  const db = getSupabaseServiceClient();

  const { data: request, error: fetchError } = await db
    .from('product_update_requests')
    .select('*')
    .eq('id', input.requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: '请求不存在' };
  }
  if (request.status !== 'pending') {
    return { success: false, error: '该请求已审核，请勿重复操作' };
  }

  if (input.decision === 'approved') {
    const finalData = mergeProductData(
      (request.original_data || {}) as Record<string, unknown>,
      (request.new_data || {}) as Record<string, unknown>
    );

    const { error: updateError } = await db.from('products').update(finalData).eq('id', request.product_id);
    if (updateError) {
      console.error('[Contributor] 审批通过时更新产品失败:', updateError.message);
      return { success: false, error: `产品更新失败: ${updateError.message}` };
    }
  }

  const { error: reviewError } = await db
    .from('product_update_requests')
    .update({
      status: input.decision,
      reviewer_id: input.reviewerId,
      review_comment: input.comment || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.requestId);

  if (reviewError) {
    console.error('[Contributor] 更新审批状态失败:', reviewError.message);
    return { success: false, error: '审核操作失败' };
  }
  return { success: true, productId: request.product_id };
}

/**
 * 按 source_id 批量审批产品修改请求
 * 通过：对组内每条请求合并 original_data + new_data 写入 products，再逐条标记 approved
 * 拒绝：逐条标记 rejected
 * 失败时前面已成功处理的请求保持 approved/rejected，避免回滚导致不一致
 */
export async function reviewProductUpdateRequestsBySource(input: {
  sourceId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
}): Promise<{ success: boolean; error?: string; count?: number }> {
  const db = getSupabaseServiceClient();

  const { data: requests, error: fetchError } = await db
    .from('product_update_requests')
    .select('*')
    .eq('source_id', input.sourceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (fetchError || !requests || requests.length === 0) {
    return { success: false, error: '没有待审批的请求批次' };
  }

  for (const request of requests) {
    if (input.decision === 'approved') {
      const finalData = mergeProductData(
        (request.original_data || {}) as Record<string, unknown>,
        (request.new_data || {}) as Record<string, unknown>
      );
      const { error: updateError } = await db.from('products').update(finalData).eq('id', request.product_id);
      if (updateError) {
        console.error('[Contributor] 批量审批通过时更新产品失败:', updateError.message);
        return { success: false, error: `产品 ${request.product_id} 更新失败: ${updateError.message}`, count: 0 };
      }
    }

    const { error: reviewError } = await db
      .from('product_update_requests')
      .update({
        status: input.decision,
        reviewer_id: input.reviewerId,
        review_comment: input.comment || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    if (reviewError) {
      console.error('[Contributor] 批量更新审批状态失败:', reviewError.message);
      return { success: false, error: '审核操作失败' };
    }
  }

  return { success: true, count: requests.length };
}
