/**
 * 团队协作服务层（数据库持久化版本）
 *
 * #[20260902-0900] 重构说明
 *
 * 修复前：全部数据存于进程内存 Map（源码注释即写明"演示用"），带来三个致命问题
 *   1. 不持久 —— 进程重启 / PM2 重启后数据全部丢失
 *   2. 不隔离 —— 所有用户共享同一身份，团队与共享报价互相可见
 *   3. 无权限 —— 身份取自可伪造的 x-user-id 请求头
 *
 * 修复后：
 *   1. 持久化 —— 全部读写 Supabase（迁移 126_team_tables.sql）
 *   2. 强隔离 —— 每个方法都先校验「当前用户是否为该团队成员」，非成员一律不可见
 *   3. 真身份 —— userId 由 API 层 requireAuth 从服务端 session 解析后传入，
 *                本层不再接受任何来自请求头的身份信息
 *   4. 角色分级 —— owner（团队创建者，teams.owner_id）> admin > member > guest
 *
 * 注意：本层不做 HTTP 鉴权（那是 API 层 requireAuth 的职责），
 *       但所有涉及团队数据的操作都必须通过本层的成员关系校验。
 */

import { randomBytes } from 'node:crypto';

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
// TeamRole 是枚举（运行时值），不能用 import type 引入
import { TeamRole } from '@/types/team';
import type {
  Team,
  TeamMember,
  TeamInvite,
  Comment,
  SharedQuote,
  TeamActivity,
  TeamStats,
  TeamPermissions,
  CreateTeamRequest,
  UpdateTeamRequest,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  CreateCommentRequest,
  UpdateCommentRequest,
  ShareQuoteRequest,
} from '@/types/team';

// ---------------------------------------------------------------------------
// 角色权限映射
// ---------------------------------------------------------------------------

/**
 * owner = 团队创建者（teams.owner_id），拥有全部权限，且不可被移除/降权
 * admin = 管理员：可管理成员、邀请成员、管理设置
 * member= 成员：可创建/编辑报价、评论、导出
 * guest = 访客（只读）：仅可查看与导出
 */
const ROLE_PERMISSIONS: Record<TeamRole, TeamPermissions> = {
  [TeamRole.ADMIN]: {
    canCreateQuotes: true,
    canEditQuotes: true,
    canDeleteQuotes: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageSettings: true,
    canComment: true,
    canExport: true,
  },
  [TeamRole.MEMBER]: {
    canCreateQuotes: true,
    canEditQuotes: true,
    canDeleteQuotes: false,
    canInviteMembers: false,
    canManageMembers: false,
    canManageSettings: false,
    canComment: true,
    canExport: true,
  },
  [TeamRole.GUEST]: {
    canCreateQuotes: false,
    canEditQuotes: false,
    canDeleteQuotes: false,
    canInviteMembers: false,
    canManageMembers: false,
    canManageSettings: false,
    canComment: false,
    canExport: false,
  },
};

/** owner（团队创建者）权限：全部放开 */
const OWNER_PERMISSIONS: TeamPermissions = {
  canCreateQuotes: true,
  canEditQuotes: true,
  canDeleteQuotes: true,
  canInviteMembers: true,
  canManageMembers: true,
  canManageSettings: true,
  canComment: true,
  canExport: true,
};

const DEFAULT_TEAM_SETTINGS = {
  allowGuestInvite: false,
  quoteVisibility: 'team' as const,
  requireApproval: true,
  maxMembers: 50,
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 邀请 7 天过期

// ---------------------------------------------------------------------------
// 行 → 领域对象 映射
// ---------------------------------------------------------------------------

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  avatar: string | null;
  settings: any;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

/** 成员展示名：优先真实姓名，其次用户名，最后邮箱 */
function displayNameOf(user?: Partial<UserRow> | null): string {
  if (!user) return '未知用户';
  return user.full_name || user.username || user.email || '未知用户';
}

function mapTeam(row: TeamRow, memberCount: number): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    ownerId: row.owner_id,
    avatar: row.avatar ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    memberCount,
    settings: { ...DEFAULT_TEAM_SETTINGS, ...(row.settings || {}) },
  };
}

