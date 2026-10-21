// 用户角色定义
export type UserRole =
  | 'super_admin' // 超级管理员（开发者）
  | 'admin' // 系统管理员
  | 'enterprise_admin' // 企业管理员（可管理下属）
  | 'manufacturer' // 产品厂家
  | 'vip' // VIP个人用户
  | 'premium' // 付费个人用户
  | 'free' // 免费个人用户
  | 'pending'; // 待审核用户

// 用户类型
export type UserType = 'personal' | 'enterprise' | 'manufacturer';

// 用户状态
export type UserStatus = 'active' | 'inactive' | 'pending' | 'banned' | 'expired';

// 权限定义
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'user' | 'content' | 'product' | 'quote' | 'admin' | 'billing';
}

// 所有可用权限
export const ALL_PERMISSIONS: Permission[] = [
  // 用户管理
  { id: 'user.view', name: '查看用户', description: '查看用户列表和基本信息', category: 'user' },
  { id: 'user.create', name: '创建用户', description: '添加新用户', category: 'user' },
  { id: 'user.edit', name: '编辑用户', description: '修改用户信息', category: 'user' },
  { id: 'user.delete', name: '删除用户', description: '删除用户账号', category: 'user' },
  {
    id: 'user.manage_roles',
    name: '管理角色',
    description: '分配和修改用户角色',
    category: 'user',
  },

  // 内容管理
  { id: 'content.view', name: '查看内容', description: '查看知识库内容', category: 'content' },
  { id: 'content.upload', name: '上传内容', description: '上传文件到知识库', category: 'content' },
  { id: 'content.edit', name: '编辑内容', description: '修改已上传内容', category: 'content' },
  { id: 'content.delete', name: '删除内容', description: '删除知识库内容', category: 'content' },
  {
    id: 'content.approve',
    name: '审核内容',
    description: '审核用户上传的内容',
    category: 'content',
  },

  // 产品管理
  { id: 'product.view', name: '查看产品', description: '查看产品价格库', category: 'product' },
  { id: 'product.create', name: '添加产品', description: '添加新产品', category: 'product' },
  { id: 'product.edit', name: '编辑产品', description: '修改产品信息', category: 'product' },
  { id: 'product.delete', name: '删除产品', description: '删除产品', category: 'product' },
  { id: 'product.import', name: '批量导入', description: '批量导入产品数据', category: 'product' },

  // 报价单管理
  { id: 'quote.view', name: '查看报价', description: '查看报价单', category: 'quote' },
  { id: 'quote.create', name: '生成报价', description: '创建新报价单', category: 'quote' },
  { id: 'quote.edit', name: '编辑报价', description: '修改报价单', category: 'quote' },
  { id: 'quote.delete', name: '删除报价', description: '删除报价单', category: 'quote' },
  { id: 'quote.export', name: '导出报价', description: '导出报价单为PDF/Excel', category: 'quote' },

  // 管理后台
  { id: 'admin.access', name: '访问后台', description: '访问管理后台', category: 'admin' },
  { id: 'admin.view_stats', name: '查看统计', description: '查看数据统计', category: 'admin' },
  { id: 'admin.manage_settings', name: '系统设置', description: '修改系统配置', category: 'admin' },
  { id: 'admin.manage_points_rules', name: '积分规则管理', description: '管理积分规则配置', category: 'admin' },

  // 计费配置权限（从数据库迁移）
  { id: 'admin.billing.view', name: '查看计费配置', description: '查看计费配置信息', category: 'billing' },
  { id: 'admin.billing.edit', name: '编辑计费配置', description: '编辑计费配置', category: 'billing' },

  // 企业特有
  {
    id: 'enterprise.manage_team',
    name: '管理团队',
    description: '管理企业下属员工',
    category: 'admin',
  },
  {
    id: 'enterprise.view_team_stats',
    name: '团队统计',
    description: '查看团队使用数据',
    category: 'admin',
  },
];

// 角色权限映射
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  // 超级管理员 - 所有权限
  super_admin: ALL_PERMISSIONS.map((p) => p.id),

  // 系统管理员 - 除用户管理外的所有权限
  admin: [
    'content.view',
    'content.upload',
    'content.edit',
    'content.delete',
    'content.approve',
    'product.view',
    'product.create',
    'product.edit',
    'product.delete',
    'product.import',
    'quote.view',
    'quote.create',
    'quote.edit',
    'quote.delete',
    'quote.export',
    'admin.access',
    'admin.view_stats',
    'admin.manage_settings',
    'admin.billing.view',
    'admin.billing.edit',
    'admin.manage_points_rules',
    'user.view',
  ],

  // 企业管理员
  enterprise_admin: [
    'user.view',
    'user.create',
    'user.edit',
    'enterprise.manage_team',
    'enterprise.view_team_stats',
    'content.view',
    'content.upload',
    'product.view',
    'product.create',
    'product.edit',
    'quote.view',
    'quote.create',
    'quote.edit',
    'quote.export',
    'admin.access',
    'admin.view_stats',
  ],

  // 产品厂家
  manufacturer: [
    'content.view',
    'content.upload',
    'product.view',
    'product.create',
    'product.edit',
    'product.import',
    'quote.view',
    'quote.create',
    'quote.export',
    'admin.access',
  ],

  // VIP用户
  vip: [
    'content.view',
    'content.upload',
    'product.view',
    'quote.view',
    'quote.create',
    'quote.export',
  ],

  // 付费用户
  premium: ['content.view', 'content.upload', 'product.view', 'quote.view', 'quote.create'],

  // 免费用户
  free: ['content.view', 'product.view', 'quote.view'],

  // 待审核用户
  pending: [],
};

