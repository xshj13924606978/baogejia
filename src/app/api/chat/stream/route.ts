import { NextRequest } from 'next/server';
import { streamDeepSeekChat } from '@/lib/deepseek-client';
import { InputProcessor, ProcessedInput } from '@/lib/input-processor';
import { smartChatProcessor } from '@/lib/smart-chat-processor';

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
    
    // 3. 构建对话历史
    const history = conversationId ? globalConversationMemory.getHistory(conversationId) : [];
    
    // 4. 构建系统提示词和消息
    const smartProcessor = smartChatProcessor;
    const systemPrompt = (smartProcessor as any).buildSystemPrompt(processedInput);
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content: message }
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
            globalConversationMemory.addToHistory(conversationId, 'user', message);
            globalConversationMemory.addToHistory(conversationId, 'assistant', fullContent);
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
