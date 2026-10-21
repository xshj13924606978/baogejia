import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';

/**
 * 调用 /api/knowledge/download 流式下载知识库文件
 * 成功时自动创建 Blob URL 并触发下载/打开
 */
export async function downloadKnowledgeFile(entryId: string, fileName?: string) {
  const res = await fetch('/api/knowledge/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
    body: JSON.stringify({ entryId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '下载失败');
  }

  const blob = await res.blob();

  // 内容兜底校验：若服务端返回的是登录页/错误页 HTML（如认证被重定向），
  // 直接抛错而不是下载损坏文件（#20260822-2242）
  if (blob.size > 0) {
    const head = await blob.slice(0, 512).text();
    if (/^\s*<!DOCTYPE html|<html/i.test(head) || head.includes('Next.js') && head.includes('_next/')) {
      throw new Error('下载失败：请重新登录后再试');
    }
  }

  const url = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    a.click();
  } finally {
    // 延迟释放，避免大文件在点击瞬间失效
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  }
}

export async function downloadKnowledgeFileWithToast(
  entryId: string,
  fileName?: string,
  options?: { successMessage?: string }
) {
  try {
    await downloadKnowledgeFile(entryId, fileName);
    if (options?.successMessage) {
      toast.info(options.successMessage);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '下载失败');
    throw err;
  }
}
