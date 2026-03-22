import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 默认模块列表
const DEFAULT_MODULES = [
  { module_code: 'chat', module_name: '智能对话', description: 'AI智能对话与问答功能', is_active: true },
  { module_code: 'quote', module_name: '报价生成', description: '产品报价单智能生成', is_active: true },
  { module_code: 'history', module_name: '历史记录', description: '查看历史对话和报价记录', is_active: true },
  { module_code: 'export', module_name: '导出功能', description: '导出PDF和Excel文件', is_active: true },
  { module_code: 'analytics', module_name: '数据分析', description: '统计分析与数据报告', is_active: true },
  { module_code: 'api', module_name: 'API接口', description: 'API接口调用权限', is_active: true },
  { module_code: 'knowledge', module_name: '知识库', description: '知识库上传与管理', is_active: true },
  { module_code: 'points', module_name: '积分系统', description: '积分获取与消费', is_active: true },
];

/**
 * GET: 获取模块列表
 */
export async function GET() {
  try {
    const db = getSupabaseServiceClient();

    const { data: modules, error } = await db
      .from('modules')
      .select('*')
      .order('module_code');

    if (error) {
      console.log('[Modules API] 表不存在或查询失败，返回默认值');
      return NextResponse.json({ success: true, data: DEFAULT_MODULES });
    }

    return NextResponse.json({ success: true, data: modules || DEFAULT_MODULES });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT_MODULES });
  }
}

/**
 * POST: 创建模块
 */
export async function POST(request: NextRequest) {
  try {
    const { module_code, module_name, description, is_active } = await request.json();

    if (!module_code || !module_name) {
      return NextResponse.json({ success: false, error: '模块代码和名称不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('modules')
      .insert({
        module_code,
        module_name,
        description: description || '',
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) {
      console.error('[Modules API] 创建失败:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: '模块代码已存在' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '模块创建成功', data });
  } catch (error: any) {
    console.error('[Modules API] 创建异常:', error);
    return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 });
  }
}

/**
 * PUT: 更新模块
 */
export async function PUT(request: NextRequest) {
  try {
    const { id, module_name, description, is_active } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少模块ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (module_name !== undefined) updateData.module_name = module_name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await db
      .from('modules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Modules API] 更新失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '更新成功', data });
  } catch (error: any) {
    console.error('[Modules API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

/**
 * DELETE: 删除模块
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少模块ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { error } = await db.from('modules').delete().eq('id', id);

    if (error) {
      console.error('[Modules API] 删除失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error: any) {
    console.error('[Modules API] 删除异常:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}
