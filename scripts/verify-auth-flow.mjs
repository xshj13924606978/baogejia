#!/usr/bin/env node
/**
 * 认证体系全流程生产验证脚本 #[20260829-1800]
 *
 * 覆盖用户验证清单中 API 可自动化项：
 *   1. 注册即登录（手机号+验证码）
 *   2. verify-session 权威校验（token 有效 + phone/email 实时反映绑定变化）
 *   3. 换绑手机号（旧手机验证码 + 新手机验证码 双验证）
 *   4. 换绑邮箱（旧邮箱验证码 + 新邮箱验证码 双验证，purpose=rebind）
 *   5. 密码登录（手机号/用户名 + 密码）
 *   6. 限流（60s 内重复获取验证码 → 429）
 *   7. 全部设备登出（session_version 递增 → 旧 token 真实失效）
 *   8. 注销账号（密码校验 + 真实删除 → 旧 token 失效）
 *   9. 未登录访问受保护接口 → 401
 *
 * 用法：node scripts/verify-auth-flow.mjs
 * 前置：.env.local 含生产 Supabase service role 凭据（验证码从 DB 读取）
 * 说明：会向随机测试手机号发送真实短信验证码（验证码从 DB 读取，不依赖短信回传）
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

const BASE = process.env.VERIFY_BASE_URL || 'https://xs-bj.com';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let passCount = 0, failCount = 0, warnCount = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passCount++; console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
};
const warn = (label, detail = '') => { warnCount++; console.log(`  ⚠️  ${label}${detail ? ' — ' + detail : ''}`); };

const rnd = (n) => crypto.randomBytes(n).toString('hex').slice(0, n);
const phoneA = '138' + String(Math.floor(Math.random() * 90000000) + 10000000);
const phoneB = '138' + String(Math.floor(Math.random() * 90000000) + 10000000);
const emailA = `u${rnd(8)}@verifymail.test`;
const emailB = `u${rnd(8)}@verifymail.test`;
const username = `t_${rnd(6)}`;
const password = 'Test@12345';

async function api(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-user-token'] = token;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, data };
}

async function dbSmsCode(p, purpose = 'register') {
  const { data } = await supabase
    .from('sms_verification_codes')
    .select('code').eq('phone', p).eq('purpose', purpose).is('consumed_at', null)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0]?.code || '';
}

async function dbEmailOtp(e) {
  const { data } = await supabase
    .from('email_verification_codes')
    .select('current_email_otp').eq('email', e).maybeSingle();
  return data?.current_email_otp || '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 发送短信验证码；若触发 60s 冷却（429），按 cooldownSeconds 等待后重试。
 * 注册步骤已消耗该手机号 60s 冷却，换绑测试需等待冷却结束。
 */
async function sendSmsWithRetry(phone, purpose, maxRetry = 2) {
  for (let i = 0; i <= maxRetry; i++) {
    const r = await api('POST', '/api/auth/send-sms-code', { body: { phone, purpose } });
    if (r.status === 200) return r;
    if (r.status === 429) {
      const wait = (r.data?.cooldownSeconds || 60) + 2;
      console.log(`  ⏳ 触发限流，等待 ${wait}s 后重试（${purpose}/${phone}）`);
      await sleep(wait * 1000);
      continue;
    }
    return r;
  }
  return { status: 429, data: { error: '重试超限' } };
}

console.log(`🔍 认证全流程验证开始 (${new Date().toLocaleString('zh-CN')}) BASE=${BASE}`);
console.log(`   测试用户: username=${username}, phoneA=${phoneA}, phoneB=${phoneB}`);

