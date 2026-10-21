/**
 * 认证相关校验规则
 */

/** 中国大陆手机号：1 开头，共 11 位 */
export const PHONE_REGEX = /^1[3-9]\d{9}$/;

/** 规范化手机号（去首尾空白） */
export function normalizePhone(phone: unknown): string {
  return typeof phone === 'string' ? phone.trim() : '';
}

/** 校验手机号格式 */
export function validatePhone(phone: unknown): phone is string {
  return PHONE_REGEX.test(normalizePhone(phone));
}

/** 邮箱：基本格式校验（与前端 upload 页面使用的正则保持一致 #[20260828-1230]） */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 规范化邮箱（小写 + 去空白） */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** 校验邮箱格式 */
export function validateEmail(email: unknown): email is string {
  return EMAIL_REGEX.test(normalizeEmail(email));
}
