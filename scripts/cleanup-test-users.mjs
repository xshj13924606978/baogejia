#!/usr/bin/env node
/** 清理验证脚本残留的测试用户（邮箱 @verifymail.test） */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: users, error } = await db
  .from('users')
  .select('id, username, email')
  .ilike('email', '%@verifymail.test');
if (error) { console.error('查询失败:', error.message); process.exit(1); }
if (!users || users.length === 0) { console.log('无待清理测试用户'); process.exit(0); }
for (const u of users) {
  const rpc = await db.rpc('delete_user_cascade', { user_ids: [u.id] });
  console.log(`${rpc.error ? '❌' : '✅'} ${u.username} ${u.email} ${rpc.error ? 'RPC失败: ' + rpc.error.message : '已删除'}`);
}
