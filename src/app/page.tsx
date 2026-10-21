'use client';

import React, { useState, useEffect } from 'react';
import ChatArea from '@/components/chat-area';
import ConversationList from '@/components/conversation-list';
import UserMenu from '@/components/user/user-menu';
import { SwitchProvider } from '@/components/switch-manager';
import { QuoteProvider } from '@/contexts/QuoteContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, Plus, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function Home() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string>('新对话');
  const [supplierInfo, setSupplierInfo] = useState<any>(null);
  // 管理员待审核提醒（#20260820-1130-2）
  const { user } = useUser();
  const router = useRouter();
  const isAdmin = !!user && (user.role === 'super_admin' || user.role === 'admin');
  const [pendingCount, setPendingCount] = useState<{
    total: number;
    uploadPending: number;
    requestPending: number;
  } | null>(null);
  const [knowledgePendingCount, setKnowledgePendingCount] = useState<number>(0);

  // 消费微信绑定结果回跳参数（#20260821-2130）：callback 绑定成功/失败后整页跳回首页
  // 此时 UserContext 初始化已通过 verify-session 拿到含 wechat 的最新用户，仅需提示并清理 URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const bound = params.get('wechat_bound');
    if (bound === 'success') {
      toast.success('微信绑定成功');
    } else if (bound === 'failed') {
      toast.error('微信绑定失败，请重试');
    }
    if (bound === 'success' || bound === 'failed') {
      params.delete('wechat_bound');
      params.delete('provider');
      const query = params.toString();
      const cleanUrl = window.location.pathname + (query ? `?${query}` : '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  // 定时拉取待审核计数（管理员，60s 轮询）
  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      try {
        const [contributorRes, knowledgeRes] = await Promise.all([
          fetch('/api/admin/contributor/pending-count'),
          fetch('/api/admin/knowledge?status=pending&limit=1'),
        ]);
        const contributorData = await contributorRes.json();
        if (contributorData.success) {
          setPendingCount({
            total: contributorData.total || 0,
            uploadPending: contributorData.uploadPending || 0,
            requestPending: contributorData.requestPending || 0,
          });
        }
        const knowledgeData = await knowledgeRes.json();
        if (knowledgeData.success && knowledgeData.statusCounts) {
          setKnowledgePendingCount(knowledgeData.statusCounts.pending || 0);
        }
      } catch {}
    };
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [isAdmin]);

  // 从 localStorage 加载供应商信息，若为空则从 API 获取
  useEffect(() => {
    const load = async () => {
      try {
        const stored = localStorage.getItem('supplierInfo');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.companyName) {
            setSupplierInfo(parsed);
            return;
          }
        }
        // localStorage 为空时从 API 加载
        const res = await fetch('/api/suppliers');
        if (res.ok) {
          const result = await res.json();
          const suppliers = result.suppliers || (result.supplier ? [result.supplier] : []);
          const defaultOne = suppliers.find((s: any) => s.isDefault) || suppliers[0];
          if (defaultOne) {
            setSupplierInfo(defaultOne);
            localStorage.setItem('supplierInfo', JSON.stringify(defaultOne));
          }
        }
      } catch {}
    };
    load();
    window.addEventListener('supplier-info-updated', load);
    return () => window.removeEventListener('supplier-info-updated', load);
  }, []);

  // 监听对话标题变化
  useEffect(() => {
    const handleConversationTitleChange = (event: CustomEvent) => {
      const { title } = event.detail;
      setCurrentConversationTitle(title);
    };

    window.addEventListener(
      'conversation-title-changed',
      handleConversationTitleChange as EventListener
    );
    return () => {
      window.removeEventListener(
        'conversation-title-changed',
        handleConversationTitleChange as EventListener
      );
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

    // 对话上下文恢复（#[20260827-1630]-1）：刷新页面 / 从其他页面返回 / 切换路由后，
    // 直接读取持久化的会话 ID 并同步选中状态，驱动 ChatArea 从数据库恢复消息与标题。
    // #[20260827-1630]-2：改用 sessionStorage（关闭标签页即清空，重新打开为全新会话）
    try {
      const raw = sessionStorage.getItem('chat_area_restore_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.conversationId === 'string' && parsed.conversationId) {
          setSelectedConversationId(parsed.conversationId);
        }
      }
    } catch {}

  }, []);

  // 保存侧边栏状态到本地存储
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  const handleNewConversation = () => {
    setSelectedConversationId(null);
    setCurrentConversationTitle('新对话');
    // #[20260827-1630]-1：新建对话清除持久化状态（与 ChatArea 的 new-conversation 监听双保险，
    // 确保刷新后不会误恢复上一个对话）
    // #[20260827-1630]-2：改用 sessionStorage 保持一致
    try {
      sessionStorage.removeItem('chat_area_restore_v1');
    } catch {}
    window.dispatchEvent(new CustomEvent('new-conversation'));
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSelectConversation = (id: string | null) => {
    setSelectedConversationId(id);
    setSidebarOpen(false);
  };

  return (
    <TooltipProvider>
      <QuoteProvider>
        <SwitchProvider>
          <div className="flex h-screen supports-[height:100dvh]:h-dvh bg-white dark:bg-gray-950 w-full overflow-hidden">
            {/* 桌面端侧边栏 - 分栏线只在展开时显示 */}
            <aside
              className={cn(
                'hidden lg:flex lg:flex-col bg-gray-50/50 dark:bg-gray-900/50 transition-all duration-300',
                isCollapsed
                  ? 'lg:w-16'
                  : 'lg:w-72 lg:border-r lg:border-gray-200 dark:lg:border-gray-800',
                'flex-shrink-0 h-full'
              )}
            >
              {/* Logo区域 - 包含收起/展开按钮 */}
              <div className="h-16 flex items-center border-b border-gray-200 dark:border-gray-800 px-4 flex-shrink-0">
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                    <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-lg">报</span>
                    </div>
                    {!isCollapsed && (
                      <span className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                        报个价
                      </span>
                    )}
                  </div>

                  {/* 收起/展开按钮 - 始终显示 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-md border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 flex-shrink-0 shadow-sm"
                        onClick={toggleSidebar}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                        ) : (
                          <ChevronLeft className="h-4 w-4 text-gray-700 dark:text-gray-300" />
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
                    <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xl">报</span>
                    </div>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                      报个价
                    </span>
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
              {/* 管理员待审核横幅（#20260820-1130-2） */}
              {isAdmin && ((pendingCount && pendingCount.total > 0) || knowledgePendingCount > 0) && (
                <button
                  onClick={() => {
                    // 优先进入有待审核的模块；都有则按 贡献资料 → 产品修改 → 资料中心 优先级
                    if (pendingCount && pendingCount.total > 0) {
                      router.push(
                        `/admin/contributor?tab=${
                          pendingCount.requestPending > 0 ? 'requests' : 'pending'
                        }`
                      );
                    } else {
                      router.push('/admin/knowledge');
                    }
                  }}
                  className="flex-shrink-0 w-full bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm px-6 py-2 flex items-center justify-center gap-2 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  <span>
                    有 {((pendingCount?.total || 0) + knowledgePendingCount).toLocaleString()} 条内容待审核
                    {pendingCount && pendingCount.uploadPending > 0 && `（贡献资料 ${pendingCount.uploadPending} 条`}
                    {pendingCount && pendingCount.requestPending > 0 && `${pendingCount.uploadPending > 0 ? ' / ' : '（'}产品修改 ${pendingCount.requestPending} 条`}
                    {knowledgePendingCount > 0 && `${(pendingCount?.total || 0) > 0 ? ' / ' : '（'}资料中心 ${knowledgePendingCount} 条`}
                    {((pendingCount?.total || 0) + knowledgePendingCount) > 0 && '）'}
                    ，点击立即处理
                  </span>
                </button>
              )}
              {/* 桌面端导航栏 - 无边框 */}
              <div className="hidden lg:flex h-16 items-center justify-between px-6 bg-white dark:bg-gray-950 flex-shrink-0">
                <div className="w-36"></div>
                <div className="flex-1 flex justify-center min-w-0">
                  <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate px-4">
                    {currentConversationTitle}
                  </h1>
                </div>
                <div className="w-36 flex justify-end flex-shrink-0">
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
                  <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">报</span>
                  </div>
                  <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                    报个价
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNewConversation}
                    className="lg:hidden flex-shrink-0"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  {/* 移动端用户入口（#20260829-1100 补）：头像/登录 + 下拉菜单，小屏隐藏用户名只留头像 */}
                  <div className="lg:hidden flex-shrink-0 -mr-1">
                    <UserMenu />
                  </div>
                </div>
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
                      supplierInfo={supplierInfo}
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
