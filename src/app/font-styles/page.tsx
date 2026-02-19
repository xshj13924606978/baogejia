'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const fontStyles = [
  {
    id: 'modern-bold',
    name: '现代粗体风格',
    description: '简洁大气，适合商务应用',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_c2e058a0-5cca-4ded-a0e2-8924adf160c9.jpeg',
    cssClass: 'font-black tracking-widest'
  },
  {
    id: 'tech-glow',
    name: '科技感发光风格',
    description: '未来感，带淡蓝色发光效果',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_6af959fd-5bfa-4e28-b54e-b5f7ce4c08d8.jpeg',
    cssClass: 'font-black tracking-widest drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]'
  },
  {
    id: 'metal-gradient',
    name: '金属质感渐变风格',
    description: '带金属光泽，质感厚重',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_a754f1ee-532d-4757-a91f-af9f19ccafd7.jpeg',
    cssClass: 'font-black tracking-widest bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent'
  },
  {
    id: 'minimal-light',
    name: '极简现代风格',
    description: '超细字重，优雅简约',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_b19d9c40-c328-4386-98d6-084d043efd07.jpeg',
    cssClass: 'font-light tracking-[0.3em]'
  },
  {
    id: '3d-emboss',
    name: '立体浮雕风格',
    description: '带立体投影，视觉冲击力强',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_3777879b-c5a9-4fb1-a1d0-782f50a782a1.jpeg',
    cssClass: 'font-black tracking-widest drop-shadow-2xl'
  },
  {
    id: 'glow-gradient',
    name: '渐变辉光风格',
    description: '带边缘辉光，视觉冲击力强',
    image: 'https://coze-coding-project.tos.coze.site/coze_storage_7607086369059373096/image/generate_image_c22a8b31-eb38-444a-805c-25abf3aa0ad0.jpeg',
    cssClass: 'font-black tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]'
  }
];

export default function FontStylesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 返回按钮 */}
        <Link href="/">
          <Button variant="ghost" className="mb-6 gap-2">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Button>
        </Link>

        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 mb-2">
            字体样式参考
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            为"报个价"导航栏标题提供多种字体风格选择
          </p>
        </div>

        {/* 字体样式展示 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fontStyles.map((style) => (
            <Card key={style.id} className="overflow-hidden hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{style.name}</CardTitle>
                <CardDescription>{style.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 图片展示 */}
                  <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
                    <img
                      src={style.image}
                      alt={style.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* CSS 类参考 */}
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mb-1">Tailwind CSS 类：</p>
                    <code className="text-sm font-mono text-slate-900 dark:text-slate-100 break-all">
                      {style.cssClass}
                    </code>
                  </div>

                  {/* 实时预览 */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-4">
                    <p className="text-xs text-blue-100 mb-2 opacity-75">实时预览（当前应用）：</p>
                    <h1 className={`text-3xl text-white ${style.cssClass}`}>
                      报个价
                    </h1>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 使用说明 */}
        <Card className="mt-8 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-700 dark:text-slate-300 space-y-2">
            <p>1. 当前已应用的样式为：<strong>现代粗体风格</strong>（`tracking-widest`）</p>
            <p>2. 所有样式的字间距均已加宽（`tracking-widest` 或 `tracking-[0.3em]`）</p>
            <p>3. 如需切换样式，请在 <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm">src/app/page.tsx</code> 中修改相应的 CSS 类</p>
            <p>4. 当前默认样式：<code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">font-black tracking-widest text-white</code></p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
