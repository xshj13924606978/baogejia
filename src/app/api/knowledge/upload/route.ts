import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { processKnowledgeUpload, UploadError } from '@/lib/knowledge/upload-processor';
import { addAuditLog } from '@/lib/knowledge/audit-log';
import { ensureEntryEmbedding } from '@/lib/knowledge/embedding-service';
import { safeErrorMessage } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    // 统一认证上下文解析
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    const userId = ctx.currentUserId!;

    // 管理员上传直接上架（approved），无需进入审核队列
    const isAdmin = ['admin', 'super_admin'].includes(ctx.effectiveRole);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string) || '';
    const title = (formData.get('title') as string) || '';
    const description = (formData.get('description') as string) || '';
    const metadataStr = (formData.get('metadata') as string) || '';
    const tagsStr = (formData.get('tags') as string) || '';

    // 解析 metadata（失败回退空对象，不阻断上传）
    let metadata: Record<string, any> = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        console.warn('[Knowledge Upload] metadata JSON 解析失败，使用空对象');
      }
    }

    // 解析 tags
    const tagNames = tagsStr
      ? tagsStr
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 统一编排：校验 → 上传 → 解析降级 → 建记录 → 标签 → 日志
    const result = await processKnowledgeUpload(getSupabaseClient(), {
      userId,
      type,
      title,
      description,
      file: { name: file.name, type: file.type, buffer },
      metadata,
      tags: tagNames,
      // 管理员上传直接上架
      status: isAdmin ? 'approved' : undefined,
      requestMeta: {
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: request.headers.get('user-agent'),
      },
    });

    // 写审计日志（非阻塞）
    if (result.record?.id) {
      try {
        await addAuditLog(
          result.record.id,
          'create',
          userId,
          {
            title: result.record.title,
            type: result.record.type,
            file_name: file.name,
            status: result.record.status,
          }
        );
      } catch (logErr) {
        console.warn('[Knowledge Upload] 审计日志写入失败（不影响上传）:', logErr);
      }
    }

    // 管理员上传直接上架时触发向量化（非阻塞）
    if (isAdmin && result.record?.id) {
      try {
        await ensureEntryEmbedding(getSupabaseClient(), result.record.id);
      } catch (embErr) {
        console.warn('[Knowledge Upload] 向量化失败（不影响上传）:', embErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: result.record,
      parse: result.parse, // 解析摘要供前端展示（页数/字数/识别状态）
      message: isAdmin ? '上传成功' : '上传成功，等待审核',
    });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: safeErrorMessage(error), details: error.details ?? undefined },
        { status: error.status }
      );
    }
    console.error('[Knowledge Upload] 上传失败:', error);
    return NextResponse.json(
      {
        error: '上传失败',
        message: error instanceof Error ? safeErrorMessage(error) : '未知错误',
      },
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
