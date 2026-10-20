/**
 * 修复 6 个用户的所有关联数据
 */
const B = 'https://tjbnjrcgmyiwudqptfhc.supabase.co/rest/v1';
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SK) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY before running this script');
const H = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type': 'application/json' };

const TARGETS = [
  { email: '519733058@qq.com',     role: 'super_admin',      level: 5, points: 10000 },
  { email: 'cs@xs-hj.com',         role: 'admin',            level: 5, points: 10000 },
  { email: '2651772301@qq.com',    role: 'vip',              level: 5, points: 10000 },
  { email: '1379856008@163.com',   role: 'enterprise_admin', level: 4, points: 5000  },
  { email: '39666731@qq.com',      role: 'premium',          level: 3, points: 2000  },
  { email: '1307190511@qq.com',    role: 'free',             level: 1, points: 100   },
];

async function run() {
  // 1. 获取 public.users 中的用户
  const users = await fetch(`${B}/users?select=id,email,role&limit=100`, {headers:H}).then(r=>r.json());
  console.log(`public.users: ${users.length} 个用户`);

  // 2. 获取所有 user_levels（清理旧数据）
  const oldLevels = await fetch(`${B}/user_levels?select=id,user_id&limit=100`, {headers:H}).then(r=>r.json());
  for (const l of oldLevels) {
    await fetch(`${B}/user_levels?id=eq.${l.id}`, {method:'DELETE',headers:{...H,Prefer:'return=minimal'}});
  }
  console.log(`清除 ${oldLevels.length} 条 user_levels`);

  // 3. 获取所有 user_token_balance（清理旧数据）
  const oldBal = await fetch(`${B}/user_token_balance?select=id,user_id&limit=100`, {headers:H}).then(r=>r.json());
  for (const b of oldBal) {
    await fetch(`${B}/user_token_balance?id=eq.${b.id}`, {method:'DELETE',headers:{...H,Prefer:'return=minimal'}});
  }
  console.log(`清除 ${oldBal.length} 条 user_token_balance`);

  // 4. 更新每个用户
  for (const t of TARGETS) {
    const u = users.find(u => u.email === t.email);
    if (!u) { console.log(`❌ ${t.email}: 不在 public.users`); continue; }

    process.stdout.write(`${u.email} (${u.id.substring(0,8)})...`);

    // 更新 public.users metadata
    await fetch(`${B}/users?id=eq.${u.id}`, {
      method: 'PATCH', headers: {...H, Prefer:'return=minimal'},
      body: JSON.stringify({ role: t.role, metadata: { role: t.role, level: t.level, points: t.points } }),
    });

    // 插入 user_levels
    await fetch(`${B}/user_levels`, {
      method: 'POST', headers: {...H, Prefer:'return=minimal'},
      body: JSON.stringify({ user_id: u.id, level: t.level, current_points: t.points, next_level_points: t.level<5?t.points+5000:0 }),
    });

    // 插入 user_token_balance
    await fetch(`${B}/user_token_balance`, {
      method: 'POST', headers: {...H, Prefer:'return=minimal'},
      body: JSON.stringify({ user_id: u.id, points_balance: t.points, token_balance: 0 }),
    });

    console.log(' ✓');
  }

  console.log('\n=== 验证 ===');
  const v = await fetch(`${B}/users?select=email,role,metadata&limit=10`, {headers:H}).then(r=>r.json());
  v.forEach(u => console.log(`  ${u.email} | ${u.role} | level=${u.metadata?.level} pts=${u.metadata?.points}`));
}

run().catch(e => { console.error(e); process.exit(1); });
