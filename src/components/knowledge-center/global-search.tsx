'use client';

import { useState } from 'react';
import type { KnowledgeEntry } from '@/types/knowledge';

const TYPE_LABELS: Record<string, string> = {
  document: '技术文档',
  case: '案例',
  standard: '标准规范',
  drawing: '图纸图片',
  quota: '定额',
};

const TYPE_ICONS: Record<string, string> = {
  document: '📄',
  case: '🏗️',
  standard: '📖',
  drawing: '🖼️',
  quota: '🧮',
};

export default function GlobalSearch() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Record<string, KnowledgeEntry[]>>({});
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/knowledge/search?keyword=${encodeURIComponent(keyword)}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setResults(json.results || {});
        setTotal(json.total || 0);
      }
    } catch (err) {
      console.error('[GlobalSearch] 搜索失败:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🔍</span> 全局搜索
        </h3>
      </div>

      {/* 搜索框 */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="输入关键词，跨所有子库搜索..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 p-2 border rounded text-base"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !keyword.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
        >
          {searching ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* 搜索结果 */}
      {searched && (
        <div>
          {!searching && total === 0 && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <div>未找到与 &quot;{keyword}&quot; 相关的结果</div>
            </div>
          )}

          {Object.entries(results).map(([type, entries]) => {
            if (!entries || entries.length === 0) return null;
            return (
              <div key={type} className="mb-6">
                <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                  <span>{TYPE_ICONS[type]}</span>
                  {TYPE_LABELS[type] || type}
                  <span className="font-normal text-gray-400">({entries.length})</span>
                </h4>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => {
                        if (entry.file_url) {
                          const a = document.createElement('a');
                          a.href = entry.file_url;
                          a.download = entry.file_name;
                          a.target = '_blank';
                          a.click();
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{entry.title}</div>
                          {entry.description && (
                            <div className="text-xs text-gray-500 mt-1 truncate">{entry.description}</div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                          {entry.created_at?.split('T')[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 未搜索时的提示 */}
      {!searched && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🔍</div>
          <div>输入关键词搜索所有资料库</div>
          <p className="text-sm mt-2 text-gray-400">
            支持搜索：技术文档、案例、标准规范、图纸图片、定额
          </p>
        </div>
      )}
    </div>
  );
}
