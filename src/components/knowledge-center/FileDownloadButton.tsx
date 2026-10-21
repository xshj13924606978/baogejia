'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FileDownloadButtonProps {
  /** 知识条目 ID */
  entryId: string;
  /** 原始文件名（用于 <a download> 兜底） */
  fileName?: string;
  /** 下载所需积分（>0 时下载前先检查用户积分余额） */
  cost?: number;
  /** 按钮文案，默认「下载」 */
  children?: React.ReactNode;
  /** 自定义 class（替换默认绿色文本样式） */
  className?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 下载成功回调 */
  onSuccess?: () => void;
}

/**
 * 知识库统一下载按钮
 *
 * 通过 /api/knowledge/download-url 获取签名 URL 后，
 * 创建 <a download> 标签触发浏览器原生下载，保留原始文件名。
 *
 * 扣费资料（cost > 0）点击后先弹出确认对话框（#202608242100），
 * 用户确认后再执行下载并扣除积分。
 */
export default function FileDownloadButton({
  entryId,
  fileName,
  cost = 0,
  children,
  className,
  disabled,
  onSuccess,
}: FileDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doDownload = useCallback(async () => {
    if (!entryId || loading) return;

    // 下载前积分余额检查：避免发起无意义的请求并给出明确引导
    if (cost > 0) {
      try {
        const pointsRes = await fetch('/api/user/points');
        const pointsData = await pointsRes.json().catch(() => ({}));
        const balance =
          typeof pointsData?.data?.points === 'number' ? pointsData.data.points : null;
        if (balance !== null && balance < cost) {
          toast.error('积分不足，无法下载', {
            description: `下载需要 ${cost} 积分，当前余额 ${balance} 积分。请前往「用户中心 - 积分中心」充值后再试。`,
          });
          return;
        }
      } catch {
        // 积分接口异常时不阻塞下载，由服务端兜底校验（402）
      }
    }

    setLoading(true);
    setSucceeded(false);
    try {
      const res = await fetch('/api/knowledge/download-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ entryId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || '生成下载链接失败';
        if (res.status === 402) {
          toast.error(msg, { description: `需要 ${data.required_points ?? ''} 积分` });
        } else {
          toast.error(msg);
        }
        return;
      }

      if (!data.url) {
        toast.error('服务器未返回下载链接');
        return;
      }

      // 签名 URL 为跨域地址，<a download> 的 download 属性在跨域场景会被浏览器忽略
      // （#20260823-1830），因此改用 window.open 直接导航：响应头
      // Content-Disposition: attachment 会触发浏览器原生下载并保留中文文件名。
      // 若 window.open 被弹窗拦截（返回 null），降级为隐藏 <a> 导航（行为等价）。
      let opened = false;
      try {
        opened = !!window.open(data.url, '_blank');
      } catch {
        opened = false;
      }
      if (!opened) {
        const anchor = document.createElement('a');
        anchor.href = data.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }

      setSucceeded(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSucceeded(false), 3000);
      toast.success('下载已开始');
      onSuccess?.();
    } catch (err) {
      console.error('[FileDownloadButton] 下载失败:', err);
      toast.error('下载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [entryId, fileName, cost, loading, onSuccess]);

  // 扣费资料先弹确认框，免费资料直接下载（#202608242100）
  const handleClick = useCallback(() => {
    if (!entryId || loading) return;
    if (cost > 0) {
      setConfirmOpen(true);
    } else {
      doDownload();
    }
  }, [entryId, loading, cost, doDownload]);

  const baseClass =
    className ??
    'text-xs text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={baseClass}
      >
        {loading ? '下载中…' : succeeded ? '已开始下载' : children || '下载'}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认下载</AlertDialogTitle>
            <AlertDialogDescription>
              下载此文件将扣除{' '}
              <span className="font-semibold text-foreground">{cost} 积分</span>
              ，确认继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                doDownload();
              }}
            >
              确认下载
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
