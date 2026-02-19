'use client';

import { useState } from 'react';

interface SearchResult {
  id: string;
  name: string;
  code?: string;
  description?: string;
  price?: number;
  source: string;
  type: string;
}

export default function GlobalSearch() {
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!keyword.trim()) return;

    setSearching(true);
    setHasSearched(true);

    // 模拟跨库搜索
    setTimeout(() => {
      setResults({
        price: [
          { id: 'p1', name: '提升泵', price: 3200, source: '产品价格库', type: 'price' },
          { id: 'p2', name: '搅拌罐', price: 14500, source: '产品价格库', type: 'price' },
          { id: 'p3', name: '一体化设备', price: 28000, source: '产品价格库', type: 'price' }
        ],
        document: [
          { id: 'd1', name: '一体化设备说明书.pdf', description: '详细操作维护说明', source: '技术文档库', type: 'document' },
          { id: 'd2', name: '安装调试手册.docx', description: '现场安装调试指南', source: '技术文档库', type: 'document' }
        ],
        quota: [
          { id: 'q1', code: 'GD-001', name: '设备安装定额', source: '定额库', type: 'quota' },
          { id: 'q2', code: '1-1-1', name: '人工挖土方', source: '定额库', type: 'quota' }
        ],
        case: [
          { id: 'c1', name: '某污水处理厂案例', description: 'MBR工艺升级改造', source: '案例库', type: 'case' },
          { id: 'c2', name: '工业园区供水管网', description: '15km管网改造', source: '案例库', type: 'case' }
        ],
        standard: [
          { id: 's1', code: 'GB 50014-2021', name: '室外排水设计标准', source: '规范库', type: 'standard' },
          { id: 's2', code: 'GB 50242-2002', name: '建筑给水排水验收规范', source: '规范库', type: 'standard' }
        ],
        drawing: [
          { id: 'dw1', name: '工艺流程图.dwg', description: '主要工艺流程', source: '图纸库', type: 'drawing' },
          { id: 'dw2', name: '设备布置图.dwg', description: '设备平面布置', source: '图纸库', type: 'drawing' }
        ]
      });
      setSearching(false);
    }, 1000);
  };

  const getModuleIcon = (key: string) => {
    switch (key) {
      case 'price': return '📊';
      case 'document': return '📄';
      case 'quota': return '📊';
      case 'case': return '🏗️';
      case 'standard': return '📋';
      case 'drawing': return '🖼️';
      default: return '📁';
    }
  };

  const getModuleName = (key: string) => {
    switch (key) {
      case 'price': return '产品价格库';
      case 'document': return '技术文档库';
      case 'quota': return '定额库';
      case 'case': return '案例库';
      case 'standard': return '规范库';
      case 'drawing': return '图纸库';
      default: return '未知';
    }
  };

  const totalResults = Object.values(results).reduce((sum, items) => sum + items.length, 0);

  return (
    <div>
      {/* 搜索框 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="输入关键词搜索所有资料库..."
          className="flex-1 p-3 border rounded-lg text-lg"
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
        >
          {searching ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* 热门搜索 */}
      {!hasSearched && !keyword && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">热门搜索</h3>
          <div className="flex flex-wrap gap-2">
            {['一体化设备', '搅拌罐', '提升泵', '污水处理', 'CAD图纸'].map(term => (
              <button
                key={term}
                onClick={() => { setKeyword(term); handleSearch(); }}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 搜索中 */}
      {searching ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <div className="mt-2 text-gray-500">正在搜索所有资料库...</div>
        </div>
      ) : hasSearched && totalResults > 0 ? (
        <div>
          {/* 搜索结果统计 */}
          <div className="text-sm text-gray-500 mb-4">
            找到 <span className="font-bold text-blue-600">{totalResults}</span> 条结果
          </div>

          {/* 搜索结果列表 */}
          <div className="space-y-6 max-h-[60vh] overflow-auto pb-4">
            {Object.entries(results).map(([key, items]) => (
              items.length > 0 && (
                <div key={key}>
                  <h3 className="font-bold text-blue-600 mb-2 flex items-center gap-2">
                    <span>{getModuleIcon(key)}</span>
                    <span>{getModuleName(key)}</span>
                    <span className="text-sm font-normal text-gray-500">({items.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map((item: SearchResult) => (
                      <div key={item.id} className="p-3 border rounded hover:bg-gray-50 cursor-pointer">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {item.name}
                              {item.code && (
                                <span className="font-mono text-sm text-gray-500">({item.code})</span>
                              )}
                            </div>
                            {item.description && (
                              <div className="text-sm text-gray-600 mt-1">{item.description}</div>
                            )}
                            <div className="text-xs text-gray-500 mt-2">{item.source}</div>
                          </div>
                          {item.price && (
                            <div className="text-right">
                              <div className="text-red-600 font-bold">¥{item.price.toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      ) : hasSearched && totalResults === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🔍</div>
          <div>未找到相关结果</div>
          <div className="text-sm mt-2">请尝试其他关键词</div>
        </div>
      ) : (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🔍</div>
          <div>输入关键词开始搜索</div>
          <div className="text-sm mt-2">可搜索产品、文档、案例、规范、图纸等</div>
        </div>
      )}

      {/* 提示信息 */}
      {hasSearched && (
        <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
          ⚠️ 当前使用模拟数据展示，跨库搜索功能开发中。
        </div>
      )}
    </div>
  );
}
