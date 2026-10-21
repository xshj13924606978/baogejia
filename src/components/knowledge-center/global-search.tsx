'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeEntry } from '@/types/knowledge';

interface SearchResultItem extends KnowledgeEntry {
  typeLabel: string;
  snippet?: string;
  snippetField?: 'title' | 'description';
  score: number;
}

interface SearchResponse {
  success: boolean;
  results: Record<string, SearchResultItem[]>;
  total: number;
  error?: string;
}

interface GlobalSearchProps {
  /** 点击结果时跳转到对应资料库 tab（可选） */
  onJump?: (type: string) => void;
  /** 外部传入的初始搜索关键词，挂载后自动搜索（#[20260827-1800]） */
  initialKeyword?: string;
}

// 可用搜索的模块（与 index.tsx 的 tab id 对应）
const SEARCH_TYPES = [
  { id: 'document', name: '技术文档', icon: '📄', color: 'bg-green-100 text-green-700' },
  { id: 'case', name: '案例', icon: '🏗️', color: 'bg-purple-100 text-purple-700' },
  { id: 'standard', name: '标准规范', icon: '📋', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'drawing', name: '图纸图片', icon: '🖼️', color: 'bg-pink-100 text-pink-700' },
  { id: 'quota', name: '定额', icon: '📊', color: 'bg-orange-100 text-orange-700' },
];

function renderSnippet(snippet: string | undefined): React.ReactNode {
  if (!snippet) return null;
  // 将 [[hl]]...[[/hl]] 标记转换为 <mark>
  const parts = snippet.split(/\[\[hl\]\]|\[\[\/hl\]\]/);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

export default function GlobalSearch({ onJump, initialKeyword }: GlobalSearchProps) {
  const [keyword, setKeyword] = useState(initialKeyword || '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(SEARCH_TYPES.map(t => t.id));
  const [results, setResults] = useState<Record<string, SearchResultItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const toggleType = (typeId: string) => {
    setSelectedTypes(prev =>
      prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
    );
  };

  const doSearch = useCallback(async (kw: string, types: string[]) => {
    if (!kw.trim()) {
      setResults({});
      setTotal(0);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        keyword: kw.trim(),
        types: types.join(','),
        limit: '20',
      });
      const res = await fetch(`/api/knowledge/search?${params.toString()}`);
      const data: SearchResponse = await res.json();
      if (!data.success) throw new Error(data.error || '搜索失败');
      setResults(data.results || {});
      setTotal(data.total || 0);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || '搜索失败，请稍后重试');
      setResults({});
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // 输入防抖
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      doSearch(keyword, selectedTypes);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [keyword, selectedTypes, doSearch]);

  const visibleTypes = SEARCH_TYPES.filter(t => selectedTypes.includes(t.id));
  const hasResults = visibleTypes.some(t => (results[t.id] || []).length > 0);

  return (
    <div className="space-y-6">
      {/* 搜索输入框 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          全局搜索 <span className="text-xs text-slate-400 font-normal">（可跨多个资料库搜索标题与描述）</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词，例如：混凝土、防水、验收规范…"
            className="w-full px-4 py-3 pl-11 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
          {loading && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm animate-pulse">搜索中…</span>
          )}
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="flex flex-wrap gap-2">
        {SEARCH_TYPES.map((type) => {
          const active = selectedTypes.includes(type.id);
          return (
            <button
              key={type.id}
              onClick={() => toggleType(type.id)}
              className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 border transition-colors ${
                active
                  ? `${type.color} border-transparent`
                  : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-600'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.name}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {searched && !loading && !hasResults && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <span className="text-5xl mb-4">🔍</span>
          <div className="text-lg font-medium text-slate-500">未找到相关内容</div>
          <p className="text-sm mt-2">换个关键词试试，或检查是否已选择对应的资料库类型</p>
        </div>
      )}

      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <span className="text-5xl mb-4">📚</span>
          <div className="text-lg font-medium text-slate-500">输入关键词开始搜索</div>
          <p className="text-sm mt-2">支持跨技术文档、案例、标准规范、图纸图片、定额库检索</p>
        </div>
      )}

      {/* 结果列表 */}
      {visibleTypes.map((type) => {
        const items = results[type.id] || [];
        if (items.length === 0) return null;
        return (
          <div key={type.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{type.icon}</span>
              <h3 className="font-medium text-slate-800 dark:text-slate-200">{type.name}</h3>
              <span className="text-xs text-slate-400">共 {items.length} 条</span>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 类型标签 */}
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${type.color}`}>
                          {item.typeLabel}
                        </span>
                        <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.snippetField === 'title' ? renderSnippet(item.snippet) : item.title}
                        </h4>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-3">
                        {item.snippetField === 'description' ? renderSnippet(item.snippet) : item.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* 相关性分数徽标 */}
                      {item.score > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.score >= 6
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : item.score >= 3
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                          title="相关性分数（基于关键词命中次数）"
                        >
                          相关度 {item.score}
                        </span>
                      )}
                      {/* 跳转详情 */}
                      {onJump && (
                        <button
                          onClick={() => onJump(item.type)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          前往该库查看 →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {total > 0 && (
        <div className="text-center text-sm text-slate-400 pt-2">
          共匹配 {total} 条结果，相关度按关键词命中次数计算
        </div>
      )}
    </div>
  );
}