function mapMember(
  row: {
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    joined_at: string;
    last_active_at: string | null;
  },
  user?: Partial<UserRow> | null
): TeamMember {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role as TeamRole,
    nickname: displayNameOf(user),
    email: user?.email ?? undefined,
    avatar: user?.avatar_url ?? undefined,
    joinedAt: new Date(row.joined_at),
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at) : undefined,
  };
}

function mapInvite(row: {
  id: string;
  team_id: string;
  invited_by: string;
  invitee_email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}): TeamInvite {
  return {
    id: row.id,
    teamId: row.team_id,
    invitedBy: row.invited_by,
    inviteeEmail: row.invitee_email,
    role: row.role as TeamRole,
    status: row.status as TeamInvite['status'],
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    // 邀请令牌：用于接受邀请，仅团队管理员视角可见
    token: row.token,
  };
}

function mapComment(
  row: {
    id: string;
    team_id: string;
    target_id: string;
    target_type: string;
    user_id: string;
    content: string;
    parent_id: string | null;
    created_at: string;
    updated_at: string;
  },
  user?: Partial<UserRow> | null
): Comment {
  return {
    id: row.id,
    targetId: row.target_id,
    targetType: row.target_type as Comment['targetType'],
    userId: row.user_id,
    userName: displayNameOf(user),
    userAvatar: user?.avatar_url ?? undefined,
    content: row.content,
    parentId: row.parent_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    likes: 0,
  };
}

function mapSharedQuote(row: {
  id: string;
  quote_id: string;
  team_id: string;
  shared_by: string;
  shared_at: string;
  permissions: any;
}): SharedQuote {
  return {
    id: row.id,
    quoteId: row.quote_id,
    teamId: row.team_id,
    sharedBy: row.shared_by,
    sharedAt: new Date(row.shared_at),
    permissions: {
      canEdit: !!row.permissions?.canEdit,
      canComment: !!row.permissions?.canComment,
      canExport: !!row.permissions?.canExport,
    },
  };
}

// ---------------------------------------------------------------------------
// 服务实现
// ---------------------------------------------------------------------------

export class TeamService {
  // ===================== 内部：成员关系与权限校验 =====================

  /**
   * 校验用户是否为团队成员。
   * 这是全服务的数据隔离总闸门——任何返回团队数据的方法都必须先过这一关。
   */
  private static async requireMembership(
    teamId: string,
    userId: string
  ): Promise<{ teamId: string; userId: string; role: TeamRole } | null> {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return { teamId, userId, role: data.role as TeamRole };
  }

  /** 校验用户是否为团队成员且具备指定角色之一（owner 自动放行） */
  private static async requireRole(
    teamId: string,
    userId: string,
    allowed: TeamRole[]
  ): Promise<boolean> {
    const team = await this.getTeamRow(teamId);
    if (!team) return false;
    // owner 永远放行
    if (team.owner_id === userId) return true;

    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return false;
    return allowed.includes(membership.role);
  }

  private static async getTeamRow(teamId: string): Promise<TeamRow | null> {
    const db = getSupabaseServiceClient();
    const { data, error } = await db.from('teams').select('*').eq('id', teamId).maybeSingle();
    if (error || !data) return null;
    return data as TeamRow;
  }

