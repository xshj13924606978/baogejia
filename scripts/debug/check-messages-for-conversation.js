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

async function checkMessages() {
  // 获取最新的对话
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (convError) {
    console.error('❌ 获取对话失败:', convError);
    return;
  }

  console.log('\n📋 最近的5个对话:');
  conversations.forEach((conv, index) => {
    console.log(`${index + 1}. ${conv.id} - ${conv.title} (${conv.created_at})`);
  });

  // 检查每个对话的消息
  for (const conv of conversations) {
    console.log(`\n🔍 检查对话 ${conv.id} 的消息:`);
    
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('❌ 获取消息失败:', msgError);
    } else if (messages && messages.length > 0) {
      console.log(`✅ 找到 ${messages.length} 条消息:`);
      messages.forEach((msg, i) => {
        console.log(`   ${i+1}. [${msg.role}] ${msg.content.substring(0, 50)}`);
      });
    } else {
      console.log('❌ 没有找到消息');
    }
  }
}

checkMessages();
