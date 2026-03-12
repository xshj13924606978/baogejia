import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 预定义的权限模板
 */
const TEMPLATES = {
  construction: {
    name: '建筑行业模板',
    description: '适用于建筑行业用户的权限配置',
    levels: {
      3: {
        fieldPermissions: {
          can_view_cost_price: true,
          can_view_min_price: true,
          can_view_manufacturer: true,
          can_view_contact: false,
          can_view_phone: false
        },
        modulePermissions: ['product.search', 'price.view', 'quote.create']
      },
      4: {
        fieldPermissions: {
          can_view_cost_price: true,
          can_view_min_price: true,
          can_view_manufacturer: true,
          can_view_contact: true,
          can_view_phone: true
        },
        modulePermissions: ['product.search', 'price.view', 'quote.create', 'excel.export']
      });
    }
  },
  retail: {
    name: '零售行业模板',
    description: '适用于零售行业用户的权限配置',
    levels: {
      3: {
        fieldPermissions: {
          can_view_cost_price: false,
          can_view_min_price: true,
          can_view_manufacturer: false,
          can_view_contact: false,
          can_view_phone: false
        },
        modulePermissions: ['product.search', 'price.view']
      }
    }
  },
  manufacturing: {
    name: '制造业模板',
    description: '适用于制造业用户的权限配置',
    levels: {
      3: {
        fieldPermissions: {
          can_view_cost_price: true,
          can_view_min_price: true,
          can_view_manufacturer: true,
          can_view_contact: true,
          can_view_phone: false
        },
        modulePermissions: ['product.search', 'price.view', 'quote.create', 'manufacturer.view']
      },
      4: {
        fieldPermissions: {
          can_view_cost_price: true,
          can_view_min_price: true,
          can_view_manufacturer: true,
          can_view_contact: true,
          can_view_phone: true
        },
        modulePermissions: ['product.search', 'price.view', 'quote.create', 'manufacturer.view', 'excel.export', 'cost_price.view']
      }
    }
  },
  ecommerce: {
    name: '电商行业模板',
    description: '适用于电商行业用户的权限配置',
    levels: {
      2: {
        fieldPermissions: {
          can_view_cost_price: false,
          can_view_min_price: false,
          can_view_manufacturer: false,
          can_view_contact: false,
          can_view_phone: false
        },
        modulePermissions: ['product.search']
      },
      3: {
        fieldPermissions: {
          can_view_cost_price: true,
          can_view_min_price: true,
          can_view_manufacturer: false,
          can_view_contact: false,
          can_view_phone: false
        },
        modulePermissions: ['product.search', 'price.view', 'quote.create']
      }
    }
  }
};

/**
 * 权限模板管理API
 *
 * 功能：
 * - GET: 获取所有权限模板
 * - POST: 应用权限模板到指定等级
 * 权限：仅超级管理员
 */

/**
 * 获取所有权限模板
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.templates.view'] },
  async (request: NextRequest, user: any) => {

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
      console.error('[Templates API] 获取用户角色失败:', roleError);
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

    console.log('[Templates API] 获取所有权限模板');

    return NextResponse.json({
      success: true,
      templates: TEMPLATES
    });
  } catch (error) {
    console.error('[Templates API] 获取模板失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }

/**
 * 应用权限模板
 */

export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.templates.edit'] },
  async (request: NextRequest, user: any) => {

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
      console.error('[Templates API] 获取用户角色失败:', roleError);
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
    const { templateName, targetLevels } = body;

    if (!templateName || !targetLevels || !Array.isArray(targetLevels)) {
      return NextResponse.json(
        { error: '缺少参数：templateName 和 targetLevels（数组）' },
        { status: 400 }
      );
    }

    // 查找模板
    const template = TEMPLATES[templateName as keyof typeof TEMPLATES];
    if (!template) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      );
    }

    console.log('[Templates API] 应用权限模板:', templateName, targetLevels);

    // 构建更新列表
    const updates = targetLevels
      .map((level: number) => {
        const levelConfig = (template.levels as Record<number, unknown>)[level];
        if (!levelConfig) return null;

        return {
          level,
          changes: levelConfig,
          reason: `应用${template.name}`
        };
      })
      .filter(Boolean) as Array<{ level: number; changes: unknown; reason: string }>;

    if (updates.length === 0) {
      return NextResponse.json(
        { error: '模板中没有匹配的等级配置' },
        { status: 400 }
      );
    }

    // 批量更新等级
    const result = await userLevelService.batchUpdateLevels(
      updates,
      Number(currentUser.id)
    );

    return NextResponse.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('[Templates API] 应用模板失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
