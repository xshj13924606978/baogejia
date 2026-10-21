'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import { useUser } from '@/contexts/UserContext';
import { Loader2, UploadCloud, CheckCircle2, ShieldCheck, Gift, Copy, Check, Share2, ArrowLeft, AlertTriangle } from 'lucide-react';
import {
  CONTRIBUTOR_TYPES,
  CONTRIBUTOR_FORM_DEFS,
  ContributorType,
} from '@/lib/contributor/types';
import PriceTableMappingDialog from '@/components/contributor/price-table-mapping-dialog';
import { parsePriceTableFile } from '@/lib/contributor/price-table-parser';
import {
  fetchProductFieldConfigs,
  buildProductFormFields,
  buildProductSystemFields,
  type ProductFieldConfig,
} from '@/lib/contributor/product-field-configs';
import { buildSystemFieldsForType } from '@/lib/contributor/duplicate-configs';

interface FormValue {
  [key: string]: string;
}

// 支持批量表格导入的资料类型（产品价格库 + 技术文档库/案例库/标准规范库/图纸图片库/定额库）
const TABLE_IMPORT_TYPES: ContributorType[] = ['product', 'document', 'case', 'standard', 'drawing', 'quota'];

// 判重条目描述：优先取各类型的名称类字段，兜底显示序号
const describeDuplicateItem = (d: { index: number; input: Record<string, string> }) => {
  const primary =
    d.input.name ||
    d.input.doc_title ||
    d.input.case_name ||
    d.input.standard_name ||
    d.input.drawing_name ||
    d.input.quota_name ||
    d.input.model ||
    `第 ${d.index + 1} 条`;
  const extra = d.input.model && d.input.name ? ` / ${d.input.model}` : '';
  return `${primary}${extra}`;
};

// 邀请奖励说明：积分值由 /api/contributor/points-rules 动态返回（fallback 20/30/50），
//   管理员在 points_rules 表调整后无需重新部署即可生效（#[20260827-1030]-8）。
const DEFAULT_INVITE_REWARD_RULES = [
  { label: '被邀请人注册', points: 20 },
  { label: '被邀请人提交资料', points: 30 },
  { label: '资料审核通过（邀请人）', points: 50 },
];
const DEFAULT_REGISTER_POINTS = 100;

