/**
 * 用户手机号提取工具
 *
 * 背景：users 表没有顶层 phone 列，手机号存储在 metadata.phone（jsonb）。
 * 因此凡涉及 users 联表查询（`user:users(...)`）都不能 select `phone`，
 * 否则 PostgREST 返回 400（column users.phone does not exist）→ API 500。
 * 正确做法：联表 select `metadata`，再用本工具把 metadata.phone 提升为
 * user.phone 供前端直接使用（与 /api/admin/users 列表口径一致），并移除冗余 metadata。
 */

interface HasUser {
  user?: any;
}

/** 批量：把每条记录 user.metadata.phone 提升为 user.phone，并移除冗余 metadata */
export function attachUserPhone<T extends HasUser>(records: T[]): T[] {
  if (!Array.isArray(records)) return records;
  for (const r of records) {
    if (r && r.user && typeof r.user === 'object') {
      const u = r.user;
      if (!u.phone && u.metadata && typeof u.metadata === 'object') {
        u.phone = u.metadata.phone || null;
      }
      if ('metadata' in u) delete u.metadata;
    }
  }
  return records;
}

/** 单个：与 attachUserPhone 同口径，用于 maybeSingle/single 结果 */
export function attachUserPhoneOne<T extends HasUser>(obj: T | null): T | null {
  if (!obj) return obj;
  if (obj.user && typeof obj.user === 'object') {
    const u = obj.user;
    if (!u.phone && u.metadata && typeof u.metadata === 'object') {
      u.phone = u.metadata.phone || null;
    }
    if ('metadata' in u) delete u.metadata;
  }
  return obj;
}
