/**
 * 图表生成器（#[20260827-1030]-2）
 *
 * 使用 ECharts 生成可视化图表：
 * - 报价占比饼图
 * - 设备参数对比柱状图
 * 浏览器端渲染为 PNG（getDataURL），供查看与 PPT/Word 导出使用。
 */

import type { ProposalChartData } from '@/types/proposal';

// ============================================================================
// ECharts option 构建（纯函数，服务端/客户端通用）
// ============================================================================

/**
 * 报价占比饼图 option
 */
export function buildQuoteBreakdownOption(chartData: ProposalChartData): any {
  const data = (chartData?.quoteBreakdown || []).filter((d) => d.value > 0);
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 元 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: '报价占比',
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{d}%', fontSize: 11 },
        data,
      },
    ],
    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'],
  };
}

/**
 * 设备参数对比柱状图 option
 */
export function buildEquipmentCompareOption(chartData: ProposalChartData): any {
  const items = chartData?.equipmentCompare || [];
  const paramKeys: string[] = [];
  items.forEach((it) => {
    Object.keys(it.params || {}).forEach((k) => {
      if (!paramKeys.includes(k)) paramKeys.push(k);
    });
  });

  // 单参数：横向条形；多参数：分组柱状
  if (paramKeys.length <= 1) {
    const key = paramKeys[0] || '数量';
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 130, right: 24, top: 24, bottom: 36 },
      xAxis: { type: 'value', name: key },
      yAxis: {
        type: 'category',
        data: items.map((it) => it.name),
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          name: key,
          type: 'bar',
          data: items.map((it) => it.params[key] ?? 0),
          itemStyle: { borderRadius: [0, 6, 6, 0], color: '#3b82f6' },
          label: { show: true, position: 'right', fontSize: 11 },
          barMaxWidth: 28,
        },
      ],
    };
  }

  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 48, right: 24, top: 40, bottom: 64 },
    xAxis: {
      type: 'category',
      data: items.map((it) => it.name),
      axisLabel: { fontSize: 11, interval: 0, rotate: items.length > 4 ? 18 : 0 },
    },
    yAxis: { type: 'value' },
    series: paramKeys.map((key, i) => ({
      name: key,
      type: 'bar',
      data: items.map((it) => it.params[key] ?? 0),
      barMaxWidth: 26,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    })),
    color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
  };
}

// ============================================================================
// 浏览器端渲染（动态引入 echarts，避免 SSR 报错）
// ============================================================================

let echartsModule: any = null;

async function loadEcharts(): Promise<any> {
  if (echartsModule) return echartsModule;
  const mod = await import('echarts');
  echartsModule = mod;
  return echartsModule;
}

/**
 * 将 ECharts option 渲染为 PNG dataURL（浏览器端）
 */
export async function renderChartToPng(
  option: any,
  width = 640,
  height = 400
): Promise<string> {
  const echarts = await loadEcharts();
  const dom = document.createElement('div');
  dom.style.cssText = `position:absolute;left:-9999px;top:-9999px;width:${width}px;height:${height}px;`;
  document.body.appendChild(dom);

  let chart: any = null;
  try {
    chart = echarts.init(dom, undefined, { renderer: 'canvas', devicePixelRatio: 2 });
    chart.setOption(option, true);
    // 等待渲染完成
    await new Promise((resolve) => setTimeout(resolve, 120));
    const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
    return dataUrl;
  } finally {
    try {
      if (chart) chart.dispose();
    } catch {
      /* ignore */
    }
    try {
      document.body.removeChild(dom);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 生成结构化占位图（ECharts 渲染失败时使用，保证功能闭环）
 */
export function buildChartFallbackSvg(title: string, lines: { label: string; value: string }[]): string {
  const W = 640;
  const H = 320;
  let rows = '';
  lines.forEach((l, i) => {
    const y = 96 + i * 44;
    rows += `<rect x="70" y="${y - 22}" width="500" height="34" rx="6" fill="${i % 2 === 0 ? '#f1f5f9' : '#f8fafc'}" stroke="#e2e8f0" stroke-width="1"/>`;
    rows += `<text x="90" y="${y + 4}" font-size="14" fill="#334155" font-family="sans-serif">${l.label}</text>`;
    rows += `<text x="540" y="${y + 4}" text-anchor="end" font-size="14" font-weight="bold" fill="#1e40af" font-family="sans-serif">${l.value}</text>`;
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${W / 2}" y="48" text-anchor="middle" font-size="18" font-weight="bold" fill="#111827" font-family="sans-serif">${title}</text>`,
    rows,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
