/**
 * 知识库统一 CRUD API（指令 2/3）
 *
 * GET    /api/knowledge/entries    列表查询（按模块、状态分页 + 关键字）
 * POST   /api/knowledge/entries    创建记录（上传完成后调用，JSON body）
 * PUT    /api/knowledge/entries    更新记录（元数据、状态等）
 * DELETE /api/knowledge/entries    删除记录（含存储文件）
 *
 * 权限：
 * - GET：未登录只看 approved；普通用户 + 自己的；admin 全量
 * - POST：需登录
 * - PUT：本人或 admin
 * - DELETE：仅 admin（#202608242100 权限矩阵：删除资料 管理员✅ 非管理员❌）
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { ensureEntryEmbedding, type EntryEmbeddingResult } from '@/lib/knowledge/embedding-service';
import { isUserAdminRole } from '@/lib/admin-role-helper';
import { safeErrorMessage } from '@/lib/error-handler';

const VALID_TYPES = ['price', 'document', 'case', 'standard', 'drawing', 'quota', 'other'];
const VALID_STATUS = ['pending', 'approved', 'rejected'];

/**
 * 管理员判定：DB 角色集驱动 + 中英文 fallback 兼容
 * 见 @/lib/admin-role-helper#loadAdminRoleCodes（real-time 从 roles 表读取）
 *
 * 保留 isAdminRole 函数名以最小化下面调用方的改动。
 */
function isAdminRole(role: string | null | undefined): boolean {
  return isUserAdminRole(role);
}

/** 列表查询（GET） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const db = getSupabaseServiceClient();
    const ctx = await resolveAuthContext(request);
    const isAdmin = isAdminRole(ctx.effectiveRole);

    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');
    const keyword = searchParams.get('keyword');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = db.from('knowledge_entries').select('*', { count: 'exact' });

    if (type && VALID_TYPES.includes(type)) query = query.eq('type', type);
    if (status && VALID_STATUS.includes(status)) query = query.eq('status', status);
    if (userId) query = query.eq('user_id', userId);
    if (keyword) {
      query = query.or(
        `title.ilike.%${keyword}%,description.ilike.%${keyword}%,file_name.ilike.%${keyword}%`
      );
    }

    // 非管理员：只看 approved + 自己的全部状态
    if (!isAdmin) {
      if (ctx.currentUserId) {
        query = query.or(`status.eq.approved,user_id.eq.${ctx.currentUserId}`);
      } else {
        query = query.eq('status', 'approved');
      }
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: false, error: '查询失败', details: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: '查询失败', details: err?.message }, { status: 500 });
  }
}

/** 创建记录（POST）——上传完成后调用 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated || !ctx.currentUserId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: '请求体解析失败' }, { status: 400 });
    }

    const { type, title, description, file_name, file_key, file_url, file_size, file_type, metadata } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: '无效的知识库类型' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ success: false, error: '请输入标题' }, { status: 400 });
    }
    if (!file_name || !file_key) {
      return NextResponse.json({ success: false, error: '缺少文件信息' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: record, error } = await db
      .from('knowledge_entries')
      .insert({
        user_id: ctx.currentUserId,
        type,
        title,
        description: description || '',
        file_name,
        file_key,
        file_url: file_url || '',
        file_size: Number(file_size) || 0,
        file_type: file_type || '',
        status: 'pending',
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: '创建失败', details: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: record, message: '创建成功，等待审核' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: '创建失败', details: err?.message }, { status: 500 });
  }
}

/** 更新记录（PUT）——审核状态、元数据 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated || !ctx.currentUserId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body?.id) {
      return NextResponse.json({ success: false, error: '缺少条目 id' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: existing, error: findErr } = await db
      .from('knowledge_entries')
      .select('id, user_id')
      .eq('id', body.id)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    const isAdmin = isAdminRole(ctx.effectiveRole);
    const isSelf = existing.user_id === ctx.currentUserId;
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ success: false, error: '无权限修改该条目' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = String(body.description);
    if (body.metadata !== undefined && typeof body.metadata === 'object') updates.metadata = body.metadata;
    if (body.status !== undefined) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ success: false, error: '无效的状态' }, { status: 400 });
      }
      // 非管理员不能直接置为 approved（须走审核）
      if (body.status === 'approved' && !isAdmin) {
        return NextResponse.json({ success: false, error: '无权限直接审核通过' }, { status: 403 });
      }
      updates.status = body.status;
      updates.reviewed_by = ctx.currentUserId;
      updates.reviewed_at = new Date().toISOString();
      if (body.status === 'rejected') updates.reject_reason = body.reject_reason || '';
    }
    updates.updated_at = new Date().toISOString();

    const { data: record, error: updateErr } = await db
      .from('knowledge_entries')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: '更新失败', details: updateErr.message }, { status: 500 });
    }

    // 审批通过 → 触发向量化（指令 2/3 阶段 C）
    // 优雅降级：生成失败不影响审批结果；响应携带 embedding 状态供前端展示
    if (body.status === 'approved') {
      const embeddingResult = await ensureEntryEmbedding(db, body.id);
      const { data: fresh } = await db.from('knowledge_entries').select().eq('id', body.id).single();
      if (fresh) {
        return NextResponse.json({ success: true, data: fresh, embedding: embeddingResult });
      }
      return NextResponse.json({ success: true, data: record, embedding: embeddingResult });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: '更新失败', details: err?.message }, { status: 500 });
  }
}

/** 删除记录（DELETE）——含存储文件 */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated || !ctx.currentUserId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少条目 id' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: existing, error: findErr } = await db
      .from('knowledge_entries')
      .select('id, user_id, file_key, file_bucket, storage_bucket')
      .eq('id', id)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 权限矩阵：删除资料仅管理员可操作，非管理员一律禁止（#202608242100）
    const isAdmin = isAdminRole(ctx.effectiveRole);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: '仅管理员可删除资料' }, { status: 403 });
    }

    // 先删除存储文件（失败不阻塞记录删除）
    const bucket = existing.storage_bucket || existing.file_bucket || 'knowledge-base';
    if (existing.file_key) {
      try {
        await db.storage.from(bucket).remove([existing.file_key]);
      } catch (err: any) {
        console.warn('[Knowledge Entries] 删除存储文件失败（已忽略）:', err?.message);
      }
    }

    const { error: delErr } = await db.from('knowledge_entries').delete().eq('id', id);
    if (delErr) {
      return NextResponse.json({ success: false, error: '删除失败', details: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: '删除失败', details: err?.message }, { status: 500 });
  }
}
