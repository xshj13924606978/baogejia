'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Filter,
  Download,
  UserPlus,
  MoreHorizontal,
  Shield,
  Clock,
  Calendar,
  Edit2,
  Trash2,
  Ban,
  CheckCircle,
  Key,
  History,
  Users as UsersIcon,
  Building2,
  Star,
  Gift,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { UserRole, UserStatus, UserType, getRoleDisplayName } from '@/lib/auth/roles';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  userType: UserType;
  status: UserStatus;
  department?: string;
  company?: string;
  phone?: string;
  lastActive: string;
  createdAt: string;
  expiresAt?: string;
  membershipLevel?: string;
  points: number;
  uploadCount: number;
  quoteCount: number;
  storageUsed: string;
  storageLimit: string;
  teamSize?: number;
  teamMembers?: string[];
  permissions: string[];
  tags?: string[];
  inviteCode?: string;
  invitedBy?: string;
}

// 模拟用户数据（丰富版，包含各种类型）
const mockUsers: User[] = [
  // 超级管理员
  {
    id: '1',
    name: '系统管理员',
    email: 'admin@baogejia.com',
    role: 'super_admin' as UserRole,
    userType: 'personal' as UserType,
    status: 'active' as UserStatus,
    phone: '13800138001',
    lastActive: '2024-02-26 14:30',
    createdAt: '2024-01-01',
    points: 9999,
    uploadCount: 999,
    quoteCount: 999,
    storageUsed: '5 GB',
    storageLimit: '无限',
    permissions: ['all'],
    tags: ['创始人', '超级管理员'],
  },
  // 企业管理员
  {
    id: '2',
    name: '张三',
    email: 'zhangsan@enterprise.com',
    role: 'enterprise_admin' as UserRole,
    userType: 'enterprise' as UserType,
    status: 'active' as UserStatus,
    company: '某某制造企业',
    department: '采购部',
    phone: '13800138002',
    lastActive: '2024-02-26 13:45',
    createdAt: '2024-01-15',
    points: 8500,
    uploadCount: 450,
    quoteCount: 230,
    storageUsed: '2.3 GB',
    storageLimit: '50 GB',
    teamSize: 15,
    teamMembers: ['user3', 'user4', 'user5'],
    permissions: ['upload', 'quote', 'team_manage'],
    tags: ['企业VIP', '大客户'],
  },
  // 普通管理员
  {
    id: '3',
    name: '李四',
    email: 'lisi@company.com',
    role: 'admin' as UserRole,
    userType: 'personal' as UserType,
    status: 'active' as UserStatus,
    company: '某某科技公司',
    department: '技术部',
    phone: '13800138003',
    lastActive: '2024-02-26 12:30',
    createdAt: '2024-02-01',
    points: 5200,
    uploadCount: 280,
    quoteCount: 140,
    storageUsed: '1.2 GB',
    storageLimit: '20 GB',
    permissions: ['upload', 'quote'],
    tags: ['资深用户'],
  },
  // 产品厂家
  {
    id: '4',
    name: '王五',
    email: 'wangwu@factory.com',
    role: 'manufacturer' as UserRole,
    userType: 'manufacturer' as UserType,
    status: 'active' as UserStatus,
    company: '某某设备制造厂',
    department: '销售部',
    phone: '13800138004',
    lastActive: '2024-02-26 11:20',
    createdAt: '2024-02-10',
    points: 3800,
    uploadCount: 180,
    quoteCount: 95,
    storageUsed: '850 MB',
    storageLimit: '10 GB',
    permissions: ['upload', 'quote', 'view_analytics'],
    tags: ['厂家认证'],
  },
  // VIP会员
  {
    id: '5',
    name: '赵六',
    email: 'zhaoliu@vip.com',
    role: 'vip' as UserRole,
    userType: 'personal' as UserType,
    status: 'active' as UserStatus,
    phone: '13800138005',
    lastActive: '2024-02-26 10:15',
    createdAt: '2024-02-18',
    points: 6800,
    uploadCount: 350,
    quoteCount: 175,
    storageUsed: '1.8 GB',
    storageLimit: '15 GB',
    membershipLevel: 'VIP',
    permissions: ['upload', 'quote', 'export'],
    tags: ['VIP用户', '活跃'],
  },
  // 付费会员
  {
    id: '6',
    name: '孙七',
    email: 'sunqi@premium.com',
    role: 'premium' as UserRole,
    userType: 'personal' as UserType,
    status: 'active' as UserStatus,
    phone: '13800138006',
    lastActive: '2024-02-26 08:45',
    createdAt: '2024-02-20',
    points: 2100,
    uploadCount: 95,
    quoteCount: 47,
    storageUsed: '450 MB',
    storageLimit: '5 GB',
    membershipLevel: 'Premium',
    permissions: ['upload', 'quote'],
    tags: ['付费用户'],
  },
  // 待审核用户
  {
    id: '7',
    name: '周八',
    email: 'zhouba@pending.com',
    role: 'pending' as UserRole,
    userType: 'personal' as UserType,
    status: 'pending' as UserStatus,
    phone: '13800138007',
    lastActive: '2024-02-26 08:00',
    createdAt: '2024-02-26',
    points: 0,
    uploadCount: 0,
    quoteCount: 0,
    storageUsed: '0 MB',
    storageLimit: '10 MB',
    permissions: [],
    tags: ['待审核'],
    inviteCode: 'INVITE123',
    invitedBy: 'user2',
  },
];

