'use client';

import { useState, useEffect } from 'react';
import ConversationList from '@/components/conversation-list';
import ChatArea from '@/components/chat-area';
import InfoPanel from '@/components/info-panel';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Menu, Settings as SettingsIcon, PanelLeft, PanelRight, Plus } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import LoginModal from '@/components/auth/login-modal';
import UserMenu from '@/components/user/user-menu';

interface SupplierInfo {
  companyName: string;
  logoUrl?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
}

export default function Home() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true); // 左侧边栏状态（桌面端）
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false); // 右侧边栏状态（桌面端），默认关闭
  const [key, setKey] = useState(0); // 用于强制重新渲染 ChatArea
  const [supplierInfo, setSupplierInfo] = useState<SupplierInfo | undefined>(undefined);
  const [user, setUser] = useState<any>(null); // 用户登录状态
  const [showLogin, setShowLogin] = useState(false); // 登录弹窗状态

  // 从 localStorage 读取 supplierInfo 和用户信息
  useEffect(() => {
    const savedSupplierInfo = localStorage.getItem('supplierInfo');
    if (savedSupplierInfo) {
      try {
        setSupplierInfo(JSON.parse(savedSupplierInfo));
      } catch (error) {
        console.error('Failed to parse supplierInfo from localStorage:', error);
      }
    }

    // 读取用户信息
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (error) {
        console.error('Failed to parse user from localStorage:', error);
      }
    }
  }, []);

  // 监听 localStorage 变化（当 InfoPanel 或用户信息更新时）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'supplierInfo' && e.newValue) {
        try {
          setSupplierInfo(JSON.parse(e.newValue));
        } catch (error) {
          console.error('Failed to parse supplierInfo from storage event:', error);
        }
      }
      if (e.key === 'user' && e.newValue) {
        try {
          setUser(JSON.parse(e.newValue));
        } catch (error) {
          console.error('Failed to parse user from storage event:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleNewConversation = () => {
    setSelectedConversationId(null);
    setKey(prev => prev + 1); // 强制重新渲染以重置 ChatArea 状态
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* 左侧对话列表 - 桌面端 */}
      {isLeftPanelOpen && (
        <div className="hidden lg:block w-72 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm transition-all duration-300">
          <ConversationList
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            onNewConversation={handleNewConversation}
          />
        </div>
      )}

      {/* 中间对话区 */}
      <div className={`
        flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950
        transition-all duration-300 ease-in-out
        ${!isLeftPanelOpen && !isRightPanelOpen ? 'max-w-7xl mx-auto' : ''}
      `}>
        {/* 桌面端顶部栏 */}
        <div className="hidden lg:flex items-center justify-between px-10 py-5 border-b-2 border-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 shadow-md sticky top-0 z-50">
          <div className="flex items-center gap-3">
            {/* 左侧边栏切换按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`text-white hover:bg-white/20 transition-all duration-200 active:scale-95 ${
                    !isLeftPanelOpen ? 'bg-white/10' : ''
                  }`}
                  onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                >
                  <PanelLeft className={`h-5 w-5 transition-transform duration-200 ${!isLeftPanelOpen ? 'rotate-180' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isLeftPanelOpen ? "收起对话列表" : "展开对话列表"}</p>
              </TooltipContent>
            </Tooltip>
            <h1 className="text-4xl font-black tracking-widest text-white">报个价</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* 登录按钮或用户菜单 */}
            {user ? (
              <UserMenu user={user} />
            ) : (
              <Button
                onClick={() => setShowLogin(true)}
                className="bg-white text-blue-600 hover:bg-blue-50 font-medium px-4 py-2"
              >
                登录 / 注册
              </Button>
            )}
            {/* xl断点以上时显示右侧边栏切换按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`hidden xl:flex text-white hover:bg-white/20 transition-all duration-200 active:scale-95 ${
                    !isRightPanelOpen ? 'bg-white/10' : ''
                  }`}
                  onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                >
                  <PanelRight className={`h-5 w-5 transition-transform duration-200 ${!isRightPanelOpen ? 'rotate-180' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isRightPanelOpen ? "收起信息管理" : "展开信息管理"}</p>
              </TooltipContent>
            </Tooltip>
            {/* xl断点以下时显示打开右侧面板按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="xl:hidden text-white hover:bg-white/20 transition-all duration-200"
                  onClick={() => setIsRightPanelOpen(true)}
                >
                  <SettingsIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>打开信息管理</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 移动端顶部栏 */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b-2 border-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 shadow-md">
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-block">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 transition-colors">
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-72 p-0 bg-white dark:bg-slate-950">
                      <VisuallyHidden>
                        <SheetTitle>对话历史</SheetTitle>
                        <SheetDescription>查看和管理所有报价对话记录</SheetDescription>
                      </VisuallyHidden>
                      <ConversationList
                        selectedConversationId={selectedConversationId}
                        onSelectConversation={(id) => {
                          setSelectedConversationId(id);
                        }}
                        onNewConversation={handleNewConversation}
                      />
                    </SheetContent>
                  </Sheet>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>打开对话列表</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <h1 className="text-2xl font-black tracking-widest text-white flex-1">报个价</h1>
          <div className="flex items-center gap-2">
            {/* 登录按钮或用户菜单（移动端） */}
            {user ? (
              <UserMenu user={user} />
            ) : (
              <Button
                onClick={() => setShowLogin(true)}
                className="bg-white text-blue-600 hover:bg-blue-50 font-medium px-3 py-1 text-sm h-auto"
              >
                登录
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 transition-colors"
                  onClick={() => setIsRightPanelOpen(true)}
                >
                  <SettingsIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>打开信息管理</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <ChatArea
          key={key}
          conversationId={selectedConversationId}
          onOpenRightPanel={() => setIsRightPanelOpen(true)}
          onNewConversation={handleNewConversation}
          supplierInfo={supplierInfo}
        />
      </div>

      {/* 右侧信息面板 - 桌面端 xl 断点以上 */}
      {isRightPanelOpen && (
        <div className="hidden xl:block w-96 border-l border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm transition-all duration-300">
          <InfoPanel />
        </div>
      )}

      {/* 移动端右侧面板 */}
      <Sheet open={isRightPanelOpen} onOpenChange={setIsRightPanelOpen}>
        <SheetContent side="right" className="w-96 p-0 overflow-y-auto bg-white dark:bg-slate-950">
          <VisuallyHidden>
            <SheetTitle>信息管理</SheetTitle>
            <SheetDescription>管理供应方、客户和商务条款信息</SheetDescription>
          </VisuallyHidden>
          <InfoPanel />
        </SheetContent>
      </Sheet>

      {/* 登录弹窗 */}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={(userData) => {
          setUser(userData);
          setShowLogin(false);
        }}
      />
    </div>
    </TooltipProvider>
  );
}
