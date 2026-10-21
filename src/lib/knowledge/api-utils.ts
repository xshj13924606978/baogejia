/**
 * 知识中心 API 统一工具
 *
 * 集中管理：角色映射、认证上下文解析、降级检测
 * 所有 /api/knowledge/* 路由必须使用此模块，禁止内联认证逻辑
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';

// ===================== 角色映射 =====================

/** 中文角色名 → 英文标准角色名（所有路由共用一份） */
export const ROLE_MAP: Record<string, string> = {
  '超级管理员': 'super_admin',
  '系统管理员': 'admin',
  '管理员': 'admin',
  'VIP会员': 'vip',
  'VIP用户': 'vip',
  '付费会员': 'premium',
  '普通会员': 'premium',
  '免费用户': 'free',
  '企业用户': 'enterprise',
  '企业管理员': 'enterprise_admin',
  '待审核': 'pending',
  'user': 'user',
};

/** 角色标准化 */
export function normalizeRole(role: string | null | undefined): string {
  if (!role) return 'user';
  return ROLE_MAP[role] || role || 'user';
}

// ===================== 认证上下文 =====================

export interface AuthContext {
  /** 用于数据查询的 ID（降级时为 fallback 用户的真实 DB UUID） */
  currentUserId: string | null;
  /** 用于权限判断的角色（降级时从 x-user-role header 读取） */
  effectiveRole: string;
  /** 是否命中了开发环境降级（mock ID 不在 DB 中） */
  isDevFallback: boolean;
  /** 请求是否携带了认证信息（header/cookie） */
  hasRealAuth: boolean;
  /** 是否视为已认证（有认证信息且有用户身份） */
  isAuthenticated: boolean;
}

/**
 * 统一解析认证上下文
 *
 * 核心设计：
 * - 调用 getCurrentUser(request) 获取用户
 * - 检测 dev fallback：当请求 x-user-id 与返回的用户 ID 不匹配时
 * - 降级时 currentUserId **保留** fallback 用户的真实 UUID
 *   这样 scope=mine、download 自上传检测、upload 写入 user_id 都能正确工作
 * - 降级时 effectiveRole 使用 x-user-role header（前端从 localStorage 传入）
 */
export async function resolveAuthContext(request: NextRequest): Promise<AuthContext> {
  const requestUserId = request.headers.get('x-user-id');
  const requestUserRole = request.headers.get('x-user-role');

  let currentUserId: string | null = null;
  let currentUserRole: string | null = null;

  try {
    const currentUser = await getCurrentUser(request);
    if (currentUser?.id) currentUserId = currentUser.id;
    if (currentUser?.role) currentUserRole = currentUser.role;
  } catch { /* 未登录忽略 */ }

  // 检测降级：请求的 x-user-id 与 getCurrentUser 返回的 ID 不匹配
  const isDevFallback = !!(requestUserId && currentUserId && requestUserId !== currentUserId);

  if (isDevFallback) {
    // 降级时：用 header 角色覆盖，但保留 fallback 用户的真实 UUID
    currentUserRole = requestUserRole || 'user';
    // currentUserId 保持为 fallback 用户的 UUID，不再设为 null
  }

  const hasRealAuth = !!(
    requestUserId ||
    request.headers.get('x-user-token') ||
    request.headers.get('authorization') ||
    request.cookies.get('session_token') ||
    request.cookies.get('sb-access-token')
  );

  const isAuthenticated = hasRealAuth && !!(requestUserId || currentUserId);

  return {
    currentUserId,
    effectiveRole: normalizeRole(currentUserRole),
    isDevFallback,
    hasRealAuth,
    isAuthenticated,
  };
}
