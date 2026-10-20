const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY before running this script');
const h = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' };
const B = 'https://tjbnjrcgmyiwudqptfhc.supabase.co/rest/v1';

const TABLES = ['user_levels', 'user_token_balance', 'profiles', 'users'];
TABLES.forEach(async (t) => {
  const r = await fetch(`${B}/${t}?limit=1`, { headers: { ...h, Prefer: 'count=exact' } });
  const isJson = r.headers.get('content-type')?.includes('json');
  let d;
  try { d = await r.json(); } catch { d = 'NOT_JSON'; }
  const cols = Array.isArray(d) && d[0] ? Object.keys(d[0]).join(',') : (typeof d === 'object' ? JSON.stringify(d).substring(0,150) : String(d));
  console.log(`${t} → ${r.status} | cols: ${cols}`);
});
