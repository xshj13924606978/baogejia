/**
 * 方案查看器（#[20260827-1030]-2）
 *
 * 展示增强后的完整技术方案：
 * - 完整 Markdown（10 章节）
 * - 工艺流程图（Mermaid 渲染为 SVG）
 * - 报价占比 / 设备参数对比（ECharts）
 * - AI 设备示意图（Pollinations.ai + 结构化占位图降级）
 * - 报价明细 / 备品备件表格
 * - 导出：PPT / PDF / Word / Excel / Markdown
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import type {
  EnhancedProposalResult,
  ProposalExportAssets,
} from '@/types/proposal';
import {
  renderMermaidToSvg,
  svgToPngDataUrl,
  buildMermaidFallbackSvg,
} from '@/lib/visualization/flowchart-generator';
import {
  buildQuoteBreakdownOption,
  buildEquipmentCompareOption,
} from '@/lib/visualization/chart-generator';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// ============================================================================
// 主组件
// ============================================================================

export default function ProposalViewer({ proposal }: { proposal: EnhancedProposalResult }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 渲染资产引用（供导出）
  const chartRefs = useRef<{ breakdown?: any; equipment?: any }>({});
  const diagramRef = useRef<{ svg?: string; png?: string }>({});
  const imageRefs = useRef<Record<string, string>>({});

  // 图表容器
  const breakdownRef = useRef<HTMLDivElement>(null);
  const equipmentRef = useRef<HTMLDivElement>(null);

  const supplier = proposal.supplierInfo || {};
  const totalAmount = proposal.totalAmount || 0;

  // --------------------------------------------------------------------------
  // 导出资产收集
  // --------------------------------------------------------------------------

  const collectAssets = useCallback((): ProposalExportAssets => {
    const assets: ProposalExportAssets = {};
    const charts: Record<string, string> = {};
    if (chartRefs.current.breakdown) {
      try {
        charts.quoteBreakdown = chartRefs.current.breakdown.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
      } catch {
        /* ignore */
      }
    }
    if (chartRefs.current.equipment) {
      try {
        charts.equipmentCompare = chartRefs.current.equipment.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
      } catch {
        /* ignore */
      }
    }
    if (Object.keys(charts).length > 0) assets.charts = charts;

    if (diagramRef.current.png) {
      assets.diagram = { svg: diagramRef.current.svg, png: diagramRef.current.png };
    }
    if (Object.keys(imageRefs.current).length > 0) {
      assets.images = { ...imageRefs.current };
    }
    return assets;
  }, []);

  // --------------------------------------------------------------------------
  // 服务端导出（PPT / PDF / Word）
  // --------------------------------------------------------------------------

  const serverExport = useCallback(
    async (format: 'ppt' | 'pdf' | 'word') => {
      setExporting(format);
      setExportError(null);
      try {
        const assets = collectAssets();
        const res = await fetch('/api/proposal/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'enhance',
            preGeneratedResult: proposal,
            format,
            assets,
          }),
        });
        if (!res.ok) {
          let msg = `导出失败（${res.status}）`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'ppt' ? 'pptx' : format;
        a.download = `${(proposal.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_')}-技术方案.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        setExportError(e?.message || '导出失败');
        console.error('[ProposalViewer] 导出失败:', e);
      } finally {
        setExporting(null);
      }
    },
    [proposal, collectAssets]
  );

  // --------------------------------------------------------------------------
  // 客户端导出（Excel / Markdown）
  // --------------------------------------------------------------------------

  const clientExportExcel = useCallback(() => {
    try {
      const quoteRows = proposal.quoteItems.map((it, i) => ({
        序号: i + 1,
        名称: it.name,
        规格型号: it.model,
        品牌产地: it.brand,
        数量: it.quantity,
        单位: it.unit,
        单价元: it.unitPrice,
        小计元: it.totalPrice,
        质保期: it.warranty,
        技术参数: it.techParams,
      }));
      const spareRows = proposal.spareParts.map((p, i) => ({
        序号: i + 1,
        名称: p.name,
        规格型号: p.model,
        品牌: p.brand,
        数量: p.quantity,
        单位: p.unit,
        单价元: p.unitPrice,
        小计元: p.totalPrice,
        备注: p.remark,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quoteRows), '报价明细');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spareRows), '备品备件');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          { 项目名称: proposal.projectName, 供方单位: supplier.companyName, 报价合计元: totalAmount },
        ]),
        '汇总'
      );
      XLSX.writeFile(wb, `${proposal.projectName || '技术方案'}-报价明细.xlsx`);
    } catch (e: any) {
      setExportError(e?.message || 'Excel 导出失败');
    }
  }, [proposal, supplier.companyName, totalAmount]);

  const clientExportMarkdown = useCallback(() => {
    const content = `# ${proposal.title}\n\n${proposal.markdown}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(proposal.projectName || '技术方案').replace(/[\\/:*?"<>|]/g, '_')}-技术方案.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [proposal]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(proposal.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [proposal.markdown]);

  const markdownHtml = useMemo(() => md.render(proposal.markdown || ''), [proposal.markdown]);

  const totalChinese = useMemo(() => numToChinese(totalAmount), [totalAmount]);

  return (
    <div className="w-full space-y-4 rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* 头部信息 */}
      <div className="rounded-t-xl bg-gradient-to-r from-blue-700 to-blue-500 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-snug">{proposal.title || '技术方案'}</h3>
            <p className="mt-1 text-sm text-blue-100">
              {proposal.projectName}
              {proposal.capacity > 0 && `｜设计规模 ${proposal.capacity} m³/d`}
            </p>
            {supplier.companyName && (
              <p className="mt-1 text-xs text-blue-100">供方：{supplier.companyName}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-white/20 text-white hover:bg-white/30">
              {proposal.sections?.length || 0} 章节
            </Badge>
            {totalAmount > 0 && (
              <div className="text-right">
                <div className="text-xs text-blue-200">报价合计（元）</div>
                <div className="text-2xl font-bold">¥ {totalAmount.toLocaleString('zh-CN')}</div>
                <div className="text-xs text-blue-200">{totalChinese}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 导出工具栏 */}
      <div className="px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="default" disabled={exporting === 'ppt'} onClick={() => serverExport('ppt')}>
            {exporting === 'ppt' ? <Spinner className="mr-1 h-3 w-3" /> : null}
            导出 PPT
          </Button>
          <Button size="sm" variant="outline" disabled={exporting === 'pdf'} onClick={() => serverExport('pdf')}>
            {exporting === 'pdf' ? <Spinner className="mr-1 h-3 w-3" /> : null}
            导出 PDF
          </Button>
          <Button size="sm" variant="outline" disabled={exporting === 'word'} onClick={() => serverExport('word')}>
            {exporting === 'word' ? <Spinner className="mr-1 h-3 w-3" /> : null}
            导出 Word
          </Button>
          <Button size="sm" variant="outline" onClick={clientExportExcel}>
            导出 Excel
          </Button>
          <Button size="sm" variant="outline" onClick={clientExportMarkdown}>
            导出 Markdown
          </Button>
          <Button size="sm" variant="ghost" onClick={copyMarkdown}>
            {copied ? '已复制' : '复制内容'}
          </Button>
          {exportError && (
            <span className="text-xs text-red-600">导出失败：{exportError}</span>
          )}
        </div>
      </div>

      {/* 可视化区域 */}
      <div className="px-5">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">完整方案</TabsTrigger>
            <TabsTrigger value="flow">工艺流程图</TabsTrigger>
            <TabsTrigger value="charts">数据图表</TabsTrigger>
            <TabsTrigger value="images">设备示意图</TabsTrigger>
            <TabsTrigger value="quote">报价明细</TabsTrigger>
            <TabsTrigger value="parts">备品备件</TabsTrigger>
            <TabsTrigger value="calcs">设计计算书</TabsTrigger>
          </TabsList>

          {/* 完整方案（Markdown） */}
          <TabsContent value="overview" className="mt-3">
            <MarkdownPanel html={markdownHtml} />
          </TabsContent>

          {/* 工艺流程图 */}
          <TabsContent value="flow" className="mt-3">
            <FlowDiagramPanel
              mermaidSource={proposal.mermaidSource}
              steps={extractStepNames(proposal.mermaidSource)}
              onRendered={(svg, png) => {
                diagramRef.current = { svg, png };
              }}
            />
          </TabsContent>

          {/* 数据图表 */}
          <TabsContent value="charts" className="mt-3">
            <ChartsPanel
              chartData={proposal.chartData}
              breakdownRef={breakdownRef}
              equipmentRef={equipmentRef}
              chartRefs={chartRefs}
            />
          </TabsContent>

          {/* 设备示意图 */}
          <TabsContent value="images" className="mt-3">
            <ImagesPanel
              images={proposal.images}
              onImageReady={(id, dataUrl) => {
                imageRefs.current[id] = dataUrl;
              }}
            />
          </TabsContent>

          {/* 报价明细 */}
          <TabsContent value="quote" className="mt-3">
            <QuoteTable proposal={proposal} />
          </TabsContent>

          {/* 备品备件 */}
          <TabsContent value="parts" className="mt-3">
            <SparePartsTable proposal={proposal} />
          </TabsContent>

          {/* 设计计算书 */}
          <TabsContent value="calcs" className="mt-3">
            <DesignCalcsPanel proposal={proposal} />
          </TabsContent>
        </Tabs>
      </div>

      <div className="px-5 pb-4 text-xs text-muted-foreground">
        生成时间：{proposal.generatedAt ? new Date(proposal.generatedAt).toLocaleString('zh-CN') : '-'}
        ｜ 方案置信度：{(proposal.confidence * 100).toFixed(0)}%
      </div>
    </div>
  );
}

// ============================================================================
// 子面板
// ============================================================================

function MarkdownPanel({ html }: { html: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className="proposal-markdown max-h-[640px] overflow-y-auto text-sm leading-7"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </CardContent>
    </Card>
  );
}

function FlowDiagramPanel({
  mermaidSource,
  steps,
  onRendered,
}: {
  mermaidSource: string;
  steps: { step: number; name: string }[];
  onRendered: (svg: string, png: string) => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setSvg(null);
      setPng(null);
      notifiedRef.current = false;
      if (!mermaidSource) {
        setError('未生成流程图');
        return;
      }
      try {
        const rendered = await renderMermaidToSvg(mermaidSource);
        if (cancelled) return;
        setSvg(rendered);
        try {
          const dataUrl = await svgToPngDataUrl(rendered, 1200, 500);
          if (cancelled) return;
          setPng(dataUrl);
        } catch {
          /* PNG 转换失败不影响 SVG 展示 */
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || '流程图渲染失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mermaidSource]);

  // 通知父组件导出资产
  useEffect(() => {
    if (svg && png && !notifiedRef.current) {
      notifiedRef.current = true;
      onRendered(svg, png);
    }
  }, [svg, png, onRendered]);

  if (error && !svg) {
    const fallback = buildMermaidFallbackSvg('工艺流程图', steps);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">流程图渲染失败，已展示结构化示意图</p>
          <img src={fallback} alt="工艺流程图（示意）" className="w-full rounded-lg border" />
        </CardContent>
      </Card>
    );
  }

  if (!svg) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-10">
          <Spinner className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">正在渲染工艺流程图…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="工艺流程图" className="mx-auto min-w-[720px]" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">工艺流程图（Mermaid 渲染为 SVG）</p>
      </CardContent>
    </Card>
  );
}

function ChartsPanel({
  chartData,
  breakdownRef,
  equipmentRef,
  chartRefs,
}: {
  chartData: EnhancedProposalResult['chartData'];
  breakdownRef: React.RefObject<HTMLDivElement | null>;
  equipmentRef: React.RefObject<HTMLDivElement | null>;
  chartRefs: React.MutableRefObject<{ breakdown?: any; equipment?: any }>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let breakdownChart: any = null;
    let equipmentChart: any = null;

    (async () => {
      try {
        const echarts = await import('echarts');
        if (cancelled) return;

        if (breakdownRef.current) {
          breakdownChart = echarts.init(breakdownRef.current, undefined, { renderer: 'canvas' });
          breakdownChart.setOption(buildQuoteBreakdownOption(chartData), true);
          chartRefs.current.breakdown = breakdownChart;
        }
        if (equipmentRef.current) {
          equipmentChart = echarts.init(equipmentRef.current, undefined, { renderer: 'canvas' });
          equipmentChart.setOption(buildEquipmentCompareOption(chartData), true);
          chartRefs.current.equipment = equipmentChart;
        }

        const handleResize = () => {
          breakdownChart?.resize();
          equipmentChart?.resize();
        };
        window.addEventListener('resize', handleResize);
        setLoading(false);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '图表渲染失败');
      }
    })();

    return () => {
      cancelled = true;
      try {
        breakdownChart?.dispose();
        equipmentChart?.dispose();
      } catch {
        /* ignore */
      }
    };
  }, [chartData, breakdownRef, equipmentRef, chartRefs]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          图表渲染失败：{error}
        </CardContent>
      </Card>
    );
  }

  const hasData =
    (chartData?.quoteBreakdown?.length || 0) > 0 || (chartData?.equipmentCompare?.length || 0) > 0;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          暂无图表数据（请确认已生成完整的成本分析数据）。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">报价占比</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex h-[320px] items-center justify-center">
              <Spinner className="h-4 w-4" />
            </div>
          ) : (
            <div ref={breakdownRef} className="h-[320px] w-full" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">设备参数对比</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex h-[320px] items-center justify-center">
              <Spinner className="h-4 w-4" />
            </div>
          ) : (
            <div ref={equipmentRef} className="h-[320px] w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImagesPanel({
  images,
  onImageReady,
}: {
  images: EnhancedProposalResult['images'];
  onImageReady: (id: string, dataUrl: string) => void;
}) {
  const [status, setStatus] = useState<Record<string, 'loading' | 'loaded' | 'failed'>>({});

  const handleError = useCallback(
    (id: string) => {
      setStatus((s) => ({ ...s, [id]: 'failed' }));
    },
    []
  );

  const handleLoad = useCallback(
    (id: string, el: HTMLImageElement) => {
      setStatus((s) => ({ ...s, [id]: 'loaded' }));
      // 尝试捕获同源/带 CORS 图片用于导出（失败静默）
      try {
        if (el.src.startsWith('http')) return; // 跨域图片不尝试 toDataURL
        onImageReady(id, el.src);
      } catch {
        /* ignore */
      }
    },
    [onImageReady]
  );

  if (!images || images.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          暂无设备示意图（设备清单为空时可忽略此区域）。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {images.map((img) => (
        <Card key={img.id}>
          <CardContent className="p-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-slate-50">
              {status[img.id] === 'loading' || !status[img.id] ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : null}
              {status[img.id] === 'failed' ? (
                <img
                  src={img.fallback}
                  alt={img.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <img
                  src={img.url}
                  alt={img.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  crossOrigin="anonymous"
                  onLoad={(e) => handleLoad(img.id, e.currentTarget)}
                  onError={() => handleError(img.id)}
                />
              )}
            </div>
            <p className="mt-2 text-center text-xs font-medium">{img.title}</p>
            {status[img.id] === 'failed' && (
              <p className="text-center text-[10px] text-muted-foreground">
                图片生成失败，已展示结构化占位图（含设备名称与关键参数）
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuoteTable({ proposal }: { proposal: EnhancedProposalResult }) {
  const items = proposal.quoteItems || [];
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">报价明细为空。</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          报价明细　合计：¥ {proposal.totalAmount.toLocaleString('zh-CN')}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-3 pt-0">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="bg-blue-50 text-left text-blue-900">
              <th className="border px-2 py-1.5">序号</th>
              <th className="border px-2 py-1.5">名称</th>
              <th className="border px-2 py-1.5">规格型号</th>
              <th className="border px-2 py-1.5">品牌/产地</th>
              <th className="border px-2 py-1.5">数量</th>
              <th className="border px-2 py-1.5">单价(元)</th>
              <th className="border px-2 py-1.5">小计(元)</th>
              <th className="border px-2 py-1.5">质保期</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id || i} className="odd:bg-white even:bg-slate-50">
                <td className="border px-2 py-1.5">{i + 1}</td>
                <td className="border px-2 py-1.5">{it.name}</td>
                <td className="border px-2 py-1.5">{it.model || '-'}</td>
                <td className="border px-2 py-1.5">{it.brand || '-'}</td>
                <td className="border px-2 py-1.5">{it.quantity}</td>
                <td className="border px-2 py-1.5">{it.unitPrice.toLocaleString('zh-CN')}</td>
                <td className="border px-2 py-1.5 font-medium">
                  {it.totalPrice.toLocaleString('zh-CN')}
                </td>
                <td className="border px-2 py-1.5">{it.warranty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SparePartsTable({ proposal }: { proposal: EnhancedProposalResult }) {
  const parts = proposal.spareParts || [];
  if (parts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">备品备件清单为空。</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">首年推荐备品备件清单</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-3 pt-0">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-blue-50 text-left text-blue-900">
              <th className="border px-2 py-1.5">序号</th>
              <th className="border px-2 py-1.5">名称</th>
              <th className="border px-2 py-1.5">规格型号</th>
              <th className="border px-2 py-1.5">品牌</th>
              <th className="border px-2 py-1.5">数量</th>
              <th className="border px-2 py-1.5">单价(元)</th>
              <th className="border px-2 py-1.5">小计(元)</th>
              <th className="border px-2 py-1.5">备注</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50">
                <td className="border px-2 py-1.5">{i + 1}</td>
                <td className="border px-2 py-1.5">{p.name}</td>
                <td className="border px-2 py-1.5">{p.model || '-'}</td>
                <td className="border px-2 py-1.5">{p.brand || '-'}</td>
                <td className="border px-2 py-1.5">{p.quantity}</td>
                <td className="border px-2 py-1.5">{p.unitPrice.toLocaleString('zh-CN')}</td>
                <td className="border px-2 py-1.5 font-medium">
                  {p.totalPrice.toLocaleString('zh-CN')}
                </td>
                <td className="border px-2 py-1.5">{p.remark || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-muted-foreground">
          备品备件价格按主机价格比例估算，实际采购价格以当期市场价为准。
        </p>
      </CardContent>
    </Card>
  );
}

function DesignCalcsPanel({ proposal }: { proposal: EnhancedProposalResult }) {
  const calcs = proposal.designCalculations || [];
  if (calcs.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          设计计算书为空（处理规模未提供时跳过）。
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {calcs.map((c, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {i + 1}. {c.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">计算目的：</span>
              {c.purpose}
            </p>
            <div>
              <span className="font-medium">计算过程：</span>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                {c.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            </div>
            <p>
              <span className="font-medium">计算结果：</span>
              {c.result}
            </p>
            <p>
              <span className="font-medium">结论：</span>
              {c.conclusion}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// 工具
// ============================================================================

function extractStepNames(mermaidSource: string): { step: number; name: string }[] {
  const steps: { step: number; name: string }[] = [];
  if (!mermaidSource) return steps;
  const re = /\bS(\d+)\["([^"]+)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mermaidSource)) !== null) {
    steps.push({ step: parseInt(m[1], 10), name: m[2] });
  }
  return steps.sort((a, b) => a.step - b.step);
}

function numToChinese(num: number): string {
  if (!num || num <= 0) return '零元整';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];

  const s = String(Math.floor(num));
  const len = s.length;
  const groups: string[] = [];
  for (let i = len; i > 0; i -= 4) {
    groups.push(s.slice(Math.max(0, i - 4), i));
  }

  const readGroup = (g: string): string => {
    let out = '';
    let zeroPending = false;
    for (let i = 0; i < g.length; i++) {
      const d = parseInt(g[i], 10);
      const pos = g.length - i - 1;
      if (d === 0) {
        if (out) zeroPending = true;
      } else {
        if (zeroPending) out += '零';
        zeroPending = false;
        out += digits[d] + units[pos];
      }
    }
    return out;
  };

  let result = '';
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    const read = readGroup(g);
    if (!read) continue;
    if (result) {
      const leadingZeroNeeded = /^0/.test(g) && /[1-9]/.test(g.slice(1));
      if (leadingZeroNeeded && !result.endsWith('零')) result += '零';
    }
    result += read + bigUnits[gi];
  }
  result = result.replace(/零+$/, '');
  return (result || '零') + '元整';
}
