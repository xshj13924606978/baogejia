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

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    todayUsers: 0,
    totalUsers: 0,
    todayQuotes: 0,
    totalQuotes: 0,
    todayPoints: 0,
    totalPoints: 0,
    todayIncome: 0,
    totalIncome: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  };

  // 用户增长数据
  const userChartData = {
    labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
    datasets: [
      {
        label: '新增用户',
        data: [65, 78, 90, 102, 115, 128],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
  };

  // 收入数据
  const incomeChartData = {
    labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
    datasets: [
      {
        label: '收入（元）',
        data: [1200, 1900, 2300, 2800, 3200, 4100],
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500">今日新增用户</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">{stats.todayUsers}</div>
          <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <span>↑ 12%</span>
            <span className="text-gray-400">较昨日</span>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500">今日报价</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">{stats.todayQuotes}</div>
          <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <span>↑ 8%</span>
            <span className="text-gray-400">较昨日</span>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500">今日发放积分</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">{stats.todayPoints}</div>
          <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <span>↑ 15%</span>
            <span className="text-gray-400">较昨日</span>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="text-sm text-gray-500">今日收入</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">¥{stats.todayIncome}</div>
          <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <span>↑ 20%</span>
            <span className="text-gray-400">较昨日</span>
          </div>
        </div>
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h2 className="font-medium mb-4 text-gray-900">用户增长趋势</h2>
          <div className="h-80">
            <Line data={userChartData} options={chartOptions} />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h2 className="font-medium mb-4 text-gray-900">收入统计</h2>
          <div className="h-80">
            <Bar data={incomeChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button className="p-4 bg-blue-50 rounded-lg text-left hover:bg-blue-100 transition-colors group">
          <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">👥</div>
          <div className="font-medium text-gray-900">待审核用户</div>
          <div className="text-sm text-gray-600 mt-1">12 人等待审核</div>
        </button>
        
        <button className="p-4 bg-green-50 rounded-lg text-left hover:bg-green-100 transition-colors group">
          <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">📋</div>
          <div className="font-medium text-gray-900">待审核内容</div>
          <div className="text-sm text-gray-600 mt-1">8 条待审核</div>
        </button>
        
        <button className="p-4 bg-yellow-50 rounded-lg text-left hover:bg-yellow-100 transition-colors group">
          <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">💰</div>
          <div className="font-medium text-gray-900">待处理订单</div>
          <div className="text-sm text-gray-600 mt-1">3 笔待处理</div>
        </button>
        
        <button className="p-4 bg-purple-50 rounded-lg text-left hover:bg-purple-100 transition-colors group">
          <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">⚠️</div>
          <div className="font-medium text-gray-900">系统告警</div>
          <div className="text-sm text-gray-600 mt-1">0 条告警</div>
        </button>
      </div>
    </div>
  );
}
