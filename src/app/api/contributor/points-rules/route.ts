import { NextResponse } from 'next/server';
import { getAllContributorPointsConfig } from '@/lib/contributor/points-config';

// 公开 API：获取贡献者积分规则配置（#[20260827-1030]-8）
//
//   数据源：public.points_rules（迁移 085_contributor_points_rules.sql）
//   返回：审核通过积分（按资料类型）/ 注册奖励 / 采纳奖励 / 邀请奖励 / 多级奖励 / 通用邀请码有效期
//   用途：前端上传/审核/邀请页面动态展示，零硬编码
//   缓存：服务侧 30s TTL（points-config.ts 内置）；HTTP 侧建议
//         客户端 fetch 加 Cache-Control: max-age=30
//
//   强制返回全部字段（即使 DB 不可达），由 points-config.ts fallback 默认值兜底
//   保证前端展示永远不为空（容错优先）。

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getAllContributorPointsConfig();
    return NextResponse.json({
      success: true,
      data: config,
      source: 'points_rules',
      message: '积分规则来自数据库 points_rules 表，可由管理员后台动态修改',
    });
  } catch (error) {
    console.error('[Contributor Points Rules API] 获取失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取积分规则失败',
        // 即使失败也返回 fallback 配置，避免前端空白
        data: {
          upload: {
            product: 50,
            document: 80,
            case: 60,
            standard: 80,
            drawing: 40,
            quota: 50,
          },
          register: 100,
          adopt: 100,
          invite: { register: 20, submit: 30, review: 50 },
          multiLevel: { level1: 50, level2: 10, level3: 5 },
          universalInviteExpiryDays: 30,
        },
      },
      { status: 200 }
    );
  }
}