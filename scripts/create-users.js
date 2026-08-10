/**
 * 批量创建 Supabase Auth 用户 + 同步 users / user_levels / user_token_balance
 * 用法: node scripts/create-users.js
 */
const SUPABASE_URL = 'https://tjbnjrcgmyiwudqptfhc.supabase.co';
const SERVICE_ROLE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
const ADMIN_BASE = `${SUPABASE_URL}/auth/v1/admin`;
const REST_BASE = `${SUPABASE_URL}/rest/v1`;

const USERS = [
  { email: '519733058@qq.com',     password: 'YOUR_USER_PASSWORD',      role: 'super_admin',      level: 5, points: 10000 },
  { email: 'cs@xs-hj.com',         password: 'YOUR_USER_PASSWORD',      role: 'admin',            level: 5, points: 10000 },
  { email: '2651772301@qq.com',    password: 'YOUR_USER_PASSWORD',    role: 'vip',              level: 5, points: 10000 },
  { email: '1379856008@163.com',   password: 'YOUR_USER_PASSWORD',    role: 'enterprise_admin', level: 4, points: 5000  },
  { email: '39666731@qq.com',      password: 'YOUR_USER_PASSWORD',    role: 'premium',          level: 3, points: 2000  },
  { email: '1307190511@qq.com',    password: 'YOUR_USER_PASSWORD',    role: 'free',             level: 1, points: 100   },
];

const adminHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
};

const restHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
};

async function apiPatch(table, idField, idVal, body) {
  const url = `${REST_BASE}/${table}?${encodeURIComponent(idField)}=eq.${encodeURIComponent(idVal)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${table} → ${res.status}: ${text.substring(0, 200)}`);
  }
}

async function main() {
  console.log('=== 批量创建 Supabase Auth 用户 ===\n');

  // 1. 删除已存在的相同邮箱用户
  console.log('── 清理已存在用户...');
  const listRes = await fetch(`${ADMIN_BASE}/users`, { headers: adminHeaders });
  if (listRes.ok) {
    const data = await listRes.json();
    const targetEmails = new Set(USERS.map(u => u.email));
    const duplicates = (data.users || []).filter(u => targetEmails.has(u.email));
    for (const du of duplicates) {
      process.stdout.write(`  删除: ${du.email}...`);
      await fetch(`${ADMIN_BASE}/users/${du.id}`, { method: 'DELETE', headers: adminHeaders });
      console.log(' ✓');
    }
    if (duplicates.length === 0) console.log('  ✓ 无冲突');
  }

  console.log('');

  // 2. 按顺序创建用户
  const createdUsers = [];

  for (const u of USERS) {
    process.stdout.write(`── ${u.email} (${u.role})...`);

    try {
      const createRes = await fetch(`${ADMIN_BASE}/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { role: u.role, level: u.level, points: u.points },
          app_metadata: { role: u.role },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        console.log(` ✗ ${createRes.status} ${err.msg || ''}`);
        continue;
      }

      const authData = await createRes.json();
      const userId = authData.id;
      createdUsers.push({ ...u, id: userId });
      console.log(` ✓ ${userId.substring(0, 8)}`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  if (createdUsers.length === 0) {
    console.log('\n❌ 没有用户创建成功');
    process.exit(1);
  }

  console.log(`\n── 同步 database (${createdUsers.length} 个用户)...`);

  for (const u of createdUsers) {
    process.stdout.write(`  ${u.email}...`);

    try {
      // 更新 public.users 表的 role 和 metadata
      await apiPatch('users', 'id', u.id, {
        role: u.role,
        status: 'active',
        metadata: { role: u.role, level: u.level, points: u.points },
      });
    } catch (e) {
      process.stdout.write(` users(${e.message.substring(0,40)})`);
    }

    try {
      // 更新 user_levels
      await apiPatch('user_levels', 'user_id', u.id, {
        level: u.level,
        current_points: u.points,
        next_level_points: u.level < 5 ? u.points + 5000 : 0,
      });
    } catch (e) {
      process.stdout.write(` levels(${e.message.substring(0,40)})`);
    }

    try {
      // 更新 user_token_balance
      await apiPatch('user_token_balance', 'user_id', u.id, {
        points_balance: u.points,
        token_balance: 0,
      });
    } catch (e) {
      process.stdout.write(` bal(${e.message.substring(0,40)})`);
    }

    console.log(' ✓');
  }

  console.log(`\n=== ✅ 全部完成 ===`);

  // 验证
  const v = await fetch(`${ADMIN_BASE}/users?page=1&per_page=10`, { headers: adminHeaders }).then(r => r.json());
  console.log(`Auth Users: ${v.total || (v.users || []).length}`);
  console.log('请到 Supabase Dashboard → Authentication → Users 验证');
}

main().catch(err => { console.error('错误:', err); process.exit(1); });
