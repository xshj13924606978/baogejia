import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 等级分布统计API
 *
 * GET: 获取用户等级分布、等级转化趋势、等级升级时间统计
 */

export async function GET() {
  try {
    const supabase = getSupabaseServiceClient();

    // 获取用户等级数据
    const { data: userLevels, error: levelsError } = await supabase
      .from('user_levels')
      .select('user_id, level, level_up_at, created_at');

    if (levelsError) {
      console.log('[LevelDistribution API] user_levels 表不存在:', levelsError.message);
      return NextResponse.json(emptyDistribution());
    }

    // 获取用户基本信息
    const { data: _users, error: usersError } = await supabase
      .from('users')
      .select('id, created_at');

    if (usersError) {
      console.log('[LevelDistribution API] users 表查询失败:', usersError.message);
      return NextResponse.json(emptyDistribution());
    }

      // 合并数据
      const distribution = {
        levels: [] as Array<{
          level: number;
          count: number;
          percentage: number;
          cumulativePercentage: number;
        }>,
        trends: [] as Array<{ date: string; level: number; count: number }>,
        conversion: {} as Record<string, { rate: number; count: number }>,
        upgradeTime: {} as Record<number, { avgDays: number; minDays: number; maxDays: number }>,
        summary: {
          totalUsers: userLevels?.length || 0,
          averageLevel: 0,
          mostCommonLevel: 1,
          upgradeRate: 0}};

      const totalUsers = userLevels?.length || 0;
      if (totalUsers === 0) {
        return NextResponse.json(distribution);
      }

      // 统计各等级人数
      const levelCount = new Map<number, number>();
      userLevels?.forEach((u) => {
        const level = u.level || 1;
        levelCount.set(level, (levelCount.get(level) || 0) + 1);
      });

      // 计算平均等级
      let totalLevelSum = 0;
      let maxCount = 0;
      let mostCommonLevel = 1;

      distribution.levels = Array.from(levelCount.entries())
        .sort(([a], [b]) => a - b)
        .map(([level, count], index, array) => {
          const percentage = Math.round((count / totalUsers) * 100);
          let cumulativePercentage = 0;

          // 计算累计百分比
          for (let i = 0; i <= index; i++) {
            cumulativePercentage += (array[i][1] / totalUsers) * 100;
          }
          cumulativePercentage = Math.round(cumulativePercentage);

          totalLevelSum += level * count;

          if (count > maxCount) {
            maxCount = count;
            mostCommonLevel = level;
          }

          return { level, count, percentage, cumulativePercentage };
        });

      distribution.summary.averageLevel = Number((totalLevelSum / totalUsers).toFixed(2));
      distribution.summary.mostCommonLevel = mostCommonLevel;

      // 计算等级转化率
      const maxLevel = 5;
      for (let i = 1; i < maxLevel; i++) {
        const fromLevel = levelCount.get(i) || 0;
        const toLevel = levelCount.get(i + 1) || 0;
        const rate = fromLevel ? Math.round((toLevel / fromLevel) * 100) : 0;

        distribution.conversion[`${i}->${i + 1}`] = {
          rate,
          count: toLevel};
      }

      // 计算升级所需时间
      const upgradeTimeMap = new Map<number, number[]>();

      userLevels?.forEach((u) => {
        if (u.level > 1 && u.level_up_at) {
          const level = u.level;
          const upgradeDate = new Date(u.level_up_at);
          const createdDate = new Date(u.created_at);
          const daysDiff = Math.floor(
            (upgradeDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (!upgradeTimeMap.has(level)) {
            upgradeTimeMap.set(level, []);
          }
          upgradeTimeMap.get(level)!.push(daysDiff);
        }
      });

      // 计算升级时间统计
      upgradeTimeMap.forEach((daysArray, level) => {
        if (daysArray.length > 0) {
          const sum = daysArray.reduce((a, b) => a + b, 0);
          const avgDays = Math.round(sum / daysArray.length);
          const minDays = Math.min(...daysArray);
          const maxDays = Math.max(...daysArray);

          distribution.upgradeTime[level] = {
            avgDays,
            minDays,
            maxDays};
        }
      });

      // 计算总升级率（曾经升级过的用户比例）
      const upgradedUsers = userLevels?.filter((u) => u.level > 1).length || 0;
      distribution.summary.upgradeRate = Math.round((upgradedUsers / totalUsers) * 100);

      // 生成趋势数据（按月统计）
      const monthlyMap = new Map<string, Map<number, number>>();

      userLevels?.forEach((u) => {
        const date = new Date(u.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, new Map());
        }

        const monthData = monthlyMap.get(monthKey)!;
        const level = u.level || 1;
        monthData.set(level, (monthData.get(level) || 0) + 1);
      });

      distribution.trends = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([date, levelMap]) =>
          Array.from(levelMap.entries()).map(([level, count]) => ({
            date,
            level,
            count}))
        );

      console.log('[LevelDistribution API] 等级分布统计完成:', {
        totalUsers: distribution.summary.totalUsers,
        levels: distribution.levels.length,
        averageLevel: distribution.summary.averageLevel});

      return NextResponse.json(distribution);
    } catch (error) {
      console.error('[LevelDistribution API] 获取等级分布失败:', error);
      return NextResponse.json({ error: '获取失败' }, { status: 500 });
    }
}

function emptyDistribution() {
  return {
    levels: [], trends: [], conversion: {}, upgradeTime: {},
    summary: { totalUsers: 0, averageLevel: 0, mostCommonLevel: 1, upgradeRate: 0 },
  };
}
