/**
 * Mermaid 流程图渲染器（#[20260827-1030]-2）
 *
 * 职责：
 * 1. 从工艺步骤数据构建 Mermaid flowchart 源码（服务端/客户端通用）
 * 2. 浏览器端使用已安装的 `mermaid` 包将源码渲染为 SVG
 * 3. 渲染失败时提供结构化占位图（含工艺名称与关键参数），保证功能闭环
 */

import type { ProcessFlowStep } from '@/types/proposal';

// ============================================================================
// Mermaid 源码构建（纯函数，服务端/客户端通用）
// ============================================================================

/**
 * 从工艺步骤构建 Mermaid 流程图源码
 */
export function buildProcessFlowMermaid(steps: ProcessFlowStep[]): string {
  if (!steps || steps.length === 0) {
    return defaultProcessFlowMermaid('工艺处理流程');
  }

  const lines: string[] = [];
  lines.push('flowchart LR');
  lines.push('  %% 工艺流程图（自动生成）');

  const sorted = [...steps].sort((a, b) => a.step - b.step);

  // 节点定义
  sorted.forEach((s) => {
    const id = `S${s.step}`;
    const label = sanitizeMermaidLabel(s.name || `工序${s.step}`);
    lines.push(`  ${id}["${label}"]`);
  });

  // 连线
  for (let i = 0; i < sorted.length - 1; i++) {
    lines.push(`  S${sorted[i].step} --> S${sorted[i + 1].step}`);
  }

  // 首尾标记
  if (sorted.length > 0) {
    lines.unshift('  Start([进水/原水])');
    lines.push(`  S${sorted[sorted.length - 1].step} --> EndX([出水/排放或回用])`);
    lines.push(`  Start --> S${sorted[0].step}`);
  }

  return lines.join('\n');
}

/**
 * 默认工艺流程图（当步骤为空时的兜底）
 */
export function defaultProcessFlowMermaid(title: string): string {
  return [
    'flowchart LR',
    '  Start([原水]) --> A["预处理"]',
    '  A --> B["主处理单元"]',
    '  B --> C["深度处理"]',
    '  C --> D["消毒"]',
    '  D --> EndX([出水])',
    '  B -. 污泥 .-> Sludge["污泥处理处置"]',
  ].join('\n');
}

/**
 * 从步骤数据构建"预处理-主处理-深度处理-污泥"框架流程图（含关键参数备注）
 */
export function buildFrameworkMermaid(steps: ProcessFlowStep[]): string {
  const groups: Record<string, ProcessFlowStep[]> = {
    预处理: [],
    主处理: [],
    深度处理: [],
    污泥: [],
  };

  steps.forEach((s) => {
    const name = s.name || '';
    if (name.includes('污泥') || name.includes('脱水') || name.includes('浓缩')) {
      groups['污泥'].push(s);
    } else if (name.includes('消毒') || name.includes('深度') || name.includes('膜') || name.includes('过滤')) {
      groups['深度处理'].push(s);
    } else if (name.includes('调节') || name.includes('格栅') || name.includes('沉淀') || name.includes('隔油')) {
      groups['预处理'].push(s);
    } else {
      groups['主处理'].push(s);
    }
  });

  const lines: string[] = ['flowchart LR'];
  lines.push('  Start([原水]) --> Pre(["预处理"])');
  const chain = ['Pre', 'Main', 'Deep', 'Out'];
  lines.push('  Main(["主处理单元"])');
  lines.push('  Deep(["深度处理与消毒"])');
  lines.push('  Pre --> Main');
  lines.push('  Main --> Deep');
  lines.push('  Deep --> Out([出水])');
  lines.push('  Main -. 污泥 .-> Slu(["污泥处理处置"])');

  // 关键参数备注
  let noteIdx = 0;
  steps.forEach((s) => {
    if (s.keyParams && noteIdx < 6) {
      lines.push(`  note${noteIdx}[${sanitizeMermaidLabel(s.name + '：' + s.keyParams)}]`);
      noteIdx++;
    }
  });

  return lines.join('\n');
}

// ============================================================================
// 浏览器端渲染（动态引入 mermaid，避免 SSR 报错）
// ============================================================================

let mermaidModule: any = null;

async function loadMermaid(): Promise<any> {
  if (mermaidModule) return mermaidModule;
  const mod = await import('mermaid');
  mermaidModule = mod.default || mod;
  return mermaidModule;
}

/**
 * 将 Mermaid 源码渲染为 SVG 字符串（浏览器端）
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  try {
    const mermaid = await loadMermaid();
    if (!mermaid) throw new Error('mermaid 加载失败');

    // 初始化（幂等）
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      });
    } catch {
      /* 已初始化则忽略 */
    }

    const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { svg } = await mermaid.render(id, code);
    if (!svg || svg.length < 50) throw new Error('渲染结果为空');
    return svg;
  } catch (err: any) {
    console.error('[MermaidRenderer] 渲染失败，降级为占位图:', err?.message || err);
    throw err;
  }
}

/**
 * 将 SVG 字符串转换为 PNG dataURL（用于导出 PPT/Word）
 */
export async function svgToPngDataUrl(svg: string, width = 1000, height = 500): Promise<string> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 图片加载失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// 结构化占位图（渲染失败时使用，保证闭环）
// ============================================================================

/**
 * 生成结构化占位 SVG（含流程图标题与关键节点）
 */
export function buildMermaidFallbackSvg(
  title: string,
  steps: Array<{ step: number; name: string }>
): string {
  const names = steps.slice(0, 8).map((s) => sanitizeSvgText(s.name || `工序${s.step}`));
  const W = 1000;
  const H = Math.max(260, 100 + names.length * 60);
  const boxW = 200;
  const boxH = 44;

  let nodes = '';
  names.forEach((name, i) => {
    const x = 80 + i * 220;
    const y = 90;
    nodes += `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>`;
    nodes += `<text x="${x + boxW / 2}" y="${y + boxH / 2 + 6}" text-anchor="middle" font-size="15" fill="#1e3a8a" font-family="sans-serif">${name}</text>`;
    if (i < names.length - 1) {
      nodes += `<line x1="${x + boxW}" y1="${y + boxH / 2}" x2="${x + 220}" y2="${y + boxH / 2}" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow)"/>`;
    }
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/></marker></defs>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${W / 2}" y="48" text-anchor="middle" font-size="22" font-weight="bold" fill="#111827" font-family="sans-serif">${sanitizeSvgText(title)}</text>`,
    `<text x="${W / 2}" y="74" text-anchor="middle" font-size="13" fill="#6b7280" font-family="sans-serif">工艺流程图（SVG 生成）</text>`,
    nodes,
    `</svg>`,
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ============================================================================
// 工具
// ============================================================================

function sanitizeMermaidLabel(text: string): string {
  return (text || '')
    .replace(/["\\]/g, '')
    .replace(/[<>]/g, ' ')
    .replace(/\n/g, ' ')
    .slice(0, 40);
}

function sanitizeSvgText(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 60);
}
