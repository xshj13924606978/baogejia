import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 获取系统默认等级配置API
 *
 * 功能：获取系统默认的等级配置
 * 权限：仅超级管理员和管理员
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    console.log('[Defaults API] 当前用户:', currentUser);

    if (!currentUser || !currentUser.id) {
      console.log('[Defaults API] 用户未登录');
      return NextResponse.json(
        { error: '未登录' },
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
      console.error('[Defaults API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      console.log('[Defaults API] 权限不足:', userRole.role);
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    console.log('[Defaults API] 获取系统默认配置');

    // 尝试从 level_definitions 表获取默认配置
    const { data: defaults, error: defaultsError } = await supabase
      .from('level_definitions')
      .select('*')
      .order('level', { ascending: true });

    if (defaultsError) {
      console.error('[Defaults API] 查询失败:', defaultsError);
      return NextResponse.json(
        { error: '获取失败' },
        { status: 500 }
      );
    }

    // 如果数据库没有数据，返回硬编码的默认配置（每个等级不同）
    if (!defaults || defaults.length === 0) {
      console.log('[Defaults API] 数据库无默认配置，返回硬编码配置');
      const hardcodedDefaults = [
        {
          level: 1,
          name: '免费用户',
          role: 'free',
          required_points: 0,
          quotas: {
            daily_quota: 10,
            max_files: 5,
            max_chat_messages: 20
          },
          fieldPermissions: {
            can_view_cost_price: false,
            can_view_min_price: false,
            can_view_manufacturer: false,
            can_view_contact: false,
            can_view_phone: false
          },
          modulePermissions: ['user.view', 'product.search']
        },
        {
          level: 2,
          name: '普通会员',
          role: 'premium',
          required_points: 100,
          quotas: {
            daily_quota: 50,
            max_files: 20,
            max_chat_messages: 100
          },
          fieldPermissions: {
            can_view_cost_price: false,
            can_view_min_price: true,
            can_view_manufacturer: false,
            can_view_contact: false,
            can_view_phone: false
          },
          modulePermissions: ['user.view', 'product.search', 'product.detail']
        },
        {
          level: 3,
          name: 'VIP会员',
          role: 'vip',
          required_points: 500,
          quotas: {
            daily_quota: 200,
            max_files: 50,
            max_chat_messages: 500
          },
          fieldPermissions: {
            can_view_cost_price: true,
            can_view_min_price: true,
            can_view_manufacturer: true,
            can_view_contact: false,
            can_view_phone: false
          },
          modulePermissions: ['user.view', 'product.search', 'product.detail', 'quote.create']
        },
        {
          level: 4,
          name: '企业会员',
          role: 'enterprise_admin',
          required_points: 1000,
          quotas: {
            daily_quota: 1000,
            max_files: 200,
            max_chat_messages: 2000
          },
          fieldPermissions: {
            can_view_cost_price: true,
            can_view_min_price: true,
            can_view_manufacturer: true,
            can_view_contact: true,
            can_view_phone: true
          },
          modulePermissions: ['user.view', 'product.search', 'product.detail', 'quote.create', 'excel.export']
        },
        {
          level: 5,
          name: '超级会员',
          role: 'super_admin',
          required_points: 5000,
          quotas: {
            daily_quota: 9999,
            max_files: 9999,
            max_chat_messages: 9999
          },
          fieldPermissions: {
            can_view_cost_price: true,
            can_view_min_price: true,
            can_view_manufacturer: true,
            can_view_contact: true,
            can_view_phone: true
          },
          modulePermissions: ['*']
        }
      ];
      return NextResponse.json(hardcodedDefaults);
    }

    console.log('[Defaults API] 成功获取默认配置:', defaults.length, '条记录');
    return NextResponse.json(defaults);
  } catch (error) {
    console.error('[Defaults API] 获取默认配置失败:', error);
    return NextResponse.json(
      { error: '获取失败' },
      { status: 500 }
    );
  }
}