export default function ContributorUploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  // #20260829-1500：解构 loading，登录状态未就绪前不渲染联系方式表单，避免已登录用户误看到
  const { user, loading: authLoading } = useUser();
  const [type, setType] = useState<ContributorType>('product');
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  // #20260828-1230：未登录首次提交资料时必须完成账号三要素绑定
  // （手机号/邮箱+密码+验证码）；通过 identifier 实时格式识别是手机号还是邮箱
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  // #20260828-1345：邮箱场景验证码（必填，防止虚假邮箱注册）
  const [emailCode, setEmailCode] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailCountdown, setEmailCountdown] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  const [passwordMinLength, setPasswordMinLength] = useState(6);
  const [formValues, setFormValues] = useState<FormValue>({});
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, { path: string; url: string; originalFileName?: string }>
  >({});
  // 价格表解析与字段映射（仅 product 类型使用）
  const [parsingFile, setParsingFile] = useState(false);

  // 积分规则：动态从 /api/contributor/points-rules 读取（#[20260827-1030]-8）
  //   默认值与迁移 085 种子一致；DB 不可达或接口失败时保留 fallback，
  //   保证零停机；管理员在后台调整 points_rules 后刷新即生效（30s 内）。
  const [pointsConfig, setPointsConfig] = useState<{
    inviteRewardRules: { label: string; points: number }[];
    registerPoints: number;
  }>({
    inviteRewardRules: DEFAULT_INVITE_REWARD_RULES,
    registerPoints: DEFAULT_REGISTER_POINTS,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/contributor/points-rules', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.data) return;
        const cfg = json.data;
        setPointsConfig({
          inviteRewardRules: [
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
          ],
          registerPoints: cfg.register ?? DEFAULT_REGISTER_POINTS,
        });
      } catch (err) {
        // 静默失败，保留默认值
        console.warn('[Contributor Upload] 获取积分规则失败:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inviteRewardRules = pointsConfig.inviteRewardRules;
  const [pendingMapping, setPendingMapping] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [priceTableProducts, setPriceTableProducts] = useState<Record<string, string>[] | null>(null);
  // 价格表判重预检结果
  const [duplicateCheck, setDuplicateCheck] = useState<{
    total: number;
    duplicateCount: number;
    duplicates: { index: number; input: Record<string, string>; existing: Record<string, unknown> | null }[];
    ruleDescription: string;
  } | null>(null);
  // 判重预检进行中标记：结果未返回前禁用「提交资料」并显示进度条（#20260821-2100）
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateProgress, setDuplicateProgress] = useState(0);
  // 文件上传真实进度（0-100）与当前上传的字段名
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  // 判重处理方式选择弹窗（#20260821-1545-1）：skip=跳过重复仅导入不重复；overwrite=覆盖更新（提交审批）
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'overwrite' | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  // 后台产品字段配置（product_field_configs），驱动单品表单字段/必填/字段映射
  const [productFieldConfigs, setProductFieldConfigs] = useState<ProductFieldConfig[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<
    | {
        identifier: string;
        isNew: boolean;
        isLoggedIn?: boolean;
        autoLoggedIn?: boolean;
        warning?: string;
        // #[20260829-1500]-1：用户是否「新建账号」（区分「注册成功」与「已注册账号提交成功」）
        isNewUser?: boolean;
      }
    | null
  >(null);
  const [inviteCode, setInviteCode] = useState('');
  const [myInvite, setMyInvite] = useState<{ inviteCode: string; inviteLink: string } | null>(null);
  // #[20260829-1500]-1：展示「3.联系方式」的判断维度由「登录状态」改为「注册状态」——
  // 已注册用户（登录用户，或未登录但输入的联系方式已存在于用户表）不显示注册表单，自动带账号联系方式；
  // 未注册用户显示完整注册表单（手机号/邮箱+密码+验证码三要素绑定）。
  // authLoading 期间不判定，避免 SSR 首帧/会话恢复期误显示或误隐藏。
  const isLoggedIn = !!user?.id;
  // 未登录时随输入的联系方式实时查询的注册状态（checking=查询中 / registered=已注册 / unregistered=未注册）
  const [regStatus, setRegStatus] = useState<'checking' | 'registered' | 'unregistered'>('unregistered');
  const isRegistered = isLoggedIn || (!authLoading && regStatus === 'registered');
  const showContactInfo = !isLoggedIn && !authLoading && regStatus !== 'registered';
  // 账号联系方式（提交资料时前端/后端用此值作为提交人联系方式）
  const accountContact = user?.phone || user?.email || user?.username || '';
  const [notContributor, setNotContributor] = useState(false);
  const [copied, setCopied] = useState(false);
  // 通用邀请码（裂变邀请）：邀请人姓名 / 生成结果
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [universalCode, setUniversalCode] = useState<{ code: string; link: string } | null>(null);
  const [universalCopied, setUniversalCopied] = useState(false);
  const [universalError, setUniversalError] = useState('');

  // 加载后台产品字段配置（字段列表/必填/排序以后台配置为准，单点配置全局生效）
  useEffect(() => {
    fetchProductFieldConfigs().then((configs) => {
      if (configs) setProductFieldConfigs(configs);
    });
  }, []);

  // #20260828-1230：动态加载密码最小长度（与 /api/auth/register 一致），避免硬编码
  useEffect(() => {
    fetch('/api/auth/password-policy')
      .then((r) => r.json())
      .then((data) => {
        const min = Number(data?.minLength);
        if (min && min > 0) setPasswordMinLength(min);
      })
      .catch(() => {
        /* 静默降级：保留默认 6 位 */
      });
  }, []);

  // #20260828-1230：短信验证码发送后的 60s 倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = setTimeout(() => setCodeCountdown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [codeCountdown]);

  // #20260828-1345：邮箱验证码发送后的 60s 倒计时
  useEffect(() => {
    if (emailCountdown <= 0) return;
    const timer = setTimeout(() => setEmailCountdown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailCountdown]);

  // #20260828-1345：发送邮箱验证码（通过 /api/auth/send-email-code 调用 Supabase Admin generateLink 触发真实邮件）
  const handleSendEmailCode = async () => {
    if (!identifier) {
      setError('请先填写邮箱');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(identifier)) {
      setError('邮箱格式不正确，请检查后重新输入');
      return;
    }
    setEmailSending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '验证邮件发送失败');
        return;
      }
      setEmailSent(true);
      setEmailCountdown(data.cooldownSeconds ?? 60);
      setEmailCode('');
    } catch {
      setError('验证邮件发送失败，请稍后重试');
    } finally {
      setEmailSending(false);
    }
  };

  // #20260828-1230：发送手机号注册验证码（与 send-sms-code 接口对齐，purpose: register）
  const handleSendCode = async () => {
    if (!identifier) {
      setError('请先填写手机号');
      return;
    }
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(identifier)) {
      setError('手机号格式不正确，请检查后重新输入');
      return;
    }
    setSendingCode(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: identifier, purpose: 'register' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '验证码发送失败');
        return;
      }
      setCodeSent(true);
      setCodeCountdown(60);
      setVerificationCode('');
    } catch {
      setError('验证码发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  // #20260828-1230：实时判断 identifier 是手机号还是邮箱，决定验证码字段显示与否
  const phoneRegex = /^1[3-9]\d{9}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isPhone = phoneRegex.test(identifier);
  const isEmail = emailRegex.test(identifier);
  const showSmsCode = showContactInfo && isPhone;

  // #[20260829-1500]-1：注册状态动态响应——未登录时随输入的联系方式实时查询是否已注册。
  // identifier 变更后防抖 350ms 查询 /api/contributor/check-registered（读用户表真实数据，无硬编码），
  // 已注册 → 隐藏注册表单（自动带账号联系方式）；未注册 → 显示完整注册表单。
  // 查询失败按未注册降级（不阻断公开提交）；扫码/分享链接打开同样生效（走同一查询逻辑）。
  useEffect(() => {
    if (isLoggedIn || authLoading) return;
    const value = identifier.trim();
    if (!value) {
      setRegStatus('unregistered');
      return;
    }
    const phoneRe = /^1[3-9]\d{9}$/;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!phoneRe.test(value) && !emailRe.test(value)) {
      setRegStatus('unregistered');
      return;
    }
    let cancelled = false;
    setRegStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/contributor/check-registered', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: value }),
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled) return;
        setRegStatus(data?.registered ? 'registered' : 'unregistered');
      } catch {
        if (!cancelled) setRegStatus('unregistered');
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [identifier, isLoggedIn, authLoading]);

  // 读取 URL 中的邀请码（个人邀请：?inviteCode=XXX；通用邀请：?code=XXX）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('inviteCode') || params.get('code');
    if (code) {
      setInviteCode(code.trim());
    }
  }, []);

  // 已登录用户获取自己的邀请码（显式携带 x-user-token，避免公开路径下 401）
  useEffect(() => {
    if (!user?.id) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
    fetch('/api/contributor/invite', {
      headers: token ? { 'x-user-token': token } : undefined,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMyInvite({ inviteCode: data.inviteCode, inviteLink: data.inviteLink });
          setNotContributor(false);
        } else if (data.reason === 'not_contributor') {
          setNotContributor(true);
        }
      })
      .catch(() => {
        // 静默失败，不影响上传功能
      });
  }, [user?.id]);

  // 通用邀请码：查询邀请人信息并记录访问（点击统计 + 渠道来源 ref）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const query = new URLSearchParams({ code });
    const ref = params.get('ref');
    if (ref) query.set('ref', ref);

    fetch(`/api/contributor/invite-info?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.valid && data.inviterName) {
          setInviterName(data.inviterName);
        }
      })
      .catch(() => {
        // 静默失败，不影响上传功能
      });
  }, []);

  // 进入页面后自动生成通用邀请码（人人可转发，无需手动点击生成）
  useEffect(() => {
    handleGenerateUniversal();
  }, []);

  // 返回上一页（无历史记录时回首页）
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

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

  // 生成通用邀请码（无需登录即可使用，人人可转发）
  const handleGenerateUniversal = async () => {
    setGeneratingCode(true);
    setUniversalError('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
      const res = await fetch('/api/contributor/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        body: JSON.stringify({ source: 'web' }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setUniversalError(result.error || '生成邀请码失败');
        return;
      }
      setUniversalCode({ code: result.code, link: result.link });
    } catch {
      setUniversalError('生成邀请码失败，请重试');
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

  // 产品类型：单品表单字段由后台字段配置驱动（未加载时回退到内置兜底定义）；其他类型用静态定义
  const formDef = useMemo(() => {
    if (type !== 'product') return CONTRIBUTOR_FORM_DEFS[type];
    return { ...CONTRIBUTOR_FORM_DEFS.product, fields: buildProductFormFields(productFieldConfigs) };
  }, [type, productFieldConfigs]);

  // 判重进行中时驱动进度条动画（仅表达进行中状态，非业务数据，不展示具体百分比）
  useEffect(() => {
    if (!duplicateChecking) return;
    setDuplicateProgress(0);
    const timer = setInterval(() => {
      setDuplicateProgress((v) => (v >= 100 ? 0 : v + 5));
    }, 120);
    return () => clearInterval(timer);
  }, [duplicateChecking]);

  // 切换资料类型时清空已填写内容
  const handleTypeChange = (value: string) => {
    setType(value as ContributorType);
    setFormValues({});
    setUploadedFiles({});
    setPendingMapping(null);
    setPriceTableProducts(null);
    setDuplicateCheck(null);
    setDuplicateChecking(false);
    setError('');
  };

  // 使用 XMLHttpRequest 上传文件，支持进度回调；保持 raw binary + X-File-Name 兼容 WSL/Windows 端口转发
  const uploadFileWithProgress = (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; filePath: string; url: string; originalFileName?: string; error?: string; details?: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/contributor/upload-file', true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      });

      xhr.addEventListener('load', () => {
        let payload: any;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          payload = { error: '上传响应解析失败' };
        }
        if (xhr.status >= 200 && xhr.status < 300 && payload.success) {
          resolve({ success: true, filePath: payload.filePath, url: payload.url });
        } else {
          const errorMsg = payload.details
            ? `${payload.error}：${payload.details}`
            : payload.error || `文件上传失败（状态 ${xhr.status}）`;
          resolve({ success: false, filePath: '', url: '', error: errorMsg });
        }
      });

      xhr.addEventListener('error', () => resolve({ success: false, filePath: '', url: '', error: '网络错误，上传失败' }));
      xhr.addEventListener('abort', () => resolve({ success: false, filePath: '', url: '', error: '上传已取消' }));

      xhr.send(file);
    });
  };

  const handleFileChange = async (fieldName: string, file: File | null) => {
    if (!file) return;
    setError('');
    setUploadingField(fieldName);
    setUploadProgress((prev) => ({ ...prev, [fieldName]: 0 }));

    try {
      const result = await uploadFileWithProgress(file, (percent) => {
        setUploadProgress((prev) => ({ ...prev, [fieldName]: percent }));
      });
      if (!result.success) {
        setError(result.error || '文件上传失败');
        return;
      }
      setUploadedFiles((prev) => ({
        ...prev,
        [fieldName]: {
          path: result.filePath,
          url: result.url,
          originalFileName: result.originalFileName || file.name,
        },
      }));

      // 单文件资料上传后：从文件名自动解析标题与文件类型，减少手填（仅当对应字段为空时）
      if (fieldName === 'file' && type !== 'product') {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const fileTypeLabel = file.type
          ? file.type.split('/').pop()?.toUpperCase() || ''
          : file.name.split('.').pop()?.toUpperCase() || '';

        setFormValues((prev) => {
          const next = { ...prev };
          const titleField =
            type === 'document'
              ? 'doc_title'
              : type === 'case'
              ? 'case_name'
              : type === 'standard'
              ? 'standard_no'
              : type === 'drawing'
              ? 'drawing_name'
              : type === 'quota'
              ? 'quota_no'
              : null;
          const typeField = type === 'document' ? 'doc_type' : null;
          if (titleField && !next[titleField]) {
            next[titleField] = baseName;
          }
          if (typeField && !next[typeField]) {
            next[typeField] = fileTypeLabel;
          }
          return next;
        });
      }

      // 支持表格导入的资料类型：解析表格并弹出字段映射（支持 .xls / .xlsx / .csv）
      if (fieldName === 'file' && TABLE_IMPORT_TYPES.includes(type) && /\.(xlsx|xls|csv)$/i.test(file.name)) {
        await handleParsePriceTable(file);
      }

      toast({
        title: '文件上传成功',
        description: `${file.name} 已上传，已自动解析标题/类型`,
        duration: 2000,
      });
    } catch {
      setError('文件上传失败，请重试');
    } finally {
      setUploadingField(null);
    }
  };

  // 解析表格（.xls / .xlsx / .csv），成功后弹出字段映射弹窗
  const handleParsePriceTable = async (file: File) => {
    setParsingFile(true);
    try {
      const parsed = await parsePriceTableFile(file);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('未从文件中解析出数据，请检查表格内容');
        return;
      }
      setPendingMapping({ headers: parsed.headers, rows: parsed.rows });
    } catch (err) {
      console.error('表格解析失败:', err);
      setError('表格解析失败，请确认文件为 .xls / .xlsx / .csv 格式');
    } finally {
      setParsingFile(false);
    }
  };

  // 确认字段映射：构建产品数据并自动填充表单，同时后台预检重复
  const handleConfirmMapping = async (mapping: Record<string, string>) => {
    if (!pendingMapping) return;

    const products = pendingMapping.rows.map((row) => {
      const product: FormValue = {};
      for (const [header, sysKey] of Object.entries(mapping)) {
        product[sysKey] = (row[header] || '').toString().trim();
      }
      return product;
    });

    setPriceTableProducts(products);
    setDuplicateCheck(null);
    setDuplicateChecking(true);
    setDuplicateAction(null);
    setDuplicateReason('');

    // 用第一条记录自动填充表单（已有手填内容时优先保留手填内容）
    const first = products[0] || {};
    setFormValues((prev) => {
      const next: FormValue = { ...prev };
      for (const field of formDef.fields) {
        if (field.name === 'file') continue;
        const v = first[field.name];
        if (v) next[field.name] = v;
      }
      return next;
    });

    setPendingMapping(null);
    toast({
      title: '表格解析成功',
      description: `已解析 ${products.length} 条数据，已自动填充表单信息`,
    });

    // 按后台判重配置预检重复（公开接口，无需登录）
    try {
      const res = await fetch('/api/contributor/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'product' ? { products } : { type, items: products }
        ),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setDuplicateCheck({
          total: result.total || products.length,
          duplicateCount: result.duplicateCount || 0,
          duplicates: result.duplicates || [],
          ruleDescription: result.ruleDescription || '',
        });
      }
    } catch {
      // 判重预检失败不影响主流程，静默忽略
    } finally {
      setDuplicateChecking(false);
    }
  };

  // 提交入口：存在判重结果且用户尚未选择处理方式时，先弹出选择弹窗（#20260821-1545-1）
  const handleSubmit = async () => {
    if (priceTableProducts && duplicateCheck && duplicateCheck.duplicateCount > 0 && duplicateAction === null) {
      setDuplicateDialogOpen(true);
      return;
    }
    await performSubmit(duplicateAction);
  };

  // 实际提交：action 为「跳过重复」时过滤重复产品；为「覆盖更新」时携带操作标记与理由
  const performSubmit = async (action: 'skip' | 'overwrite' | null) => {
    setError('');
    setSubmitting(true);

    // #20260828-1230-1：表格字段映射未确认前，禁止提交资料（全局强制流程）。
    // pendingMapping 非空 = 映射弹窗仍处于未确认状态；防御任何关闭路径绕过映射直接提交。
    if (pendingMapping) {
      setError('请先在「表格字段映射」弹窗中完成映射并点击「确认映射并导入」，之后才能提交资料');
      setSubmitting(false);
      return;
    }

    // 校验必填字段
    // 支持表格导入的类型选择"上传表格"（file 字段已上传）时，允许通过表格导入，不强制手填单品必填字段
    const isPriceTableMode = TABLE_IMPORT_TYPES.includes(type) && !!uploadedFiles['file'];
    const missing = isPriceTableMode
      ? []
      : formDef.fields.filter((f) => f.required && !formValues[f.name] && !uploadedFiles[f.name]);
    if (missing.length > 0) {
      setError(`请填写必填项：${missing.map((f) => f.label).join('、')}`);
      setSubmitting(false);
      return;
    }

    // #[20260829-1500]-1：已注册用户自动使用账号联系方式，无需填写联系方式注册表单。
    // 登录用户直接用账号联系方式；未登录但联系方式已注册时，用户输入的 identifier 即该账号联系方式。
    const isRegisteredUser = isLoggedIn || (!authLoading && regStatus === 'registered');
    let submitIdentifier = identifier;
    let submitName = name;
    if (isLoggedIn) {
      submitIdentifier = user.phone || user.email || user.username || '';
      submitName = user.name || user.username || '';
      if (!submitIdentifier) {
        setError('当前账号缺少可用的手机号/邮箱/用户名，请补充联系方式后再试');
        setSubmitting(false);
        return;
      }
    }

    if (!submitIdentifier) {
      setError('请填写手机号或邮箱，用于接收审核通知');
      setSubmitting(false);
      return;
    }

    // #20260828-1230：未注册用户首次提交必须完成账号三要素绑定（手机号/邮箱+密码+验证码）。
    // 已注册用户（登录用户，或未登录但联系方式已注册）走现有账号，无需再次绑定。
    if (!isRegisteredUser) {
      if (!password || password.length < passwordMinLength) {
        setError(`请设置账号密码（至少 ${passwordMinLength} 位），提交资料即注册账号，密码用于后续登录`);
        setSubmitting(false);
        return;
      }
      const phoneRegex = /^1[3-9]\d{9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isPhone = phoneRegex.test(submitIdentifier);
      const isEmail = !isPhone && emailRegex.test(submitIdentifier);
      if (isPhone) {
        if (!verificationCode || verificationCode.length < 4) {
          setError('请填写短信验证码');
          setSubmitting(false);
          return;
        }
        // 先调 verify-sms-code，校验通过后再调 upload（与短信通道一致的「先校验、再下单」模式）
        try {
          const verifyRes = await fetch('/api/auth/verify-sms-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: submitIdentifier,
              code: verificationCode,
              purpose: 'register',
              consume: true,
            }),
          });
          const verifyResult = await verifyRes.json();
          if (!verifyRes.ok || !verifyResult.verified) {
            setError(verifyResult.error || '短信验证码校验失败');
            setSubmitting(false);
            return;
          }
        } catch {
          setError('短信验证码校验失败，请重试');
          setSubmitting(false);
          return;
        }
      } else if (isEmail) {
        // #20260828-1345：邮箱场景验证码必填校验（防虚假邮箱注册）
        if (!emailCode) {
          setError('请填写邮箱验证码');
          setSubmitting(false);
          return;
        }
        try {
          const verifyRes = await fetch('/api/auth/verify-email-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: submitIdentifier,
              code: emailCode,
            }),
          });
          const verifyResult = await verifyRes.json();
          if (!verifyRes.ok || !verifyResult.verified) {
            setError(verifyResult.error || '邮箱验证码校验失败');
            setSubmitting(false);
            return;
          }
        } catch {
          setError('邮箱验证码校验失败，请重试');
          setSubmitting(false);
          return;
        }
      }
    }

    try {
      let submitData: Record<string, unknown> = formValues;
      if (priceTableProducts) {
        // 产品价格库使用 products 字段，其他资料库使用 items 字段（管理端通用表格渲染）
        const batchKey = type === 'product' ? 'products' : 'items';
        submitData = { ...formValues, [batchKey]: priceTableProducts };
        // 选择「跳过重复」：仅提交不重复的条目
        if (action === 'skip' && duplicateCheck && duplicateCheck.duplicates.length > 0) {
          const skipIndices = new Set(duplicateCheck.duplicates.map((d) => d.index));
          submitData[batchKey] = priceTableProducts.filter((_, i) => !skipIndices.has(i));
        }
        // 选择「覆盖更新」：携带操作标记与理由，审核通过后对重复条目执行覆盖更新
        if (action === 'overwrite') {
          submitData.duplicateAction = 'overwrite';
          submitData.duplicateReason = duplicateReason.trim();
        }
      }
      const originalFileNames = Object.fromEntries(
        Object.entries(uploadedFiles).map(([field, info]) => [field, info.originalFileName || ''])
      );
      const res = await fetch('/api/contributor/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: submitIdentifier,
          name: submitName || undefined,
          type,
          data: { ...submitData, __originalFileNames: originalFileNames },
          files: Object.values(uploadedFiles).map((f) => f.path),
          inviteCode: inviteCode || undefined,
          // #20260828-1230：未注册用户首次提交时绑定密码（registerContributor 内部按 password_min_length 兜底校验）；
          // #[20260829-1500]-1：已注册用户复用账号，无需再次设置密码。
          password: isRegisteredUser ? undefined : password,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || '提交失败');
        setSubmitting(false);
        return;
      }

      setDuplicateDialogOpen(false);
      // #20260828-2156：未登录首次提交成功后，服务端已签发 session cookie 并设到浏览器；
      // 前端通过 autoLogin 字段识别此时已是登录态，跳转首页时强制整页刷新，
      // 让 UserContext 重新读取 /api/auth/me 而非停留在未登录状态。
      const isLoggedIn = !!user?.id || !!result.autoLogin;
      setSuccess({
        identifier: result.contributor?.identifier || submitIdentifier,
        isNew: result.contributor?.isNew ?? true,
        // #[20260829-1500]-1：以「用户是否新建账号」驱动成功页文案，避免已注册用户被误展示「注册成功」
        isNewUser: !!result.isNewUser,
        isLoggedIn,
        autoLoggedIn: !!result.autoLogin,
        warning: result.warning,
      });
    } catch {
      setError('网络错误，请稍后重试');
      setSubmitting(false);
    }
  };

  // 成功页
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <h1 className="text-2xl font-bold text-gray-800">提交成功</h1>
            {success.isLoggedIn ? (
              <p className="text-gray-500">您的资料已提交审核，审核通过后将发放积分奖励。</p>
            ) : success.isNewUser ? (
              <>
                <p className="text-gray-500">
                  您已成功注册为资料贡献者，账号为：
                  <span className="font-semibold text-sky-600">{success.identifier}</span>
                </p>
                <div className="w-full bg-sky-50 rounded-lg p-4 flex items-center gap-3">
                  <Gift className="w-6 h-6 text-sky-500 shrink-0" />
                  <div className="text-left text-sm text-gray-600">
                    您已获得 <span className="font-bold text-sky-600">{pointsConfig.registerPoints} 积分</span> 注册奖励
                  </div>
                </div>
              </>
            ) : (
              // #[20260829-1500]-1：未登录但联系方式已注册——复用账号提交，不显示「注册成功」
              <>
                <p className="text-gray-500">
                  您的资料已提交审核，将使用已注册账号
                  <span className="font-semibold text-sky-600">{success.identifier}</span>
                  的联系方式通知您。
                </p>
                <div className="w-full bg-sky-50/70 rounded-lg p-3 text-left text-sm text-gray-600">
                  登录后可随时查看提交记录与审核进度。
                </div>
              </>
            )}
            {/* #20260828-2156：自动登录但服务端签发失败时降级提示 */}
            {success.warning && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-3 text-left text-sm text-amber-700">
                {success.warning}
              </div>
            )}
            {/* 审批流程说明（#20260820-1130-2） */}
            <div className="w-full bg-sky-50/70 rounded-lg p-4 text-left">
              <p className="text-sm font-medium text-sky-800 mb-2">关于审核，您需要了解：</p>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li className="flex gap-1.5">
                  <span className="text-sky-500 shrink-0">·</span>
                  <span>审核目的：确保资料真实有效，维护产品库质量</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-sky-500 shrink-0">·</span>
                  <span>预计时长：一般 1-2 个工作日内完成审核</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-sky-500 shrink-0">·</span>
                  <span>
                    通知方式：审核通过后积分将自动发放至您的账户，可在「最近记录」中查看审核进度
                  </span>
                </li>
              </ul>
            </div>
            {/* #20260828-2156：后端已签发 session cookie 时，必须用 window.location 整页刷新，
                让根布局里的 UserContext 重新读取 /api/auth/me；router.push 仅是 SPA 跳转，
                不会重新初始化 Provider，会导致用户停留「未登录」状态。 */}
            <Button
              className="w-full mt-2"
              onClick={() => {
                if (success.autoLoggedIn) {
                  window.location.href = '/';
                } else {
                  router.push('/');
                }
              }}
            >
              {success.autoLoggedIn ? '进入系统' : '返回首页'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-b from-sky-50 to-white py-10">
      <div className="max-w-3xl mx-auto px-4">
        {/* 头部 */}
        <div className="relative text-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2"
            onClick={handleBack}
            title="返回上一页"
            aria-label="返回上一页"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-1.5 rounded-full text-sm mb-4">
            <ShieldCheck className="w-4 h-4" />
            公开上传 · 无需登录
          </div>
          <h1 className="text-3xl font-bold text-gray-800">资料贡献中心</h1>
          <p className="text-gray-500 mt-2">
            分享您的专业资料，审核通过即可获得积分奖励，资料贡献者还可获得额外收益
          </p>
        </div>

        {/* 邀请奖励区 */}
        {/* 通过邀请链接访问时的横幅 */}
        {inviteCode && (
          <Card className="mb-4">
            <CardContent className="py-4 flex items-center gap-3">
              <Gift className="w-5 h-5 text-sky-500 shrink-0" />
              <div className="flex-1 text-sm text-gray-600">
                {inviterName ? (
                  <span>
                    <span className="font-semibold text-sky-600">{inviterName}</span> 邀请您贡献资料，
                    通过邀请码 <span className="font-semibold text-sky-600">{inviteCode}</span> 注册，
                    提交后双方获得积分奖励
                  </span>
                ) : (
                  <span>
                    您正在通过邀请码 <span className="font-semibold text-sky-600">{inviteCode}</span> 注册，
                    提交后您与被邀请人将获得额外积分奖励
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 我的专属邀请链接（已登录贡献者） */}
        {myInvite && (
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="hidden sm:block shrink-0">
                  <QRCode
                    value={myInvite.inviteLink}
                    size={96}
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
                  <p className="text-sm text-gray-500 mb-2">邀请好友注册并贡献资料，双方都可获得积分奖励</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={myInvite.inviteLink}
                      readOnly
                      className="bg-gray-50 text-sm"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyInvite}
                      title="复制邀请链接"
                    >
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
                  <div className="flex flex-wrap gap-2 mt-3">
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

        {/* 已登录但尚未注册贡献者：提示提交资料后即可获取专属链接 */}
        {user?.id && !myInvite && notContributor && (
          <Card className="mb-4">
            <CardContent className="py-4 flex items-center gap-3">
              <Gift className="w-5 h-5 text-sky-500 shrink-0" />
              <div className="flex-1 text-sm text-gray-600">
                登录成功，提交资料成为贡献者后即可查看专属邀请链接，邀请好友可获得积分奖励：
                {inviteRewardRules.map((r) => `${r.label} +${r.points}`).join('、')}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 通用邀请码：所有用户（含未登录）均可生成，可分享到任意渠道 */}
        <Card className="mb-4">
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
                生成后可分享到微信群、朋友圈等任意渠道，无需登录即可使用，每个邀请码可被使用一次
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. 选择资料类型</CardTitle>
            <CardDescription>根据您要上传的内容选择对应的类型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {CONTRIBUTOR_TYPES.map((t) => (
                <Badge
                  key={t.id}
                  variant={type === t.id ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => handleTypeChange(t.id)}
                >
                  {t.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">2. 填写资料信息</CardTitle>
            <CardDescription>{formDef.label} · 标 * 为必填</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formDef.fields.map((field) => {
              const fileInfo = uploadedFiles[field.name];
              if (field.type === 'file' || field.type === 'image') {
                return (
                  <div key={field.name} className="space-y-2">
                    <Label>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer flex-1">
                        <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-sky-400 transition-colors">
                          {fileInfo ? (
                            <div className="text-sm text-green-600 flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              {field.label}已上传
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
                              <UploadCloud className="w-5 h-5" />
                              点击选择{field.type === 'image' ? '图片' : '文件'}
                            </div>
                          )}
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingField === field.name}
                          accept={
                            field.type === 'image'
                              ? 'image/*'
                              : type === 'product'
                                ? '.xls,.xlsx,.csv'
                                : type === 'drawing'
                                  ? '.dwg,.dxf,.dwf,.dwt,.dws,.pdf,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar'
                                  : undefined
                          }
                          onChange={(e) => handleFileChange(field.name, e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    {uploadingField === field.name && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-sky-700">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          正在上传文件… {uploadProgress[field.name] ?? 0}%
                        </div>
                        <Progress value={uploadProgress[field.name] ?? 0} className="h-1.5" />
                      </div>
                    )}
                    {fileInfo && uploadingField !== field.name && (
                      <p className="text-xs text-green-600 flex items-center gap-1" title={fileInfo.path.split('/').pop()}>
                        <CheckCircle2 className="w-3 h-3" />
                        已上传：{fileInfo.originalFileName || fileInfo.path.split('/').pop()}
                      </p>
                    )}
                    {type === 'product' && field.name === 'file' && (
                      <div className="space-y-1">
                        {parsingFile && (
                          <p className="text-xs text-sky-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            正在解析表格...
                          </p>
                        )}
                        {priceTableProducts && (
                          <p className="text-xs text-green-600">
                            已解析表格：共 {priceTableProducts.length} 条数据，已自动填充表单信息
                          </p>
                        )}
                        {duplicateChecking && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-amber-700">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              正在检测与现有产品的重复情况，请稍候…
                            </div>
                            <Progress value={duplicateProgress} className="h-1.5" />
                          </div>
                        )}
                        {duplicateCheck && duplicateCheck.duplicateCount > 0 && (
                          <div className="text-xs bg-amber-50 border border-amber-200 rounded-md p-2 text-amber-800">
                            <div className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <div className="flex-1">
                                <p className="font-medium">
                                  检测到 {duplicateCheck.duplicateCount} 条产品可能与现有产品重复
                                  {duplicateCheck.ruleDescription ? `（${duplicateCheck.ruleDescription}）` : ''}
                                </p>
                                <ul className="mt-1 space-y-0.5 text-amber-700/80">
                                  {duplicateCheck.duplicates.slice(0, 3).map((d, idx) => (
                                    <li key={idx}>
                                      · {describeDuplicateItem(d)}
                                    </li>
                                  ))}
                                  {duplicateCheck.duplicates.length > 3 && (
                                    <li>… 还有 {duplicateCheck.duplicates.length - 3} 条</li>
                                  )}
                                </ul>
                                <p className="mt-1 text-amber-700/70">提交资料时请选择处理方式：「跳过重复」仅导入不重复资料，或「覆盖更新」用本次数据覆盖已存在的重复资料（需填写操作理由，由管理员审批）。</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              if (field.type === 'textarea') {
                return (
                  <div key={field.name} className="space-y-2">
                    <Label>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    <Textarea
                      value={formValues[field.name] || ''}
                      placeholder={field.placeholder}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  </div>
                );
              }

              if (field.type === 'date') {
                return (
                  <div key={field.name} className="space-y-2">
                    <Label>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      type="date"
                      value={formValues[field.name] || ''}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  </div>
                );
              }

              return (
                <div key={field.name} className="space-y-2">
                  <Label>
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={formValues[field.name] || ''}
                    placeholder={field.placeholder}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            {/* #[20260829-1500]-1：注册状态驱动展示——已注册用户（登录用户或未登录但联系方式已注册）不显示注册表单；
                未注册用户显示「3.联系方式」注册表单；authLoading 期间展示占位说明，避免 SSR 首帧/会话恢复期误显示 */}
            <CardTitle className="text-lg">{isRegistered ? '3. 提交资料' : '3. 联系方式'}</CardTitle>
            {authLoading ? (
              <CardDescription>正在检测注册状态，请稍候…</CardDescription>
            ) : isLoggedIn ? (
              <CardDescription>
                已使用账号联系方式
                {accountContact ? `（${accountContact}）` : '（账号暂未绑定手机号/邮箱，请先到个人中心补充后再提交）'}
                ，无需重复填写
              </CardDescription>
            ) : isRegistered ? (
              <CardDescription>该联系方式已注册，提交时将自动使用该账号的联系方式，无需重复填写</CardDescription>
            ) : (
              <CardDescription>用于注册账号并接收审核结果通知</CardDescription>
            )}
          </CardHeader>
          {authLoading ? (
            <CardContent className="py-6 flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在检测注册状态，请稍候…
            </CardContent>
          ) : isLoggedIn ? null : isRegistered ? (
            // #[20260829-1500]-1：未登录但联系方式已注册——仅保留联系方式输入框便于修改，隐藏密码/验证码注册表单
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>
                  手机号 / 邮箱 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={identifier}
                  placeholder="请输入手机号或邮箱"
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <p className="text-xs text-sky-600 bg-sky-50 border border-sky-200 rounded-md p-2">
                已检测到该联系方式已注册，提交资料时将自动使用该账号的联系方式，无需设置密码
              </p>
            </CardContent>
          ) : showContactInfo ? (
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>
                  手机号 / 邮箱 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={identifier}
                  placeholder="请输入手机号或邮箱"
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>姓名（可选）</Label>
                <Input value={name} placeholder="请输入您的姓名" onChange={(e) => setName(e.target.value)} />
              </div>
              {/* #20260828-1230：未登录首次提交资料时必须完成账号三要素绑定 */}
              {!user?.id && (
                <>
                  <div className="space-y-2">
                    <Label>
                      密码 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="password"
                      value={password}
                      placeholder={`请设置账号密码（至少 ${passwordMinLength} 位）`}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-gray-400">
                      提交资料即视为注册贡献者账号，密码用于后续登录，请妥善保管
                    </p>
                  </div>
                  {showSmsCode && (
                    <div className="space-y-2">
                      <Label>
                        验证码 <span className="text-red-500">*</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={verificationCode}
                          placeholder="请输入短信验证码"
                          onChange={(e) => setVerificationCode(e.target.value)}
                          maxLength={6}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSendCode}
                          disabled={sendingCode || codeCountdown > 0 || !identifier}
                          className="shrink-0"
                        >
                          {sendingCode ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              发送中
                            </>
                          ) : codeCountdown > 0 ? (
                            `${codeCountdown}s 后重试`
                          ) : codeSent ? (
                            '重新发送'
                          ) : (
                            '发送验证码'
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400">
                        验证码将发送至手机号 {identifier}，用于确认您持有该号码
                      </p>
                    </div>
                  )}
                  {!isPhone && !isEmail && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                      请填写正确的手机号或邮箱格式以完成账号绑定
                    </p>
                  )}
                  {isEmail && (
                    <div className="space-y-2">
                      {/* #20260828-1345：邮箱场景验证码必填（防虚假邮箱注册） */}
                      <Label>
                        邮箱验证码 <span className="text-red-500">*</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={emailCode}
                          placeholder={emailSent ? '请输入邮件中的验证码，或粘贴邮件中的确认链接' : '请先点击右侧发送验证邮件'}
                          onChange={(e) => setEmailCode(e.target.value)}
                          disabled={!emailSent}
                          maxLength={500}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSendEmailCode}
                          disabled={emailSending || emailCountdown > 0 || !identifier}
                          className="shrink-0"
                        >
                          {emailSending ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              发送中
                            </>
                          ) : emailCountdown > 0 ? (
                            `${emailCountdown}s 后重试`
                          ) : emailSent ? (
                            '重新发送'
                          ) : (
                            '发送验证邮件'
                          )}
                        </Button>
                      </div>
                      {emailSent && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                          验证邮件已发送至 <span className="font-mono">{identifier}</span>。
                          请打开邮箱查看：邮件中包含 <strong>数字验证码</strong> 和 <strong>确认链接</strong>，
                          输入验证码或复制整条确认链接粘贴到上方均可完成验证。验证码 10 分钟内有效。
                          若未收到请检查垃圾邮件箱。
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          ) : null}
          <CardFooter className="flex-col gap-3">
            {error && <p className="text-red-500 text-sm w-full">{error}</p>}
            {duplicateCheck && duplicateCheck.duplicateCount > 0 && (
              <div className="w-full text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  已检测到 {duplicateCheck.duplicateCount} 条重复资料，点击「提交资料」后请选择「跳过重复」或「覆盖更新」处理方式。
                </span>
              </div>
            )}
            <Button
              className="w-full"
              size="lg"
              disabled={submitting || duplicateChecking || authLoading}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : duplicateChecking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  正在检测重复资料，请稍候…
                </>
              ) : (
                '提交资料'
              )}
            </Button>
            {showContactInfo && (
              <p className="text-xs text-gray-400 text-center">
                提交即表示同意作为资料贡献者注册账号，注册奖励 {pointsConfig.registerPoints} 积分
              </p>
            )}
          </CardFooter>
        </Card>

        {/* 判重处理方式选择弹窗（#20260821-1545-1） */}
        <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>发现重复资料</DialogTitle>
              <DialogDescription>
                检测到 {duplicateCheck?.duplicateCount ?? 0} 条资料可能与现有资料重复
                {duplicateCheck?.ruleDescription ? `（${duplicateCheck.ruleDescription}）` : ''}
                ，请选择处理方式后再提交。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {duplicateCheck && duplicateCheck.duplicates.length > 0 && (
                <ul className="max-h-24 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-800">
                  {duplicateCheck.duplicates.slice(0, 5).map((d, idx) => (
                    <li key={idx}>
                      · {describeDuplicateItem(d)}
                    </li>
                  ))}
                  {duplicateCheck.duplicates.length > 5 && (
                    <li>… 还有 {duplicateCheck.duplicates.length - 5} 条</li>
                  )}
                </ul>
              )}
              <RadioGroup
                value={duplicateAction ?? ''}
                onValueChange={(v) => {
                  setDuplicateAction(v as 'skip' | 'overwrite');
                  if (v === 'skip') setDuplicateReason('');
                }}
              >
                <div className="flex items-start space-x-2 rounded-md border border-slate-200 p-3">
                  <RadioGroupItem value="skip" id="dup-skip" />
                  <Label htmlFor="dup-skip" className="font-normal cursor-pointer">
                    <span className="font-medium text-gray-800">跳过重复</span>
                    <p className="text-xs text-gray-500">
                      仅导入不重复的资料（共{' '}
                      {priceTableProducts
                        ? priceTableProducts.length - (duplicateCheck?.duplicateCount ?? 0)
                        : 0}{' '}
                      条），重复资料本次不提交。
                    </p>
                  </Label>
                </div>
                <div className="flex items-start space-x-2 rounded-md border border-slate-200 p-3">
                  <RadioGroupItem value="overwrite" id="dup-overwrite" />
                  <Label htmlFor="dup-overwrite" className="font-normal cursor-pointer">
                    <span className="font-medium text-gray-800">覆盖更新</span>
                    <p className="text-xs text-gray-500">
                      重复资料将随本次提交，审核通过后覆盖更新已存在的重复资料（由管理员审批）。
                    </p>
                  </Label>
                </div>
              </RadioGroup>
              {duplicateAction === 'overwrite' && (
                <div className="space-y-1.5">
                  <Label htmlFor="dup-reason">
                    操作理由 <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="dup-reason"
                    value={duplicateReason}
                    onChange={(e) => setDuplicateReason(e.target.value)}
                    rows={3}
                    placeholder="请说明覆盖更新的原因（如：更正错误价格、补充最新报价等），管理员审批时会参考"
                  />
                </div>
              )}
              {duplicateAction === 'overwrite' && !duplicateReason.trim() && (
                <p className="text-xs text-red-500">请填写操作理由后再提交</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
                取消
              </Button>
              <Button
                disabled={duplicateAction === null || (duplicateAction === 'overwrite' && !duplicateReason.trim())}
                onClick={() => {
                  setDuplicateDialogOpen(false);
                  performSubmit(duplicateAction);
                }}
              >
                确认并提交
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 表格字段映射弹窗 */}
        <PriceTableMappingDialog
          open={!!pendingMapping}
          headers={pendingMapping?.headers || []}
          rows={pendingMapping?.rows || []}
          systemFields={
            type === 'product'
              ? buildProductSystemFields(productFieldConfigs)
              : buildSystemFieldsForType(type)
          }
          onConfirm={handleConfirmMapping}
          onCancel={() => setPendingMapping(null)}
        />
      </div>
    </div>
  );
}
