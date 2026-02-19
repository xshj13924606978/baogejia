/**
 * 团队协作功能类型定义
 */

// 团队角色
export enum TeamRole {
  ADMIN = 'admin',      // 管理员：完全控制权限
  MEMBER = 'member',    // 成员：可以编辑和评论
  GUEST = 'guest'       // 访客：只能查看
}

// 团队权限定义
export interface TeamPermissions {
  canCreateQuotes: boolean;      // 创建报价单
  canEditQuotes: boolean;        // 编辑报价单
  canDeleteQuotes: boolean;      // 删除报价单
  canInviteMembers: boolean;     // 邀请成员
  canManageMembers: boolean;     // 管理成员
  canManageSettings: boolean;    // 管理团队设置
  canComment: boolean;           // 评论
  canExport: boolean;            // 导出报价单
}

// 团队信息
export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  settings: TeamSettings;
}

// 团队设置
export interface TeamSettings {
  allowGuestInvite: boolean;     // 允许访客邀请
  quoteVisibility: 'private' | 'team' | 'public';  // 报价单可见性
  requireApproval: boolean;      // 新成员需要审批
  maxMembers: number;            // 最大成员数
}

// 团队成员
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  avatar?: string;
  nickname?: string;
  email?: string;
  joinedAt: Date;
  lastActiveAt?: Date;
}

// 团队邀请
export interface TeamInvite {
  id: string;
  teamId: string;
  invitedBy: string;
  inviteeEmail: string;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

// 评论
export interface Comment {
  id: string;
  targetId: string;              // 评论目标ID（报价单ID等）
  targetType: 'quote' | 'team' | 'proposal';  // 评论目标类型
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  parentId?: string;             // 父评论ID（用于回复）
  createdAt: Date;
  updatedAt: Date;
  likes: number;                 // 点赞数
  replies?: Comment[];           // 回复列表
}

// 共享报价单
export interface SharedQuote {
  id: string;
  quoteId: string;
  teamId: string;
  sharedBy: string;
  sharedAt: Date;
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canExport: boolean;
  };
}

// 团队活动日志
export interface TeamActivity {
  id: string;
  teamId: string;
  userId: string;
  userName: string;
  action: string;                // 动作描述
  targetId?: string;             // 目标对象ID
  targetType?: string;           // 目标对象类型
  metadata?: Record<string, any>; // 额外信息
  createdAt: Date;
}

// 创建团队请求
export interface CreateTeamRequest {
  name: string;
  description?: string;
  avatar?: string;
  settings?: Partial<TeamSettings>;
}

// 更新团队请求
export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  avatar?: string;
  settings?: Partial<TeamSettings>;
}

// 邀请成员请求
export interface InviteMemberRequest {
  emails: string[];
  role: TeamRole;
  message?: string;
}

// 更新成员角色请求
export interface UpdateMemberRoleRequest {
  userId: string;
  role: TeamRole;
}

// 创建评论请求
export interface CreateCommentRequest {
  targetId: string;
  targetType: 'quote' | 'team' | 'proposal';
  content: string;
  parentId?: string;
}

// 更新评论请求
export interface UpdateCommentRequest {
  content: string;
}

// 共享报价单请求
export interface ShareQuoteRequest {
  quoteId: string;
  teamId: string;
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canExport: boolean;
  };
}

// 团队统计信息
export interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  totalQuotes: number;
  totalComments: number;
  recentActivity: TeamActivity[];
}
