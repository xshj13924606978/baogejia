import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { tokenBillingService } from '@/lib/token-billing-service';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 计费配置管理API（管理员）
 *
 * 功能：
 * - GET: 获取当前计费配置（需要 admin.billing.view 权限）
 * - POST: 更新计费配置（需要 admin.billing.edit 权限）
 */

/**
 * 获取当前计费配置
 * 需要 admin.billing.view 权限
 */
export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.billing.view' },
  async (request: NextRequest, _context: any) => {
    try {
      console.log('[BillingConfig API] 获取计费配置');

      // 获取计费配置
      const config = await tokenBillingService.getBillingConfig();

      if (!config) {
        return NextResponse.json({ error: '获取计费配置失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: config
      });
    } catch (error) {
      console.error('[BillingConfig API] 获取计费配置异常:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }
  }
);

/**
 * 更新计费配置
 * 需要 admin.billing.edit 权限
 */
export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.billing.edit' },
  async (request: NextRequest, _context: any) => {
    try {
      const body = await request.json();
      const {
        configName,
        yuanToTokens,
        yuanToPoints,
        pointsToTokens,
        level1InputRate,
        level1OutputRate,
        level2InputRate,
        level2OutputRate,
        level3InputRate,
        level3OutputRate,
        level4InputRate,
        level4OutputRate,
        level5InputRate,
        level5OutputRate
      } = body;

      // 验证必填字段
      if (!yuanToTokens || !yuanToPoints || !pointsToTokens) {
        return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
      }

      console.log('[BillingConfig API] 更新计费配置:', {
        configName,
        yuanToTokens,
        yuanToPoints,
        pointsToTokens,
        levelDiscounts: {
          level1: { input: level1InputRate, output: level1OutputRate },
          level5: { input: level5InputRate, output: level5OutputRate },
        }
      });

      // 更新计费配置
      const success = await tokenBillingService.updateBillingConfig({
        yuanToTokens,
        yuanToPoints,
        pointsToTokens,
        level1InputRate,
        level1OutputRate,
        level2InputRate,
        level2OutputRate,
        level3InputRate,
        level3OutputRate,
        level4InputRate,
        level4OutputRate,
        level5InputRate,
        level5OutputRate
      });

      if (!success) {
        return NextResponse.json({ error: '更新配置失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: '配置更新成功'
      });
    } catch (error) {
      console.error('[BillingConfig API] 更新计费配置异常:', error);
      return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }
  }
);