// 获取用户类型
export const getUserType = (role: UserRole): UserType => {
  if (role === 'enterprise_admin') return 'enterprise';
  if (role === 'manufacturer') return 'manufacturer';
  return 'personal';
};

// 获取角色显示名称
export const getRoleDisplayName = (role: UserRole): string => {
  const roleNames: Record<UserRole, string> = {
    super_admin: '超级管理员',
    admin: '系统管理员',
    enterprise_admin: '企业管理员',
    manufacturer: '产品厂家',
    vip: 'VIP会员',
    premium: '付费会员',
    free: '免费用户',
    pending: '待审核',
  };
  return roleNames[role] || role;
};

// 角色选项（用于下拉选择）
export const ROLE_OPTIONS = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '系统管理员' },
  { value: 'enterprise_admin', label: '企业管理员' },
  { value: 'manufacturer', label: '产品厂家' },
  { value: 'vip', label: 'VIP会员' },
  { value: 'premium', label: '付费会员' },
  { value: 'free', label: '免费用户' },
  { value: 'pending', label: '待审核' },
];

// 用户状态显示名称
export const getUserStatusDisplayName = (status: UserStatus): string => {
  const statusNames: Record<UserStatus, string> = {
    active: '正常',
    inactive: '未激活',
    pending: '待审核',
    banned: '已封禁',
    expired: '已过期',
  };
  return statusNames[status] || status;
};

// 用户状态下拉选项
export const USER_STATUS_OPTIONS = [
  { value: 'active', label: '正常' },
  { value: 'inactive', label: '未激活' },
  { value: 'pending', label: '待审核' },
  { value: 'banned', label: '已封禁' },
  { value: 'expired', label: '已过期' },
];

// 获取角色等级（用于权限判断）
export const getRoleLevel = (role: UserRole): number => {
  const levels: Record<UserRole, number> = {
    super_admin: 100,
    admin: 90,
    enterprise_admin: 80,
    manufacturer: 70,
    vip: 60,
    premium: 50,
    free: 40,
    pending: 0,
  };
  return levels[role] || 0;
};

// ==================== 等级系统相关函数 ====================

/**
 * 根据等级获取角色
 * @param level 用户等级
 * @returns 对应的角色
 */
export const getRoleByLevel = (level: number): UserRole => {
  if (level >= 5) return 'super_admin';
  if (level >= 4) return 'enterprise_admin';
  if (level >= 3) return 'vip';
  if (level >= 2) return 'premium';
  return 'free';
};

/**
 * 检查用户是否拥有某权限
 * @param user 用户对象
 * @param permissionId 权限ID
 * @returns 是否有权限
 */
export const hasPermission = (user: any, permissionId: string): boolean => {
  if (!user) return false;

  // 中文角色名到标准英文角色的映射（兼容数据库中存储的中文角色名）
  const ROLE_NAME_MAP: Record<string, UserRole> = {
    '超级管理员': 'super_admin',
    'super_admin': 'super_admin',
    'Super_Admin': 'super_admin',
    'SUPER_ADMIN': 'super_admin',
    '管理员': 'admin',
    'admin': 'admin',
    'Admin': 'admin',
    'ADMIN': 'admin',
    '企业管理员': 'enterprise_admin',
    'enterprise_admin': 'enterprise_admin',
    'Enterprise_Admin': 'enterprise_admin',
    '产品厂家': 'manufacturer',
    'manufacturer': 'manufacturer',
    'VIP会员': 'vip',
    'vip': 'vip',
    'VIP': 'vip',
    '付费会员': 'premium',
    'premium': 'premium',
    '免费用户': 'free',
    'free': 'free',
    '待审核': 'pending',
    'pending': 'pending',
  };

  // 规范化角色名为标准 UserRole
  const normalizedRole: UserRole = ROLE_NAME_MAP[user.role] || getRoleByLevel(user.level || 1);

  // 如果是超级管理员，拥有所有权限
  if (normalizedRole === 'super_admin') return true;

  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];

  return permissions.includes(permissionId);
};

/**
 * 检查用户是否拥有多个权限中的任意一个
 * @param user 用户对象
 * @param permissionIds 权限ID数组
 * @returns 是否有任意一个权限
 */
export const hasAnyPermission = (user: any, permissionIds: string[]): boolean => {
  return permissionIds.some((permissionId) => hasPermission(user, permissionId));
};

/**
 * 检查用户是否拥有所有指定权限
 * @param user 用户对象
 * @param permissionIds 权限ID数组
 * @returns 是否拥有所有权限
 */
export const hasAllPermissions = (user: any, permissionIds: string[]): boolean => {
  return permissionIds.every((permissionId) => hasPermission(user, permissionId));
};