try {
  // ── 1. 未登录访问受保护接口 → 401 ──
  console.log('\n── 1. 未登录鉴权 ──');
  const r1 = await api('POST', '/api/auth/phone/bind', { body: { phone: phoneA, code: '000000' } });
  ok('未登录调 phone/bind → 401', r1.status === 401, `status=${r1.status}`);

  // ── 2. 注册即登录 ──
  console.log('\n── 2. 手机号+验证码注册（注册即登录）──');
  const s1 = await api('POST', '/api/auth/send-sms-code', { body: { phone: phoneA, purpose: 'register' } });
  ok('send-sms-code(register) → 200', s1.status === 200, `status=${s1.status}`);
  const codeA = await dbSmsCode(phoneA, 'register');
  ok('数据库读取注册验证码', codeA.length === 6, `code=${codeA}`);
  const reg = await api('POST', '/api/auth/register', {
    body: { username, password, email: emailA, phone: phoneA, sms_code: codeA },
  });
  const tokenA = reg.data?.sessionToken || '';
  ok('register → 注册成功', reg.status === 200 && reg.data?.success === true, `status=${reg.status}`);
  ok('注册即登录（签发 sessionToken）', tokenA.length > 20, `tokenLen=${tokenA.length}`);
  const userId = reg.data?.user?.id || '';

  // ── 3. verify-session 权威校验 ──
  console.log('\n── 3. verify-session ──');
  const v1 = await api('POST', '/api/auth/verify-session', { body: { token: tokenA } });
  ok('verify-session → valid', v1.status === 200 && v1.data?.valid === true, `status=${v1.status}`);
  ok('verify-session 返回 phone 正确', v1.data?.user?.phone === phoneA, `phone=${v1.data?.user?.phone}`);
  ok('verify-session 返回 email 正确', (v1.data?.user?.email || '').toLowerCase() === emailA.toLowerCase(), `email=${v1.data?.user?.email}`);
  ok('verify-session 返回 hasPassword=true', v1.data?.user?.hasPassword === true, `hasPassword=${v1.data?.user?.hasPassword}`);

  // ── 4. 换绑手机号（双验证）──
  console.log('\n── 4. 换绑手机号（旧+新验证码）──');
  const sOld = await sendSmsWithRetry(phoneA, 'bind');
  const sNew = await sendSmsWithRetry(phoneB, 'bind');
  const codeOld = await dbSmsCode(phoneA, 'bind');
  const codeNew = await dbSmsCode(phoneB, 'bind');
  ok('旧手机验证码已发送', sOld.status === 200 && codeOld.length === 6, `status=${sOld.status}`);
  ok('新手机验证码已发送', sNew.status === 200 && codeNew.length === 6, `status=${sNew.status}`);
  const bindP = await api('POST', '/api/auth/phone/bind', {
    token: tokenA,
    body: { phone: phoneB, code: codeNew, oldPhone: phoneA, oldCode: codeOld },
  });
  ok('phone/bind 换绑成功', bindP.status === 200 && bindP.data?.success === true, `status=${bindP.status}`);
  ok('换绑后 phone 已更新', bindP.data?.phone === phoneB, `phone=${bindP.data?.phone}`);
  const v2 = await api('POST', '/api/auth/verify-session', { body: { token: tokenA } });
  ok('verify-session 即时反映新手机号', v2.data?.user?.phone === phoneB, `phone=${v2.data?.user?.phone}`);

  // ── 5. 换绑邮箱（双验证）──
  console.log('\n── 5. 换绑邮箱（旧+新验证码）──');
  const eOld = await api('POST', '/api/auth/send-email-code', {
    token: tokenA, body: { email: emailA, purpose: 'rebind' },
  });
  if (eOld.status === 200) {
    const codeEmailOld = await dbEmailOtp(emailA);
    const eNew = await api('POST', '/api/auth/send-email-code', { body: { email: emailB } });
    if (eNew.status === 200) {
      const codeEmailNew = await dbEmailOtp(emailB);
      ok('旧邮箱验证码已发送(rebind)', codeEmailOld.length > 0, `otpLen=${codeEmailOld.length}`);
      ok('新邮箱验证码已发送', codeEmailNew.length > 0, `otpLen=${codeEmailNew.length}`);
      const bindE = await api('POST', '/api/auth/email/bind', {
        token: tokenA,
        body: { email: emailB, code: codeEmailNew, oldEmail: emailA, oldCode: codeEmailOld },
      });
      ok('email/bind 换绑成功', bindE.status === 200 && bindE.data?.success === true, `status=${bindE.status} ${bindE.data?.error || ''}`);
      ok('换绑后 email 已更新', (bindE.data?.email || '').toLowerCase() === emailB.toLowerCase(), `email=${bindE.data?.email}`);
      const v3 = await api('POST', '/api/auth/verify-session', { body: { token: tokenA } });
      ok('verify-session 即时反映新邮箱', (v3.data?.user?.email || '').toLowerCase() === emailB.toLowerCase(), `email=${v3.data?.user?.email}`);
    } else {
      warn('新邮箱验证码发送失败', `status=${eNew.status} ${eNew.data?.error || ''}（邮件通道可能无法投递到测试邮箱，换绑邮箱请人工验证）`);
    }
  } else {
    warn('旧邮箱验证码发送失败(rebind)', `status=${eOld.status} ${eOld.data?.error || ''}（邮件通道可能无法投递到测试邮箱，换绑邮箱请人工验证）`);
  }

  // ── 6. 密码登录（手机号登录）──
  console.log('\n── 6. 密码登录 ──');
  const lg = await api('POST', '/api/auth/login', { body: { username: phoneB, password } });
  const tokenLogin = lg.data?.sessionToken || '';
  ok('手机号+密码登录成功', lg.status === 200 && lg.data?.success === true, `status=${lg.status}`);
  ok('登录签发新 sessionToken', tokenLogin.length > 20, `tokenLen=${tokenLogin.length}`);

  // ── 7. 限流（60s 冷却）──
  console.log('\n── 7. 限流 ──');
  const rl = await api('POST', '/api/auth/send-sms-code', { body: { phone: phoneB, purpose: 'bind' } });
  ok('60s 内重复获取验证码 → 429', rl.status === 429, `status=${rl.status} ${rl.data?.error || ''}`);

  // ── 8. 全部设备登出（session_version 递增）──
  console.log('\n── 8. 全部设备登出 ──');
  const lo = await api('POST', '/api/auth/logout-all', { token: tokenA });
  ok('logout-all → success', lo.status === 200 && lo.data?.success === true, `status=${lo.status}`);
  const v4 = await api('POST', '/api/auth/verify-session', { body: { token: tokenA } });
  ok('旧 token 因 session_version 递增而失效', v4.status === 401, `status=${v4.status} ${v4.data?.error || ''}`);
  const v4b = await api('POST', '/api/auth/verify-session', { body: { token: tokenLogin } });
  ok('logout-all 撤销所有已签发 token（含登录 token）', v4b.status === 401, `status=${v4b.status} ${v4b.data?.error || ''}`);

  // ── 9. 注销账号（重新登录 → 密码校验 → 真实删除）──
  console.log('\n── 9. 注销账号 ──');
  const relogin = await api('POST', '/api/auth/login', { body: { username: phoneB, password } });
  const tokenC = relogin.data?.sessionToken || '';
  ok('注销前重新登录成功（新版本 token）', relogin.status === 200 && tokenC.length > 20, `status=${relogin.status}`);
  const v4c = await api('POST', '/api/auth/verify-session', { body: { token: tokenC } });
  ok('新 token 有效（携带最新版本号）', v4c.status === 200 && v4c.data?.valid === true, `status=${v4c.status}`);
  const da = await api('POST', '/api/auth/delete-account', { token: tokenC, body: { password } });
  ok('delete-account → success', da.status === 200 && da.data?.success === true, `status=${da.status} ${da.data?.error || ''}`);
  const v5 = await api('POST', '/api/auth/verify-session', { body: { token: tokenC } });
  ok('注销后旧 token 失效（用户已删除/禁用）', v5.status === 401, `status=${v5.status} ${v5.data?.error || ''}`);

  // 确认用户已从 DB 删除
  if (userId) {
    const { data: gone } = await supabase.from('users').select('id,status').eq('id', userId).maybeSingle();
    ok('用户已从数据库删除/标记删除', !gone || (gone.status && gone.status !== 'active'),
      gone ? `status=${gone.status}` : 'record removed');
  }
} catch (e) {
  failCount++;
  console.log(`  ❌ 脚本异常中断: ${e.message}`);
}

console.log('\n══════════════════════════════════════');
console.log(`结果：✅ ${passCount} 通过 | ❌ ${failCount} 失败 | ⚠️ ${warnCount} 待人工确认`);
if (failCount > 0) { console.log('存在失败项，请查看上方 ❌ 标记'); process.exit(1); }
console.log(warnCount > 0 ? '全部通过（含待人工确认项）' : '全部通过');
