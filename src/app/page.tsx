'use client';

import React, { useState, useEffect } from 'react';
import ChatArea from '@/components/chat-area';
import ConversationList from '@/components/conversation-list';
import UserMenu from '@/components/user/user-menu';
import { SwitchProvider } from '@/components/switch-manager';
import { QuoteProvider } from '@/contexts/QuoteContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, MessageSquare, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export default function Home() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string>('新对话');

  // 监听对话标题变化
  useEffect(() => {
    const handleConversationTitleChange = (event: CustomEvent) => {
      const { title } = event.detail;
      setCurrentConversationTitle(title);
    };

    window.addEventListener('conversation-title-changed', handleConversationTitleChange as EventListener);
    return () => {
      window.removeEventListener('conversation-title-changed', handleConversationTitleChange as EventListener);
    };
  }, []);

  // 标记组件已初始化
  useEffect(() => {
    setIsInitialized(true);
    
    // 从本地存储读取侧边栏状态
    const savedState = localStorage.getItem('sidebar-collapsed');
    if (savedState) {
      setIsCollapsed(savedState === 'true');
    }
    
    console.log('[Home] 组件初始化，isCollapsed:', isCollapsed);
  }, []);

  // 保存侧边栏状态到本地存储
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
    console.log('[Home] 切换侧边栏状态:', newState);
  };

  const handleNewConversation = () => {
    console.log('[Home] 开始新建对话（只清空容器，不创建记录）');
    setSelectedConversationId(null);
    setCurrentConversationTitle('新对话');
    window.dispatchEvent(new CustomEvent('new-conversation'));
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSelectConversation = (id: string | null) => {
    console.log('[Home] 选择对话:', id);
    setSelectedConversationId(id);
    setSidebarOpen(false);
  };

  return (
    <TooltipProvider>
      <QuoteProvider>
        <SwitchProvider>
          <div className="flex h-screen bg-white dark:bg-gray-950 w-full overflow-hidden">
            {/* 桌面端侧边栏 - 分栏线只在展开时显示 */}
            <aside className={cn(
              "hidden lg:flex lg:flex-col bg-gray-50/50 dark:bg-gray-900/50 transition-all duration-300",
              isCollapsed ? "lg:w-16" : "lg:w-72 lg:border-r lg:border-gray-200 dark:lg:border-gray-800",
              "flex-shrink-0 h-full"
            )}>
              {/* Logo区域 - 包含收起按钮 */}
              <div className="h-16 flex items-center border-b border-gray-200 dark:border-gray-800 px-4 flex-shrink-0">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-lg">报</span>
                    </div>
                    {!isCollapsed && (
                      <span className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">报个价</span>
                    )}
                  </div>
                  
                  {/* 唯一的收起/展开按钮 - 添加悬浮提示 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0"
                        onClick={toggleSidebar}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronLeft className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{isCollapsed ? '展开侧边栏' : '收起侧边栏'}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* 对话列表 - 收起时完全不显示 */}
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden min-h-0">
                  <ScrollArea className="h-full">
                    <ConversationList 
                      selectedConversationId={selectedConversationId}
                      onSelectConversation={handleSelectConversation}
                      onNewConversation={handleNewConversation}
                      refreshTrigger={refreshTrigger}
                      hideEmptyConversations={true}
                      isCollapsed={isCollapsed}
                    />
                  </ScrollArea>
                </div>
              )}
            </aside>

            {/* 移动端侧边栏 */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent side="left" className="w-80 p-0 lg:hidden">
                <div className="flex h-full flex-col bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex h-16 items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 flex-shrink-0">
                    <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xl">报</span>
                    </div>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">报个价</span>
                  </div>
                  
                  <div className="flex-1 overflow-hidden min-h-0">
                    <ScrollArea className="h-full">
                      <ConversationList 
                        selectedConversationId={selectedConversationId}
                        onSelectConversation={handleSelectConversation}
                        onNewConversation={handleNewConversation}
                        refreshTrigger={refreshTrigger}
                        hideEmptyConversations={true}
                        isCollapsed={false}
                      />
                    </ScrollArea>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* 主内容区 - 无边框 */}
            <main className="flex flex-1 flex-col overflow-hidden min-w-0">
              {/* 桌面端导航栏 - 无边框 */}
              <div className="hidden lg:flex h-16 items-center justify-between px-6 bg-white dark:bg-gray-950 flex-shrink-0">
                <div className="w-32"></div>
                <div className="flex-1 flex justify-center min-w-0">
                  <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate px-4">
                    {currentConversationTitle}
                  </h1>
                </div>
                <div className="w-32 flex justify-end flex-shrink-0">
                  <UserMenu />
                </div>
              </div>

              {/* 移动端顶部栏 - 保留移动端边框 */}
              <div className="lg:hidden flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 bg-white dark:bg-gray-950 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden flex-shrink-0"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">报</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">报个价</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewConversation}
                  className="lg:hidden flex-shrink-0"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>

              {/* 聊天区域容器 */}
              <div className="flex-1 w-full flex justify-center overflow-auto min-h-0">
                <div className="w-full max-w-4xl h-full">
                  {isInitialized ? (
                    <ChatArea
                      conversationId={selectedConversationId}
                      onOpenRightPanel={() => {}}
                      onNewConversation={handleNewConversation}
                      onTitleChange={setCurrentConversationTitle}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </SwitchProvider>
      </QuoteProvider>
    </TooltipProvider>
  );
}
