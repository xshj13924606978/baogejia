'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSwitch } from '@/components/switch-manager';
import { logOnce } from '@/lib/logger';

export default function FloatingSwitcher() {
  // TypeScript误报：useSwitch不接受任何参数
  const { fileGroupId, currentChoice, isLoading, hasFiles } = useSwitch();
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const _inputAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 移除频繁的状态日志，避免控制台过于嘈杂
    // logOnce('Floating', '状态已更新', { fileGroupId, currentChoice, isLoading, hasFiles });

    if (fileGroupId && hasFiles) {
      setIsVisible(true);
      // 查找输入区域
      findInputPosition();
    } else {
      setIsVisible(false);
    }
  }, [fileGroupId, currentChoice, isLoading, hasFiles]);

  // 查找输入框位置
  const findInputPosition = () => {
    // 查找输入区域
    const textarea = document.querySelector('textarea');
    const inputContainer = document.querySelector('.p-4.bg-white.dark\\:bg-slate-950.border-t');

    if (inputContainer) {
      const rect = inputContainer.getBoundingClientRect();
      setPosition({
        top: rect.top - 50, // 在输入框上方50px
        right: window.innerWidth - rect.right + 10, // 距离右侧10px
      });
    } else if (textarea) {
      const rect = textarea.getBoundingClientRect();
      setPosition({
        top: rect.top - 60,
        right: window.innerWidth - rect.right + 10,
      });
    }
  };

  // 监听滚动和窗口大小变化，更新位置
  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => {
      findInputPosition();
    };

    const handleResize = () => {
      findInputPosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVisible]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 300);
  };

  const handleChoiceChange = async (choice: string) => {
    if (isLoading) return;

    logOnce('Floating', `切换: ${currentChoice} -> ${choice}`);

    window.dispatchEvent(
      new CustomEvent('switch-change', {
        detail: {
          fileGroupId,
          choice,
        },
      })
    );

    setTimeout(() => {
      setIsHovered(false);
    }, 200);
  };

  const getCurrentIcon = () => {
    switch (currentChoice) {
      case 'quote':
        return '📊';
      case 'proposal':
        return '📝';
      case 'both':
        return '📑';
      default:
        return '⚡';
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed z-50 transition-all duration-200"
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`,
      }}
    >
      <div
        className="flex flex-col items-end"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 圆形主按钮 */}
        <Button
          size="icon"
          className="h-10 w-10 rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        >
          <span className="text-lg">{getCurrentIcon()}</span>
        </Button>

        {/* 小红点提示 */}
        {currentChoice && !isHovered && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900 animate-pulse" />
        )}

        {/* 悬浮展开菜单 - 在按钮左侧弹出，垂直居中 */}
        {isHovered && (
          <div
            className="absolute right-12 top-1/2 -translate-y-1/2 animate-in fade-in slide-in-from-right-2 duration-200"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Card className="backdrop-blur-md bg-white/95 dark:bg-gray-900/95 border border-gray-200/50 dark:border-gray-700/50 shadow-xl rounded-xl overflow-hidden w-64">
              <div className="p-3 space-y-1.5">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
                  请选择生成内容
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleChoiceChange('quote')}
                  disabled={isLoading}
                  className={`w-full justify-start gap-0 h-9 text-sm rounded-lg ${
                    currentChoice === 'quote'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-base w-5 text-center">📊</span>
                  <span className="flex-1 text-left">生成报价单</span>
                  {currentChoice === 'quote' && (
                    <span className="text-xs text-blue-600 w-3 text-right">✓</span>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleChoiceChange('proposal')}
                  disabled={isLoading}
                  className={`w-full justify-start gap-0 h-9 text-sm rounded-lg ${
                    currentChoice === 'proposal'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-base w-5 text-center">📝</span>
                  <span className="flex-1 text-left">生成方案</span>
                  {currentChoice === 'proposal' && (
                    <span className="text-xs text-purple-600 w-3 text-right">✓</span>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleChoiceChange('both')}
                  disabled={isLoading}
                  className={`w-full justify-start gap-0 h-9 text-sm rounded-lg ${
                    currentChoice === 'both'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-base w-5 text-center">📑</span>
                  <span className="flex-1 text-left">方案+报价</span>
                  {currentChoice === 'both' && (
                    <span className="text-xs text-emerald-600 w-3 text-right">✓</span>
                  )}
                </Button>

                {isLoading && (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <span className="text-xs text-gray-600 dark:text-gray-400">生成中...</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
