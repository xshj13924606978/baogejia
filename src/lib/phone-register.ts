/**
 * 手机号注册 / 自动建号公共逻辑（#20260820-1600 起）
 * 供 /api/auth/register 与 /api/auth/login-with-sms 复用：
 * - 临时用户名自动生成（user_ + 手机号后4位，冲突追加 _2/_3...），也可指定用户名
 * - 未提供邮箱时使用 {phone}@phone.local 占位（不修改 DB 约束）
 * - 未提供密码时生成随机 bcrypt 哈希占位（不可用于密码登录，引导用户补全）
 * - 注册积分奖励 + 邀请关系处理
 */
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getSiteConfigValues } from '@/lib/site-config';
import { createPointsNotification } from '@/lib/notification-service';

// 默认注册积分奖励（与 site_config.register_points 默认值 100 保持一致）
const DEFAULT_REGISTER_POINTS = 100;
// 默认邀请好友奖励积分（与 site_config.invite_reward_points 默认值 50 保持一致）
const DEFAULT_INVITE_REWARD_POINTS = 50;

export interface RegisterByPhoneOptions {
  username?: string;
  password?: string;
  email?: string;
  company?: string;
  contact?: string;
}

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

async function getInviteRewardPoints(): Promise<number> {
  try {
    const configs = await getSiteConfigValues(['invite_reward_points']);
    const value = configs['invite_reward_points'];
    if (value === null || value === undefined || value === '') return DEFAULT_INVITE_REWARD_POINTS;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? DEFAULT_INVITE_REWARD_POINTS : parsed;
  } catch {
    return DEFAULT_INVITE_REWARD_POINTS;
  }
}

/**
 * 生成唯一用户名：
 * - 有 preferred 且格式合法时使用，否则回退临时名 user_<手机号后4位>
 * - 与现有用户冲突时自动追加 _2/_3...
 */
