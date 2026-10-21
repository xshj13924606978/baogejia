/**
 * 图片服务（#[20260827-1030]-2）
 *
 * 职责：
 * 1. 使用 Pollinations.ai 免费图片服务生成设备示意图
 * 2. 生成失败/加载失败时降级为结构化占位图（含设备名称与关键参数），保证功能闭环
 */

import type { ProposalImageRef } from '@/types/proposal';

// ============================================================================
// Pollinations.ai URL 构建
// ============================================================================

/**
 * 构建 Pollinations.ai 图片 URL
 * 参考：https://image.pollinations.ai/prompt/{prompt}?width=1024&height=1024&seed=xxx&model=flux
 */
export function buildPollinationsUrl(prompt: string, options: { width?: number; height?: number; seed?: number } = {}): string {
  const { width = 1024, height = 768, seed = 42 } = options;
  const encoded = encodeURIComponent(prompt.trim());
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;
}

// ============================================================================
// 结构化占位图
// ============================================================================

/**
 * 生成结构化占位图（SVG data URI，含设备名称与关键参数）
 */
export function buildEquipmentPlaceholder(title: string, params: string[] = []): string {
  const W = 1024;
  const H = 768;
  const safeTitle = (title || '设备示意图').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 40);
  const safeParams = params.map((p) =>
    (p || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 46)
  );

  let paramRows = '';
  safeParams.forEach((p, i) => {
    const y = 470 + i * 52;
    paramRows += `<rect x="220" y="${y - 24}" width="584" height="40" rx="8" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="1"/>`;
    paramRows += `<text x="250" y="${y + 5}" font-size="22" fill="#334155" font-family="sans-serif">${p}</text>`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="#eff6ff"/><stop offset="100%" stop-color="#e0f2fe"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    `<rect x="262" y="140" width="500" height="260" rx="20" fill="#ffffff" stroke="#3b82f6" stroke-width="4"/>`,
    `<circle cx="452" cy="270" r="52" fill="#dbeafe" stroke="#3b82f6" stroke-width="3"/>`,
    `<circle cx="572" cy="270" r="52" fill="#dbeafe" stroke="#3b82f6" stroke-width="3"/>`,
    `<rect x="380" y="330" width="264" height="18" rx="6" fill="#93c5fd"/>`,
    `<line x1="452" y1="218" x2="452" y2="140" stroke="#3b82f6" stroke-width="6"/>`,
    `<line x1="572" y1="218" x2="572" y2="140" stroke="#3b82f6" stroke-width="6"/>`,
    `<circle cx="452" cy="140" r="14" fill="#3b82f6"/>`,
    `<circle cx="572" cy="140" r="14" fill="#3b82f6"/>`,
    `<text x="${W / 2}" y="96" text-anchor="middle" font-size="40" font-weight="bold" fill="#1e3a8a" font-family="sans-serif">${safeTitle}</text>`,
    `<text x="${W / 2}" y="420" text-anchor="middle" font-size="24" fill="#1e40af" font-family="sans-serif">设备示意图（AI 配图生成中，加载后将替换此占位图）</text>`,
    paramRows,
    `<text x="${W / 2}" y="${470 + Math.max(0, safeParams.length) * 52 + 30}" text-anchor="middle" font-size="20" fill="#64748b" font-family="sans-serif">图：${safeTitle} 示意</text>`,
    `</svg>`,
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// 设备图片引用生成
// ============================================================================

export interface EquipmentImageInput {
  name: string;
  model?: string;
  specs?: string;
}

/**
 * 为设备清单生成图片引用（Pollinations.ai URL + 占位图降级）
 * 图片生成失败/加载失败时前端自动切换为 fallback 占位图
 */
export function generateEquipmentImages(equipment: EquipmentImageInput[]): ProposalImageRef[] {
  const pool = equipment.filter((e) => e && e.name).slice(0, 6);
  return pool.map((e, i) => {
    const title = e.name;
    const model = e.model ? `型号 ${e.model}` : '';
    const params = [model, e.specs || '按设计选型配置', '质保期：壹年（易损件除外）'].filter(Boolean);
    const prompt = `专业工业设备示意图，水处理${title}，工程设备渲染图，白色背景，工业风格，清晰细节，中文标注"${title}"`;
    return {
      id: `eq-img-${i + 1}`,
      title,
      prompt,
      url: buildPollinationsUrl(prompt, { seed: 100 + i, width: 1024, height: 768 }),
      fallback: buildEquipmentPlaceholder(title, params),
    };
  });
}
