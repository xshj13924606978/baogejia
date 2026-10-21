'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UploadCloud, FileSearch, Cpu, Ruler, Weight, Package } from 'lucide-react';
import { CNCAnalysisResult, CNCQuoteResult } from '@/lib/openclaw-cnc/types';

// 可选材料
const MATERIALS = ['铝合金', '6061铝合金', '7075铝合金', '不锈钢', '304不锈钢', '316不锈钢', '碳钢', '45钢', 'Q235', '模具钢', '铜', '黄铜', '紫铜', 'POM', '尼龙', 'PA66', 'ABS', 'PC', 'PEEK', '钛合金', 'TC4钛合金'];

// 公差等级
const TOLERANCES = ['±0.1mm', '±0.05mm', '±0.02mm', '±0.01mm'];

// 表面处理
const SURFACE_TREATMENTS = ['无', '阳极氧化', '硬质阳极氧化', '镀锌', '镀镍', '镀铬', '喷砂', '抛光', '拉丝', '喷漆'];

// 复杂度
const COMPLEXITIES = [
  { value: 'low', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'high', label: '复杂' },
];

// 支持的文件类型
const ACCEPTED_EXTENSIONS = ['.step', '.stp', '.stl', '.obj', '.ply', '.glb', '.gltf', '.dxf', '.png', '.jpg', '.jpeg', '.bmp', '.webp'];

interface AnalysisDisplayProps {
  result: CNCAnalysisResult;
}

