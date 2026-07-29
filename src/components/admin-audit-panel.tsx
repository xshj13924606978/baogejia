'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, X, Eye } from 'lucide-react';

interface UserAudit {
  id: string;
  username: string;
  email: string;
  phone: string;
  company: string;
  contact: string;
  role: string;
  status: string;
  created_at: string;
}

interface ProductAudit {
  id: string;
  name: string;
  brand: string;
  model: string;
  price: number;
  manufacturer_id: string;
  users: {
    id: string;
    username: string;
    company: string;
  };
  created_at: string;
}

interface AdminAuditPanelProps {
  userId: string;
  userRole: string;
}

export default function AdminAuditPanel({ userId, userRole }: AdminAuditPanelProps) {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<UserAudit[]>([]);
  const [products, setProducts] = useState<ProductAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditDialog, setAuditDialog] = useState<{
    open: boolean;
    type: 'user' | 'product';
    item: any;
  }>({ open: false, type: 'user', item: null });
  const [auditAction, setAuditAction] = useState<'approve' | 'reject'>('approve');
  const [auditReason, setAuditReason] = useState('');
  const [auditRole, setAuditRole] = useState<string>('普通用户');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAuditData();
  }, [activeTab]);

  const loadAuditData = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/admin/audit?type=${activeTab === 'users' ? 'users' : 'products'}`
      );
      const data = await res.json();

      if (data.success) {
        if (activeTab === 'users') {
          setUsers(data.users || []);
        } else {
          setProducts(data.products || []);
        }
      }
    } catch (error) {
      console.error('[AdminAudit] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAuditDialog = (type: 'user' | 'product', item: any) => {
    setAuditDialog({ open: true, type, item });
    setAuditAction('approve');
    setAuditReason('');
    setAuditRole('普通用户');
    setMessage(null);
  };

  const handleAudit = async () => {
    try {
      setSubmitting(true);
      setMessage(null);

      const res = await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: userId,
          target_id: auditDialog.item.id,
          type: auditDialog.type,
          action: auditAction,
          reason: auditAction === 'approve' ? auditRole : auditReason,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setTimeout(() => {
          setAuditDialog({ open: false, type: 'user', item: null });
          loadAuditData();
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error || '操作失败' });
      }
    } catch (error) {
      console.error('[AdminAudit] 审核失败:', error);
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  if (userRole !== '超级管理员') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>管理员审核</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">该功能仅限超级管理员使用</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white">
          <CardTitle>管理员审核</CardTitle>
          <CardDescription className="text-white/80">审核用户注册和产品上传</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">待审核用户 ({users.length})</TabsTrigger>
              <TabsTrigger value="products">待审核产品 ({products.length})</TabsTrigger>
            </TabsList>

            {/* 用户审核 */}
            <TabsContent value="users">
              {loading ? (
                <div className="text-center py-8">加载中...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无待审核用户</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户名</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>公司</TableHead>
                      <TableHead>申请角色</TableHead>
                      <TableHead>注册时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.company}</TableCell>
                        <TableCell>
                          <Badge>{user.role}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAuditDialog('user', user)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 产品审核 */}
            <TabsContent value="products">
              {loading ? (
                <div className="text-center py-8">加载中...</div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无待审核产品</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>产品名称</TableHead>
                      <TableHead>品牌</TableHead>
                      <TableHead>型号</TableHead>
                      <TableHead>价格</TableHead>
                      <TableHead>厂家</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.brand}</TableCell>
                        <TableCell>{product.model}</TableCell>
                        <TableCell className="text-brand-danger font-bold">¥{product.price}</TableCell>
                        <TableCell>{product.users?.company}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(product.created_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAuditDialog('product', product)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 审核对话框 */}
      <Dialog
        open={auditDialog.open}
        onOpenChange={(open) => !submitting && setAuditDialog({ ...auditDialog, open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{auditDialog.type === 'user' ? '审核用户' : '审核产品'}</DialogTitle>
            <DialogDescription>
              {auditDialog.type === 'user' ? (
                <>
                  用户: {auditDialog.item?.username}
                  <br />
                  公司: {auditDialog.item?.company}
                </>
              ) : (
                <>
                  产品: {auditDialog.item?.name}
                  <br />
                  厂家: {auditDialog.item?.users?.company}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>审核结果</Label>
              <Select value={auditAction} onValueChange={(v: any) => setAuditAction(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">通过</SelectItem>
                  <SelectItem value="reject">拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {auditDialog.type === 'user' && auditAction === 'approve' && (
              <div>
                <Label>分配角色</Label>
                <Select value={auditRole} onValueChange={setAuditRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="普通用户">普通用户</SelectItem>
                    <SelectItem value="高级用户">高级用户</SelectItem>
                    <SelectItem value="厂家">厂家</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {auditAction === 'reject' && (
              <div>
                <Label>拒绝原因</Label>
                <Textarea
                  placeholder="请输入拒绝原因"
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                />
              </div>
            )}
          </div>

          {message && (
            <Alert className="mt-4" variant={message.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAuditDialog({ open: false, type: 'user', item: null })}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={handleAudit}
              disabled={submitting || (auditAction === 'reject' && !auditReason)}
              className={auditAction === 'approve' ? 'bg-brand-secondary' : 'bg-red-500'}
            >
              {submitting ? (
                '处理中...'
              ) : auditAction === 'approve' ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              {submitting ? '处理中' : auditAction === 'approve' ? '通过' : '拒绝'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
