'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import { useUser } from '@/contexts/UserContext';
import { Loader2, Gift, Copy, Check, Share2, LogIn, ShieldCheck, ArrowRight } from 'lucide-react';

// 邀请奖励说明：积分值由 /api/contributor/points-rules 动态返回（fallback 20/30/50），
//   管理员在 points_rules 表调整后无需重新部署即可生效（#[20260827-1030]-8）。
const DEFAULT_INVITE_REWARD_RULES = [
  { label: '被邀请人注册', points: 20 },
  { label: '被邀请人提交资料', points: 30 },
  { label: '资料审核通过（邀请人）', points: 50 },
];

type InviteStatus = 'loading' | 'not-logged' | 'not-contributor' | 'error' | 'ready';

export default function ContributorInvitePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const [status, setStatus] = useState<InviteStatus>('loading');
  const [myInvite, setMyInvite] = useState<{ inviteCode: string; inviteLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // 通用邀请码（无需登录，人人可转发）
  const [generatingCode, setGeneratingCode] = useState(false);
  const [universalCode, setUniversalCode] = useState<{ code: string; link: string } | null>(null);
  const [universalCopied, setUniversalCopied] = useState(false);
  const [universalError, setUniversalError] = useState('');
  // 邀请奖励积分：动态从 /api/contributor/points-rules 读取（#[20260827-1030]-8）
  const [inviteRewardRules, setInviteRewardRules] = useState(DEFAULT_INVITE_REWARD_RULES);

  // 已登录用户获取自己的邀请链接（显式携带 x-user-token，避免公开路径下 401）
  useEffect(() => {
    if (!user?.id) {
      setStatus('not-logged');
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
    fetch('/api/contributor/invite', {
      headers: token ? { 'x-user-token': token } : undefined,
    })
      .then(async (res) => {
        if (res.status === 401) {
          // 会话无效，按未登录处理
          setStatus('not-logged');
          return;
        }
        const data = await res.json();
        if (data.success) {
          setMyInvite({ inviteCode: data.inviteCode, inviteLink: data.inviteLink });
          setStatus('ready');
        } else if (data.reason === 'not_contributor') {
          // 已登录但尚未注册成为贡献者（接口返回 200，不再产生 404 网络报错）
          setStatus('not-contributor');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [user?.id]);

  // 拉取邀请奖励积分（points_rules 驱动，#[20260827-1030]-8）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/contributor/points-rules', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.data) return;
        const cfg = json.data;
        setInviteRewardRules([
          {
            label: '被邀请人注册',
            points: cfg.invite?.register ?? DEFAULT_INVITE_REWARD_RULES[0].points,
          },
          {
            label: '被邀请人提交资料',
            points: cfg.invite?.submit ?? DEFAULT_INVITE_REWARD_RULES[1].points,
          },
          {
            label: '资料审核通过（邀请人）',
            points: cfg.invite?.review ?? DEFAULT_INVITE_REWARD_RULES[2].points,
          },
        ]);
      } catch (err) {
        console.warn('[Contributor Invite] 获取积分规则失败:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyInvite = async () => {
    if (!myInvite) return;
    try {
      await navigator.clipboard.writeText(myInvite.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // 生成通用邀请码（无需登录，人人可转发）
  const handleGenerateUniversal = async () => {
    setGeneratingCode(true);
    setUniversalError('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
      const res = await fetch('/api/contributor/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setUniversalCode({ code: data.code, link: data.link });
      } else {
        setUniversalError(data.error || '生成失败，请稍后重试');
      }
    } catch {
      setUniversalError('网络异常，请稍后重试');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyUniversal = async () => {
    if (!universalCode) return;
    try {
      await navigator.clipboard.writeText(universalCode.link);
      setUniversalCopied(true);
      setTimeout(() => setUniversalCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // 检测是否在微信内置浏览器中
  const isInWechat = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.indexOf('micromessenger') !== -1;
  };

  // 在微信内置浏览器中调起微信原生分享面板
  const shareToWechat = (title: string, desc: string, link: string): boolean => {
    if (typeof window === 'undefined') return false;
    // @ts-ignore - WeixinJSBridge 是微信浏览器私有 API
    const wx = (window as any).WeixinJSBridge;
    if (!wx || !wx.invoke) return false;
    try {
      wx.invoke('sendAppMessage', {
        title,
        desc,
        link,
        img_url: `${window.location.origin}/favicon.ico`,
      });
      return true;
    } catch {
      return false;
    }
  };

  // 分享邀请链接：微信内优先原生分享，其次系统分享，最后复制链接
  const handleShareInvite = async (link: string) => {
    if (isInWechat()) {
      const ok = shareToWechat('邀请好友贡献资料', '分享专业资料，审核通过即可获得积分奖励', link);
      if (ok) {
        toast({ title: '微信分享', description: '请选择好友发送', duration: 2000 });
        return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: '邀请好友贡献资料',
          text: '分享专业资料，审核通过即可获得积分奖励',
          url: link,
        });
        return;
      } catch {
        // 用户取消或 share 失败，回退到复制
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: '链接已复制', description: '请粘贴发送给好友', duration: 2000 });
    } catch {
      // ignore
    }
  };

  const goLogin = () => router.push('/login');
  const goUpload = () => router.push('/contributor/upload');

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-b from-sky-50 to-white py-10">
      <div className="max-w-3xl mx-auto px-4">
        {/* 头部 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-1.5 rounded-full text-sm mb-4">
            <ShieldCheck className="w-4 h-4" />
            邀请好友 · 双方得积分
          </div>
          <h1 className="text-3xl font-bold text-gray-800">邀请好友</h1>
          <p className="text-gray-500 mt-2">
            邀请好友注册并贡献资料，双方都可获得积分奖励
          </p>
        </div>

        {/* 加载中 */}
        {status === 'loading' && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
              <span>正在获取邀请信息...</span>
            </CardContent>
          </Card>
        )}

        {/* 未登录 / 会话过期 */}
        {status === 'not-logged' && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-4">
              <LogIn className="w-12 h-12 text-sky-400" />
              <h2 className="text-xl font-semibold text-gray-800">请先登录</h2>
              <p className="text-gray-500 max-w-sm">
                登录后即可查看您的专属邀请链接和二维码，邀请好友贡献资料可获得积分奖励。
              </p>
              <Button className="mt-2 px-8" size="lg" onClick={goLogin}>
                去登录
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 已登录但尚未注册为贡献者 */}
        {status === 'not-contributor' && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-4">
              <Gift className="w-12 h-12 text-amber-400" />
              <h2 className="text-xl font-semibold text-gray-800">先成为资料贡献者</h2>
              <p className="text-gray-500 max-w-sm">
                上传一次资料并审核通过后，即可获得专属邀请链接，邀请好友双方都能获得积分奖励。
              </p>
              <Button className="mt-2 px-8" size="lg" onClick={goUpload}>
                去上传资料
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 加载失败 */}
        {status === 'error' && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-4">
              <h2 className="text-xl font-semibold text-gray-800">加载失败</h2>
              <p className="text-gray-500 max-w-sm">获取邀请信息失败，请稍后重试。</p>
              <Button className="mt-2" variant="outline" onClick={() => router.refresh()}>
                刷新重试
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 邀请链接 + 二维码 */}
        {status === 'ready' && myInvite && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="hidden sm:block shrink-0">
                  <QRCode
                    value={myInvite.inviteLink}
                    size={140}
                    fgColor="#0284c7"
                    bgColor="transparent"
                    level="M"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sky-700 mb-1">
                    <Share2 className="w-4 h-4" />
                    <span className="font-semibold">我的专属邀请链接</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">好友通过链接注册并贡献资料，双方都可得积分</p>

                  <div className="flex items-center gap-2">
                    <Input
                      value={myInvite.inviteLink}
                      readOnly
                      className="bg-gray-50 text-sm"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button variant="outline" size="icon" onClick={handleCopyInvite} title="复制邀请链接">
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleShareInvite(myInvite.inviteLink)}
                      title="分享邀请链接"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                    <span>我的邀请码：</span>
                    <Badge variant="outline" className="font-mono text-sky-700">{myInvite.inviteCode}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(myInvite.inviteCode);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      复制
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {inviteRewardRules.map((r) => (
                      <Badge key={r.label} variant="secondary" className="bg-amber-50 text-amber-700 border-0">
                        {r.label} +{r.points}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 通用邀请码：无需登录，人人可转发 */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-amber-700">
                <Share2 className="w-4 h-4" />
                <span className="font-semibold text-sm">通用邀请码</span>
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-0">
                  可转发任意渠道
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateUniversal} disabled={generatingCode}>
                {generatingCode ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : '生成'}
              </Button>
            </div>
            {universalError && <p className="text-xs text-red-500 mb-2">{universalError}</p>}
            {universalCode ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    value={universalCode.link}
                    readOnly
                    className="bg-gray-50 text-sm"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyUniversal}
                    title="复制通用邀请链接"
                  >
                    {universalCopied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleShareInvite(universalCode.link)}
                    title="分享通用邀请链接"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  未注册用户通过该链接提交资料后自动注册，双方获得积分奖励
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                无需登录即可生成通用邀请码，可分享到微信群、朋友圈等任意渠道
              </p>
            )}
          </CardContent>
        </Card>

        {/* 奖励说明 */}
        <Card className="mt-4">
          <CardContent className="py-5">
            <h3 className="font-semibold text-gray-800 mb-2">邀请奖励规则</h3>
            <ul className="space-y-1.5 text-sm text-gray-600">
              {inviteRewardRules.map((r) => (
                <li key={r.label}>
                  · {r.label}，您获得{' '}
                  <span className="text-amber-600 font-semibold">{r.points} 积分</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
