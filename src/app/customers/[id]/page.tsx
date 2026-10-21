'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  CustomerDetail,
  CustomerQuotes,
  CustomerFollowups,
  type Customer,
  type CustomerQuote,
} from '@/components/customers';
import { useCustomer } from '@/contexts/CustomerContext';

interface DetailData extends Customer {
  quotes: CustomerQuote[];
}

export default function UserCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { setCurrentCustomer } = useCustomer();
  const id = params.id;

  const [customer, setCustomer] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const json = await res.json();
      if (json.success) {
        setCustomer(json.data);
        setCurrentCustomer({
          id: String(json.data.id),
          companyName: json.data.company_name,
          contactPerson: json.data.contact_person || '',
          phone: json.data.phone || '',
          email: json.data.email || '',
          address: json.data.address || '',
        });
      } else {
        toast.error(json.error || '加载客户详情失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [id, setCurrentCustomer]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('客户已删除');
        router.push('/customers');
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
        <Button variant="outline" onClick={() => router.push('/customers')}>
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
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1 h-4 w-4 text-destructive" />
            删除
          </Button>
          <Button onClick={() => router.push(`/customers/${customer.id}/edit`)}>
            <Pencil className="mr-1 h-4 w-4" />
            编辑
          </Button>
          <Button variant="ghost" onClick={() => router.push('/customers')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回列表
          </Button>
        </div>
      </div>

      <CustomerDetail customer={customer} />

      <CustomerQuotes quotes={customer.quotes || []} />

      <CustomerFollowups customerId={customer.id} mode="user" />

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
