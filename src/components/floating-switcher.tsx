'use client';

import { useState, useEffect, useRef } from 'react';
import { useSwitch } from './switch-manager';

export default function FloatingSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const { fileGroupId, files, currentChoice, isLoading, setChoice, setLoading } = useSwitch();

  // 调试日志
  useEffect(() => {
    console.log('[Floating] 状态:', {
      fileGroupId,
      currentChoice,
      isLoading,
      hasFiles: files?.length,
    });
  }, [fileGroupId, currentChoice, isLoading, files]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 如果没有文件组，不显示
  if (!fileGroupId || !files || files.length === 0) {
    return null;
  }

  // 切换选项
  const handleSelect = async (choice: string) => {
    if (isLoading || choice === currentChoice) return;

    console.log('[Floating] 切换:', { from: currentChoice, to: choice });

    setIsOpen(false);
    setChoice(choice);

    // 调用父组件的切换函数（需要在父组件实现）
    const event = new CustomEvent('switch-change', {
      detail: { fileGroupId, choice },
    });
    window.dispatchEvent(event);
  };

  // 获取主按钮样式
  const getMainButtonStyle = () => {
    const baseStyle = 'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200';
    const colorStyle = {
      'quote': 'bg-blue-500 hover:bg-blue-600',
      'proposal': 'bg-green-500 hover:bg-green-600',
      'both': 'bg-purple-500 hover:bg-purple-600',
    }[currentChoice] || 'bg-blue-500 hover:bg-blue-600';

    return `${baseStyle} ${colorStyle} ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}`;
  };

  // 获取选项样式
  const getOptionStyle = (choice: string) => {
    if (choice === currentChoice) {
      return 'bg-opacity-20 border-2';
    }
    return 'hover:bg-gray-100';
  };

  return (
    <div ref={switcherRef} className="fixed bottom-24 right-6 z-[9999] pointer-events-none">
      {/* 主按钮 */}
      <button
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        className={getMainButtonStyle() + ' pointer-events-auto'}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <span className="text-xl">⚡</span>
        )}
      </button>

      {/* 悬浮提示 */}
      {!isOpen && !isLoading && (
        <div className="absolute bottom-16 right-0 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap pointer-events-auto shadow-lg">
          <div className="flex items-center gap-2">
            <span>
              {currentChoice === 'quote' && '📊 当前：生成报价单'}
              {currentChoice === 'proposal' && '📝 当前：生成方案'}
              {currentChoice === 'both' && '📑 当前：生成方案（内含报价）'}
            </span>
          </div>
          <div className="absolute bottom-[-6px] right-4 w-3 h-3 bg-gray-800 transform rotate-45"></div>
        </div>
      )}

      {/* 选项面板 */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px] pointer-events-auto">
          {isLoading ? (
            // 加载状态
            <div className="p-4 text-center">
              <div className="flex justify-center mb-3">
                <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <div className="text-sm text-gray-600">
                {currentChoice === 'quote' && '正在生成报价单...'}
                {currentChoice === 'proposal' && '正在生成方案...'}
                {currentChoice === 'both' && '正在生成方案（内含报价）...'}
              </div>
            </div>
          ) : (
            // 选项列表
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-700 mb-2 px-2">切换生成方式</div>

              <button
                onClick={() => handleSelect('quote')}
                disabled={isLoading}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                  currentChoice === 'quote'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span>📊</span> 生成报价单
                </span>
                {currentChoice === 'quote' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">当前</span>}
              </button>

              <button
                onClick={() => handleSelect('proposal')}
                disabled={isLoading}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                  currentChoice === 'proposal'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'hover:bg-gray-50 border border-transparent'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span>📝</span> 生成方案
                </span>
                {currentChoice === 'proposal' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">当前</span>}
              </button>

              <button
                onClick={() => handleSelect('both')}
                disabled={isLoading}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                  currentChoice === 'both'
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : 'hover:bg-gray-50 border border-transparent'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span>📑</span> 生成方案（内含报价）
                </span>
                {currentChoice === 'both' && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">当前</span>}
              </button>
            </div>
          )}

          {/* 小三角 */}
          <div className="absolute bottom-[-6px] right-4 w-3 h-3 bg-white border-r border-b border-gray-200 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
}
