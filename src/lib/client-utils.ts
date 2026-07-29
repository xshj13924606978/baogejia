/**
 * 客户端通用工具函数
 * 此文件只能使用浏览器 API（localStorage 等），不能导入 Node.js 模块
 */

/**
 * 客户端 API 请求专用的认证 headers
 * 从 localStorage 读取用户信息和签名 token，构造 x-user-token、x-user-role 和 Authorization
 * 所有客户端 fetch 调用都应使用此函数，避免遗漏认证头
 */
export function getClientAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.role) headers['x-user-role'] = String(user.role);
    }
    const token = localStorage.getItem('session_token');
    if (token) {
      headers['x-user-token'] = token;
    }
    const authToken = localStorage.getItem('token');
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  } catch { /* ignore */ }
  return headers;
}

/** 获取客户端用户信息 */
export function getClientUser() {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr);
  } catch {
    console.error('[Auth] 解析用户数据失败');
  }
  return null;
}
