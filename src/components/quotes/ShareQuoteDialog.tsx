'use client';

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Link as LinkIcon, MessageCircle, Building2, Mail, Loader2, Copy, Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

interface ShareQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteNumber: string;
  onSent?: () => void;
}

const shareOptions = [
  { key: 'link', label: '复制链接', desc: '复制链接发送给客户', icon: LinkIcon },
  { key: 'wechat', label: '微信分享', desc: '扫码或复制链接，微信内打开', icon: MessageCircle },
  { key: 'wecom', label: '企业微信', desc: '复制链接，在企业微信内发送', icon: Building2 },
  { key: 'email', label: '邮件发送', desc: '打开邮件客户端发送', icon: Mail },
] as const;

type ShareKey = (typeof shareOptions)[number]['key'];

export function ShareQuoteDialog({ open, onOpenChange, quoteId, quoteNumber, onSent }: ShareQuoteDialogProps) {
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeMode, setActiveMode] = useState<ShareKey | ''>('');

  const shareLink = typeof window !== 'undefined'
    ? `${window.location.origin}/quotes/share/${quoteId}`
    : '';

  /** 分享动作执行后同步更新报价单状态为 sent（幂等） */
  const markSent = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('报价单已发送');
        onSent?.();
      } else {
        toast.error(data.error || '更新发送状态失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSending(false);
    }
  };

  const copyLink = async (withToast = true) => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      if (withToast) toast.success('分享链接已复制');
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      toast.error('复制失败，请手动复制链接');
      return false;
    }
  };

  const openEmail = () => {
    const subject = encodeURIComponent(`报价单 ${quoteNumber || ''}`);
    const body = encodeURIComponent(`您好，\n\n请查收报价单 ${quoteNumber || ''}：\n${shareLink}\n`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleShare = async (key: ShareKey) => {
    setActiveMode(key);
    switch (key) {
      case 'link':
        await copyLink();
        break;
      case 'wechat':
        // 展示二维码并复制链接，提示在微信中打开
        await copyLink(false);
        break;
      case 'wecom':
        await copyLink(false);
        break;
      case 'email':
        openEmail();
        break;
      default:
        break;
    }
    await markSent();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>发送报价单</DialogTitle>
          <DialogDescription>
            报价单「{quoteNumber || '-'}」可通过以下方式分享给客户
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 分享链接 */}
          <div className="rounded-lg border bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600 break-all">{shareLink}</p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => copyLink()}
                disabled={!shareLink}
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          </div>

          {/* 分享方式 */}
          <div className="grid grid-cols-2 gap-3">
            {shareOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleShare(opt.key)}
                  disabled={sending || !shareLink}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <span className="mt-0.5">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs text-gray-500">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* 二维码（微信/企业微信模式） */}
          {(activeMode === 'wechat' || activeMode === 'wecom') && (
            <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
              {activeMode === 'wechat' ? (
                <>
                  <p className="text-sm text-gray-600">微信扫码查看报价单，或复制链接在微信中打开</p>
                  <QRCodeSVG value={shareLink} size={168} level="M" />
                  <p className="text-xs text-gray-400">二维码已内置报价单链接</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">链接已复制，在企业微信聊天窗口中粘贴发送即可</p>
                  <Building2 className="h-8 w-8 text-blue-600" />
                  <p className="text-xs text-gray-400">也可将报价单链接转发给客户</p>
                </>
              )}
            </div>
          )}

          {sending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在更新发送状态...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
