import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('缺少环境变量');
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await sb
    .from('trade_config')
    .select('config_key,config_value,category,description')
    .in('config_key', ['points.token_rate', 'points.split_rates'])
    .order('config_key');

  if (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }

  console.log('迁移 114 数据验证:');
  console.log(JSON.stringify(data, null, 2));

  const expectedKeys = ['points.split_rates', 'points.token_rate'];
  const actualKeys = data?.map((r) => r.config_key).sort() || [];
  if (JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)) {
    console.log('✅ 两条配置均已写入');
  } else {
    console.error('❌ 配置缺失:', actualKeys);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
