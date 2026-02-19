'use client';

import { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function DataStats() {
  const [period, setPeriod] = useState('week');

  // 用户增长曲线
  const userGrowthData = {
    labels: period === 'week' 
      ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    datasets: [
      {
        label: '新增用户',
        data: period === 'week' 
          ? [12, 19, 15, 25, 22, 30, 28]
          : [120, 150, 180, 200, 220, 250, 280, 300, 320, 350, 380, 400],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
  };

  // 邀请排行榜
  const inviteRankings = [
    { rank: 1, username: '用户A', invites: 156, points: 4680 },
    { rank: 2, username: '用户B', invites: 142, points: 4260 },
    { rank: 3, username: '用户C', invites: 128, points: 3840 },
    { rank: 4, username: '用户D', invites: 115, points: 3450 },
    { rank: 5, username: '用户E', invites: 98, points: 2940 },
    { rank: 6, username: '用户F', invites: 87, points: 2610 },
    { rank: 7, username: '用户G', invites: 76, points: 2280 },
    { rank: 8, username: '用户H', invites: 65, points: 1950 },
    { rank: 9, username: '用户I', invites: 54, points: 1620 },
    { rank: 10, username: '用户J', invites: 43, points: 1290 },
  ];

  // 产品热度排行
  const productRankings = [
    { rank: 1, name: '空调压缩机', brand: '格力', views: 12580, quotes: 342 },
    { rank: 2, name: '变频控制器', brand: '美的', views: 9876, quotes: 287 },
    { rank: 3, name: '电机驱动器', brand: '海尔', views: 8543, quotes: 256 },
    { rank: 4, name: 'PLC控制器', brand: '西门子', views: 7654, quotes: 213 },
    { rank: 5, name: '传感器模块', brand: '欧姆龙', views: 6543, quotes: 198 },
    { rank: 6, name: '继电器组', brand: '施耐德', views: 5432, quotes: 176 },
    { rank: 7, name: '电源模块', brand: '明纬', views: 4321, quotes: 154 },
    { rank: 8, name: '触摸屏', brand: '威纶通', views: 3210, quotes: 132 },
    { rank: 9, name: '编码器', brand: '海德汉', views: 2109, quotes: 98 },
    { rank: 10, name: '伺服驱动器', brand: '三菱', views: 1098, quotes: 76 },
  ];

  // 报价统计
  const quoteStats = {
    labels: period === 'week'
      ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    datasets: [
      {
        label: '报价次数',
        data: period === 'week'
          ? [45, 52, 48, 65, 72, 38, 35]
          : [420, 480, 520, 580, 620, 680, 720, 780, 820, 860, 900, 950],
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderRadius: 4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">数据统计</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="week">本周</option>
          <option value="year">全年</option>
        </select>
      </div>

      {/* 用户增长曲线 */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h2 className="font-medium mb-4 text-gray-900">用户增长曲线</h2>
        <div className="h-80">
          <Line data={userGrowthData} options={chartOptions} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 邀请排行榜 */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h2 className="font-medium mb-4 text-gray-900">邀请排行榜</h2>
          <div className="space-y-2">
            {inviteRankings.map((item, index) => (
              <div
                key={item.rank}
                className={`flex items-center p-3 rounded-lg ${
                  index < 3 ? 'bg-gradient-to-r from-yellow-50 to-orange-50' : 'bg-gray-50'
                }`}
              >
                <div className="text-xl font-bold w-8 text-center">
                  {getRankBadge(item.rank)}
                </div>
                <div className="flex-1 ml-3">
                  <div className="font-medium text-gray-900">{item.username}</div>
                  <div className="text-sm text-gray-600">邀请 {item.invites} 人</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">+{item.points}</div>
                  <div className="text-xs text-gray-500">积分</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 产品热度排行 */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h2 className="font-medium mb-4 text-gray-900">产品热度排行</h2>
          <div className="space-y-2">
            {productRankings.map((item, index) => (
              <div
                key={item.rank}
                className={`flex items-center p-3 rounded-lg ${
                  index < 3 ? 'bg-gradient-to-r from-blue-50 to-purple-50' : 'bg-gray-50'
                }`}
              >
                <div className="text-xl font-bold w-8 text-center">
                  {getRankBadge(item.rank)}
                </div>
                <div className="flex-1 ml-3">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-sm text-gray-600">{item.brand}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-blue-600">{item.views}</div>
                  <div className="text-xs text-gray-500">浏览</div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-green-600">{item.quotes}</div>
                  <div className="text-xs text-gray-500">报价</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 报价统计 */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h2 className="font-medium mb-4 text-gray-900">报价统计</h2>
        <div className="h-80">
          <Bar data={quoteStats} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