export async function generateUniqueUsername(
  db: any,
  phone: string,
  preferred?: string
): Promise<string> {
  const preferredTrimmed = preferred?.trim() || '';
  const base =
    preferredTrimmed && /^[\w\u4e00-\u9fa5]{2,30}$/.test(preferredTrimmed)
      ? preferredTrimmed
      : `user_${phone.slice(-4)}`;

  let candidate = base;
  let suffix = 2;
  for (;;) {
    const { data } = await db.from('users').select('id').eq('username', candidate).limit(1);
    if (!data?.length) return candidate;
    if (suffix > 50) {
      // 极端冲突回退：附加随机后缀
      return `${base}_${randomBytes(3).toString('hex')}`;
    }
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

/**
 * 通过手机号创建用户（注册或未注册手机号自动建号）
 * - phone 已通过短信验证码校验
 * - 密码未提供时生成随机哈希占位（占位密码无法用于密码登录）
 * - 注册积分奖励失败不影响注册成功
 */
export async function registerUserByPhone(
  phone: string,
  options: RegisterByPhoneOptions = {}
): Promise<{ user: any | null; error?: string }> {
  const db = getSupabaseServiceClient();
  const normalizedPhone = phone.trim();

  const username = await generateUniqueUsername(db, normalizedPhone, options.username);
  const email = options.email?.trim() || `${normalizedPhone}@phone.local`;
  const passwordHash = options.password
    ? await bcrypt.hash(options.password, 10)
    : await bcrypt.hash(randomBytes(16).toString('hex'), 10); // 占位密码：不可用于密码登录

  const insertData: Record<string, unknown> = {
    username,
    password_hash: passwordHash,
    email,
    role: 'free', // 注册固定为免费用户，不允许客户端指定
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // users 表无 phone/company/contact 顶层列，统一存入 metadata
  const metadata: Record<string, string> = {
    phone: normalizedPhone,
    phone_verified: 'true', // 注册必须通过手机号短信验证
  };
  if (options.company) metadata.company = options.company;
  if (options.contact) metadata.contact = options.contact;
  insertData.metadata = metadata;

  const { data: user, error: createError } = await db
    .from('users')
    .insert(insertData)
    .select()
    .single();

  if (createError || !user) {
    console.error('[Auth] 手机号建号失败:', createError);
    return { user: null, error: '注册失败' };
  }

  // 注册成功后奖励积分（原子 RPC：users 更新 + 双表流水 + user_levels 等级联动）
  try {
    const pointsRule = await getRegisterPoints();
    if (pointsRule > 0) {
      const { error: rpcError } = await db.rpc('add_points_atomic', {
        p_user_id: user.id,
        p_points: pointsRule,
        p_type: 'register',
        p_description: '注册账号奖励',
        p_reference_id: `register:${user.id}`,
      });
      if (rpcError) {
        console.error('[Auth] 注册积分奖励失败:', rpcError);
      } else {
        await createPointsNotification({
          userId: user.id,
          points: pointsRule,
          type: 'register',
          description: '注册账号奖励',
        });
      }
    } else {
      // 无奖励配置时仍保证等级记录存在（等级链路完整性）
      const { error: lvlErr } = await db.from('user_levels').upsert(
        {
          user_id: user.id,
          level: 1,
          current_points: 0,
          next_level_points: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (lvlErr) console.error('[Auth] 创建用户等级失败:', lvlErr);
    }
  } catch (pointsError) {
    console.error('[Auth] 注册积分奖励失败:', pointsError);
  }

  return { user };
}

/**
 * 处理邀请关系：新用户注册成功后，若携带邀请码则绑定邀请人并发放邀请奖励
 * （从 register route 迁移，#20260820-1600 起供 register / login-with-sms 复用）
 */
export async function handleInviteReward(
  db: any,
  inviteeId: string,
  inviteCode: string
): Promise<void> {
  // 1. 在 invites 表按邀请码查找邀请人
  const { data: invite } = await db
    .from('invites')
    .select('*')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (!invite) {
    // 兼容历史：老邀请码在 invite_codes 表
    const { data: legacyCode } = await db
      .from('invite_codes')
      .select('*')
      .eq('code', inviteCode)
      .eq('is_active', true)
      .maybeSingle();

    if (!legacyCode) {
      console.warn('[Auth] 邀请码无效，跳过邀请奖励:', inviteCode);
      return;
    }

    // 防重复：同一被邀请人只能建立一次关系
    const { data: existingLegacy } = await db
      .from('invite_relations')
      .select('id')
      .eq('invitee_id', inviteeId)
      .maybeSingle();

    if (existingLegacy) return;

    const legacyPoints = await getInviteRewardPoints();
    await db.from('invite_relations').insert({
      inviter_id: legacyCode.user_id,
      invitee_id: inviteeId,
      level: 1,
      points_awarded: legacyPoints,
      channel_type: 'link',
    });

    // 邀请人获得积分（reference_id 幂等，防重复发放）
    const { error: legacyRpcError } = await db.rpc('add_points_atomic', {
      p_user_id: legacyCode.user_id,
      p_points: legacyPoints,
      p_type: 'invite_friend',
      p_description: '邀请好友注册奖励',
      p_reference_id: `invite_friend:${inviteCode}:${inviteeId}`,
    });
    if (legacyRpcError) {
      console.error('[Auth] 邀请人积分发放失败:', legacyRpcError);
    } else {
      await createPointsNotification({
        userId: legacyCode.user_id,
        points: legacyPoints,
        type: 'invite_friend',
        description: '您邀请的好友已注册，邀请奖励',
        referenceId: `invite_friend:${inviteCode}:${inviteeId}`,
      });
    }

    // 更新邀请码注册次数
    await db
      .from('invite_codes')
      .update({ register_count: (legacyCode.register_count || 0) + 1 })
      .eq('id', legacyCode.id);
    return;
  }

  // 防重复：同一被邀请人只能建立一次邀请关系
  const { data: existingRelation } = await db
    .from('invite_relations')
    .select('id')
    .eq('invitee_id', inviteeId)
    .maybeSingle();

  if (existingRelation) {
    console.warn('[Auth] 已建立过邀请关系，跳过邀请奖励:', inviteeId);
    return;
  }

  const rewardPoints = await getInviteRewardPoints();

  // 创建一级邀请关系
  await db.from('invite_relations').insert({
    inviter_id: invite.user_id,
    invitee_id: inviteeId,
    level: 1,
    points_awarded: rewardPoints,
    channel_type: 'link',
  });

  // 邀请人获得积分（reference_id 幂等，防重复发放）
  const { error: rpcError } = await db.rpc('add_points_atomic', {
    p_user_id: invite.user_id,
    p_points: rewardPoints,
    p_type: 'invite_friend',
    p_description: '邀请好友注册奖励',
    p_reference_id: `invite_friend:${inviteCode}:${inviteeId}`,
  });
  if (rpcError) {
    console.error('[Auth] 邀请人积分发放失败:', rpcError);
  } else {
    await createPointsNotification({
      userId: invite.user_id,
      points: rewardPoints,
      type: 'invite_friend',
      description: '您邀请的好友已注册，邀请奖励',
      referenceId: `invite_friend:${inviteCode}:${inviteeId}`,
    });
  }

  // 更新邀请记录状态与已发放积分
  await db
    .from('invites')
    .update({
      status: 'registered',
      points_awarded: rewardPoints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id);
}
