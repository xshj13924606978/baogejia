'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, UploadCloud, CheckCircle2, ShieldCheck, Gift } from 'lucide-react';
import {
  CONTRIBUTOR_TYPES,
  CONTRIBUTOR_TYPE_LABELS,
  CONTRIBUTOR_FORM_DEFS,
  CONTRIBUTOR_REGISTER_POINTS,
  ContributorType,
} from '@/lib/contributor/types';

interface FormValue {
  [key: string]: string;
}

export default function ContributorUploadPage() {
  const router = useRouter();
  const [type, setType] = useState<ContributorType>('product');
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [formValues, setFormValues] = useState<FormValue>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { path: string; url: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ identifier: string; isNew: boolean } | null>(null);

  const formDef = CONTRIBUTOR_FORM_DEFS[type];

  // 切换资料类型时清空已填写内容
  const handleTypeChange = (value: string) => {
    setType(value as ContributorType);
    setFormValues({});
    setUploadedFiles({});
    setError('');
  };

  const handleFileChange = async (fieldName: string, file: File | null) => {
    if (!file) return;
    setError('');

    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/contributor/upload-file', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || '文件上传失败');
        return;
      }
      setUploadedFiles((prev) => ({
        ...prev,
        [fieldName]: { path: result.filePath, url: result.url },
      }));
    } catch {
      setError('文件上传失败，请重试');
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);

    // 校验必填字段
    const missing = formDef.fields.filter((f) => f.required && !formValues[f.name] && !uploadedFiles[f.name]);
    if (missing.length > 0) {
      setError(`请填写必填项：${missing.map((f) => f.label).join('、')}`);
      setSubmitting(false);
      return;
    }

    if (!identifier) {
      setError('请填写手机号或邮箱，用于接收审核通知');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/contributor/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          name: name || undefined,
          type,
          data: formValues,
          files: Object.values(uploadedFiles).map((f) => f.path),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || '提交失败');
        setSubmitting(false);
        return;
      }

      setSuccess({
        identifier: result.contributor?.identifier || identifier,
        isNew: result.contributor?.isNew ?? true,
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
            <p className="text-gray-500">
              您已成功注册为资料贡献者，账号为：
              <span className="font-semibold text-sky-600">{success.identifier}</span>
            </p>
            <div className="w-full bg-sky-50 rounded-lg p-4 flex items-center gap-3">
              <Gift className="w-6 h-6 text-sky-500 shrink-0" />
              <div className="text-left text-sm text-gray-600">
                您已获得 <span className="font-bold text-sky-600">{CONTRIBUTOR_REGISTER_POINTS} 积分</span> 注册奖励
                {success.isNew ? '' : '（老用户）'}
              </div>
            </div>
            <p className="text-sm text-gray-400">您的资料已进入审核流程，审核通过后将自动发放积分奖励。</p>
            <Button className="w-full mt-2" onClick={() => router.push('/')}>
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10">
      <div className="max-w-3xl mx-auto px-4">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-1.5 rounded-full text-sm mb-4">
            <ShieldCheck className="w-4 h-4" />
            公开上传 · 无需登录
          </div>
          <h1 className="text-3xl font-bold text-gray-800">资料贡献中心</h1>
          <p className="text-gray-500 mt-2">
            分享您的专业资料，审核通过即可获得积分奖励，资料贡献者还可获得额外收益
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. 选择资料类型</CardTitle>
            <CardDescription>根据您要上传的内容选择对应的类型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {CONTRIBUTOR_TYPES.map((t) => (
                <Badge
                  key={t}
                  variant={type === t ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => handleTypeChange(t)}
                >
                  {CONTRIBUTOR_TYPE_LABELS[t]}
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
                          accept={field.type === 'image' ? 'image/*' : undefined}
                          onChange={(e) => handleFileChange(field.name, e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
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
            <CardTitle className="text-lg">3. 联系方式</CardTitle>
            <CardDescription>用于注册账号并接收审核结果通知</CardDescription>
          </CardHeader>
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
          </CardContent>
          <CardFooter className="flex-col gap-3">
            {error && <p className="text-red-500 text-sm w-full">{error}</p>}
            <Button
              className="w-full"
              size="lg"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                '提交资料'
              )}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              提交即表示同意作为资料贡献者注册账号，注册奖励 {CONTRIBUTOR_REGISTER_POINTS} 积分
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
