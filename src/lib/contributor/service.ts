/**
 * 资料贡献者服务层
 * 负责贡献者账号注册、资料提交、积分奖励等核心逻辑
 * 创建时间: 2026-08-12
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';
import {
  CONTRIBUTOR_REGISTER_POINTS,
  CONTRIBUTOR_POINTS_RULES,
  ContributorType,
  UploadStatus,
} from './types';

// 邀请奖励积分规则
const INVITE_REGISTER_POINTS = 20; // 被邀请人注册 +20
const INVITE_SUBMIT_POINTS = 30; // 被邀请人提交资料 +30
const INVITE_REVIEW_POINTS = 50; // 被邀请人资料审核通过 +50（发放给邀请人）

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
    // 插入积分流水
    const { error: recordError } = await db.from('point_records').insert({
      user_id: userId,
      points,
      type,
      description,
    });

    if (recordError) {
      console.error('[Contributor] 记录积分失败:', recordError.message);
    }

    // 更新用户积分
    const { data: userPoints } = await db
      .from('users')
      .select('points, total_points')
      .eq('id', userId)
      .single();

    const newPoints = Math.max(0, (userPoints?.points || 0) + points);
    const newTotalPoints = (userPoints?.total_points || 0) + Math.max(0, points);

    await db.from('users').update({ points: newPoints, total_points: newTotalPoints }).eq('id', userId);
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

    // 首次注册奖励积分
    await awardPointsToUser(user.id, CONTRIBUTOR_REGISTER_POINTS, 'register', '注册成为贡献者奖励');
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
      const inviter = await getContributorByInviteCode(inviteCode);
      if (inviter && inviter.user_id !== user.id) {
        // 被邀请人注册奖励 +20
        await awardPointsToUser(user.id, INVITE_REGISTER_POINTS, 'invite_register', '被邀请注册奖励');
        // 创建邀请记录
        await db.from('contributor_invites').insert({
          inviter_id: inviter.user_id,
          invitee_id: user.id,
          invite_code: inviteCode,
          status: 'registered',
          register_rewarded: true,
        });
        // 记录被邀请人信息
        await db.from('contributors').update({ invited_by: inviter.user_id }).eq('id', contributor.id);
      }
    } catch (e) {
      console.error('[Contributor] 处理邀请关系失败:', e);
    }
  }

  return { success: true, user, contributor, isNew };
}

/**
 * 提交资料上传
 */
export async function submitUpload(input: {
  identifier: string;
  name?: string;
  type: ContributorType;
  data: Record<string, unknown>;
  files: string[];
  inviteCode?: string;
}): Promise<{ success: boolean; upload?: any; contributor?: any; error?: string }> {
  // 先注册/获取贡献者
  const regResult = await registerContributor({
    identifier: input.identifier,
    name: input.name,
    inviteCode: input.inviteCode,
  });

  if (!regResult.success) {
    return { success: false, error: regResult.error };
  }

  const db = getSupabaseServiceClient();

  const { data: upload, error } = await db
    .from('contributor_uploads')
    .insert({
      contributor_id: regResult.contributor.id,
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
  if (regResult.user?.id) {
    try {
      const { data: inviteRecord } = await db
        .from('contributor_invites')
        .select('id, submit_rewarded')
        .eq('invitee_id', regResult.user.id)
        .maybeSingle();

      if (inviteRecord && !inviteRecord.submit_rewarded) {
        await awardPointsToUser(regResult.user.id, INVITE_SUBMIT_POINTS, 'invite_submit', '被邀请人提交资料奖励');
        await db
          .from('contributor_invites')
          .update({ submit_rewarded: true, status: 'submitted', updated_at: new Date().toISOString() })
          .eq('id', inviteRecord.id);
      }
    } catch (e) {
      console.error('[Contributor] 发放被邀请人提交奖励失败:', e);
    }
  }

  return { success: true, upload, contributor: regResult.contributor };
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
    const rule = CONTRIBUTOR_POINTS_RULES[upload.type as ContributorType];
    pointsAwarded = rule ? rule.points : 0;
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
        const rule = CONTRIBUTOR_POINTS_RULES[upload.type as ContributorType];
        await awardPointsToUser(
          userId,
          pointsAwarded,
          'task_reward',
          `资料贡献奖励：${rule ? rule.reason : '资料上传'}`
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
          await awardPointsToUser(inviteRecord.inviter_id, INVITE_REVIEW_POINTS, 'invite_review', '邀请贡献者奖励：被邀请人资料审核通过');
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
