#!/usr/bin/env node

// 测试 DeepSeek API 调用

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
  dangerouslyAllowBrowser: false,
});

async function testDeepSeek() {
  console.log('开始测试 DeepSeek API...');
  
  try {
    const messages = [
      { role: 'system', content: '你是一个助手' },
      { role: 'user', content: '你好' }
    ];
    
    console.log('发送消息:', JSON.stringify(messages, null, 2));
    
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
      temperature: 0.7,
      max_tokens: 100,
      stream: false,
    });
    
    console.log('API 调用成功！');
    console.log('响应:', response.choices[0]?.message?.content);
  } catch (error) {
    console.error('API 调用失败:', error);
    console.error('错误详情:', JSON.stringify(error, null, 2));
  }
}

testDeepSeek();
