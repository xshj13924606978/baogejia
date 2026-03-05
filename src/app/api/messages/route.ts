import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  console.log('[Messages] POST 保存消息');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const body = await request.json();
    console.log('[Messages] 收到数据:', JSON.stringify(body, null, 2));
    
    const { conversationId, role, content, quoteData, files } = body;

    if (!conversationId || !role) {
      console.error('[Messages] 缺少必要参数:', { conversationId, role });
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 先检查对话是否存在
    const { data: conversation, error: checkError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .single();

    if (checkError || !conversation) {
      console.error('[Messages] 对话不存在:', conversationId);
      return NextResponse.json(
        { error: '对话不存在' },
        { status: 404 }
      );
    }

    // 确保文件数据是数组
    const fileData = Array.isArray(files) ? files : [];
    
    // 处理文件数据，确保关键字段存在
    const processedFiles = fileData.map(file => ({
      id: file.id || `file-${Date.now()}-${Math.random()}`,
      name: file.name || file.fileName || '未知文件',
      size: file.size || '0 B',
      type: file.type || 'application/octet-stream',
      url: file.url || '',
      fileKey: file.fileKey || ''
    }));

    // 准备要插入的数据
    const messageData = {
      conversation_id: conversationId,
      role: role,
      content: content || '',
      quote_data: quoteData || null,
      file_data: processedFiles,
      created_at: new Date().toISOString()
    };

    console.log('[Messages] 插入数据:', JSON.stringify(messageData, null, 2));

    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (error) {
      console.error('[Messages] 插入失败:', error);
      return NextResponse.json(
        { error: '保存失败', details: error.message },
        { status: 500 }
      );
    }

    console.log('[Messages] 保存成功:', data.id);

    return NextResponse.json({ 
      success: true,
      message: data 
    });
  } catch (error) {
    console.error('[Messages] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误', details: String(error) },
      { status: 500 }
    );
  }
}

// 获取对话的消息
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json(
      { error: '缺少 conversationId 参数' },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Messages] 查询失败:', error);
      return NextResponse.json(
        { error: '查询失败' },
        { status: 500 }
      );
    }

    // 确保返回的消息中包含文件数据
    const messages = (data || []).map(msg => ({
      ...msg,
      file_data: msg.file_data || []
    }));

    console.log('[Messages] 返回消息数量:', messages.length);
    if (messages.length > 0) {
      console.log('[Messages] 第一条消息文件数据:', messages[0].file_data);
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[Messages] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
