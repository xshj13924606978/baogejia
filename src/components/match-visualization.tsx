/**
 * 匹配结果可视化组件
 * 
 * 功能：
 * 1. 展示匹配结果的条形图
 * 2. 展示参数匹配对比
 * 3. 展示置信度仪表盘
 * 4. 展示产品评分雷达图
 */

'use client';

import React from 'react';
import { Brain, Target, Zap, CheckCircle, AlertCircle } from 'lucide-react';

interface MatchVisualizationProps {
  matchSummary: {
    totalMatches: number;
    exactMatches: number;
    approximateMatches: number;
    confidenceLevel: string;
    confidenceScore: number;
    recommendedProduct?: string;
    similarityFactors?: string[];
  };
}

export function MatchVisualization({ matchSummary }: MatchVisualizationProps) {
  const {
    totalMatches,
    exactMatches,
    approximateMatches,
    confidenceLevel,
    confidenceScore,
    recommendedProduct,
    similarityFactors
  } = matchSummary;

  // 计算百分比
  const exactPercentage = totalMatches > 0 ? (exactMatches / totalMatches) * 100 : 0;
  const approximatePercentage = totalMatches > 0 ? (approximateMatches / totalMatches) * 100 : 0;
  const otherPercentage = 100 - exactPercentage - approximatePercentage;

  // 置信度等级
  const confidenceLevelText = {
    high: '高',
    medium: '中',
    low: '低'
  }[confidenceLevel as string] || confidenceLevel;

  // 置信度颜色
  const confidenceColor = {
    high: 'bg-green-500',
    medium: 'bg-yellow-500',
    low: 'bg-red-500'
  }[confidenceLevel as string] || 'bg-blue-500';

  return (
    <div className="space-y-4 mt-4">
      {/* 匹配分布条形图 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            匹配分布
          </h3>
        </div>

        <div className="space-y-3">
          {/* 精确匹配 */}
          <div>
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>精确匹配</span>
              <span className="font-medium">{exactMatches} ({exactPercentage.toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${exactPercentage}%` }}
              />
            </div>
          </div>

          {/* 近似匹配 */}
          <div>
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>近似匹配</span>
              <span className="font-medium">{approximateMatches} ({approximatePercentage.toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                style={{ width: `${approximatePercentage}%` }}
              />
            </div>
          </div>

          {/* 其他匹配 */}
          {otherPercentage > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>其他匹配</span>
                <span className="font-medium">{totalMatches - exactMatches - approximateMatches} ({otherPercentage.toFixed(0)}%)</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-500 rounded-full transition-all duration-500"
                  style={{ width: `${otherPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 置信度仪表盘 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            置信度评估
          </h3>
        </div>

        <div className="flex items-center gap-4">
          {/* 圆形进度条 */}
          <div className="relative w-24 h-24">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - confidenceScore)}`}
                className={`${confidenceColor} transition-all duration-500`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(confidenceScore * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* 置信度详情 */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                置信度等级: <span className="font-medium">{confidenceLevelText}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                匹配质量: <span className="font-medium">{confidenceScore >= 0.8 ? '优秀' : confidenceScore >= 0.6 ? '良好' : '一般'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 推荐产品 */}
      {recommendedProduct && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                推荐产品
              </h3>
              <p className="text-base font-semibold text-blue-700 dark:text-blue-300">
                {recommendedProduct}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                基于匹配结果和置信度评估，这是最符合您需求的产品
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 相似度因素 */}
      {similarityFactors && similarityFactors.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              相似度分析
            </h3>
          </div>

          <div className="space-y-2">
            {similarityFactors.map((factor, index) => {
              const [label, value] = factor.split(': ');
              const percentage = parseInt(value?.replace('%', '') || '0');

              return (
                <div key={index}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
