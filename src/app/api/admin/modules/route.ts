import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 模块管理API
 *
 * 功能：
 * - GET: 获取所有模块
 * - POST: 创建新模块
 * - PUT: 更新模块
 * - DELETE: 删除模块
 * 权限：仅超级管理员
 */

/**
 * 获取所有模块
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[AdminModules API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    console.log('[AdminModules API] 获取所有模块');

    // 获取所有模块
    const { data: modules, error } = await supabase
      .from('system_modules')
      .select('*')
      .order('module_code', { ascending: true });

    if (error) {
      console.error('[AdminModules API] 获取模块失败:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      modules
    });
  } catch (error) {
    console.error('[AdminModules API] 获取模块失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 创建新模块
 */
export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[AdminModules API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { module_code, module_name, description, is_active } = body;

    if (!module_code || !module_name) {
      return NextResponse.json(
        { error: '缺少必要参数：module_code 和 module_name' },
        { status: 400 }
      );
    }

    console.log('[AdminModules API] 创建新模块:', module_code);

    // 创建模块
    const { data, error } = await supabase
      .from('system_modules')
      .insert([{
        module_code,
        module_name,
        description,
        is_active: is_active !== undefined ? is_active : true
      }])
      .select()
      .single();

    if (error) {
      console.error('[AdminModules API] 创建模块失败:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      module: data
    });
  } catch (error) {
    console.error('[AdminModules API] 创建模块失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 更新模块
 */
export async function PUT(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[AdminModules API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { module_code, module_name, description, is_active } = body;

    if (!module_code) {
      return NextResponse.json(
        { error: '缺少参数：module_code' },
        { status: 400 }
      );
    }

    console.log('[AdminModules API] 更新模块:', module_code);

    // 更新模块
    const { data, error } = await supabase
      .from('system_modules')
      .update({
        module_name,
        description,
        is_active
      })
      .eq('module_code', module_code)
      .select()
      .single();

    if (error) {
      console.error('[AdminModules API] 更新模块失败:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      module: data
    });
  } catch (error) {
    console.error('[AdminModules API] 更新模块失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 删除模块
 */
export async function DELETE(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[AdminModules API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const module_code = searchParams.get('code');

    if (!module_code) {
      return NextResponse.json(
        { error: '缺少参数：code' },
        { status: 400 }
      );
    }

    console.log('[AdminModules API] 删除模块:', module_code);

    // 删除模块
    const { error } = await supabase
      .from('system_modules')
      .delete()
      .eq('module_code', module_code);

    if (error) {
      console.error('[AdminModules API] 删除模块失败:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '模块删除成功'
    });
  } catch (error) {
    console.error('[AdminModules API] 删除模块失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
