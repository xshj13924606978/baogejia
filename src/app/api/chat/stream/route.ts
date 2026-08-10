export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import { aiClient } from '@/lib/deepseek-client';
import { InputProcessor } from '@/lib/input-processor';
import { smartChatProcessor } from '@/lib/smart-chat-processor';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';
import { searchWeb, formatSearchResult } from '@/lib/web-search';
import { processWithIntent, formatProductsAsContext } from '@/lib/intent-pipeline';
import { buildSupplierContext, buildCustomerContext } from '@/lib/inject-business-info';
import { autoSelectModel } from '@/lib/models';

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
      .limit(20);

    if (error) {
      console.error('[Chat Stream API] 加载对话历史失败:', error);
      return [];
    }

    return (data || []).map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
  } catch (error) {
    console.error('[Chat Stream API] 加载对话历史异常:', error);
    return [];
  }
}

// 全局对话记忆（用于维持上下文）
// 添加 TTL 机制：每个对话 30 分钟无活动自动清理，防止内存泄漏
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 分钟

const globalConversationMemory = {
  histories: new Map<string, { role: 'user' | 'assistant'; content: string }[]>(),
  lastAccess: new Map<string, number>(),

  _cleanup() {
    const now = Date.now();
    for (const [id, ts] of this.lastAccess) {
      if (now - ts > MEMORY_TTL_MS) {
        this.histories.delete(id);
        this.lastAccess.delete(id);
      }
    }
  },

  addToHistory(conversationId: string, role: 'user' | 'assistant', content: string) {
    // 每100次操作执行一次清理
    if (Math.random() < 0.01) this._cleanup();

    if (!this.histories.has(conversationId)) {
      this.histories.set(conversationId, []);
    }
    this.histories.get(conversationId)!.push({ role, content });
    this.lastAccess.set(conversationId, Date.now());

    // 限制历史长度
    const history = this.histories.get(conversationId)!;
    if (history.length > 20) {
      this.histories.set(conversationId, history.slice(-20));
    }
  },

  getHistory(conversationId: string) {
    this.lastAccess.set(conversationId, Date.now());
    return this.histories.get(conversationId) || [];
  }
};

