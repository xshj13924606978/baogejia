/**
 * 前端密码策略工具（#20260821-0930 修复）
 * 从 /api/auth/password-policy 读取后端 site_config 的 password_min_length，
 * 避免前端硬编码 <6 与后端配置（如 8）不一致导致保存/注册被 400 拒绝。
 * 模块级缓存，进程内只请求一次；加载失败回退 6（后端仍会兜底校验）。
 */
let cachedMinLength = 6;

/** 同步读取已缓存的密码最小长度（首次调用未加载时返回默认 6） */
export function getMinPasswordLength(): number {
  return cachedMinLength;
}

/** 异步加载（并缓存）密码最小长度，供提交前校验使用 */
export async function loadMinPasswordLength(): Promise<number> {
  try {
    const res = await fetch('/api/auth/password-policy', { cache: 'no-store' });
    const data = await res.json();
    cachedMinLength = data?.success ? Math.max(1, Number(data.minLength) || 6) : 6;
  } catch {
    // 网络异常时保持默认 6，后端最终校验兜底
  }
  return cachedMinLength;
}
