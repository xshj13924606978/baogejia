import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 计费配置管理API（管理员）
 *
 * 功能：
 * - GET: 获取当前计费配置（需要 admin.billing.view 权限）
 * - POST: 更新计费配置（需要 admin.billing.edit 权限）
 */

// 默认计费配置
const DEFAULT_BILLING_CONFIG = {
  yuanToTokens: 1000,
  yuanToPoints: 100,
  pointsToTokens: 10,
  level1InputRate: 1.0,
  level1OutputRate: 1.0,
  level2InputRate: 0.9,
  level2OutputRate: 0.9,
  level3InputRate: 0.8,
  level3OutputRate: 0.8,
  level4InputRate: 0.7,
  level4OutputRate: 0.7,
  level5InputRate: 0.6,
  level5OutputRate: 0.6,
};

// 内存中存储的配置（可被修改）
let currentConfig = { ...DEFAULT_BILLING_CONFIG };

/**
 * 获取当前计费配置
 * 需要 admin.billing.view 权限
 */
export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: 'admin.billing.view' },
  async (request: NextRequest, _context: any) => {
    try {
      console.log('[BillingConfig API] 获取计费配置');

      return NextResponse.json({
        success: true,
        data: currentConfig
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
        yuanToTokens,
        yuanToPoints,
        pointsToTokens,
        levelDiscounts: {
          level1: { input: level1InputRate, output: level1OutputRate },
          level5: { input: level5InputRate, output: level5OutputRate },
        }
      });

      // 更新内存中的配置
      currentConfig = {
        yuanToTokens,
        yuanToPoints,
        pointsToTokens,
        level1InputRate: level1InputRate ?? 1.0,
        level1OutputRate: level1OutputRate ?? 1.0,
        level2InputRate: level2InputRate ?? 0.9,
        level2OutputRate: level2OutputRate ?? 0.9,
        level3InputRate: level3InputRate ?? 0.8,
        level3OutputRate: level3OutputRate ?? 0.8,
        level4InputRate: level4InputRate ?? 0.7,
        level4OutputRate: level4OutputRate ?? 0.7,
        level5InputRate: level5InputRate ?? 0.6,
        level5OutputRate: level5OutputRate ?? 0.6,
      };

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
