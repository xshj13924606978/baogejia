import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '@/lib/logger';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  Logger.info('[Messages] POST 保存消息');

  try {
    const user = await getCurrentUser(request);
    if (!user) {
      Logger.error('[Messages] 用户未认证');
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const body = await request.json();
    Logger.debug('[Messages] 收到数据', {
      conversationId: body.conversationId,
      role: body.role,
      contentLength: body.content?.length || 0,
      hasQuoteData: !!body.quoteData,
      fileCount: body.files?.length || 0,
    });

    const { conversationId, role, content, quoteData, files } = body;

    if (!conversationId || !role) {
      Logger.error('[Messages] 缺少必要参数', { conversationId, role });
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
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
    const messageData = {
      conversation_id: conversationId,
      role: role,
      content: content || '',
      quote_data: quoteData || null,
      file_data: processedFiles,
      created_at: new Date().toISOString(),
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
      return NextResponse.json({ error: '保存失败', details: error.message }, { status: 500 });
    }

    Logger.info('[Messages] 保存成功', { messageId: data.id });

    return NextResponse.json({
      success: true,
      message: data,
    });
  } catch (error) {
    Logger.error('[Messages] 异常', error);
    return NextResponse.json({ error: '服务器错误', details: String(error) }, { status: 500 });
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
    const user = await getCurrentUser(request);
    if (!user) {
      Logger.error('[Messages] 用户未认证');
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
    const user = await getCurrentUser(request);
    if (!user) {
      Logger.error('[Messages] 用户未认证');
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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

    Logger.info('[Messages] PATCH 更新成功', { dbMessageId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    Logger.error('[Messages] PATCH 异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
