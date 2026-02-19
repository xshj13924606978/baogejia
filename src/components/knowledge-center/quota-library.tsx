'use client';

import { useState } from 'react';

interface Quota {
  id: string;
  type: '全国' | '地方' | '行业' | '企业';
  region: string;
  industry: string;
  code: string;
  name: string;
  unit: string;
  basePrice: number;
  laborCost: number;
  materialCost: number;
  machineCost: number;
  updateTime: string;
}

export default function QuotaLibrary() {
  const [quotas, setQuotas] = useState<Quota[]>([
    {
      id: '1',
      type: '全国',
      region: '-',
      industry: '土建',
      code: '1-1-1',
      name: '人工挖土方(一、二类土)',
      unit: 'm³',
      basePrice: 45.60,
      laborCost: 45.60,
      materialCost: 0,
      machineCost: 0,
      updateTime: '2024-01-01'
    },
    {
      id: '2',
      type: '地方',
      region: '广东省',
      industry: '安装',
      code: 'GD-001',
      name: '钢筋混凝土搅拌罐安装',
      unit: '台',
      basePrice: 1250.00,
      laborCost: 450.00,
      materialCost: 600.00,
      machineCost: 200.00,
      updateTime: '2024-01-01'
    },
    {
      id: '3',
      type: '行业',
      region: '-',
      industry: '环保',
      code: 'HB-003',
      name: '一体化污水处理设备调试',
      unit: '台',
      basePrice: 800.00,
      laborCost: 500.00,
      materialCost: 100.00,
      machineCost: 200.00,
      updateTime: '2024-01-01'
    },
    {
      id: '4',
      type: '企业',
      region: '-',
      industry: '安装',
      code: 'QY-015',
      name: '提升泵安装（含基础）',
      unit: '台',
      basePrice: 580.00,
      laborCost: 200.00,
      materialCost: 300.00,
      machineCost: 80.00,
      updateTime: '2024-01-01'
    }
  ]);

  const [filterType, setFilterType] = useState('all');
  const [filterRegion, setFilterRegion] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredQuotas = quotas.filter(q => {
    if (filterType !== 'all' && q.type !== filterType) return false;
    if (filterRegion && q.region !== filterRegion && q.region !== '-') return false;
    if (searchTerm) {
      return q.name.includes(searchTerm) || q.code.includes(searchTerm);
    }
    return true;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case '全国': return 'bg-blue-100 text-blue-700';
      case '地方': return 'bg-green-100 text-green-700';
      case '行业': return 'bg-purple-100 text-purple-700';
      case '企业': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleImport = () => {
    alert('导入功能开发中，支持Excel模板导入');
  };

  const handleDownloadTemplate = () => {
    alert('模板下载功能开发中');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📊</span> 定额库
          <span className="text-sm font-normal text-gray-500 ml-2">
            {quotas.length}条定额
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            📤 导入定额
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
          >
            📥 下载模板
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="p-2 border rounded bg-white"
        >
          <option value="all">全部定额</option>
          <option value="全国">全国统一定额</option>
          <option value="地方">地方定额</option>
          <option value="行业">行业定额</option>
          <option value="企业">企业定额</option>
        </select>

        <select
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
          className="p-2 border rounded bg-white"
        >
          <option value="">全部地区</option>
          <option value="广东省">广东省</option>
          <option value="浙江省">浙江省</option>
          <option value="江苏省">江苏省</option>
        </select>

        <input
          type="text"
          placeholder="搜索定额编号或名称"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="col-span-2 p-2 border rounded"
        />
      </div>

      {/* 定额列表 */}
      <div className="border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">定额编号</th>
              <th className="px-3 py-2 text-left">项目名称</th>
              <th className="px-3 py-2 text-left">单位</th>
              <th className="px-3 py-2 text-right">基价(元)</th>
              <th className="px-3 py-2 text-right">人工费</th>
              <th className="px-3 py-2 text-right">材料费</th>
              <th className="px-3 py-2 text-right">机械费</th>
              <th className="px-3 py-2 text-left">类型</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotas.map(q => (
              <tr key={q.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{q.code}</td>
                <td className="px-3 py-2">{q.name}</td>
                <td className="px-3 py-2">{q.unit}</td>
                <td className="px-3 py-2 text-right">¥{q.basePrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">¥{q.laborCost.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">¥{q.materialCost.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">¥{q.machineCost.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(q.type)}`}>
                    {q.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded">
        ⚠️ 当前使用模拟数据，导入功能开发中。
      </div>
    </div>
  );
}
