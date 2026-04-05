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

    console.log('[Chat Stream API] 加载对话历史:', { conversationId, count: data?.length || 0 });
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

    // 0. 获取当前用户（用于计费）
    let userId: string | null = null;
    try {
      const currentUser = await getCurrentUser(request);
      if (currentUser && currentUser.id) {
        userId = currentUser.id; // 保持 UUID 字符串格式
        console.log('[Chat Stream API] 用户ID:', userId);
      }
    } catch (error) {
      console.error('[Chat Stream API] 获取用户信息失败:', error);
    }

    // 1. 解析请求
    const body = await request.json();
    const { message, conversationId, model, customerId } = body;

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

    // 1.5. 积分预检查（如果有用户）
    let estimatedInputTokens = 0;
    let estimatedRequiredPoints = 0;
    if (userId) {
      try {
        // 估算输入Token
        estimatedInputTokens = pointsService.countTokens(message);
        // 估算总Token（输入+预估输出）
        const estimatedTotalTokens = estimatedInputTokens + 500; // 预估输出500 token
        estimatedRequiredPoints = await pointsService.calculatePointsForTokens(userId, estimatedTotalTokens);

        const hasEnough = await pointsService.checkPointsBalance(userId, estimatedRequiredPoints);
        if (!hasEnough) {
          const pointsInfo = await pointsService.getUserPoints(userId);
          console.log('[Chat Stream API] 积分不足:', {
            userId,
            required: estimatedRequiredPoints,
            balance: pointsInfo?.points
          });
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
        console.log('[Chat Stream API] 积分预检查通过:', {
          estimatedInputTokens,
          estimatedRequiredPoints
        });
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
        console.log('[Chat Stream API] 全局内存无历史，从数据库加载');
        history = await loadConversationHistory(conversationId);

        // 将加载的历史同步到全局内存
        if (history.length > 0) {
          history.forEach((msg) => {
            globalConversationMemory.addToHistory(conversationId, msg.role, msg.content);
          });
        }
      }

      console.log('[Chat Stream API] 对话历史:', { conversationId, historyCount: history.length });
    }

    // 3.5. 意图理解 + 语义搜索（增强上下文 + 过滤卡片数据）
    let enhancedMessage = message;
    let databaseInfo: any = null;
    let priceMatchedProducts: any[] | undefined;
    let priceBrandCompareData: any[] | undefined;
    let extractedProductType = '';
    let intentProducts: any[] = []; // 保存意图管道结果用于过滤卡片
    try {
      const intentPipelineResult = await processWithIntent(message);
      extractedProductType = intentPipelineResult?.intent?.entities?.productType || '';
      if (intentPipelineResult.source === 'intent' && intentPipelineResult.products.length > 0) {
        enhancedMessage += formatProductsAsContext(intentPipelineResult, message);
        intentProducts = intentPipelineResult.products;
        console.log('[Chat Stream API] 意图理解层命中，找到', intentPipelineResult.products.length, '个产品，已增强上下文');
      }
    } catch (error) {
      console.error('[Chat Stream API] 意图理解层失败，降级:', error);
    }

    // 4. 价格查询预处理（对比卡片数据源）
    try {
      const priceQuery = await (smartChatProcessor as any).detectPriceQuery(message);
      console.log('[Chat Stream API] detectPriceQuery结果:', JSON.stringify({ isPriceQuery: priceQuery.isPriceQuery, productName: priceQuery.productName, model: priceQuery.model }));
      if (priceQuery.isPriceQuery && priceQuery.productName) {
        console.log('[Chat Stream API] 检测到价格查询:', priceQuery);
        const priceResult = await (smartChatProcessor as any).handlePriceQuery(
          priceQuery.productName,
          priceQuery.model,
          priceQuery.extraction?.parameter_description
        );
        if (priceResult.priceData) {
          databaseInfo = {
            productName: priceResult.priceData.productName,
            model: priceResult.priceData.model,
            price: priceResult.priceData.price,
            brand: priceResult.priceData.brand,
            parameterDescription: priceResult.priceData.parameterDescription,
            costPrice: priceResult.priceData.costPrice,
            minPrice: priceResult.priceData.minPrice,
          };
          // 保存匹配产品列表用于前端卡片展示
          priceMatchedProducts = priceResult.priceData?.matchedProducts;
          priceBrandCompareData = priceResult.brandCompareData;
          console.log('[Chat Stream API] 已保存数据库信息:', databaseInfo);
          console.log('[Chat Stream API] 匹配产品数:', priceMatchedProducts?.length, '品牌对比数:', priceBrandCompareData?.length);
        }
        if (priceResult.contextInfo) {
          enhancedMessage += priceResult.contextInfo;
          console.log('[Chat Stream API] 已添加价格查询结果到上下文:', priceResult.contextInfo);
        }
      }
    } catch (error) {
      console.error('[Chat Stream API] 价格查询失败:', error);
    }

    // 4.5 意图管道结果直接构建卡片数据（彻底解决旧管道查询不全的根因）
    // 当意图管道有结果时，直接用其产品列表生成卡片，绕过旧管道的查询限制
    if (intentProducts.length > 0) {
      const exactProducts = intentProducts.filter((p: any) => p.matchType === 'exact');
      const closeProducts = intentProducts.filter((p: any) => p.matchType === 'close');

      // 从意图管道产品直接构建卡片数据
      priceBrandCompareData = intentProducts.map((p: any, i: number) => ({
        brand: p.brand || '',
        productName: p.name || '',
        model: p.model || '',
        price: p.minPrice > 0 ? p.minPrice : p.price,
        minPrice: p.minPrice || undefined,
        costPrice: p.costPrice || undefined,
        confidence: p.matchType === 'exact' ? 0.95 : 0.70,
        rating: 5,
        quoteCount: 1,
        tags: [],
        isRecommended: i === 0,
        source: 'database',
        parameterDescription: p.parameterDescription || '',
        matchType: p.matchType || 'exact',
        isFallback: p.matchType === 'close',
        matchDetails: p.matchDetails || undefined,
      }));

      // 同步构建 matchedProducts
      priceMatchedProducts = intentProducts.map((p: any) => ({
        brand: p.brand || '',
        model: p.model || '',
        price: p.price,
        minPrice: p.minPrice,
        costPrice: p.costPrice,
        confidence: p.matchType === 'exact' ? 0.95 : 0.70,
        isRecommended: false,
        source: 'database',
        matchLevel: p.matchType === 'exact' ? 'exact' : 'approximate',
        matchedBy: 'intent',
        matchType: p.matchType || 'exact',
        parameters: p.parameterDescription || '',
      }));

      console.log(`[Chat Stream API] 意图管道直接构建卡片: 精确${exactProducts.length}款, 相近${closeProducts.length}款, 共${priceBrandCompareData.length}款`);
    }

    // 4.6 标记联网搜索需求（所有非琐碎咨询）
    const trivialPattern = /^(你好|hello|hi|hey|谢谢|thanks|再见|bye|ok|好的|嗯|嗯嗯|是|不是|对|错|收到|明白)$/i;
    const isTrivial = trivialPattern.test(message.trim()) || message.trim().length < 4;
    let needsWebSearch = !isTrivial;

    // 5. 定义智能处理器
    const smartProcessor = smartChatProcessor;

    // 6. 构建系统提示词和消息
    let systemPrompt = (smartChatProcessor as any).buildSystemPrompt(processedInput);

    // 6.1 注入商务信息（供应方）和客户信息（采购方）到 system prompt
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // 获取商务信息（供应方）
      if (userId) {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('company_name,contact_person,phone,email,address,tax_number,bank_name,bank_account')
          .eq('metadata->>user_id', userId)
          .single();

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
            console.log('[Chat Stream API] 已注入供应方商务信息');
          }
        } else {
          console.log('[Chat Stream API] 未找到供应方数据, userId:', userId);
        }
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
            console.log('[Chat Stream API] 已注入客户信息:', customer.company_name);
          }
        }
      } else {
        // 没选客户时提醒 AI
        systemPrompt += '\n【注意】当前未选择客户，生成报价单时请先询问客户的名称、联系人、电话等信息。';
        console.log('[Chat Stream API] 未传入customerId，提示AI询问客户信息');
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
        try {
          console.log('[Chat Stream API] 开始流式生成...');

          // 发送开始标记
          const startEvent = `data: ${JSON.stringify({ type: 'start' })}\n\n`;
          controller.enqueue(encoder.encode(startEvent));

          // === 联网搜索阶段 ===
          let webSearchUsed = false;
          if (needsWebSearch) {
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
                console.log('[Chat Stream API] 联网搜索成功，已添加到上下文');
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

            // 将数据库信息添加到AI回复的末尾（隐藏格式）
            let assistantMessage = fullContent;
            if (databaseInfo) {
              assistantMessage += `\n\n<!-- DATABASE_INFO: ${JSON.stringify(databaseInfo)} -->`;
              console.log('[Chat Stream API] 已将数据库信息添加到AI回复中');
            }

            // 扣除积分（如果有用户）- 使用统一的 pointsService
            if (userId) {
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
                  console.log('[Chat Stream API] 扣除积分成功:', {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    pointsConsumed: result.pointsConsumed
                  });

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
          const parsedResponse = (smartProcessor as any).parseLLMResponse(fullContent);

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
                matchedProducts: priceMatchedProducts?.map((p: any) => ({
                  brand: p.brand,
                  supplier: p.supplier,
                  contactPhone: p.contactPhone,
                  model: p.model,
                  price: p.price,
                  minPrice: p.parameters?.minPrice,
                  costPrice: p.parameters?.costPrice,
                  confidence: p.confidence,
                  isRecommended: p.isRecommended,
                  source: 'database',
                  tags: p.tags || [],
                  matchLevel: p.matchLevel,
                  matchedBy: p.matchedBy,
                  matchType: p.matchType || null,
                  parameters: p.parameters,
                })),
              },
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(endEvent));

          console.log('[Chat Stream API] 流式生成完成, metadata.brandCompare数量:', priceBrandCompareData?.length || 0, ', matchedProducts数量:', priceMatchedProducts?.length || 0);
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
