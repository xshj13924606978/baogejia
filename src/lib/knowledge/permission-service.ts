/**
 * 知识中心统一权限服务
 *
 * 所有权限判断集中管理，API 端和前端端共用。
 * 传入标准化的角色名（通过 normalizeRole 转换后的英文名）。
 */

export interface KnowledgeFile {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'uploading';
}

// ===================== 权限判断 =====================

/** 所有登录用户可查看列表 */
export function canViewList(isAuthenticated: boolean): boolean {
  return isAuthenticated;
}

/** 判断用户是否能查看特定文件 */
export function canViewFile(
  role: string,
  userId: string | null,
  file: KnowledgeFile,
): boolean {
  if (!userId) return false;

  // super_admin：所有文件
  if (role === 'super_admin') return true;

  // admin：所有文件
  if (role === 'admin') return true;

  // 已通过的文件：所有登录用户可见
  if (file.status === 'approved') return true;

  // 非通过的文件：只有上传者本人可见
  return file.user_id === userId;
}

/** 判断用户是否能下载文件 */
export function canDownload(
  role: string,
  userId: string | null,
  file: KnowledgeFile,
): boolean {
  if (!userId) return false;

  // free / pending 角色不可下载
  if (role === 'free' || role === 'pending') return false;

  // super_admin：所有文件可下载
  if (role === 'super_admin') return true;

  // admin：所有文件可下载
  if (role === 'admin') return true;

  // 其他角色：只有已通过的文件可下载
  return file.status === 'approved';
}

/** 判断用户是否能上传 */
export function canUpload(isAuthenticated: boolean): boolean {
  return isAuthenticated;
}

/** 判断用户是否能审核（仅管理员） */
export function canAudit(role: string): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** 判断用户是否能删除文件 */
export function canDelete(
  role: string,
  userId: string | null,
  file: KnowledgeFile,
): boolean {
  if (!userId) return false;

  // super_admin 可删除任何文件
  if (role === 'super_admin') return true;

  // 其他用户只能删除自己上传的 pending 文件
  return file.user_id === userId && file.status === 'pending';
}
