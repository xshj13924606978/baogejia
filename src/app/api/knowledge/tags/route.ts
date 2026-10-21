import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 知识库标签 API
 *
 * GET  /api/knowledge/tags?type=document — 获取某类型下所有标签
 * POST /api/knowledge/tags                    — 创建标签
 */

// GET: 获取标签列表
export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '';

    // 获取所有标签（如果有 type 参数，只返回该类型下使用的标签）
    if (type) {
      // 先获取该类型的条目 ID
      const { data: entries } = await db
        .from('knowledge_entries')
        .select('id')
        .eq('type', type)
        .eq('status', 'approved');

      if (!entries || entries.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const entryIds = entries.map((e: any) => e.id);
      const { data: tagRelations } = await db
        .from('knowledge_entry_tags')
        .select('tag_id, knowledge_tags(id, name, created_at)')
        .in('entry_id', entryIds);

      if (!tagRelations) {
        return NextResponse.json({ success: true, data: [] });
      }

      // 去重
      const tagMap = new Map<string, any>();
      tagRelations.forEach((r: any) => {
        if (r.knowledge_tags && !tagMap.has(r.tag_id)) {
          tagMap.set(r.tag_id, {
            id: r.knowledge_tags.id,
            name: r.knowledge_tags.name,
            created_at: r.knowledge_tags.created_at,
          });
        }
      });

      return NextResponse.json({ success: true, data: Array.from(tagMap.values()) });
    }

    // 无 type 参数，返回所有标签
    const { data: tags, error } = await db
      .from('knowledge_tags')
      .select('*')
      .order('name');

    if (error) {
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({ success: true, data: tags || [] });
  } catch (error: any) {
    console.error('[Knowledge Tags API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取标签失败' }, { status: 500 });
  }
}

// POST: 创建标签
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: '标签名称不能为空' }, { status: 400 });
    }

    const tagName = name.trim();

    // 检查是否已存在
    const { data: existing } = await db
      .from('knowledge_tags')
      .select('id, name')
      .eq('name', tagName)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, data: existing, message: '标签已存在' });
    }

    // 创建新标签
    const { data, error } = await db
      .from('knowledge_tags')
      .insert({ name: tagName })
      .select()
      .single();

    if (error) {
      console.error('[Knowledge Tags API] 创建失败:', error);
      return NextResponse.json({ success: false, error: '创建标签失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '标签创建成功' });
  } catch (error: any) {
    console.error('[Knowledge Tags API] 异常:', error);
    return NextResponse.json({ success: false, error: '创建标签失败' }, { status: 500 });
  }
}
