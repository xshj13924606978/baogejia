'use client';

/**
 * 知识库列表骨架屏加载组件
 * 用于各子库的加载状态显示
 */
export function KnowledgeListSkeleton({ count = 3, variant = 'card' }: { count?: number; variant?: 'card' | 'table' | 'wide' }) {
  if (variant === 'table') {
    return (
      <div className="space-y-0">
        {/* 表头骨架 */}
        <div className="flex gap-4 p-2 border-b">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: i === 0 ? '25%' : '12%' }} />
          ))}
        </div>
        {/* 行骨架 */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-4 p-2 border-b">
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: j === 0 ? '25%' : '12%' }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'wide') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 animate-pulse">
            <div className="flex justify-between items-start">
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="flex gap-4 mt-2">
                  <div className="h-3 bg-gray-100 rounded w-16" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // card variant (default)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count * 3 }).map((_, i) => (
        <div key={i} className="border rounded-lg p-3 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          </div>
          <div className="flex justify-between items-center mt-3 pt-2 border-t">
            <div className="h-3 bg-gray-100 rounded w-16" />
            <div className="h-3 bg-gray-100 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
