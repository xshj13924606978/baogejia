export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { Logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth-utils';
import { generateQuoteNumber } from '@/lib/inject-business-info';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 将消息中的报价数据同步写入 quotes 表（报价单列表数据源）。
 * 通过 metadata->>message_id 幂等：同一消息只创建一张报价单，后续编辑仅更新。
 */
async function syncQuoteToQuotesTable(
  supabase: any,
  params: {
    user: { id: string };
    conversationId: string;
    messageId: string;
    quoteData: any;
  }
) {
  const { user, conversationId, messageId, quoteData } = params;
  const products = Array.isArray(quoteData?.products) ? quoteData.products : [];
  if (products.length === 0) return;

  const quoteNumber = quoteData.quoteNumber || generateQuoteNumber();

  // 查重：同一消息（metadata->>message_id）只对应一张报价单
  const { data: existing } = await supabase
    .from('quotes')
    .select('id')
    .eq('metadata->>message_id', messageId)
    .maybeSingle();

  const record = {
    quote_number: quoteNumber,
    user_id: user.id,
    conversation_id: conversationId,
    products,
    subtotal: quoteData.subtotal ?? 0,
    tax_rate: quoteData.taxRate ?? 13,
    tax_amount: quoteData.taxAmount ?? 0,
    discount_rate: quoteData.discountRate ?? 0,
    discount_amount: quoteData.discountAmount ?? 0,
    total_amount: quoteData.totalAmount ?? 0,
    supplier_info: quoteData.supplierInfo || {},
    customer_info: quoteData.customerInfo || {},
    terms: quoteData.terms || {},
    status: 'draft',
    version: 1,
    valid_until: quoteData.validUntil || null,
    metadata: { message_id: messageId, source: 'chat' },
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        quote_number: quoteNumber,
        products,
        subtotal: quoteData.subtotal ?? 0,
        tax_rate: quoteData.taxRate ?? 13,
        tax_amount: quoteData.taxAmount ?? 0,
        discount_rate: quoteData.discountRate ?? 0,
        discount_amount: quoteData.discountAmount ?? 0,
        total_amount: quoteData.totalAmount ?? 0,
        supplier_info: quoteData.supplierInfo || {},
        customer_info: quoteData.customerInfo || {},
        terms: quoteData.terms || {},
        valid_until: quoteData.validUntil || null,
        metadata: { message_id: messageId, source: 'chat' },
      })
      .eq('id', existing.id);
    if (updateError) {
      Logger.error('[Messages] 同步更新报价单失败（非致命）', updateError);
    }
    return;
  }

  const { error: insertError } = await supabase.from('quotes').insert(record);
  if (insertError) {
    Logger.error('[Messages] 同步创建报价单失败（非致命）', insertError);
  }
}

export async function POST(request: NextRequest) {
  Logger.info('[Messages] POST 保存消息');

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      Logger.error('[Messages] 请求体解析失败', parseError);
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
    }

    const { conversationId, role, content, quoteData, files, metadata } = body;

    if (!conversationId || !role) {
      Logger.error('[Messages] 缺少必要参数', { conversationId, role });
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = getSupabaseServiceClient();
    } catch (dbError) {
      Logger.error('[Messages] 数据库客户端初始化失败', dbError);
      return NextResponse.json(
        { error: '数据库服务暂不可用', details: dbError instanceof Error ? dbError.message : String(dbError) },
        { status: 500 }
      );
    }

    // 先检查对话是否存在，不存在则自动创建
    const { data: conversationData, error: checkError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .single();

    let conversation = conversationData;

    if (checkError || !conversation) {
      // 对话不存在，自动创建
      Logger.info('[Messages] 对话不存在，自动创建', { conversationId });

      const now = new Date().toISOString();
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          id: conversationId,
          title: '新对话',
          user_id: user.id,
          last_message: content?.substring(0, 100) || '',
          status: 'active',
          updated_at: now,
          created_at: now,
        })
        .select()
        .single();

      if (createError || !newConv) {
        Logger.error('[Messages] 创建对话失败', createError);
        return NextResponse.json(
          { error: '对话不存在且创建失败', details: createError?.message },
          { status: 500 }
        );
      }

      conversation = newConv;
      Logger.info('[Messages] 对话创建成功', { conversationId });
    } else {
      // 权限检查：非超管/管理员只能向自己的对话发送消息
      if (user.role !== 'super_admin' && user.role !== 'admin' && conversation.user_id !== user.id) {
        Logger.error('[Messages] 无权向此对话发送消息', { conversationId });
        return NextResponse.json({ error: '无权操作' }, { status: 403 });
      }
    }

    // 确保文件数据是数组
    const fileData = Array.isArray(files) ? files : [];

    // 处理文件数据，确保关键字段存在
    const processedFiles = fileData.map((file) => ({
      id: file.id || `file-${Date.now()}-${Math.random()}`,
      name: file.name || file.fileName || '未知文件',
      size: file.size || '0 B',
      type: file.type || 'application/octet-stream',
      url: file.url || '',
      fileKey: file.fileKey || '',
    }));

    // 准备要插入的数据
    const now = new Date().toISOString();
    const messageData = {
      conversation_id: conversationId,
      role: role,
      content: content || '',
      quote_data: quoteData || null,
      file_data: processedFiles,
      metadata: metadata || null,
      created_at: now,
    };

    Logger.debug('[Messages] 插入数据', {
      conversationId,
      role,
      contentLength: content?.length || 0,
      hasQuoteData: !!quoteData,
      fileCount: processedFiles.length,
    });

    const { data, error } = await supabase.from('messages').insert(messageData).select().single();

    if (error) {
      Logger.error('[Messages] 插入失败', error);
      return NextResponse.json({ error: '保存失败', details: safeErrorMessage(error) }, { status: 500 });
    }

    // 消息保存成功后，回写会话的最新消息和更新时间
    try {
      await supabase
        .from('conversations')
        .update({
          last_message: content?.substring(0, 100) || '',
          updated_at: now,
        })
        .eq('id', conversationId);
    } catch (convUpdateError) {
      // 非关键操作，仅记录日志
      Logger.error('[Messages] 更新会话失败（非致命）', convUpdateError);
    }

    // 消息带报价数据时，同步写入 quotes 表（报价单列表数据源）
    if (quoteData && typeof quoteData === 'object') {
      try {
        await syncQuoteToQuotesTable(supabase, {
          user,
          conversationId,
          messageId: data.id,
          quoteData,
        });
      } catch (quoteSyncError) {
        Logger.error('[Messages] 同步报价单失败（非致命）', quoteSyncError);
      }
    }

    Logger.info('[Messages] 保存成功', { messageId: data.id });

    return NextResponse.json({
      success: true,
      message: data,
    });
  } catch (error) {
    Logger.error('[Messages] 异常', error);
    return NextResponse.json(
      { error: error instanceof Error ? safeErrorMessage(error) : '服务器错误' },
      { status: 500 }
    );
  }
}