  private static async countMembers(teamId: string): Promise<number> {
    const db = getSupabaseServiceClient();
    const { count, error } = await db
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);
    return error ? 0 : count || 0;
  }

  /** 批量补全成员的用户资料（email/姓名/头像） */
  private static async loadUsers(userIds: string[]): Promise<Map<string, UserRow>> {
    const map = new Map<string, UserRow>();
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (ids.length === 0) return map;

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('users')
      .select('id, email, username, full_name, avatar_url')
      .in('id', ids);

    if (!error && data) {
      for (const row of data as UserRow[]) map.set(row.id, row);
    }
    return map;
  }

  // ===================== 团队 =====================

  /** 创建团队，创建者自动成为 admin 成员（即 owner） */
  static async createTeam(ownerId: string, data: CreateTeamRequest): Promise<Team> {
    const db = getSupabaseServiceClient();

    const { data: teamRow, error: teamError } = await db
      .from('teams')
      .insert({
        name: data.name.trim(),
        description: data.description ?? null,
        owner_id: ownerId,
        avatar: data.avatar ?? null,
        settings: { ...DEFAULT_TEAM_SETTINGS, ...(data.settings || {}) },
      })
      .select('*')
      .single();

    if (teamError || !teamRow) {
      throw new Error(teamError?.message || '创建团队失败');
    }

    // 创建者以 admin 角色入成员表（owner 身份由 teams.owner_id 体现）
    const { error: memberError } = await db.from('team_members').insert({
      team_id: (teamRow as TeamRow).id,
      user_id: ownerId,
      role: TeamRole.ADMIN,
    });

    if (memberError) {
      // 成员写入失败则回滚团队，避免出现无成员的孤儿团队
      await db.from('teams').delete().eq('id', (teamRow as TeamRow).id);
      throw new Error(memberError.message || '初始化团队成员失败');
    }

    await this.recordActivity((teamRow as TeamRow).id, ownerId, '创建了团队', (teamRow as TeamRow).id, 'team');

    return mapTeam(teamRow as TeamRow, 1);
  }

  /** 获取「我」加入的团队（数据隔离：只返回本人为成员的团队） */
  static async getUserTeams(userId: string): Promise<Team[]> {
    const db = getSupabaseServiceClient();

    const { data: memberRows, error: memberError } = await db
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId);

    if (memberError || !memberRows || memberRows.length === 0) return [];

    const teamIds = memberRows.map((m: any) => m.team_id as string);

    const { data: teamRows, error: teamError } = await db
      .from('teams')
      .select('*')
      .in('id', teamIds)
      .order('created_at', { ascending: false });

    if (teamError || !teamRows) return [];

    // 逐团队统计成员数（团队数量级很小，可接受）
    const result: Team[] = [];
    for (const row of teamRows as TeamRow[]) {
      result.push(mapTeam(row, await this.countMembers(row.id)));
    }
    return result;
  }

  /** 获取团队详情（非成员返回 null） */
  static async getTeam(teamId: string, userId: string): Promise<Team | null> {
    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return null;

    const row = await this.getTeamRow(teamId);
    if (!row) return null;

    return mapTeam(row, await this.countMembers(teamId));
  }

  /** 更新团队信息（仅 owner 与 admin） */
  static async updateTeam(
    teamId: string,
    userId: string,
    data: UpdateTeamRequest
  ): Promise<Team | null> {
    const allowed = await this.requireRole(teamId, userId, [TeamRole.ADMIN]);
    if (!allowed) return null;

    const db = getSupabaseServiceClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.avatar !== undefined) patch.avatar = data.avatar ?? null;
    if (data.settings !== undefined) {
      const current = await this.getTeamRow(teamId);
      patch.settings = { ...DEFAULT_TEAM_SETTINGS, ...(current?.settings || {}), ...data.settings };
    }

    const { data: updated, error } = await db
      .from('teams')
      .update(patch)
      .eq('id', teamId)
      .select('*')
      .maybeSingle();

    if (error || !updated) return null;

    if (data.name !== undefined || data.description !== undefined) {
      await this.recordActivity(teamId, userId, '更新了团队信息', teamId, 'team');
    }

    return mapTeam(updated as TeamRow, await this.countMembers(teamId));
  }

  /** 删除团队（仅 owner） */
  static async deleteTeam(teamId: string, userId: string): Promise<boolean> {
    const team = await this.getTeamRow(teamId);
    if (!team || team.owner_id !== userId) return false;

    const db = getSupabaseServiceClient();
    // 成员/邀请/评论/共享/活动均通过外键 ON DELETE CASCADE 一并清理
    const { error } = await db.from('teams').delete().eq('id', teamId);
    return !error;
  }

  // ===================== 成员 =====================

  /** 获取成员列表（非成员返回空） */
  static async getTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return [];

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });

    if (error || !data) return [];

    const users = await this.loadUsers(data.map((m: any) => m.user_id as string));
    return (data as any[]).map((row) => mapMember(row, users.get(row.user_id)));
  }

  /** 邀请成员（仅 owner/admin） */
  static async inviteMembers(
    teamId: string,
    userId: string,
    data: InviteMemberRequest
  ): Promise<TeamInvite[]> {
    const allowed = await this.requireRole(teamId, userId, [TeamRole.ADMIN]);
    if (!allowed) throw new Error('无权限邀请成员');

    const team = await this.getTeamRow(teamId);
    if (!team) throw new Error('团队不存在');

    const db = getSupabaseServiceClient();
    const now = Date.now();
    const emails = Array.from(
      new Set((data.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))
    );
    if (emails.length === 0) return [];

    // 已是成员的直接跳过（成员以 email 关联 users 表判定）
    const { data: usersByEmail } = await db
      .from('users')
      .select('id, email')
      .in('email', emails);
    const emailToUserId = new Map<string, string>(
      ((usersByEmail || []) as any[]).map((u) => [String(u.email).toLowerCase(), u.id as string])
    );

    const { data: existingMembers } = await db
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId);
    const memberIds = new Set(((existingMembers || []) as any[]).map((m) => m.user_id as string));

    const pending: Array<Record<string, unknown>> = [];
    for (const email of emails) {
      const uid = emailToUserId.get(email);
      if (uid && memberIds.has(uid)) continue; // 已是成员

      pending.push({
        team_id: teamId,
        invited_by: userId,
        invitee_email: email,
        role: data.role || TeamRole.MEMBER,
        status: 'pending',
        token: randomBytes(32).toString('hex'),
        expires_at: new Date(now + INVITE_TTL_MS).toISOString(),
      });
    }

    if (pending.length === 0) return [];

    // 同一团队 + 同一邮箱的 pending 邀请有唯一索引，冲突即忽略
    const { data: inserted, error } = await db
      .from('team_invites')
      .upsert(pending, { onConflict: 'team_id,invitee_email', ignoreDuplicates: true })
      .select('*');

    if (error) throw new Error(error.message || '邀请失败');

    const invites = ((inserted || []) as any[]).map((row) => mapInvite(row));
    if (invites.length > 0) {
      await this.recordActivity(teamId, userId, `邀请了 ${invites.length} 位成员`, teamId, 'team');
    }
    return invites;
  }

  /** 获取团队待处理邀请（仅 owner/admin 可见） */
  static async getTeamInvites(teamId: string, userId: string): Promise<TeamInvite[]> {
    const allowed = await this.requireRole(teamId, userId, [TeamRole.ADMIN]);
    if (!allowed) return [];

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('team_invites')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as any[]).map((row) => mapInvite(row));
  }

  /**
   * 接受邀请（凭一次性 token，而不是可猜测的 inviteId）
   * 返回新成员记录；token 无效/过期/已使用则返回 null
   */
  static async acceptInvite(token: string, userId: string): Promise<TeamMember | null> {
    if (!token) return null;

    const db = getSupabaseServiceClient();
    const { data: invite, error } = await db
      .from('team_invites')
      .select('*')
      .eq('token', String(token))
      .eq('status', 'pending')
      .maybeSingle();

    if (error || !invite) return null;

    if (new Date((invite as any).expires_at as string).getTime() < Date.now()) {
      await db.from('team_invites').update({ status: 'expired' }).eq('id', (invite as any).id);
      return null;
    }

    // 加入成员（同一团队+用户唯一约束，重复加入时忽略）
    const { data: memberRow, error: memberError } = await db
      .from('team_members')
      .upsert(
        {
          team_id: (invite as any).team_id,
          user_id: userId,
          role: (invite as any).role,
        },
        { onConflict: 'team_id,user_id', ignoreDuplicates: false }
      )
      .select('*')
      .maybeSingle();

    if (memberError || !memberRow) return null;

    await db.from('team_invites').update({ status: 'accepted' }).eq('id', (invite as any).id);
    await this.recordActivity((invite as any).team_id, userId, '加入了团队', (invite as any).team_id, 'team');

    const users = await this.loadUsers([userId]);
    return mapMember(memberRow as any, users.get(userId));
  }

  /** 更新成员角色（仅 owner/admin，且不可修改创建者） */
  static async updateMemberRole(
    teamId: string,
    userId: string,
    data: UpdateMemberRoleRequest
  ): Promise<TeamMember | null> {
    const allowed = await this.requireRole(teamId, userId, [TeamRole.ADMIN]);
    if (!allowed) return null;

    const team = await this.getTeamRow(teamId);
    if (!team) return null;
    // 创建者角色不可变更（owner 身份固定）
    if (data.userId === team.owner_id) return null;

    const db = getSupabaseServiceClient();
    const { data: updated, error } = await db
      .from('team_members')
      .update({ role: data.role })
      .eq('team_id', teamId)
      .eq('user_id', data.userId)
      .select('*')
      .maybeSingle();

    if (error || !updated) return null;

    await this.recordActivity(teamId, userId, `将成员角色改为 ${data.role}`, data.userId, 'member');

    const users = await this.loadUsers([data.userId]);
    return mapMember(updated as any, users.get(data.userId));
  }

  /** 移除成员（owner/admin 可移除他人；成员可退出自己；创建者不可被移除） */
  static async removeMember(
    teamId: string,
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    const team = await this.getTeamRow(teamId);
    if (!team) return false;
    if (targetUserId === team.owner_id) return false; // 创建者不可移除

    const isSelf = userId === targetUserId;
    if (!isSelf) {
      const allowed = await this.requireRole(teamId, userId, [TeamRole.ADMIN]);
      if (!allowed) return false;
    } else {
      const membership = await this.requireMembership(teamId, userId);
      if (!membership) return false;
    }

    const db = getSupabaseServiceClient();
    const { error } = await db
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', targetUserId);

    if (error) return false;

    await this.recordActivity(teamId, userId, '移除了成员', targetUserId, 'member');
    return true;
  }

  /** 获取当前用户在团队内的权限（非成员返回 null；owner 返回全权限） */
  static async getUserPermissions(
    teamId: string,
    userId: string
  ): Promise<TeamPermissions | null> {
    const team = await this.getTeamRow(teamId);
    if (!team) return null;
    if (team.owner_id === userId) return OWNER_PERMISSIONS;

    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return null;
    return ROLE_PERMISSIONS[membership.role];
  }

  // ===================== 评论 =====================

  /**
   * 创建评论
   * 说明：不再接受调用方传入的 userName/userAvatar（此前前端硬编码"演示用户"），
   *       用户信息统一由 users 表按 userId 关联，杜绝虚假数据。
   */
  static async createComment(
    userId: string,
    data: CreateCommentRequest & { teamId: string }
  ): Promise<Comment | null> {
    // 评论必须发生在团队内，且评论人必须是该团队成员
    const membership = await this.requireMembership(data.teamId, userId);
    if (!membership) return null;


    const perms = await this.getUserPermissions(data.teamId, userId);
    if (!perms?.canComment) return null;

    const db = getSupabaseServiceClient();
    const { data: row, error } = await db
      .from('team_comments')
      .insert({
        team_id: data.teamId,
        target_id: data.targetId,
        target_type: data.targetType,
        user_id: userId,
        content: data.content,
        parent_id: data.parentId ?? null,
      })
      .select('*')
      .single();

    if (error || !row) return null;

    const users = await this.loadUsers([userId]);
    return mapComment(row as any, users.get(userId));
  }

  /** 获取某目标下的顶级评论（需为团队成员） */
  static async getComments(targetId: string, userId: string): Promise<Comment[]> {
    // targetId 即 teamId（评论功能仅在团队页使用）
    const membership = await this.requireMembership(targetId, userId);
    if (!membership) return [];

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('team_comments')
      .select('*')
      .eq('target_id', targetId)
      .is('parent_id', null)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    const users = await this.loadUsers((data as any[]).map((c) => c.user_id as string));
    return (data as any[]).map((row) => mapComment(row, users.get(row.user_id)));
  }

  /** 更新评论（仅作者本人） */
  static async updateComment(
    commentId: string,
    userId: string,
    data: UpdateCommentRequest
  ): Promise<Comment | null> {
    const db = getSupabaseServiceClient();
    const { data: updated, error } = await db
      .from('team_comments')
      .update({ content: data.content, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error || !updated) return null;

    const users = await this.loadUsers([userId]);
    return mapComment(updated as any, users.get(userId));
  }

  /** 删除评论（仅作者本人；子回复由外键 ON DELETE CASCADE 清理） */
  static async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const db = getSupabaseServiceClient();
    const { error } = await db
      .from('team_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);
    return !error;
  }

  // ===================== 共享报价单 =====================

  /** 共享报价单到团队（需为团队成员） */
  static async shareQuote(userId: string, data: ShareQuoteRequest): Promise<SharedQuote | null> {
    const membership = await this.requireMembership(data.teamId, userId);
    if (!membership) return null;

    const db = getSupabaseServiceClient();
    const { data: row, error } = await db
      .from('team_shared_quotes')
      .upsert(
        {
          team_id: data.teamId,
          quote_id: data.quoteId,
          shared_by: userId,
          permissions: data.permissions,
          shared_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,quote_id' }
      )
      .select('*')
      .single();

    if (error || !row) return null;

    await this.recordActivity(data.teamId, userId, '共享了报价单', data.quoteId, 'quote');
    return mapSharedQuote(row as any);
  }

  /** 获取团队共享报价单（非成员返回空） */
  static async getTeamSharedQuotes(teamId: string, userId: string): Promise<SharedQuote[]> {
    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return [];

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('team_shared_quotes')
      .select('*')
      .eq('team_id', teamId)
      .order('shared_at', { ascending: false });

    if (error || !data) return [];
    return (data as any[]).map((row) => mapSharedQuote(row));
  }

  // ===================== 统计 =====================

  static async getTeamStats(teamId: string, userId: string): Promise<TeamStats | null> {
    const membership = await this.requireMembership(teamId, userId);
    if (!membership) return null;

    const db = getSupabaseServiceClient();

    const [membersRes, quotesRes, commentsRes, activitiesRes] = await Promise.all([
      db.from('team_members').select('last_active_at').eq('team_id', teamId),
      db
        .from('team_shared_quotes')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId),
      db
        .from('team_comments')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId),
      db
        .from('team_activities')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const members = (membersRes.data || []) as any[];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeMembers = members.filter(
      (m) => m.last_active_at && new Date(m.last_active_at).getTime() > weekAgo
    ).length;

    const activities = (activitiesRes.data || []) as any[];
    const userMap = await this.loadUsers(activities.map((a) => a.user_id as string));

    return {
      totalMembers: members.length,
      activeMembers,
      totalQuotes: quotesRes.count || 0,
      totalComments: commentsRes.count || 0,
      recentActivity: activities.map(
        (a): TeamActivity => ({
          id: a.id,
          teamId: a.team_id,
          userId: a.user_id,
          userName: displayNameOf(userMap.get(a.user_id)),
          action: a.action,
          targetId: a.target_id ?? undefined,
          targetType: a.target_type ?? undefined,
          createdAt: new Date(a.created_at),
        })
      ),
    };
  }

  // ===================== 活动日志 =====================

  /** 记录团队活动（失败不影响主流程） */
  private static async recordActivity(
    teamId: string,
    userId: string,
    action: string,
    targetId?: string,
    targetType?: string
  ): Promise<void> {
    try {
      const db = getSupabaseServiceClient();
      await db.from('team_activities').insert({
        team_id: teamId,
        user_id: userId,
        action,
        target_id: targetId ?? null,
        target_type: targetType ?? null,
      });
    } catch (error) {
      // 活动日志属旁路记录，失败不应中断业务
      console.error('[TeamService] 记录团队活动失败:', error);
    }
  }
}
