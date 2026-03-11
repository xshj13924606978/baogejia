import { NextRequest } from 'next/server';
import { streamDeepSeekChat } from '@/lib/deepseek-client';
import { InputProcessor, ProcessedInput } from '@/lib/input-processor';
import { smartChatProcessor } from '@/lib/smart-chat-processor';
import { createClient } from '@supabase/supabase-js';

// 从数据库加载对话历史
async function loadConversationHistory(conversationId: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20); // 只加载最近20条消息

    if (error) {
      console.error('[Chat Stream API] 加载对话历史失败:', error);
      return [];
    }

    console.log('[Chat Stream API] 加载对话历史:', { conversationId, count: data?.length || 0 });
    return (data || []).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  } catch (error) {
    console.error('[Chat Stream API] 加载对话历史异常:', error);
    return [];
  }
}

// 全局对话记忆（用于维持上下文）
const globalConversationMemory = {
  histories: new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>(),
  
  addToHistory(conversationId: string, role: 'user' | 'assistant', content: string) {
    if (!this.histories.has(conversationId)) {
      this.histories.set(conversationId, []);
    }
    this.histories.get(conversationId)!.push({ role, content });
    
    // 限制历史长度
    const history = this.histories.get(conversationId)!;
    if (history.length > 20) {
      this.histories.set(conversationId, history.slice(-20));
    }
  },
  
  getHistory(conversationId: string) {
    return this.histories.get(conversationId) || [];
  }
};

export async function POST(request: NextRequest) {
  try {
    console.log('[Chat Stream API] ========== 新流式请求 ==========');
    
    // 1. 解析请求
    const body = await request.json();
    const { message, conversationId } = body;
    
    console.log('[Chat Stream API] 请求参数:', {
      hasMessage: !!message,
      messagePreview: message?.substring(0, 50),
      conversationId
    });

    if (!message) {
      return new Response(JSON.stringify({ error: '请提供消息内容' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 处理输入
    const inputProcessor = new InputProcessor();
    const processedInput = await inputProcessor.process({
      type: 'text',
      content: message
    });
    
    // 3. 构建对话历史 - 优先从数据库加载
    let history = [];
    if (conversationId) {
      // 先检查全局内存中是否有历史记录
      history = globalConversationMemory.getHistory(conversationId);
      
      // 如果全局内存中没有历史，尝试从数据库加载
      if (history.length === 0) {
        console.log('[Chat Stream API] 全局内存无历史，从数据库加载');
        history = await loadConversationHistory(conversationId);
        
        // 将加载的历史同步到全局内存
        if (history.length > 0) {
          history.forEach(msg => {
            globalConversationMemory.addToHistory(conversationId, msg.role, msg.content);
          });
        }
      }
      
      console.log('[Chat Stream API] 对话历史:', { conversationId, historyCount: history.length });
    }
    
    // 4. 价格查询预处理（优先查询数据库）
    let enhancedMessage = message;
    let databaseInfo: any = null; // 保存数据库信息
    try {
      const priceQuery = (smartChatProcessor as any).detectPriceQuery(message);
      if (priceQuery.isPriceQuery && priceQuery.productName) {
        console.log('[Chat Stream API] 检测到价格查询:', priceQuery);
        const priceResult = await (smartChatProcessor as any).handlePriceQuery(priceQuery.productName, priceQuery.model);
        if (priceResult.priceData) {
          // 保存数据库信息
          databaseInfo = {
            productName: priceResult.priceData.productName,
            model: priceResult.priceData.model,
            price: priceResult.priceData.price,
            brand: priceResult.priceData.brand,
            parameterDescription: priceResult.priceData.parameterDescription,
            costPrice: priceResult.priceData.costPrice,
            minPrice: priceResult.priceData.minPrice,
            description: priceResult.priceData.description
          };
          console.log('[Chat Stream API] 已保存数据库信息:', databaseInfo);
        }
        if (priceResult.contextInfo) {
          enhancedMessage += priceResult.contextInfo;
          console.log('[Chat Stream API] 已添加价格查询结果到上下文');
        }
      }
    } catch (error) {
      console.error('[Chat Stream API] 价格查询失败:', error);
    }
    
    // 5. 定义智能处理器（用于后续解析）
    const smartProcessor = smartChatProcessor;
    
    // 6. 构建系统提示词和消息
    const systemPrompt = (smartChatProcessor as any).buildSystemPrompt(processedInput);
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content: enhancedMessage }
    ];
    
    // 5. 创建SSE流式响应
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('[Chat Stream API] 开始流式生成...');
          
          // 发送开始标记
          const startEvent = `data: ${JSON.stringify({ type: 'start' })}\n\n`;
          controller.enqueue(encoder.encode(startEvent));
          
          let fullContent = '';
          
          // 调用流式DeepSeek API
          for await (const chunk of streamDeepSeekChat({
            messages,
            temperature: 0.7,
            maxTokens: 8192
          })) {
            fullContent += chunk;
            
            // 发送内容块
            const contentEvent = `data: ${JSON.stringify({ 
              type: 'content', 
              content: chunk 
            })}\n\n`;
            controller.enqueue(encoder.encode(contentEvent));
          }
          
          // 保存对话历史
          if (conversationId) {
            // 先添加用户消息
            globalConversationMemory.addToHistory(conversationId, 'user', message);

            // 将数据库信息添加到AI回复的末尾（隐藏格式，用户不可见，但LLM可以读取）
            let assistantMessage = fullContent;
            if (databaseInfo) {
              assistantMessage += `\n\n<!-- DATABASE_INFO: ${JSON.stringify(databaseInfo)} -->`;
              console.log('[Chat Stream API] 已将数据库信息添加到AI回复中');
            }

            // 再添加AI回复
            globalConversationMemory.addToHistory(conversationId, 'assistant', assistantMessage);
          }
          
          // 解析完整响应
          const parsedResponse = (smartProcessor as any).parseLLMResponse(fullContent);
          
          // 发送结束标记
          const endEvent = `data: ${JSON.stringify({ 
            type: 'end',
            intent: parsedResponse.intent,
            suggestions: parsedResponse.suggestions,
            followUpQuestions: parsedResponse.followUpQuestions,
            metadata: {
              inputType: processedInput.type,
              confidence: parsedResponse.confidence || 0.9
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(endEvent));
          
          console.log('[Chat Stream API] 流式生成完成');
          
        } catch (error) {
          console.error('[Chat Stream API] 流式生成错误:', error);
          
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error', 
            error: error instanceof Error ? error.message : '未知错误'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      }
    });
    
    // 返回SSE响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked'
      }
    });
    
  } catch (error) {
    console.error('[Chat Stream API] 请求处理失败:', error);
    return new Response(JSON.stringify({ 
      error: '处理请求时发生错误',
      message: error instanceof Error ? error.message : '未知错误'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