// 获取对话的消息
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: '缺少 conversationId 参数' }, { status: 400 });
  }

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();

    // 权限检查：非超管/管理员只能获取自己对话的消息
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('user_id')
        .eq('id', conversationId)
        .single();
      if (conversation && conversation.user_id !== user.id) {
        Logger.error('[Messages] 无权获取此对话的消息', { conversationId });
        return NextResponse.json({ error: '无权访问' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      Logger.error('[Messages] 查询失败', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 确保返回的消息中包含文件数据
    const messages = (data || []).map((msg) => ({
      ...msg,
      file_data: msg.file_data || [],
    }));

    Logger.debug('[Messages] 返回消息', { conversationId, count: messages.length });

    return NextResponse.json({ messages });
  } catch (error) {
    Logger.error('[Messages] 异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新消息的 quote_data 字段
export async function PATCH(request: NextRequest) {
  Logger.info('[Messages] PATCH 更新消息');

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();

    const body = await request.json();
    const { quoteData, conversationId, role, contentPrefix } = body;

    if (!conversationId || !contentPrefix) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 权限检查：非超管/管理员只能更新自己对话的消息
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('user_id')
        .eq('id', conversationId)
        .single();

      if (conversation && conversation.user_id !== user.id) {
        Logger.error('[Messages] 无权更新此对话的消息', { conversationId });
        return NextResponse.json({ error: '无权操作' }, { status: 403 });
      }
    }

    // 通过 conversation_id + role + 内容前缀定位消息（前端 ID 为时间戳，与数据库 UUID 不匹配）
    const { data: matchedMessages, error: findError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('role', role || 'assistant')
      .ilike('content', contentPrefix + '%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError || !matchedMessages || matchedMessages.length === 0) {
      Logger.error('[Messages] 未找到匹配的消息', { conversationId, role, contentPrefix: contentPrefix.substring(0, 50) });
      return NextResponse.json({ error: '消息未找到' }, { status: 404 });
    }

    const dbMessageId = matchedMessages[0].id;

    const { data, error } = await supabase
      .from('messages')
      .update({ quote_data: quoteData })
      .eq('id', dbMessageId)
      .select()
      .single();

    if (error) {
      Logger.error('[Messages] PATCH 更新失败', error);
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    // 消息 quote_data 更新后，同步更新 quotes 表
    if (quoteData && typeof quoteData === 'object') {
      try {
        await syncQuoteToQuotesTable(supabase, {
          user,
          conversationId,
          messageId: dbMessageId,
          quoteData,
        });
      } catch (quoteSyncError) {
        Logger.error('[Messages] PATCH 同步报价单失败（非致命）', quoteSyncError);
      }
    }

    Logger.info('[Messages] PATCH 更新成功', { dbMessageId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    Logger.error('[Messages] PATCH 异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
