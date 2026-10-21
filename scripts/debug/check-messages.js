const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnvFromFile() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
    
    return env;
  } catch (error) {
    console.error('读取 .env.local 失败:', error.message);
    return {};
  }
}

const env = getEnvFromFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请设置环境变量');
  process.exit(1);
}

console.log('✅ 环境变量加载成功');

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('\n🔍 检查 conversations 表...');
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, title, created_at')
    .limit(5);
  
  if (convError) {
    console.error('❌ 查询 conversations 失败:', convError);
  } else {
    console.log('✅ conversations 表存在，数据数量:', conversations?.length);
    console.log('示例:', conversations);
  }

  console.log('\n🔍 检查 messages 表...');
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .limit(5);
  
  if (msgError) {
    console.error('❌ 查询 messages 失败:', msgError);
    console.log('请确保 messages 表已创建');
  } else {
    console.log('✅ messages 表存在，数据数量:', messages?.length);
    console.log('示例:', messages);
  }

  console.log('\n🔍 检查 conversation_files 表...');
  const { data: files, error: fileError } = await supabase
    .from('conversation_files')
    .select('*')
    .limit(5);
  
  if (fileError) {
    console.error('❌ 查询 conversation_files 失败:', fileError);
    console.log('请确保 conversation_files 表已创建');
  } else {
    console.log('✅ conversation_files 表存在，数据数量:', files?.length);
    console.log('示例:', files);
  }
}

checkTables();
