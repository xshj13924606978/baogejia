import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content || '';

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:3b',
        prompt: lastMessage,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 2048,
        },
      }),
      signal: req.signal, // 响应客户端断开
    });

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        // 响应客户端断开
        const onAbort = () => {
          reader.cancel();
          try { controller.close(); } catch {}
        };
        req.signal.addEventListener('abort', onAbort, { once: true });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  controller.enqueue(encoder.encode(data.response));
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        } catch (e) {
          // 客户端断开或读取错误，不再继续
        } finally {
          req.signal.removeEventListener('abort', onAbort);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Gemma API error:', error);
    return NextResponse.json({ error: 'Gemma 调用失败' }, { status: 500 });
  }
}