function AnalysisResultCard({ result }: AnalysisDisplayProps) {
  if (!result.success) {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-4">
        分析失败：{result.error || '未知错误'}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">{result.format.toUpperCase()}</Badge>
        <span className="text-sm text-gray-500 truncate">{result.fileName}</span>
      </div>
      {result.dimensions && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <Ruler className="w-5 h-5 mx-auto mb-1 text-sky-500" />
            <div className="text-lg font-bold text-gray-800">{result.dimensions.length}</div>
            <div className="text-xs text-gray-500">长度 (mm)</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <Ruler className="w-5 h-5 mx-auto mb-1 text-sky-500" />
            <div className="text-lg font-bold text-gray-800">{result.dimensions.width}</div>
            <div className="text-xs text-gray-500">宽度 (mm)</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <Ruler className="w-5 h-5 mx-auto mb-1 text-sky-500" />
            <div className="text-lg font-bold text-gray-800">{result.dimensions.height}</div>
            <div className="text-xs text-gray-500">高度 (mm)</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {result.volume !== undefined && result.volume > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <Package className="w-4 h-4 text-sky-500" />
            体积：{result.volume.toLocaleString()} mm³
          </div>
        )}
        {result.mass !== undefined && result.mass > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <Weight className="w-4 h-4 text-sky-500" />
            估算质量：{result.mass} kg
          </div>
        )}
      </div>
      {result.warnings && result.warnings.length > 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteResultCard({ result }: { result: CNCQuoteResult }) {
  if (!result.success) {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-4">
        报价失败：{result.error || '未知错误'}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-gray-500">单件价格</div>
          <div className="text-3xl font-bold text-sky-600">¥ {result.unitPrice.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">总价</div>
          <div className="text-xl font-bold text-gray-800">¥ {result.totalPrice.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">预计 {result.deliveryDays} 天交付</div>
        </div>
      </div>
      <div className="space-y-2">
        {result.breakdown.map((item, i) => (
          <div key={i} className="flex justify-between text-sm text-gray-600 border-b border-gray-100 pb-2">
            <span>{item.label}</span>
            <span className="font-medium">¥ {item.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * OpenClaw CNC 分析报价组件
 * 上传图纸/模型文件进行尺寸分析，并生成 CNC 加工报价
 */
export default function CNCAnalyzer() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CNCAnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');

  const [material, setMaterial] = useState('铝合金');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [tolerance, setTolerance] = useState('±0.1mm');
  const [surfaceTreatment, setSurfaceTreatment] = useState('无');
  const [complexity, setComplexity] = useState<'low' | 'medium' | 'high'>('medium');
  const [quoting, setQuoting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<CNCQuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState('');

  // 分析成功后，将尺寸回填到报价表单
  useEffect(() => {
    if (analysisResult?.success && analysisResult.dimensions) {
      const { length: l, width: w, height: h } = analysisResult.dimensions;
      if (l > 0) setLength(String(l));
      if (w > 0) setWidth(String(w));
      if (h > 0) setHeight(String(h));
    }
  }, [analysisResult]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setAnalyzeError(`不支持的文件格式：${ext}，请上传 ${ACCEPTED_EXTENSIONS.join('、')}`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setAnalyzeError('');
    setAnalysisResult(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setAnalyzeError('请先选择文件');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError('');
    setAnalysisResult(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch('/api/cnc/analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error || '分析失败');
      } else {
        setAnalysisResult(data.result);
      }
    } catch {
      setAnalyzeError('网络错误，请稍后重试');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleQuote = async () => {
    if (!material) {
      setQuoteError('请选择材料');
      return;
    }
    if (!length || !width || !height) {
      setQuoteError('请填写长、宽、高');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setQuoteError('请填写有效数量');
      return;
    }
    setQuoting(true);
    setQuoteError('');
    setQuoteResult(null);
    try {
      const res = await fetch('/api/cnc/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material,
          length: Number(length),
          width: Number(width),
          height: Number(height),
          quantity: Number(quantity),
          tolerance,
          surfaceTreatment,
          complexity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuoteError(data.error || '报价失败');
      } else {
        setQuoteResult(data.result);
      }
    } catch {
      setQuoteError('网络错误，请稍后重试');
    } finally {
      setQuoting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-sky-600" />
            图纸分析
          </CardTitle>
          <CardDescription>
            上传 STEP / STL / DXF 等图纸或模型文件，自动提取尺寸、体积、质量等参数
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <>
                <UploadCloud className="w-10 h-10 mx-auto mb-2 text-sky-500" />
                <div className="text-sm font-medium text-gray-700">{selectedFile.name}</div>
                <div className="text-xs text-gray-400 mt-1">点击重新选择文件</div>
              </>
            ) : (
              <>
                <UploadCloud className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-500">点击选择或拖拽文件到此处</div>
                <div className="text-xs text-gray-400 mt-1">{ACCEPTED_EXTENSIONS.join('、')}</div>
              </>
            )}
          </div>
          {analyzeError && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{analyzeError}</div>}
          <Button
            className="w-full"
            disabled={!selectedFile || analyzing}
            onClick={handleAnalyze}
          >
            {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
            {analyzing ? '分析中...' : '开始分析'}
          </Button>
          {analysisResult && <AnalysisResultCard result={analysisResult} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-sky-600" />
            CNC 加工报价
          </CardTitle>
          <CardDescription>根据材料与尺寸参数生成加工报价（估算）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="cnc-material">材料</Label>
              <Select value={material} onValueChange={setMaterial}>
                <SelectTrigger id="cnc-material" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cnc-length">长度 (mm)</Label>
              <Input
                id="cnc-length"
                type="number"
                min="0"
                step="0.1"
                className="mt-1.5"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="100"
              />
            </div>
            <div>
              <Label htmlFor="cnc-width">宽度 (mm)</Label>
              <Input
                id="cnc-width"
                type="number"
                min="0"
                step="0.1"
                className="mt-1.5"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="50"
              />
            </div>
            <div>
              <Label htmlFor="cnc-height">高度 (mm)</Label>
              <Input
                id="cnc-height"
                type="number"
                min="0"
                step="0.1"
                className="mt-1.5"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="10"
              />
            </div>
            <div>
              <Label htmlFor="cnc-quantity">数量</Label>
              <Input
                id="cnc-quantity"
                type="number"
                min="1"
                step="1"
                className="mt-1.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <Label htmlFor="cnc-tolerance">公差等级</Label>
              <Select value={tolerance} onValueChange={setTolerance}>
                <SelectTrigger id="cnc-tolerance" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOLERANCES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cnc-surface">表面处理</Label>
              <Select value={surfaceTreatment} onValueChange={setSurfaceTreatment}>
                <SelectTrigger id="cnc-surface" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURFACE_TREATMENTS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="cnc-complexity">加工复杂度</Label>
              <Select value={complexity} onValueChange={(v) => setComplexity(v as 'low' | 'medium' | 'high')}>
                <SelectTrigger id="cnc-complexity" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {quoteError && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{quoteError}</div>}
          <Button
            className="w-full"
            disabled={quoting}
            onClick={handleQuote}
          >
            {quoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
            {quoting ? '报价中...' : '生成报价'}
          </Button>
          {quoteResult && <QuoteResultCard result={quoteResult} />}
        </CardContent>
      </Card>
    </div>
  );
}
