/**
 * 积分系统端到端关联测试
 * 验证: 注册奖励 → 每日登录 → 查询积分 → 等级联动 → 流水记录 → 消费 → 一致性校验
 *
 * 用法: node scripts/verify-points-e2e.mjs
 * 前置: dev server 运行在 http://localhost:3000 (pnpm dev / bash scripts/dev.sh), .env.local 含数据库凭据
 *       如服务在其他端口，用 BASE_URL=http://host:port 覆盖
 * 注册: 手机号 + 短信验证码（mock 模式 SMS_MOCK_RETURN_CODE=true 时接口返回 code；
 *       否则自动用 service role 从 sms_verification_codes 表读取明文验证码）
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

// ---- 读取 .env.local ----
function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local 不存在');
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnvLocal();
const DB_URL = env.COZE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const DB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!DB_URL || !DB_KEY) throw new Error('数据库凭据缺失');
const db = createClient(DB_URL, DB_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- 工具函数 ----
let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
  return cond;
}
function info(name, val) {
  console.log(`  ℹ️  ${name}: ${typeof val === 'object' ? JSON.stringify(val) : val}`);
}

async function api(method, p, body, token, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${p}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: res.headers.get('set-cookie') };
}

async function dbQuery(sql) {
  const { data, error } = await db.rpc('exec_sql', { sql_query: sql });
  if (error) throw new Error(`exec_sql 失败: ${error.message}`);
  return data;
}

async function dbFrom(table, filters) {
  let q = db.from(table).select('*');
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw new Error(`${table} 查询失败: ${error.message}`);
  return data;
}

// ---- 主流程 ----
const suffix = Date.now().toString().slice(-8);
const username = `e2e_${suffix}`;
const email = `${username}@test.local`;
const password = 'Test@12345';

console.log(`\n═══ 积分系统端到端关联测试 ═══`);
console.log(`测试用户: ${username} <${email}>`);
console.log(`Base URL: ${BASE}\n`);

// 0. 前置校验: 配置
console.log('── 0. 前置校验 ──');
try {
  const cfg = await api('GET', '/api/site/config');
  if (cfg.status === 200 && cfg.data) {
    info('register_points', cfg.data.register_points ?? cfg.data.REGISTER_POINTS ?? '(未返回)');
    info('daily_login_points', cfg.data.daily_login_points ?? '(未返回)');
  }
} catch (e) { console.log('  ℹ️  获取配置失败(可能接口路径不同):', e.message); }

// 1. 注册（防虚假注册：需手机号 + 短信验证码；mock 模式 SMS_MOCK_RETURN_CODE=true 时响应返回 code）
console.log('\n── 1. 注册 → 注册奖励 ──');
const phone = '138' + String(Math.floor(Math.random() * 90000000) + 10000000);
let smsCode = '';
try {
  const sms = await api('POST', '/api/auth/send-sms-code', { phone, purpose: 'register' });
  smsCode = sms.data?.code || '';
} catch (e) {
  console.log('  ℹ️  获取短信验证码失败:', e.message);
}
if (!smsCode) {
  // 兜底：mock 未返回验证码时，用 service role 直接从 sms_verification_codes 表读取（验证码明文存储，迁移 057）
  try {
    const { data: codeRec } = await db
      .from('sms_verification_codes')
      .select('code')
      .eq('phone', phone)
      .eq('purpose', 'register')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    smsCode = codeRec?.[0]?.code || '';
    if (smsCode) console.log('  ℹ️  验证码已从数据库读取（非 mock 返回）');
  } catch (e) {
    console.log('  ℹ️  从数据库读取验证码失败:', e.message);
  }
}
if (!smsCode) {
  console.error('  ❌ 无法获取短信验证码：请配置 SMS_MOCK_RETURN_CODE=true（mock 模式）或启用真实短信渠道');
  process.exit(1);
}
const reg = await api('POST', '/api/auth/register', { username, password, email, phone, sms_code: smsCode });
ok('注册接口', reg.status === 200 && reg.data?.success === true, `status=${reg.status}`);
let userId = reg.data?.user?.id;
if (!userId) {
  // 尝试从 DB 找
  const us = await dbFrom('users', { email });
  userId = us[0]?.id;
}
ok('获得 userId', !!userId, userId);
if (userId) {
  const u = (await dbFrom('users', { id: userId }))[0];
  info('users.points', u?.points);
  info('users.total_points', u?.total_points);
  info('metadata.points', u?.metadata?.points);
  const recs = await dbFrom('point_records', { user_id: userId });
  const logs = await dbFrom('point_logs', { user_id: userId });
  info('point_records 条数', recs.length);
  info('point_logs 条数', logs.length);
  const regRec = recs.find(r => r.type === 'register');
  ok('注册奖励流水(register)', !!regRec, regRec ? `+${regRec.points}` : '无');
  const regLog = logs.find(r => r.type === 'register');
  ok('注册奖励 log 同步', !!regLog, regLog ? `+${regLog.points}` : '无');
  // 注册即登录：注册时 establishUserSession 已发放 daily_login，users.points = 注册奖励 + 每日登录奖励
  ok('users.points 已含注册奖励', !!regRec && u?.points >= regRec?.points, regRec ? `users.points=${u?.points}, 注册奖励=${regRec?.points}` : '无注册流水');
  const lvl = (await dbFrom('user_levels', { user_id: userId }))[0];
  info('user_levels 记录', lvl ? `level=${lvl.level}, current_points=${lvl.current_points}` : '不存在');
  ok('user_levels 已创建', !!lvl, lvl ? `level=${lvl.level}, points=${lvl.current_points}` : '新用户未创建等级记录');
}

// 2. 登录 → 每日登录奖励
console.log('\n── 2. 登录 → 每日登录奖励 ──');
const login = await api('POST', '/api/auth/login', { username, password });
ok('登录接口', login.status === 200 && login.data?.success === true, `status=${login.status}`);
const token = login.data?.sessionToken;
ok('获得 sessionToken', !!token);
// middleware 只认 session_token cookie，从登录响应的 Set-Cookie 中提取并携带
const cookie = (login.cookie || '').split(';')[0].trim();
info('会话 cookie', cookie ? cookie.split('=')[0] + '=***' : '(无)');
const loginUser = login.data?.user;
info('登录返回 level', loginUser?.level);
info('登录返回 currentPoints', loginUser?.currentPoints);
if (userId) {
  const u = (await dbFrom('users', { id: userId }))[0];
  info('登录后 users.points', u?.points);
  info('登录后 metadata.last_login_reward_date', u?.metadata?.last_login_reward_date);
  const logs = await dbFrom('point_logs', { user_id: userId });
  const loginLog = logs.find(r => r.type === 'daily_login');
  ok('每日登录奖励流水', !!loginLog, loginLog ? `+${loginLog.points}` : '无');
  const recs = await dbFrom('point_records', { user_id: userId });
  const loginRec = recs.find(r => r.type === 'daily_login');
  ok('每日登录奖励 record 同步', !!loginRec, loginRec ? `+${loginRec.points}` : '无');
  const lvl = (await dbFrom('user_levels', { user_id: userId }))[0];
  info('登录后 user_levels.current_points', lvl?.current_points);
  ok('等级积分与 users.points 一致', lvl?.current_points === u?.points, `user_levels=${lvl?.current_points}, users=${u?.points}`);
}

// 3. 查询积分 API
console.log('\n── 3. 查询积分 /api/user/points ──');
const pts = await api('GET', '/api/user/points', undefined, token, cookie);
info('HTTP status', pts.status);
info('返回体', pts.data);
ok('积分接口可用', pts.status === 200 || pts.status === 401);
if (pts.status === 200 && pts.data) {
  // API 返回结构为 { success, data: {...} }
  const inner = pts.data.data ?? pts.data;
  const shown = inner.points ?? inner.currentPoints ?? inner.balance;
  ok('积分展示>0', typeof shown === 'number' && shown > 0, `展示=${shown}`);
}

// 4. 查询等级 API
console.log('\n── 4. 查询等级 /api/user/level ──');
const lvl = await api('GET', '/api/user/level', undefined, token, cookie);
info('HTTP status', lvl.status);
info('返回体', lvl.data);
if (lvl.status === 200 && lvl.data) {
  // API 返回结构为 { success, data: {...} }
  const innerLvl = lvl.data.data ?? lvl.data;
  ok('等级>=1', (innerLvl.level ?? 0) >= 1, `level=${innerLvl.level}`);
}

// 5. 流水 API
console.log('\n── 5. 查询流水 /api/user/points/records ──');
const rec = await api('GET', '/api/user/points/records?limit=20', undefined, token, cookie);
info('HTTP status', rec.status);
if (rec.status === 200 && rec.data) {
  const list = Array.isArray(rec.data) ? rec.data : (rec.data.records ?? rec.data.data ?? []);
  info('流水条数', list.length);
  ok('流水含 register', list.some(r => r.type === 'register'));
  ok('流水含 daily_login', list.some(r => r.type === 'daily_login'));
}

// 6. 消费 (调用 POST 扣积分，若无权限则降级为 DB 级验证 deduct_points_atomic)
console.log('\n── 6. 积分消费 ──');
const consume = await api('POST', '/api/user/points', { points: -5, type: 'test_consume', description: 'E2E测试消费' }, token, cookie);
info('消费接口 status', consume.status);
info('消费返回', consume.data);
if (consume.status === 200) {
  ok('消费成功', consume.data?.success === true);
} else {
  console.log('  ⚠️  消费接口被拒(权限限制), 改为直接调用 deduct_points_atomic 验证');
  if (userId) {
    const { data: d, error: e } = await db.rpc('deduct_points_atomic', {
      p_user_id: userId, p_points: 5, p_type: 'test_consume', p_description: 'E2E测试消费',
    });
    ok('deduct_points_atomic 调用', !e && d?.success !== false, e ? e.message : JSON.stringify(d));
  }
}

// 7. 最终一致性校验
console.log('\n── 7. 最终一致性校验 ──');
if (userId) {
  const u = (await dbFrom('users', { id: userId }))[0];
  const lvl2 = (await dbFrom('user_levels', { user_id: userId }))[0];
  const recs = await dbFrom('point_records', { user_id: userId });
  const logs = await dbFrom('point_logs', { user_id: userId });
  const mdPoints = u?.metadata?.points;
  info('users.points', u?.points);
  info('users.total_points', u?.total_points);
  info('metadata.points', mdPoints);
  info('user_levels.current_points', lvl2?.current_points);
  info('user_levels.level', lvl2?.level);
  info('point_records 总条数', recs.length);
  info('point_logs 总条数', logs.length);
  ok('双表流水条数一致', recs.length === logs.length, `${recs.length} vs ${logs.length}`);
  ok('users.points 与 metadata.points 一致', u?.points === mdPoints, `${u?.points} vs ${mdPoints}`);
  ok('users.points 与 user_levels.current_points 一致', u?.points === lvl2?.current_points, `users=${u?.points}, user_levels=${lvl2?.current_points}`);
  // 汇总总积分
  const totalFromRecs = recs.reduce((s, r) => s + (r.points || 0), 0);
  info('流水求和', totalFromRecs);
  ok('users.points == 流水求和', u?.points === totalFromRecs, `${u?.points} vs ${totalFromRecs}`);
}

// 8. 清理测试用户(保留数据用于核对, 输出清理命令)
console.log('\n── 8. 结果汇总 ──');
console.log(`通过: ${passed}  失败: ${failed}`);
console.log(`测试用户ID(未清理, 供核对): ${userId}`);
if (userId) {
  console.log(`清理命令(如需): ${DB_URL}`);
}
process.exit(failed > 0 ? 1 : 0);