export async function POST(request: NextRequest) {
  try {
    // 0. 获取当前用户（用于计费）
    let userId: string | null = null;
    let userRole: string | null = null;
    try {
      const currentUser = await getCurrentUser(request);
      if (currentUser && currentUser.id) {
        userId = currentUser.id; // 保持 UUID 字符串格式
        userRole = currentUser.role || null;
      }
    } catch (error) {
      console.error('[Chat Stream API] 获取用户信息失败:', error);
    }

    // 管理员（super_admin / admin）不受积分限制
    const isAdmin = userRole === 'super_admin' || userRole === 'admin';

    // 1. 解析请求
    const body = await request.json();
    const { message, conversationId, model: requestModel, customerId } = body;

    // 自动路由：当 model 为 "auto" 或未指定时，根据用户问题自动选择模型
    const model = (!requestModel || requestModel === 'auto')
      ? autoSelectModel(message).model
      : requestModel;

    if (!message) {
      return new Response(JSON.stringify({ error: '请提供消息内容' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1.5. 积分预检查（如果有用户且非管理员）
    let estimatedInputTokens = 0;
    let estimatedRequiredPoints = 0;
    if (userId && !isAdmin) {
      try {
        // 估算输入Token
        estimatedInputTokens = pointsService.countTokens(message);
        // 估算总Token（输入+预估输出）
        const estimatedTotalTokens = estimatedInputTokens + 500; // 预估输出500 token
        estimatedRequiredPoints = await pointsService.calculatePointsForTokens(userId, estimatedTotalTokens);

        const hasEnough = await pointsService.checkPointsBalance(userId, estimatedRequiredPoints);
        if (!hasEnough) {
          const pointsInfo = await pointsService.getUserPoints(userId);
          return new Response(
            JSON.stringify({
              error: '积分不足',
              message: '您的积分不足，请充值后继续使用',
              required: estimatedRequiredPoints,
              balance: pointsInfo?.points
            }),
            {
              status: 402,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      } catch (error) {
        console.error('[Chat Stream API] 积分预检查失败:', error);
        // 积分检查失败时不阻断服务，允许继续
      }
    }

    // 2. 处理输入
    const inputProcessor = new InputProcessor();
    const processedInput = await inputProcessor.process({
      type: 'text',
      content: message
    });

    // 3. 构建对话历史 - 优先从数据库加载
    let history: any[] = [];
    if (conversationId) {
      // 先检查全局内存中是否有历史记录
      history = globalConversationMemory.getHistory(conversationId);

      // 如果全局内存中没有历史，尝试从数据库加载
      if (history.length === 0) {
        history = await loadConversationHistory(conversationId);

        // 将加载的历史同步到全局内存
        if (history.length > 0) {
          history.forEach((msg) => {
            globalConversationMemory.addToHistory(conversationId, msg.role, msg.content);
          });
        }
      }

    }

    // 3.5 意图管道（统一入口）
    let enhancedMessage = message;
    let priceMatchedProducts: any[] | undefined;
    let priceBrandCompareData: any[] | undefined;
    let extractedProductType = '';
    let matchLevel: string | undefined;
    try {
      const intentPipelineResult = await processWithIntent(message);
      extractedProductType = intentPipelineResult?.intent?.entities?.productType || '';
      matchLevel = intentPipelineResult?.matchLevel;

      if (intentPipelineResult.source === 'intent' && intentPipelineResult.products.length > 0) {
        enhancedMessage += formatProductsAsContext(intentPipelineResult, message);

        // 去重后构建卡片数据
        const seen = new Set<string>();
        const deduped = intentPipelineResult.products.filter((p: any) => {
          const key = `${p.brand || ''}|${p.model || ''}|${p.parameterDescription || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        priceBrandCompareData = deduped.map((p: any, i: number) => ({
          brand: p.brand || '',
          productName: p.name || '',
          model: p.model || '',
          price: p.price > 0 ? p.price : p.minPrice,
          minPrice: p.minPrice || undefined,
          costPrice: p.costPrice || undefined,
          guidePrice: p.price > 0 ? p.price : undefined,
          confidence: p.matchType === 'exact' ? 0.95 : p.matchType === 'partial' ? 0.85 : p.matchType === 'fuzzy' ? 0.75 : 0.60,
          rating: 5,
          quoteCount: 1,
          tags: p.matchType === 'recommend' ? ['推荐产品'] : p.matchType === 'fuzzy' ? ['相近匹配'] : p.matchType === 'partial' ? ['部分匹配'] : [],
          isRecommended: i === 0,
          source: 'database',
          parameterDescription: p.parameterDescription || '',
          matchType: p.matchType || 'exact',
          matchLevel: p.matchType || 'exact',
          isFallback: p.matchType === 'fuzzy' || p.matchType === 'recommend',
          matchDetails: p.matchDetails || p.missingConditions || undefined,
        }));

        priceMatchedProducts = deduped.map((p: any) => ({
          brand: p.brand || '',
          model: p.model || '',
          price: p.price,
          minPrice: p.minPrice,
          costPrice: p.costPrice,
          confidence: p.matchType === 'exact' ? 0.95 : p.matchType === 'partial' ? 0.85 : p.matchType === 'fuzzy' ? 0.75 : 0.60,
          isRecommended: false,
          source: 'database',
          matchLevel: p.matchType || 'exact',
          matchedBy: 'intent',
          matchType: p.matchType || 'exact',
          parameters: p.parameterDescription || '',
        }));

      }
    } catch (error) {
      console.error('[Chat Stream API] 意图管道失败:', error);
    }

    // 4.6 智能判断是否需要联网搜索
    // 不需要搜索的场景：问候、知识性问题、产品库查询、生成任务
    const noSearchPatterns = [
      /^(你好|hello|hi|hey|谢谢|thanks|再见|bye|ok|好的|嗯|嗯嗯|是|不是|对|错|收到|明白)$/i,
      /^你是谁|^.+是什么|解释|说明/,
      /多少钱|报价|价格|成本/,
      /生成报价单|生成方案|帮我写/,
    ];
    // 需要实时信息的关键词
    const needSearchKeywords = [
      '最新', '今天', '现在', '当前', '行情', '价格走势',
      '新闻', '报道', '2024', '2025', '2026',
      '市场', '趋势', '对比', '排名',
    ];

    let needsWebSearch = false;
    if (!noSearchPatterns.some(p => p.test(message.trim())) && message.trim().length >= 4) {
      needsWebSearch = needSearchKeywords.some(kw => message.includes(kw));
    }

    // 5. 定义智能处理器
    const smartProcessor = smartChatProcessor;

    // 6. 构建系统提示词和消息
    let systemPrompt = smartChatProcessor.buildSystemPrompt(processedInput);

    // 6.1 注入商务信息（供应方）和客户信息（采购方）到 system prompt
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // 获取商务信息（供应方）- 优先取默认供应方
      const { data: defaultSupplier } = await supabase
        .from('suppliers')
        .select('company_name,contact_person,phone,email,address,tax_number,bank_name,bank_account')
        .eq('metadata->>is_default', 'true')
        .limit(1)
        .maybeSingle();

      const supplier = defaultSupplier || (await supabase
        .from('suppliers')
        .select('company_name,contact_person,phone,email,address,tax_number,bank_name,bank_account')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      ).data;

        if (supplier) {
          const supplierCtx = buildSupplierContext({
            companyName: supplier.company_name,
            contactPerson: supplier.contact_person,
            phone: supplier.phone,
            email: supplier.email,
            companyAddress: supplier.address,
            taxNumber: supplier.tax_number,
            bankName: supplier.bank_name,
            bankAccount: supplier.bank_account,
          });
          if (supplierCtx) {
            systemPrompt += '\n' + supplierCtx;
          }
        } else {
          // 没有供应方
        }

      // 获取客户信息（采购方）
      if (customerId) {
        const { data: customer } = await supabase
          .from('customers')
          .select('company_name,contact_person,phone,email,address,project_name')
          .eq('id', customerId)
          .single();

        if (customer) {
          const customerCtx = buildCustomerContext({
            companyName: customer.company_name,
            contactPerson: customer.contact_person,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            projectName: customer.project_name,
          });
          if (customerCtx) {
            systemPrompt += '\n' + customerCtx;
          }
        }
      } else {
        systemPrompt += '\n【注意】当前未选择客户，生成报价单时请先询问客户的名称、联系人、电话等信息。';
      }
    } catch (err) {
      console.error('[Chat Stream API] 注入商务/客户信息失败（非致命）:', err);
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content: enhancedMessage },
    ];

    // 7. 创建SSE流式响应
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const onAbort = () => {
          try { controller.close(); } catch {}
        };
        request.signal.addEventListener('abort', onAbort, { once: true });

        try {
          // 发送开始标记
          const startEvent = `data: ${JSON.stringify({ type: 'start' })}\n\n`;
          controller.enqueue(encoder.encode(startEvent));

          // === 联网搜索阶段 ===
          let webSearchUsed = false;
          if (needsWebSearch && !request.signal.aborted) {
            const searchingEvent = `data: ${JSON.stringify({
              type: 'searching',
              message: '正在联网搜索相关信息...'
            })}\n\n`;
            controller.enqueue(encoder.encode(searchingEvent));

            try {
              const searchResult = await Promise.race([
                searchWeb(message),
                new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error('搜索超时')), 25000)
                ),
              ]);
              if (searchResult && searchResult.items.length > 0) {
                webSearchUsed = true;
                const formatted = formatSearchResult(searchResult);
                enhancedMessage += `\n\n【联网搜索结果（参考信息）】\n${formatted}\n\n注意：以上信息来自联网搜索，仅供参考。`;
              }
            } catch (searchError) {
              console.error('[Chat Stream API] 联网搜索失败:', searchError);
            }

            if (webSearchUsed) {
              const searchDoneEvent = `data: ${JSON.stringify({
                type: 'search_done',
                message: '搜索完成'
              })}\n\n`;
              controller.enqueue(encoder.encode(searchDoneEvent));
            }
          }
          // === 联网搜索阶段结束 ===

          let fullContent = '';

          // 调用流式AI API（支持 DeepSeek / Gemini）
          for await (const chunk of aiClient.streamChat({
            messages,
            temperature: 0.7,
            maxTokens: 8192,
            model: model || 'deepseek',
            signal: request.signal,
          })) {
            if (request.signal.aborted) break;
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

            // 将数据库信息添加到AI回复的末尾（隐藏格式）
            let assistantMessage = fullContent;
            if (priceBrandCompareData && priceBrandCompareData.length > 0) {
              assistantMessage += `\n\n<!-- DATABASE_INFO: ${JSON.stringify(priceBrandCompareData)} -->`;
            }

            // 扣除积分（如果有用户且非管理员）- 使用统一的 pointsService
            if (userId && !isAdmin) {
              try {
                // 计算实际 Token 消耗
                const cleanContent = assistantMessage.replace(/<!-- DATABASE_INFO:.*?-->/g, '');
                const inputTokens = pointsService.countTokens(message);
                const outputTokens = pointsService.countTokens(cleanContent);
                const totalTokens = inputTokens + outputTokens;

                // 使用 pointsService 扣除积分
                const result = await pointsService.consumeTokens(
                  userId,
                  totalTokens,
                  conversationId,
                  `msg_${Date.now()}`
                );

                if (result.success) {
                  // 发送积分扣减通知给前端
                  const pointsInfo = await pointsService.getUserPoints(userId);
                  const pointsEvent = `data: ${JSON.stringify({
                    type: 'points_consumed',
                    pointsConsumed: result.pointsConsumed,
                    newBalance: pointsInfo?.points || 0,
                    tokensUsed: totalTokens
                  })}\n\n`;
                  controller.enqueue(encoder.encode(pointsEvent));
                } else {
                  console.error('[Chat Stream API] 扣除积分失败:', result.reason);
                }
              } catch (error) {
                console.error('[Chat Stream API] 扣除积分异常:', error);
              }
            }

            // 再添加AI回复
            globalConversationMemory.addToHistory(conversationId, 'assistant', assistantMessage);
          }

          // 解析完整响应
          const parsedResponse = smartProcessor.parseLLMResponse(fullContent);

          // 发送结束标记
          const endEvent = `data: ${JSON.stringify({
            type: 'end',
            intent: parsedResponse.intent,
            suggestions: parsedResponse.suggestions,
            followUpQuestions: parsedResponse.followUpQuestions,
            metadata: {
              inputType: processedInput.type,
              confidence: parsedResponse.confidence || 0.9,
              entities: {
                webSearchUsed,
                productType: extractedProductType,
                brandCompare: priceBrandCompareData,
                matchLevel,
                matchedProducts: priceMatchedProducts?.map((p: any) => ({
                  brand: p.brand,
                  model: p.model,
                  price: p.price,
                  minPrice: p.minPrice,
                  costPrice: p.costPrice,
                  confidence: p.confidence,
                  isRecommended: p.isRecommended,
                  source: p.source,
                  tags: p.matchType === 'recommend' ? ['推荐产品'] : p.matchType === 'fuzzy' ? ['相近匹配'] : p.matchType === 'partial' ? ['部分匹配'] : [],
                  matchLevel: p.matchLevel,
                  matchedBy: p.matchedBy,
                  matchType: p.matchType || null,
                  parameters: p.parameters,
                })),
              },
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(endEvent));

        } catch (error) {
          console.error('[Chat Stream API] 流式生成错误:', error);

          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : '未知错误'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          request.signal.removeEventListener('abort', onAbort);
          controller.close();
        }
      }
    });

    // 返回SSE响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked'
      }
    });
  } catch (error) {
    console.error('[Chat Stream API] 请求处理失败:', error);
    return new Response(
      JSON.stringify({
        error: '处理请求时发生错误',
        message: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
