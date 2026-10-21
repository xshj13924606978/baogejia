'use client';

import { useEffect, useState } from 'react';

/**
 * 微信绑定结果中间页（#20260822-1645）
 *
 * 触发链路：用户点击"绑定微信" → window.open 弹出扫码窗口 → 用户扫码 → 微信回调
 * 到 /api/auth/callback/[provider]（bind 模式）→ 服务端写入 user_oauth_bindings + 更新
 * users.wechat_* 字段 → 重定向到本页面。
 *
 * 本页面职责：
 * 1. 通过 window.opener.postMessage 通知主窗口绑定结果
 * 2. 1.5 秒后自动关闭弹窗（window.close）
 * 3. 若无 opener（用户直接访问或浏览器拦截），跳转回首页
 *
 * 该页面不依赖任何 layout/Provider，是独立的最小化中间页，避免绑写完成后"闪跳"首页
 * 打断用户在 ProfileDialog 的其他操作。
 */
export default function WechatBindResultPage() {
  const [status, setStatus] = useState<'success' | 'failed' | 'unknown'>('unknown');
  const [provider, setProvider] = useState<string>('wechat');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const failed = params.get('failed');
    const prov = params.get('provider') || 'wechat';
    const err = params.get('error');

    const finalStatus: 'success' | 'failed' | 'unknown' =
      success === '1' ? 'success' : failed === '1' ? 'failed' : 'unknown';

    setProvider(prov);
    setStatus(finalStatus);
    if (err) setErrorCode(err);

    // 通过 postMessage 通知主窗口（ProfileDialog / ProfilePanel 等）
    try {
      if (window.opener && !window.opener.closed) {
        // #20260827-1600：携带微信昵称/头像/openid（来自回调 URL 的真实 OAuth 数据），
        // 主窗口据此即时更新绑定状态（verify-session 不可用时的真实兜底数据）。
        window.opener.postMessage(
          {
            type: 'wechat_bound',
            provider: prov,
            success: finalStatus === 'success',
            nickname: params.get('nickname') || undefined,
            avatar: params.get('avatar') || undefined,
            openId: params.get('openid') || undefined,
          },
          window.location.origin
        );
      }
    } catch (e) {
      console.warn('[WechatBindResult] postMessage failed:', e);
    }

    // 1.5 秒后自动关闭弹窗；若非弹窗（opener 不存在），降级跳转到首页
    const timer = window.setTimeout(() => {
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
        } else {
          // opener 不存在 → 用户直接打开了本页面，降级跳回首页
          window.location.replace('/');
        }
      } catch (e) {
        // window.close 在某些浏览器会被忽略，降级跳转
        window.location.replace('/');
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, []);

  const isSuccess = status === 'success';
  const isFailed = status === 'failed';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
        color: '#1f2937',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: '32px 40px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          maxWidth: 360,
          width: '100%',
        }}
      >
        {isSuccess ? (
          <>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#10b981',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 32,
              }}
              aria-hidden
            >
              ✓
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {provider === 'wechat' ? '微信' : provider} 绑定成功
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              正在返回个人资料…
            </div>
          </>
        ) : isFailed ? (
          <>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#ef4444',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 28,
              }}
              aria-hidden
            >
              ✕
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {provider === 'wechat' ? '微信' : provider} 绑定失败
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {errorCode === 'already_bound'
                ? '该账号已绑定其他用户，请先解绑后再绑定'
                : '请稍后重试'}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#6b7280',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 28,
              }}
              aria-hidden
            >
              ?
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              正在处理…
            </div>
          </>
        )}
      </div>
    </div>
  );
}