import { NextRequest, NextResponse } from 'next/server';
import {  ServerDatabaseUtils } from '@/lib/server-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';

// 知识库类型枚举
const KNOWLEDGE_TYPES = {
  PRICE: 'price', // 产品价格库
  DOCUMENT: 'document', // 技术文档库
  CASE: 'case', // 案例库
  STANDARD: 'standard', // 标准规范库
  DRAWING: 'drawing', // 图纸图片库
  QUOTA: 'quota', // 定额库
  OTHER: 'other', // 其他
};

// 允许的文件类型
const ALLOWED_MIME_TYPES = {
  // 文档
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',

  // 图片
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',

  // 压缩包
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar'};

// 文件大小限制（50MB）
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {

    // 统一认证上下文解析
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const userId = ctx.currentUserId!;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const title = formData.get('title') as string;
    const description = (formData.get('description') as string) || '';
    const metadataStr = (formData.get('metadata') as string) || '';
    const tagsStr = (formData.get('tags') as string) || '';

    // 验证必要参数
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    if (!type) {
      return NextResponse.json({ error: '请选择知识库类型' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: '请输入标题' }, { status: 400 });
    }

    // 验证知识库类型
    if (!Object.values(KNOWLEDGE_TYPES).includes(type)) {
      return NextResponse.json({ error: '无效的知识库类型' }, { status: 400 });
    }


    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过50MB' }, { status: 400 });
    }

    // 验证文件类型
    const fileExt = ALLOWED_MIME_TYPES[file.type as keyof typeof ALLOWED_MIME_TYPES];
    if (
      !fileExt &&
      !file.name.match(/\.(pdf|doc|docx|xls|xlsx|txt|csv|jpg|jpeg|png|gif|webp|zip|rar)$/i)
    ) {
      return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 });
    }

    // 解析 metadata
    let metadata: Record<string, any> = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        console.warn('[Knowledge Upload] metadata JSON 解析失败，使用空对象');
      }
    }

    // 解析 tags
    const tagNames = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    // 读取文件内容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 生成安全的文件名
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileKey = `knowledge/${type}/${userId}/${safeName}`;


    // 获取Supabase客户端
    const supabase = getSupabaseClient();

    // 上传到存储
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from('knowledge-base')
      .upload(fileKey, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false});

    if (uploadError) {
      console.error('[Knowledge Upload] 上传到存储失败:', uploadError);
      return NextResponse.json(
        { error: '上传到存储失败', details: uploadError.message },
        { status: 500 }
      );
    }

    // 获取公共URL
    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(fileKey);


    // 保存记录到数据库
    const { data: record, error: dbError } = await supabase
      .from('knowledge_entries')
      .insert({
        user_id: userId,
        type: type,
        title: title,
        description: description,
        file_name: file.name,
        file_key: fileKey,
        file_url: urlData.publicUrl,
        file_size: buffer.length,
        file_type: file.type,
        status: 'pending', // 需要审核
        metadata: metadata,
        created_at: new Date().toISOString()})
      .select()
      .single();

    if (dbError) {
      console.error('[Knowledge Upload] 保存记录失败:', dbError);

      // 如果数据库保存失败，尝试删除已上传的文件
      await supabase.storage.from('knowledge-base').remove([fileKey]);

      return NextResponse.json(
        { error: '保存记录失败', details: dbError.message },
        { status: 500 }
      );
    }


    // 处理 tags：批量查询/创建/关联
    if (tagNames.length > 0) {
      try {
        // 批量查询已有标签
        const { data: existingTags } = await supabase
          .from('knowledge_tags')
          .select('id, name')
          .in('name', tagNames);

        const existingMap = new Map(
          (existingTags || []).map((t: any) => [t.name, t.id] as [string, string])
        );

        // 找出需要创建的标签
        const toCreate = tagNames.filter(name => !existingMap.has(name));

        // 批量创建新标签
        let newTagIds: string[] = [];
        if (toCreate.length > 0) {
          const { data: createdTags } = await supabase
            .from('knowledge_tags')
            .insert(toCreate.map(name => ({ name })))
            .select('id');
          newTagIds = (createdTags || []).map((t: any) => t.id);
        }

        // 批量关联条目和标签
        const allTagIds = tagNames
          .map(name => existingMap.get(name))
          .filter((id): id is string => !!id)
          .concat(newTagIds);

        if (allTagIds.length > 0) {
          await supabase
            .from('knowledge_entry_tags')
            .insert(allTagIds.map(tagId => ({ entry_id: record.id, tag_id: tagId })));
        }
      } catch (tagErr: any) {
        console.warn('[Knowledge Upload] 标签处理失败（已忽略）:', tagErr.message);
      }
    }


    return NextResponse.json({
      success: true,
      data: record,
      message: '上传成功，等待审核'});
  } catch (error) {
    console.error('[Knowledge Upload] 上传失败:', error);
    return NextResponse.json(
      {
        error: '上传失败',
        message: error instanceof Error ? error.message : '未知错误'},
      { status: 500 }
    );
  }
}

// 获取用户上传记录
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get('userId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;


    let query = supabase.from('knowledge_entries').select('*', { count: 'exact' });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Knowledge Upload] 查询失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)}});
  } catch (error) {
    console.error('[Knowledge Upload] 获取记录失败:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}
