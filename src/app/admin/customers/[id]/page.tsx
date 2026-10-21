'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CustomerDetail,
  CustomerQuotes,
  CustomerFollowups,
  type Customer,
  type CustomerQuote,
} from '@/components/customers';

interface DetailData extends Customer {
  quotes: CustomerQuote[];
}

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [customer, setCustomer] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      const json = await res.json();
      if (json.success) {
        setCustomer(json.data);
      } else {
        toast.error(json.error || '加载客户详情失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('客户已删除');
        router.push('/admin/customers');
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Building2 className="h-8 w-8 opacity-40" />
        <p>客户不存在或已被删除</p>
        <Button variant="outline" onClick={() => router.push('/admin/customers')}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customer.company_name || '客户详情'}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.contact_person ? `联系人：${customer.contact_person} · ` : ''}
            {customer.phone || ''}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/admin/customers')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回列表
          </Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1 h-4 w-4 text-destructive" />
            删除
          </Button>
          <Button onClick={() => router.push(`/admin/customers/${customer.id}/edit`)}>
            <Pencil className="mr-1 h-4 w-4" />
            编辑
          </Button>
        </div>
      </div>

      <CustomerDetail customer={customer} />

      <CustomerQuotes quotes={customer.quotes || []} />

      <CustomerFollowups customerId={customer.id} mode="admin" />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除客户</DialogTitle>
            <DialogDescription>
              确定要删除客户「{customer.company_name}」吗？删除后将不再显示在客户列表中。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
