'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
  User,
  Settings,
  LogOut,
  CreditCard,
  Gift,
  Users,
  BarChart3,
  Bell,
  HelpCircle,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Building2,
  FileText,
  History,
  Star,
  Edit2,
  Download,
  Upload,
  Share2,
  Copy,
  Check,
  AlertCircle,
  LayoutDashboard,
  MessageSquare,
  FileSpreadsheet,
  Eye,
  Lock,
} from 'lucide-react';
import ManufacturerPaymentPanel from '@/components/manufacturer-payment-panel';
import { ProfileDialog } from '@/components/shared/profile-dialog';
import { useUser } from '@/contexts/UserContext';
import CustomerPanel from '@/components/user/customer-panel';
import { useRouter } from 'next/navigation';
import { useUserMenuConfig, type UserMenuGroup } from '@/hooks/useUserMenuConfig';
import { DynamicIcon } from '@/components/ui/dynamic-icon';

export default function UserMenu({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, loading, updateUser, logout, changePassword } = useUser();
  const _router = useRouter();
  const { toast } = useToast();
  const _fileInputRef = useRef<HTMLInputElement>(null);

  // 对话框状态
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showNotificationsDialog, setShowNotificationsDialog] = useState(false);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [showRecordsDialog, setShowRecordsDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  
  // 用户积分
  const [userPoints, setUserPoints] = useState(0);
  
  // 防抖机制：防止短时间内重复请求
  const [lastPointsRequestTime, setLastPointsRequestTime] = useState(0);
  const POINTS_REQUEST_DEBOUNCE = 1000; // 1秒内不重复请求
  
  // 加载用户积分
  useEffect(() => {
    const loadUserPoints = async () => {
      if (!user?.id) return;
      
      // 防抖：1秒内不重复请求
      const now = Date.now();
      if (now - lastPointsRequestTime < POINTS_REQUEST_DEBOUNCE) {
        return;
      }
      setLastPointsRequestTime(now);
      
      try {
        const response = await fetch(`/api/admin/users/${user.id}/points`);
        const data = await response.json();
        
        if (data.success && data.data) {
          setUserPoints(data.data.pointsBalance || 0);
          console.log(`[UserMenu] 加载用户积分成功: ${data.data.pointsBalance}`);
        }
      } catch (error) {
        console.error('[UserMenu] 获取用户积分失败:', error);
      }
    };
    
    loadUserPoints();
    
    // 监听积分更新事件（防抖机制已在 loadUserPoints 中实现）
    const handlePointsUpdate = () => {
      console.log('[UserMenu] 收到积分更新事件，刷新积分');
      // 重置最后请求时间，允许立即请求
      setLastPointsRequestTime(0);
      loadUserPoints();
    };
    
    window.addEventListener('points-updated', handlePointsUpdate);
    
    return () => {
      window.removeEventListener('points-updated', handlePointsUpdate);
    };
  }, [user?.id]);

  // 编辑状态
  const [_editingProfile,_setEditingProfilee] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(false);
  const [_editingCustomer, setEditingCustomer] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);
  const [_uploadingAvatar,_setUploadingAvatarr] = useState(false);

  // 密码表单状态
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // 生成随机key防止自动填充
  const [passwordFormKey, setPasswordFormKey] = useState(Math.random().toString(36));

  // 邀请记录弹窗状态
  const [showInviteRecordsDialog, setShowInviteRecordsDialog] = useState(false);

  // 表单数据 - 从user加载初始值
  const [_profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    avatar: '',
  });

  // 当密码弹窗打开时重置key
  useEffect(() => {
    if (showPasswordDialog) {
      setPasswordFormKey(Math.random().toString(36));
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    }
  }, [showPasswordDialog]);

  // 当user数据变化时更新表单
  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        company: user.company || '',
        address: user.address || '',
        avatar: user.avatar || '',
      });
    }
  }, [user]);

  const [supplierForm, setSupplierForm] = useState({
    companyName: '兴绿环境科技有限公司',
    contactPerson: '张经理',
    phone: '021-12345678',
    email: 'zhang@xinglv.com',
    address: '上海市浦东新区xx路123号',
    bankName: '中国建设银行上海分行',
    bankAccount: '3100 1234 5678 9012 345',
    taxNumber: '91310115MA1H123456',
  });

  const [_customerForm,_setCustomerFormm] = useState({
    name: 'XX工程项目部',
    projectName: '污水处理设备采购项目',
    contactPerson: '李工',
    phone: '13912345678',
    email: 'ligong@example.com',
    address: '江苏省苏州市工业园区',
  });

  const [termsForm, setTermsForm] = useState({
    payment: '预付30%，发货前付清70%',
    warranty: '整机质保12个月',
    delivery: '合同签订后15个工作日内',
    validity: '15天',
    taxRate: 13,
    shipping: 0,
    installation: 0,
    otherFees: 0,
  });

  // 设置状态
  const [settings, setSettings] = useState({
    notifications: {
      message: true,
      quote: true,
      points: true,
    },
    display: {
      darkMode: 'auto' as 'auto' | 'light' | 'dark',
      language: 'zh-CN',
    },
  });

  // 通知数据
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: '报价单已生成',
      message: '您的搅拌设备报价单已生成',
      time: '5分钟前',
      read: false,
      icon: '📄',
    },
    {
      id: 2,
      title: '积分到账',
      message: '邀请好友获得50积分',
      time: '1小时前',
      read: false,
      icon: '🎁',
    },
    {
      id: 3,
      title: '文件解析完成',
      message: '上传的PDF文件已解析完成',
      time: '2小时前',
      read: true,
      icon: '📁',
    },
    { id: 4, title: '系统通知', message: '新版本功能上线', time: '昨天', read: true, icon: '✨' },
  ]);

  // 邀请记录数据
  const [inviteRecords, _setInviteRecords] = useState([
    { id: 1, name: '张三', time: '2024-02-26', status: '已注册', points: 50 },
    { id: 2, name: '李四', time: '2024-02-25', status: '已注册', points: 50 },
    { id: 3, name: '王五', time: '2024-02-24', status: '待激活', points: 0 },
  ]);

  // 最近记录数据
  const [recentRecords, _setRecentRecords] = useState([
    {
      id: 1,
      name: '搅拌设备报价单.pdf',
      type: 'pdf',
      action: 'download',
      time: '2024-02-26 14:30',
      size: '2.3 MB',
    },
    {
      id: 2,
      name: '泵类采购方案.docx',
      type: 'docx',
      action: 'preview',
      time: '2024-02-25 09:15',
      size: '1.1 MB',
    },
    {
      id: 3,
      name: '产品目录.xlsx',
      type: 'xlsx',
      action: 'upload',
      time: '2024-02-24 16:45',
      size: '3.2 MB',
    },
    {
      id: 4,
      name: '技术规范.pdf',
      type: 'pdf',
      action: 'share',
      time: '2024-02-23 11:20',
      size: '4.5 MB',
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getGradientByInitial = (initial: string) => {
    const gradients = [
      'from-blue-500 to-blue-600',
      'from-purple-500 to-purple-600',
      'from-green-500 to-green-600',
      'from-orange-500 to-orange-600',
      'from-pink-500 to-pink-600',
      'from-indigo-500 to-indigo-600',
    ];
    const index = (initial?.charCodeAt(0) || 65) % gradients.length;
    return gradients[index];
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string, message: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast({
          title: '复制成功',
          description: message,
          duration: 2000,
        });
      })
      .catch(() => {
        toast({
          title: '复制失败',
          description: '请手动复制',
          variant: 'destructive',
          duration: 2000,
        });
      });
  };

  // 下载文件
  const handleDownload = (fileName: string, _fileType_fileTypefileType: string) => {
    toast({
      title: '下载中',
      description: `正在下载 ${fileName}`,
      duration: 2000,
    });

    setTimeout(() => {
      const content = `这是${fileName}的示例内容`;
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: '下载完成',
        description: `${fileName} 已下载`,
        duration: 2000,
      });
    }, 1500);
  };

  // 预览文件
  const handlePreview = (fileName: string) => {
    toast({
      title: '预览',
      description: `正在打开 ${fileName}`,
      duration: 2000,
    });

    setTimeout(() => {
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write(`
          <html>
            <head><title>预览 - ${fileName}</title></head>
            <body style="padding:20px; font-family:system-ui">
              <h2>${fileName}</h2>
              <p>这是文件的预览内容示例。</p>
              <p>在实际应用中，这里会显示文件的实际内容。</p>
              <hr/>
              <p>文件类型: ${fileName.split('.').pop()}</p>
              <p>预览时间: ${new Date().toLocaleString()}</p>
            </body>
          </html>
        `);
        previewWindow.document.close();
      }
    }, 1000);
  };

  // 上传文件
  const handleUpload = (fileName: string) => {
    toast({
      title: '上传',
      description: `正在上传 ${fileName}`,
      duration: 2000,
    });

    setTimeout(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          toast({
            title: '上传成功',
            description: `${file.name} 已上传`,
            duration: 2000,
          });
        }
      };
      input.click();
    }, 1000);
  };

  // 分享文件
  const handleShare = (fileName: string) => {
    if (navigator.share) {
      navigator
        .share({
          title: '分享文件',
          text: fileName,
          url: window.location.href,
        })
        .catch(() => {
          copyToClipboard(fileName, '文件名称已复制');
        });
    } else {
      copyToClipboard(fileName, '文件名称已复制');
    }
  };

  // 保存供应商信息
  const handleSaveSupplier = () => {
    setEditingSupplier(false);
    setShowSupplierDialog(false);
    toast({
      title: '保存成功',
      description: '供应商信息已更新',
      duration: 2000,
    });
  };

  // 保存客户信息
  const _handleSaveCustomer = () => {
    setEditingCustomer(false);
    setShowCustomerDialog(false);
    toast({
      title: '保存成功',
      description: '客户信息已更新',
      duration: 2000,
    });
  };

  // 保存商务条款
  const handleSaveTerms = () => {
    setEditingTerms(false);
    setShowTermsDialog(false);
    toast({
      title: '保存成功',
      description: '商务条款已更新',
      duration: 2000,
    });
  };

  // 标记所有通知为已读
  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    toast({
      title: '操作成功',
      description: '所有通知已标记为已读',
      duration: 2000,
    });
  };

  // 分享邀请
  const handleShareInvite = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: '邀请好友',
          text: '加入报个价，一起生成报价',
          url: text,
        });
      } catch (_error) {
        copyToClipboard(text, '邀请链接已复制到剪贴板');
      }
    } else {
      copyToClipboard(text, '邀请链接已复制到剪贴板');
    }
  };

  // 处理设置变更
  const handleNotificationChange = (key: keyof typeof settings.notifications) => {
    setSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });
    toast({
      title: '设置已更新',
      description: '通知设置已保存',
      duration: 2000,
    });
  };

  const handleDarkModeChange = () => {
    const modes: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark'];
    const currentIndex = modes.indexOf(settings.display.darkMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setSettings({
      ...settings,
      display: {
        ...settings.display,
        darkMode: nextMode,
      },
    });

    if (nextMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (nextMode === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    toast({
      title: '显示模式已更新',
      description: `已切换为${nextMode === 'auto' ? '自动' : nextMode === 'light' ? '浅色' : '深色'}模式`,
      duration: 2000,
    });
  };

  const handleLanguageChange = () => {
    const languages = ['zh-CN', 'en-US'];
    const currentIndex = languages.indexOf(settings.display.language);
    const nextLang = languages[(currentIndex + 1) % languages.length];
    setSettings({
      ...settings,
      display: {
        ...settings.display,
        language: nextLang,
      },
    });
    toast({
      title: '语言已更新',
      description: nextLang === 'zh-CN' ? '已切换为简体中文' : 'Switched to English',
      duration: 2000,
    });
  };

  // 数据管理功能
  const handleExportData = () => {
    toast({
      title: '导出数据',
      description: '正在准备导出数据...',
      duration: 2000,
    });

    setTimeout(() => {
      const dataStr = JSON.stringify({ user, settings, notifications, recentRecords }, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `baogejia-export-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      toast({
        title: '导出成功',
        description: '数据已导出',
        duration: 2000,
      });
    }, 1500);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        toast({
          title: '导入数据',
          description: `正在导入 ${file.name}`,
          duration: 2000,
        });

        setTimeout(() => {
          toast({
            title: '导入成功',
            description: '数据已导入',
            duration: 2000,
          });
        }, 1500);
      }
    };
    input.click();
  };

  const handleClearCache = () => {
    toast({
      title: '清除缓存',
      description: '正在清除缓存...',
      duration: 2000,
    });

    setTimeout(() => {
      localStorage.clear();
      sessionStorage.clear();

      toast({
        title: '缓存已清除',
        description: '页面将刷新',
        duration: 2000,
      });

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }, 1500);
  };

  // 修改密码 - 唯一声明
  const handleChangePassword = async () => {
    // 验证密码
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({
        title: '请填写完整',
        description: '所有密码字段都必须填写',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: '密码不匹配',
        description: '新密码和确认密码不一致',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: '密码太短',
        description: '新密码长度至少为6位',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setChangingPassword(true);
    try {
      const success = await changePassword(passwordForm.oldPassword, passwordForm.newPassword);

      if (success) {
        toast({
          title: '修改成功',
          description: '密码已更新，请使用新密码重新登录',
          duration: 3000,
        });
        setShowPasswordDialog(false);
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast({
          title: '修改失败',
          description: '当前密码错误',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      toast({
        title: '修改失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    logout();
  };

  // 导航功能
  const handleNavigation = (path: string) => {
    window.location.href = path;
  };

  // 帮助功能
  const handleHelp = () => {
    window.open('https://help.baogejia.com', '_blank');
  };

  // 监听用户更新事件
  useEffect(() => {
    const handleUserUpdated = (event: CustomEvent) => {
      console.log('[UserMenu] 收到用户更新事件:', event.detail);
    };

    window.addEventListener('user-updated', handleUserUpdated as EventListener);
    return () => {
      window.removeEventListener('user-updated', handleUserUpdated as EventListener);
    };
  }, []);

  // 动态菜单配置（必须在条件返回之前调用，遵守 Hooks 规则）
  const { data: menuConfig, loading: menuLoading } = useUserMenuConfig();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <Button
        variant="default"
        size="sm"
        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
        onClick={() => handleNavigation('/login')}
      >
        登录
      </Button>
    );
  }

  // dialogKey → dialog 状态 setter 映射
  const dialogHandlers: Record<string, (open: boolean) => void> = {
    profile: setShowProfileDialog,
    password: setShowPasswordDialog,
    points: setShowPointsDialog,
    invite: setShowInviteDialog,
    notifications: setShowNotificationsDialog,
    supplier: setShowSupplierDialog,
    customer: setShowCustomerDialog,
    terms: setShowTermsDialog,
    stats: setShowStatsDialog,
    records: setShowRecordsDialog,
    settings: setShowSettingsDialog,
  };

  // 处理菜单项点击
  const handleMenuItemClick = (item: any) => {
    const dialogKey = item.config?.dialogKey;
    const actionType = item.action_type;

    if (actionType === 'navigate' && item.route_path) {
      handleNavigation(item.route_path);
    } else if (actionType === 'external') {
      const url = item.config?.externalUrl || item.route_path;
      if (url) window.open(url, '_blank');
      else handleHelp();
    } else if (actionType === 'dialog' && dialogKey) {
 if (dialogKey === 'payment') {
        setShowPaymentPanel(!showPaymentPanel);
      } else {
        const handler = dialogHandlers[dialogKey];
        if (handler) handler(true);
      }
    }
  };

  // 获取徽标值
  const getBadgeValue = (item: any) => {
    const badgeKey = item.config?.badgeKey;
    if (badgeKey === 'points') return userPoints;
    if (badgeKey === 'unreadCount') return unreadCount;
    return null;
  };

  // 动态渲染菜单内容
  const renderDynamicMenu = (groups: UserMenuGroup[]) => {
    return groups.map((group, groupIdx) => (
      <React.Fragment key={group.id}>
        {groupIdx > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400 font-normal">
          {group.name_zh}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {group.items.map((item) => {
            const badgeValue = getBadgeValue(item);
            const isPaymentPanel = item.config?.hasSubPanel;
            return (
              <DropdownMenuItem
                key={item.id}
                className="cursor-pointer"
                onClick={() => handleMenuItemClick(item)}
              >
                <DynamicIcon name={item.icon || group.icon || 'User'} className="mr-2 h-4 w-4" />
                <span>{item.name_zh}</span>
                {isPaymentPanel && (
                  <ChevronDown
                    className={`ml-auto h-4 w-4 transition-transform duration-200 ${
                      showPaymentPanel ? 'rotate-180' : ''
                    }`}
                  />
                )}
                {!isPaymentPanel && badgeValue !== null && badgeValue > 0 && (
                  <Badge
                    variant="secondary"
                    className={`ml-auto border-0 text-xs ${
                      item.badge_type === 'danger'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {badgeValue}
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </React.Fragment>
    ));
  };

  const initials =
    user.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() ||
    user.email?.[0].toUpperCase() ||
    'U';

  const gradientClass = getGradientByInitial(initials);

  // 判断是否使用动态菜单：配置加载成功且有数据时使用动态菜单，否则降级到硬编码菜单
  const useDynamicMenu = !menuLoading && menuConfig.length > 0;

  return (
    <TooltipProvider>
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 h-9 hover:bg-transparent"
            >
              <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-950 ring-blue-100 dark:ring-blue-900">
                {user.avatar ? <AvatarImage src={user.avatar} /> : null}
                <AvatarFallback
                  className={`bg-gradient-to-br ${gradientClass} text-white text-sm font-medium`}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[100px] truncate">
                {user.name || '用户'}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-72 max-h-[80vh] overflow-y-auto">
            {useDynamicMenu ? (
              <>
                {renderDynamicMenu(menuConfig)}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 hover:text-red-700"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </>
            ) : (
              <>
                {/* 降级：硬编码菜单（配置加载失败时使用） */}
                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  我的账户
                </DropdownMenuLabel>

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowProfileDialog(true)}
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>个人资料</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowPasswordDialog(true)}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    <span>修改密码</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowPointsDialog(true)}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>积分明细</span>
                    <Badge variant="secondary" className="ml-auto bg-amber-50 text-amber-700 border-0">
                      {userPoints}
                    </Badge>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowInviteDialog(true)}
                  >
                    <Gift className="mr-2 h-4 w-4" />
                    <span>邀请好友</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowNotificationsDialog(true)}
                  >
                    <Bell className="mr-2 h-4 w-4" />
                    <span>通知中心</span>
                    {unreadCount > 0 && (
                      <Badge className="ml-auto bg-red-50 text-red-700 border-0 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  商务信息
                </DropdownMenuLabel>

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowSupplierDialog(true)}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <span>供应方信息</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowCustomerDialog(true)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    <span>客户管理</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem className="cursor-pointer" onClick={() => setShowTermsDialog(true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    <span>商务条款</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  数据与统计
                </DropdownMenuLabel>

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowPaymentPanel(!showPaymentPanel)}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    <span>厂商支付排行</span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 transition-transform duration-200 ${
                        showPaymentPanel ? 'rotate-180' : ''
                      }`}
                    />
                  </DropdownMenuItem>

                  <DropdownMenuItem className="cursor-pointer" onClick={() => setShowStatsDialog(true)}>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    <span>数据统计</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowRecordsDialog(true)}
                  >
                    <History className="mr-2 h-4 w-4" />
                    <span>最近记录</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                  <DropdownMenuItem className="cursor-pointer" onClick={handleHelp}>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>帮助</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="cursor-pointer text-red-600 hover:text-red-700"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 共享的个人资料弹窗 */}
        <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />

        {/* 修改密码弹窗 - 使用key防止自动填充 */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="sm:max-w-[500px]" key={passwordFormKey}>
            <DialogHeader>
              <DialogTitle>修改密码</DialogTitle>
              <DialogDescription>请输入新密码，密码长度至少6位</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">当前密码</label>
                <Input
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, oldPassword: e.target.value })
                  }
                  placeholder="请输入当前密码"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">新密码</label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                  }
                  placeholder="请输入新密码"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">确认新密码</label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                  }
                  placeholder="请再次输入新密码"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  取消
                </Button>
                <Button onClick={handleChangePassword} disabled={changingPassword}>
                  {changingPassword ? '修改中...' : '确认修改'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 其他弹窗组件保持不变... */}
        {/* 厂商支付面板 */}
        {showPaymentPanel && (
          <Dialog open={showPaymentPanel} onOpenChange={setShowPaymentPanel}>
            <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>厂商支付排行</DialogTitle>
                <DialogDescription>按支付金额排序的厂商排行榜</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <ManufacturerPaymentPanel />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* 积分明细弹窗 */}
        <Dialog open={showPointsDialog} onOpenChange={setShowPointsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>积分明细</DialogTitle>
              <DialogDescription>查看您的积分获取和消费记录</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">当前积分</p>
                    <p className="text-2xl font-bold">{userPoints}</p>
                  </div>
                  <Sparkles className="h-8 w-8 opacity-90" />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">最近记录</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <div>
                        <p className="text-sm font-medium">上传文件</p>
                        <p className="text-xs text-gray-500">2024-02-26</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-700">+10</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💰</span>
                      <div>
                        <p className="text-sm font-medium">生成报价</p>
                        <p className="text-xs text-gray-500">2024-02-25</p>
                      </div>
                    </div>
                    <Badge className="bg-red-100 text-red-700">-5</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎁</span>
                      <div>
                        <p className="text-sm font-medium">每日登录</p>
                        <p className="text-xs text-gray-500">2024-02-25</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-700">+2</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👥</span>
                      <div>
                        <p className="text-sm font-medium">邀请好友</p>
                        <p className="text-xs text-gray-500">2024-02-24</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-700">+50</Badge>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium mb-2">积分规则</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>✅ 上传文件 +10</div>
                  <div>✅ 分享知识 +20</div>
                  <div>✅ 每日登录 +2</div>
                  <div>✅ 邀请好友 +50</div>
                  <div>❌ 生成报价 -5</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 邀请好友弹窗 */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>邀请好友</DialogTitle>
              <DialogDescription>邀请好友注册，双方都可获得积分奖励</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-600">已邀请好友</p>
                    <p className="text-2xl font-bold">3人</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">获得积分</p>
                    <p className="text-2xl font-bold text-green-600">+150</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">邀请码</label>
                  <div className="flex gap-2 mt-1">
                    <Input value="ABC123XYZ" readOnly className="bg-gray-50" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard('ABC123XYZ', '邀请码已复制')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">邀请链接</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value="https://baogejia.com/invite/ABC123XYZ"
                      readOnly
                      className="bg-gray-50 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard('https://baogejia.com/invite/ABC123XYZ', '邀请链接已复制')
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600"
                  onClick={() => handleShareInvite('https://baogejia.com/invite/ABC123XYZ')}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  分享
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowInviteRecordsDialog(true)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  邀请记录
                </Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">邀请排行榜</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs">
                        1
                      </span>
                      <span className="text-sm">张三</span>
                    </div>
                    <span className="text-sm font-medium">15人</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs">
                        2
                      </span>
                      <span className="text-sm">李四</span>
                    </div>
                    <span className="text-sm font-medium">12人</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs">
                        3
                      </span>
                      <span className="text-sm">王五</span>
                    </div>
                    <span className="text-sm font-medium">8人</span>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 邀请记录弹窗 */}
        <Dialog open={showInviteRecordsDialog} onOpenChange={setShowInviteRecordsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>邀请记录</DialogTitle>
              <DialogDescription>您邀请的好友列表</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                {inviteRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-100 text-blue-700">
                          {record.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{record.name}</p>
                        <p className="text-xs text-gray-500">{record.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        className={
                          record.status === '已注册'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }
                      >
                        {record.status}
                      </Badge>
                      {record.points > 0 && (
                        <p className="text-xs text-green-600 mt-1">+{record.points}积分</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 通知中心弹窗 */}
        <Dialog open={showNotificationsDialog} onOpenChange={setShowNotificationsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>通知中心</DialogTitle>
              <DialogDescription>查看系统通知和消息</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{unreadCount}条未读</Badge>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                    <Check className="h-4 w-4 mr-2" />
                    全部已读
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      !item.read ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setNotifications(
                        notifications.map((n) => (n.id === item.id ? { ...n, read: true } : n))
                      );
                    }}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{item.title}</p>
                        {!item.read && <span className="w-2 h-2 bg-blue-600 rounded-full" />}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 数据统计弹窗 */}
        <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>数据统计</DialogTitle>
              <DialogDescription>查看您的使用数据统计</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 mb-2" />
                  <p className="text-xs text-gray-600">报价单</p>
                  <p className="text-xl font-bold">28</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-green-600 mb-2" />
                  <p className="text-xs text-gray-600">对话</p>
                  <p className="text-xl font-bold">45</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 mb-2" />
                  <p className="text-xs text-gray-600">合作厂商</p>
                  <p className="text-xl font-bold">12</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg">
                  <Star className="h-5 w-5 text-amber-600 mb-2" />
                  <p className="text-xs text-gray-600">好评率</p>
                  <p className="text-xl font-bold">96%</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">月度趋势</h4>
                <div className="h-32 flex items-end justify-between gap-2">
                  <div className="w-8 bg-blue-100 rounded-t" style={{ height: '40px' }} />
                  <div className="w-8 bg-blue-200 rounded-t" style={{ height: '60px' }} />
                  <div className="w-8 bg-blue-300 rounded-t" style={{ height: '80px' }} />
                  <div className="w-8 bg-blue-400 rounded-t" style={{ height: '100px' }} />
                  <div className="w-8 bg-blue-500 rounded-t" style={{ height: '120px' }} />
                  <div className="w-8 bg-blue-600 rounded-t" style={{ height: '140px' }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>1月</span>
                  <span>2月</span>
                  <span>3月</span>
                  <span>4月</span>
                  <span>5月</span>
                  <span>6月</span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 最近记录弹窗 */}
        <Dialog open={showRecordsDialog} onOpenChange={setShowRecordsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>最近记录</DialogTitle>
              <DialogDescription>查看您的操作历史</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                {recentRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {record.type === 'pdf' && <FileText className="h-5 w-5 text-red-500" />}
                      {record.type === 'docx' && <FileText className="h-5 w-5 text-blue-500" />}
                      {record.type === 'xlsx' && (
                        <FileSpreadsheet className="h-5 w-5 text-green-500" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{record.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{record.time}</span>
                          <span>•</span>
                          <span>{record.size}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {record.action === 'download' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8"
                              onClick={() => handleDownload(record.name, record.type)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>下载</TooltipContent>
                        </Tooltip>
                      )}
                      {record.action === 'preview' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8"
                              onClick={() => handlePreview(record.name)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>预览</TooltipContent>
                        </Tooltip>
                      )}
                      {record.action === 'upload' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8"
                              onClick={() => handleUpload(record.name)}
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>上传</TooltipContent>
                        </Tooltip>
                      )}
                      {record.action === 'share' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8"
                              onClick={() => handleShare(record.name)}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>分享</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() =>
                  toast({ title: '查看全部', description: '正在加载更多记录...', duration: 2000 })
                }
              >
                查看全部记录
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 供应商信息弹窗 */}
        <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>供应方信息</DialogTitle>
              <DialogDescription>管理您的公司信息和账户</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex justify-end">
                {!editingSupplier ? (
                  <Button variant="outline" size="sm" onClick={() => setEditingSupplier(true)}>
                    <Edit2 className="h-3 w-3 mr-2" />
                    编辑
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingSupplier(false)}>
                      取消
                    </Button>
                    <Button size="sm" onClick={handleSaveSupplier}>
                      保存
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">公司名称</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.companyName}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, companyName: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.companyName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">联系人</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.contactPerson}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, contactPerson: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.contactPerson}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">电话</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.phone}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">邮箱</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.email}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">地址</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.address}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, address: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.address}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">开户银行</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.bankName}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, bankName: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.bankName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">银行账号</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.bankAccount}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, bankAccount: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.bankAccount}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">税号</label>
                  {editingSupplier ? (
                    <Input
                      value={supplierForm.taxNumber}
                      onChange={(e) =>
                        setSupplierForm({ ...supplierForm, taxNumber: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{supplierForm.taxNumber}</p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 客户管理弹窗 */}
        <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                客户资料管理
              </DialogTitle>
              <DialogDescription>选择已有客户或添加新客户</DialogDescription>
            </DialogHeader>
            <CustomerPanel />
          </DialogContent>
        </Dialog>

        {/* 商务条款弹窗 */}
        <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>商务条款</DialogTitle>
              <DialogDescription>设置报价条款和费用</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex justify-end">
                {!editingTerms ? (
                  <Button variant="outline" size="sm" onClick={() => setEditingTerms(true)}>
                    <Edit2 className="h-3 w-3 mr-2" />
                    编辑
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingTerms(false)}>
                      取消
                    </Button>
                    <Button size="sm" onClick={handleSaveTerms}>
                      保存
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">税率 (%)</label>
                  {editingTerms ? (
                    <Input
                      type="number"
                      value={termsForm.taxRate}
                      onChange={(e) =>
                        setTermsForm({ ...termsForm, taxRate: parseFloat(e.target.value) })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{termsForm.taxRate}%</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">运费 (元)</label>
                  {editingTerms ? (
                    <Input
                      type="number"
                      value={termsForm.shipping}
                      onChange={(e) =>
                        setTermsForm({ ...termsForm, shipping: parseFloat(e.target.value) })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">¥{termsForm.shipping}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">安装费 (元)</label>
                  {editingTerms ? (
                    <Input
                      type="number"
                      value={termsForm.installation}
                      onChange={(e) =>
                        setTermsForm({ ...termsForm, installation: parseFloat(e.target.value) })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">¥{termsForm.installation}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">其他费用 (元)</label>
                  {editingTerms ? (
                    <Input
                      type="number"
                      value={termsForm.otherFees}
                      onChange={(e) =>
                        setTermsForm({ ...termsForm, otherFees: parseFloat(e.target.value) })
                      }
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">¥{termsForm.otherFees}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">付款方式</label>
                  {editingTerms ? (
                    <Input
                      value={termsForm.payment}
                      onChange={(e) => setTermsForm({ ...termsForm, payment: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{termsForm.payment}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">质保期</label>
                  {editingTerms ? (
                    <Input
                      value={termsForm.warranty}
                      onChange={(e) => setTermsForm({ ...termsForm, warranty: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{termsForm.warranty}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">交货期</label>
                  {editingTerms ? (
                    <Input
                      value={termsForm.delivery}
                      onChange={(e) => setTermsForm({ ...termsForm, delivery: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{termsForm.delivery}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">报价有效期</label>
                  {editingTerms ? (
                    <Input
                      value={termsForm.validity}
                      onChange={(e) => setTermsForm({ ...termsForm, validity: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-gray-50 rounded">{termsForm.validity}</p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 设置弹窗 */}
        <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>设置</DialogTitle>
              <DialogDescription>配置系统参数和偏好</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">通知设置</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm">新消息通知</span>
                  <Button
                    variant={settings.notifications.message ? 'default' : 'outline'}
                    size="sm"
                    className="h-7"
                    onClick={() => handleNotificationChange('message')}
                  >
                    {settings.notifications.message ? '开启' : '关闭'}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">报价单更新提醒</span>
                  <Button
                    variant={settings.notifications.quote ? 'default' : 'outline'}
                    size="sm"
                    className="h-7"
                    onClick={() => handleNotificationChange('quote')}
                  >
                    {settings.notifications.quote ? '开启' : '关闭'}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">积分变动通知</span>
                  <Button
                    variant={settings.notifications.points ? 'default' : 'outline'}
                    size="sm"
                    className="h-7"
                    onClick={() => handleNotificationChange('points')}
                  >
                    {settings.notifications.points ? '开启' : '关闭'}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-3">显示设置</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm">暗色模式</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={handleDarkModeChange}
                  >
                    {settings.display.darkMode === 'auto'
                      ? '自动'
                      : settings.display.darkMode === 'light'
                        ? '浅色'
                        : '深色'}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm">语言</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={handleLanguageChange}
                  >
                    {settings.display.language === 'zh-CN' ? '简体中文' : 'English'}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-3">数据管理</h4>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleExportData}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    导出数据
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleImportData}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    导入数据
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-red-600"
                    onClick={handleClearCache}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    清除缓存
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  );
}
