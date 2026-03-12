import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 获取系统默认等级配置API
 *
 * 功能：获取系统默认的等级配置
 * 权限：仅超级管理员和管理员
 */

export async function GET() {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser();
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
      console.error('[AdminLevelDefaults API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '无权限，需要管理员权限' },
        { status: 403 }
      );
    }

    console.log('[AdminLevelDefaults API] 获取系统默认配置');

    // 尝试从 level_definitions 表获取默认配置
    const { data: defaults, error: defaultsError } = await supabase
      .from('level_definitions')
      .select('*')
      .order('level', { ascending: true });

    if (defaultsError) {
      console.error('[AdminLevelDefaults API] 获取默认配置失败:', defaultsError);
      // 如果表不存在或出错，返回硬编码的默认值
      return NextResponse.json({
        success: true,
        source: 'hardcoded',
        defaults: [
          {
            level: 1,
            name: '免费用户',
            required_points: 0,
            role: 'user',
            quotas: {
              daily_quota: 10,
              max_files: 5,
              max_chat_messages: 20,
            },
            field_permissions: {
              can_view_cost_price: false,
              can_view_min_price: false,
              can_view_manufacturer: false,
              can_view_contact: false,
              can_view_phone: false,
            },
            module_permissions: [],
          },
          {
            level: 2,
            name: '基础会员',
            required_points: 100,
            role: 'user',
            quotas: {
              daily_quota: 50,
              max_files: 20,
              max_chat_messages: 100,
            },
            field_permissions: {
              can_view_cost_price: false,
              can_view_min_price: true,
              can_view_manufacturer: true,
              can_view_contact: false,
              can_view_phone: false,
            },
            module_permissions: ['basic_query', 'file_upload'],
          },
          {
            level: 3,
            name: '高级会员',
            required_points: 500,
            role: 'user',
            quotas: {
              daily_quota: 200,
              max_files: 50,
              max_chat_messages: 500,
            },
            field_permissions: {
              can_view_cost_price: false,
              can_view_min_price: true,
              can_view_manufacturer: true,
              can_view_contact: true,
              can_view_phone: false,
            },
            module_permissions: ['basic_query', 'file_upload', 'advanced_query'],
          },
          {
            level: 4,
            name: '企业用户',
            required_points: 2000,
            role: 'user',
            quotas: {
              daily_quota: 1000,
              max_files: 200,
              max_chat_messages: 2000,
            },
            field_permissions: {
              can_view_cost_price: true,
              can_view_min_price: true,
              can_view_manufacturer: true,
              can_view_contact: true,
              can_view_phone: true,
            },
            module_permissions: ['basic_query', 'file_upload', 'advanced_query', 'data_export'],
          },
          {
            level: 5,
            name: '超级管理员',
            required_points: 999999,
            role: 'super_admin',
            quotas: {
              daily_quota: 999999,
              max_files: 999999,
              max_chat_messages: 999999,
            },
            field_permissions: {
              can_view_cost_price: true,
              can_view_min_price: true,
              can_view_manufacturer: true,
              can_view_contact: true,
              can_view_phone: true,
            },
            module_permissions: ['*'],
          },
        ],
      });
    }

    // 如果数据库中有默认配置，返回数据库配置
    return NextResponse.json({
      success: true,
      source: 'database',
      defaults: defaults,
    });
  } catch (error) {
    console.error('[AdminLevelDefaults API] 获取默认配置异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