export default function UsersPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [_currentUser, _setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // 获取当前登录用户
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        _setCurrentUser(JSON.parse(userStr));
      }
    } catch (_error) {
      console.error('Failed to parse user data');
    }
  }, []);

  // 角色选项
  const roleOptions = [
    { value: 'super_admin', label: '超级管理员', color: 'bg-purple-500' },
    { value: 'admin', label: '系统管理员', color: 'bg-blue-500' },
    { value: 'enterprise_admin', label: '企业管理员', color: 'bg-indigo-500' },
    { value: 'manufacturer', label: '产品厂家', color: 'bg-orange-500' },
    { value: 'vip', label: 'VIP会员', color: 'bg-yellow-500' },
    { value: 'premium', label: '付费会员', color: 'bg-green-500' },
    { value: 'free', label: '免费用户', color: 'bg-gray-500' },
    { value: 'pending', label: '待审核', color: 'bg-red-500' },
  ];

  // 用户类型选项
  const typeOptions = [
    { value: 'personal', label: '个人用户', icon: '👤' },
    { value: 'enterprise', label: '企业用户', icon: '🏢' },
    { value: 'manufacturer', label: '产品厂家', icon: '🏭' },
  ];

  // 状态选项
  const statusOptions = [
    { value: 'active', label: '活跃', color: 'bg-green-100 text-green-800' },
    { value: 'inactive', label: '未激活', color: 'bg-gray-100 text-gray-800' },
    { value: 'pending', label: '待审核', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'banned', label: '已禁用', color: 'bg-red-100 text-red-800' },
    { value: 'expired', label: '已过期', color: 'bg-gray-100 text-gray-800' },
  ];

  // 筛选用户
  const filteredUsers = mockUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    const matchesType = selectedType === 'all' || user.userType === selectedType;
    const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus;
    return matchesSearch && matchesRole && matchesType && matchesStatus;
  });

  // 获取角色标签颜色
  const getRoleColor = (role: string) => {
    const option = roleOptions.find((opt) => opt.value === role);
    return option?.color || 'bg-gray-500';
  };

  // 获取状态标签样式
  const getStatusStyle = (status: string) => {
    const option = statusOptions.find((opt) => opt.value === status);
    return option?.color || 'bg-gray-100 text-gray-800';
  };

  // 获取状态标签文字
  const getStatusLabel = (status: string) => {
    const option = statusOptions.find((opt) => opt.value === status);
    return option?.label || status;
  };

  // 处理添加用户
  const handleAddUser = () => {
    toast({
      title: '用户已添加',
      description: '新用户已成功添加到系统',
      duration: 2000,
    });
    setShowAddDialog(false);
  };

  // 处理升级会员
  const handleUpgradeMembership = (_user: User) => {
    toast({
      title: '升级会员',
      description: '会员升级功能即将推出',
      duration: 2000,
    });
  };

  // 处理调整积分
  const handleAdjustPoints = (_user: User) => {
    toast({
      title: '调整积分',
      description: '积分调整功能即将推出',
      duration: 2000,
    });
  };

  // 处理邀请记录
  const handleViewInvites = (_user: User) => {
    toast({
      title: '邀请记录',
      description: `该用户邀请了 ${Math.floor(Math.random() * 10)} 人`,
      duration: 2000,
    });
  };

  // 统计信息
  const stats = {
    total: mockUsers.length,
    active: mockUsers.filter((u: User) => u.status === 'active').length,
    pending: mockUsers.filter((u: User) => u.status === 'pending').length,
    enterprise: mockUsers.filter((u: User) => u.userType === 'enterprise').length,
    vip: mockUsers.filter((u: User) => u.role === 'vip').length,
    totalPoints: mockUsers.reduce((sum: number, u: User) => sum + u.points, 0),
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="text-gray-500">管理系统用户、角色和权限，支持多级用户类型</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            导出数据
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加用户
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <UsersIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总用户</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">活跃</p>
                <p className="text-xl font-bold">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">待审核</p>
                <p className="text-xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-lg">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">企业用户</p>
                <p className="text-xl font-bold">{stats.enterprise}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg">
                <Star className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">VIP</p>
                <p className="text-xl font-bold">{stats.vip}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Gift className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总积分</p>
                <p className="text-xl font-bold">{stats.totalPoints.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选和搜索 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索用户、邮箱、公司或部门..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="用户类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                筛选
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>公司/部门</TableHead>
                <TableHead>积分</TableHead>
                <TableHead>使用统计</TableHead>
                <TableHead>存储</TableHead>
                <TableHead>有效期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {user.userType === 'enterprise'
                        ? '🏢 企业'
                        : user.userType === 'manufacturer'
                          ? '🏭 厂家'
                          : '👤 个人'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getRoleColor(user.role)} text-white`}>
                      {getRoleDisplayName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusStyle(user.status)}>
                      {getStatusLabel(user.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      {user.company && <p className="text-sm">{user.company}</p>}
                      {user.department && (
                        <p className="text-xs text-gray-500">{user.department}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Gift className="h-3 w-3 text-purple-500" />
                      <span className="font-medium">{user.points}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span>📤 {user.uploadCount}</span>
                        <span>📄 {user.quoteCount}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <div>{user.storageUsed}</div>
                      <div className="text-gray-500">/ {user.storageLimit}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.expiresAt ? (
                      <div className="flex items-center gap-1 text-yellow-600">
                        <Calendar className="h-3 w-3" />
                        <span className="text-xs">{user.expiresAt}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">永久</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>用户操作</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {}}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          编辑资料
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpgradeMembership(user)}>
                          <Star className="h-4 w-4 mr-2" />
                          会员升级
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAdjustPoints(user)}>
                          <Gift className="h-4 w-4 mr-2" />
                          调整积分
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {}}>
                          <Shield className="h-4 w-4 mr-2" />
                          设置权限
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {}}>
                          <Key className="h-4 w-4 mr-2" />
                          重置密码
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewInvites(user)}>
                          <UsersIcon className="h-4 w-4 mr-2" />
                          邀请记录
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <History className="h-4 w-4 mr-2" />
                          操作日志
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === 'active' ? (
                          <DropdownMenuItem className="text-yellow-600">
                            <Ban className="h-4 w-4 mr-2" />
                            禁用账号
                          </DropdownMenuItem>
                        ) : user.status === 'banned' ? (
                          <DropdownMenuItem className="text-green-600">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            启用账号
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除用户
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 添加用户对话框 - 支持多种用户类型 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>添加新用户</DialogTitle>
            <DialogDescription>填写用户信息，系统将根据用户类型自动分配权限</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="personal">👤 个人用户</TabsTrigger>
              <TabsTrigger value="enterprise">🏢 企业用户</TabsTrigger>
              <TabsTrigger value="manufacturer">🏭 产品厂家</TabsTrigger>
            </TabsList>
            <TabsContent value="personal" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>姓名</Label>
                  <Input placeholder="输入姓名" />
                </div>
                <div className="space-y-2">
                  <Label>邮箱</Label>
                  <Input type="email" placeholder="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>手机号</Label>
                  <Input placeholder="13800138000" />
                </div>
                <div className="space-y-2">
                  <Label>会员等级</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择等级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vip">VIP会员</SelectItem>
                      <SelectItem value="premium">付费会员</SelectItem>
                      <SelectItem value="free">免费用户</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="enterprise" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>企业名称</Label>
                  <Input placeholder="输入企业名称" />
                </div>
                <div className="space-y-2">
                  <Label>管理员姓名</Label>
                  <Input placeholder="输入管理员姓名" />
                </div>
                <div className="space-y-2">
                  <Label>企业邮箱</Label>
                  <Input type="email" placeholder="company@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>联系电话</Label>
                  <Input placeholder="021-12345678" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>企业地址</Label>
                  <Input placeholder="详细地址" />
                </div>
                <div className="space-y-2">
                  <Label>团队规模</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择规模" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10人</SelectItem>
                      <SelectItem value="11-50">11-50人</SelectItem>
                      <SelectItem value="51-200">51-200人</SelectItem>
                      <SelectItem value="200+">200人以上</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>套餐类型</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择套餐" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">基础版</SelectItem>
                      <SelectItem value="professional">专业版</SelectItem>
                      <SelectItem value="enterprise">企业版</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="manufacturer" className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>厂家名称</Label>
                  <Input placeholder="输入厂家名称" />
                </div>
                <div className="space-y-2">
                  <Label>联系人</Label>
                  <Input placeholder="联系人姓名" />
                </div>
                <div className="space-y-2">
                  <Label>联系电话</Label>
                  <Input placeholder="13800138000" />
                </div>
                <div className="space-y-2">
                  <Label>主营品类</Label>
                  <Input placeholder="如：工业设备、泵阀" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>厂家地址</Label>
                  <Input placeholder="详细地址" />
                </div>
                <div className="space-y-2">
                  <Label>产品数量</Label>
                  <Input type="number" placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>合作等级</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择等级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platinum">铂金厂家</SelectItem>
                      <SelectItem value="gold">金牌厂家</SelectItem>
                      <SelectItem value="silver">银牌厂家</SelectItem>
                      <SelectItem value="basic">基础厂家</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAddUser}>添加用户</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
