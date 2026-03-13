/**
 * 团队协作服务层
 */

import {
  Team,
  TeamRole,
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

// 内存存储（演示用，生产环境应使用数据库）
const teams = new Map<string, Team>();
const teamMembers = new Map<string, TeamMember[]>();
const teamInvites = new Map<string, TeamInvite[]>();
const comments = new Map<string, Comment[]>();
const sharedQuotes = new Map<string, SharedQuote[]>();
const teamActivities = new Map<string, TeamActivity[]>();

// 角色权限映射
const rolePermissions: Record<TeamRole, TeamPermissions> = {
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

export class TeamService {
  /**
   * 创建团队
   */
  static async createTeam(ownerId: string, data: CreateTeamRequest): Promise<Team> {
    const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const team: Team = {
      id: teamId,
      name: data.name,
      description: data.description,
      ownerId,
      avatar: data.avatar,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberCount: 1,
      settings: {
        allowGuestInvite: false,
        quoteVisibility: 'team',
        requireApproval: true,
        maxMembers: 50,
        ...data.settings,
      },
    };

    // 创建团队管理员成员
    const member: TeamMember = {
      id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      teamId,
      userId: ownerId,
      role: TeamRole.ADMIN,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    };

    teams.set(teamId, team);
    teamMembers.set(teamId, [member]);

    // 记录活动
    this.recordActivity(teamId, ownerId, '创建了团队', teamId, 'team');

    return team;
  }

  /**
   * 获取用户所有团队
   */
  static async getUserTeams(userId: string): Promise<Team[]> {
    const userTeams: Team[] = [];

    for (const [teamId, members] of teamMembers.entries()) {
      const isMember = members.some((m) => m.userId === userId);
      if (isMember) {
        const team = teams.get(teamId);
        if (team) {
          userTeams.push(team);
        }
      }
    }

    return userTeams;
  }

  /**
   * 获取团队详情
   */
  static async getTeam(teamId: string, userId: string): Promise<Team | null> {
    const team = teams.get(teamId);
    if (!team) {
      return null;
    }

    // 验证用户是否是团队成员
    const members = teamMembers.get(teamId) || [];
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return null;
    }

    return team;
  }

  /**
   * 更新团队信息
   */
  static async updateTeam(
    teamId: string,
    userId: string,
    data: UpdateTeamRequest
  ): Promise<Team | null> {
    const team = teams.get(teamId);
    if (!team || team.ownerId !== userId) {
      return null;
    }

    // 更新团队信息
    const updatedTeam = {
      ...team,
      ...data,
      settings: { ...team.settings, ...data.settings },
      updatedAt: new Date(),
    };

    teams.set(teamId, updatedTeam);

    // 记录活动
    if (data.name || data.description) {
      this.recordActivity(teamId, userId, '更新了团队信息', teamId, 'team');
    }

    return updatedTeam;
  }

  /**
   * 删除团队
   */
  static async deleteTeam(teamId: string, userId: string): Promise<boolean> {
    const team = teams.get(teamId);
    if (!team || team.ownerId !== userId) {
      return false;
    }

    teams.delete(teamId);
    teamMembers.delete(teamId);
    teamInvites.delete(teamId);
    teamActivities.delete(teamId);

    return true;
  }

  /**
   * 获取团队成员
   */
  static async getTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
    const team = teams.get(teamId);
    if (!team) {
      return [];
    }

    // 验证用户权限
    const members = teamMembers.get(teamId) || [];
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return [];
    }

    return members;
  }

  /**
   * 邀请成员
   */
  static async inviteMembers(
    teamId: string,
    userId: string,
    data: InviteMemberRequest
  ): Promise<TeamInvite[]> {
    const team = teams.get(teamId);
    if (!team) {
      throw new Error('团队不存在');
    }

    // 验证用户权限
    const members = teamMembers.get(teamId) || [];
    const currentUser = members.find((m) => m.userId === userId);
    if (!currentUser || currentUser.role !== TeamRole.ADMIN) {
      throw new Error('无权限邀请成员');
    }

    const invites: TeamInvite[] = [];
    const now = new Date();
    const existingInvites = teamInvites.get(teamId) || [];

    for (const email of data.emails) {
      // 检查是否已经是成员
      const isAlreadyMember = members.some((m) => m.email === email);
      if (isAlreadyMember) {
        continue;
      }

      // 检查是否已有待处理的邀请
      const hasPendingInvite = existingInvites.some(
        (i) => i.inviteeEmail === email && i.status === 'pending'
      );
      if (hasPendingInvite) {
        continue;
      }

      const invite: TeamInvite = {
        id: `invite_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        teamId,
        invitedBy: userId,
        inviteeEmail: email,
        role: data.role,
        status: 'pending',
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        createdAt: now,
      };

      invites.push(invite);
      existingInvites.push(invite);
    }

    teamInvites.set(teamId, existingInvites);

    // 记录活动
    if (invites.length > 0) {
      this.recordActivity(teamId, userId, `邀请了 ${invites.length} 位成员`, teamId, 'team');
    }

    return invites;
  }

  /**
   * 接受邀请
   */
  static async acceptInvite(
    inviteId: string,
    userId: string,
    userData: { nickname?: string; email?: string; avatar?: string }
  ): Promise<TeamMember | null> {
    // 查找邀请
    let foundInvite: TeamInvite | null = null;
    let teamId: string | null = null;

    for (const [tid, invites] of teamInvites.entries()) {
      const invite = invites.find((i) => i.id === inviteId);
      if (invite) {
        foundInvite = invite;
        teamId = tid;
        break;
      }
    }

    if (!foundInvite || foundInvite.status !== 'pending') {
      return null;
    }

    if (new Date() > foundInvite.expiresAt) {
      foundInvite.status = 'expired';
      return null;
    }

    // 创建团队成员
    const member: TeamMember = {
      id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      teamId: teamId!,
      userId,
      role: foundInvite.role,
      nickname: userData.nickname,
      email: userData.email,
      avatar: userData.avatar,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    };

    // 更新邀请状态
    foundInvite.status = 'accepted';

    // 添加成员
    const members = teamMembers.get(teamId!) || [];
    members.push(member);
    teamMembers.set(teamId!, members);

    // 更新团队成员数
    const team = teams.get(teamId!);
    if (team) {
      team.memberCount = members.length;
      teams.set(teamId!, team);
    }

    // 记录活动
    this.recordActivity(teamId!, userId, '加入了团队', teamId!, 'team');

    return member;
  }

  /**
   * 更新成员角色
   */
  static async updateMemberRole(
    teamId: string,
    userId: string,
    data: UpdateMemberRoleRequest
  ): Promise<TeamMember | null> {
    const team = teams.get(teamId);
    if (!team || team.ownerId !== userId) {
      return null;
    }

    const members = teamMembers.get(teamId) || [];
    const memberIndex = members.findIndex((m) => m.userId === data.userId);

    if (memberIndex === -1) {
      return null;
    }

    // 不允许修改创建者的角色
    if (data.userId === team.ownerId) {
      return null;
    }

    members[memberIndex].role = data.role;
    teamMembers.set(teamId, members);

    // 记录活动
    this.recordActivity(teamId, userId, `更改了成员角色为 ${data.role}`, data.userId, 'member');

    return members[memberIndex];
  }

  /**
   * 移除成员
   */
  static async removeMember(
    teamId: string,
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    const team = teams.get(teamId);
    if (!team) {
      return false;
    }

    // 只有管理员可以移除成员，且不能移除创建者
    const members = teamMembers.get(teamId) || [];
    const currentUser = members.find((m) => m.userId === userId);

    if (!currentUser || (currentUser.role !== TeamRole.ADMIN && userId !== targetUserId)) {
      return false;
    }

    if (targetUserId === team.ownerId) {
      return false;
    }

    const newMembers = members.filter((m) => m.userId !== targetUserId);
    teamMembers.set(teamId, newMembers);
    team.memberCount = newMembers.length;

    // 记录活动
    this.recordActivity(teamId, userId, '移除了成员', targetUserId, 'member');

    return true;
  }

  /**
   * 获取用户权限
   */
  static async getUserPermissions(teamId: string, userId: string): Promise<TeamPermissions | null> {
    const members = teamMembers.get(teamId) || [];
    const member = members.find((m) => m.userId === userId);

    if (!member) {
      return null;
    }

    return rolePermissions[member.role];
  }

  /**
   * 创建评论
   */
  static async createComment(
    userId: string,
    userName: string,
    userAvatar: string | undefined,
    data: CreateCommentRequest
  ): Promise<Comment> {
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const comment: Comment = {
      id: commentId,
      targetId: data.targetId,
      targetType: data.targetType,
      userId,
      userName,
      userAvatar,
      content: data.content,
      parentId: data.parentId,
      createdAt: new Date(),
      updatedAt: new Date(),
      likes: 0,
    };

    const targetComments = comments.get(data.targetId) || [];
    targetComments.push(comment);
    comments.set(data.targetId, targetComments);

    // 如果有父评论，更新父评论的回复列表
    if (data.parentId) {
      for (const [_targetId, commentList] of comments.entries()) {
        const parentComment = commentList.find((c) => c.id === data.parentId);
        if (parentComment) {
          if (!parentComment.replies) {
            parentComment.replies = [];
          }
          parentComment.replies.push(comment);
          break;
        }
      }
    }

    return comment;
  }

  /**
   * 获取评论
   */
  static async getComments(targetId: string): Promise<Comment[]> {
    const targetComments = comments.get(targetId) || [];

    // 只返回顶级评论（没有parentId的）
    return targetComments.filter((c) => !c.parentId);
  }

  /**
   * 更新评论
   */
  static async updateComment(
    commentId: string,
    userId: string,
    data: UpdateCommentRequest
  ): Promise<Comment | null> {
    for (const [_targetId, commentList] of comments.entries()) {
      const comment = commentList.find((c) => c.id === commentId);
      if (comment && comment.userId === userId) {
        comment.content = data.content;
        comment.updatedAt = new Date();
        return comment;
      }
    }

    return null;
  }

  /**
   * 删除评论
   */
  static async deleteComment(commentId: string, userId: string): Promise<boolean> {
    for (const [targetId, commentList] of comments.entries()) {
      const index = commentList.findIndex((c) => c.id === commentId);
      if (index !== -1) {
        const comment = commentList[index];
        if (comment.userId === userId) {
          commentList.splice(index, 1);
          comments.set(targetId, commentList);

          // 删除所有回复
          if (comment.replies) {
            for (const reply of comment.replies) {
              const replyIndex = commentList.findIndex((c) => c.id === reply.id);
              if (replyIndex !== -1) {
                commentList.splice(replyIndex, 1);
              }
            }
          }

          return true;
        }
      }
    }

    return false;
  }

  /**
   * 共享报价单
   */
  static async shareQuote(userId: string, data: ShareQuoteRequest): Promise<SharedQuote> {
    const sharedQuoteId = `shared_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const sharedQuote: SharedQuote = {
      id: sharedQuoteId,
      quoteId: data.quoteId,
      teamId: data.teamId,
      sharedBy: userId,
      sharedAt: new Date(),
      permissions: data.permissions,
    };

    const teamSharedQuotes = sharedQuotes.get(data.teamId) || [];
    teamSharedQuotes.push(sharedQuote);
    sharedQuotes.set(data.teamId, teamSharedQuotes);

    // 记录活动
    this.recordActivity(data.teamId, userId, '共享了报价单', data.quoteId, 'quote');

    return sharedQuote;
  }

  /**
   * 获取团队共享的报价单
   */
  static async getTeamSharedQuotes(teamId: string, userId: string): Promise<SharedQuote[]> {
    const team = teams.get(teamId);
    if (!team) {
      return [];
    }

    const members = teamMembers.get(teamId) || [];
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return [];
    }

    return sharedQuotes.get(teamId) || [];
  }

  /**
   * 获取团队统计信息
   */
  static async getTeamStats(teamId: string, userId: string): Promise<TeamStats | null> {
    const team = teams.get(teamId);
    if (!team) {
      return null;
    }

    const members = teamMembers.get(teamId) || [];
    const isMember = members.some((m) => m.userId === userId);
    if (!isMember) {
      return null;
    }

    const activities = teamActivities.get(teamId) || [];
    const recentActivities = activities.slice(-10).reverse();

    // 统计活跃成员（7天内活跃）
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const activeMembers = members.filter(
      (m) => m.lastActiveAt && new Date(m.lastActiveAt) > weekAgo
    ).length;

    return {
      totalMembers: members.length,
      activeMembers,
      totalQuotes: sharedQuotes.get(teamId)?.length || 0,
      totalComments: Array.from(comments.values())
        .flat()
        .filter((c) => c.targetType === 'quote' || c.targetType === 'proposal').length,
      recentActivity: recentActivities,
    };
  }

  /**
   * 记录团队活动
   */
  private static recordActivity(
    teamId: string,
    userId: string,
    action: string,
    targetId?: string,
    targetType?: string
  ): void {
    const activity: TeamActivity = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      teamId,
      userId,
      userName: `用户${userId.substring(0, 6)}`,
      action,
      targetId,
      targetType,
      createdAt: new Date(),
    };

    const activities = teamActivities.get(teamId) || [];
    activities.push(activity);
    teamActivities.set(teamId, activities);

    // 只保留最近100条活动记录
    if (activities.length > 100) {
      teamActivities.set(teamId, activities.slice(-100));
    }
  }
}
