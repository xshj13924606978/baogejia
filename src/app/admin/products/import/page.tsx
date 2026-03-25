'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Upload, FileSpreadsheet, Download, ArrowLeft, ArrowRight,
  CheckCircle, XCircle, AlertTriangle, Loader2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ImportFieldMapping from '@/components/knowledge-center/import-field-mapping';

type Step = 'upload' | 'mapping' | 'importing' | 'result';

interface ImportResult {
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  duplicate_count: number;
  details: any[];
}

export default function ProductImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 解析 Excel 文件
  const parseFile = useCallback((f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (json.length === 0) {
          toast.error('文件为空或格式不正确');
          return;
        }

        const headers = Object.keys(json[0]);
        setFile(f);
        setExcelHeaders(headers);
        setExcelData(json);
        setStep('mapping');
        toast.success(`解析成功：${json.length} 条数据，${headers.length} 列`);
      } catch {
        toast.error('文件解析失败，请确认为有效的 Excel 文件');
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  // 文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
    // 重置 input 以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 拖拽
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        parseFile(f);
      } else {
        toast.error('请上传 Excel (.xlsx/.xls) 或 CSV 文件');
      }
    }
  };

  // 字段映射确认
  const handleMappingConfirm = (mapping: Record<string, string>) => {
    const validMappings = Object.entries(mapping).filter(([, v]) => v);
    if (validMappings.length === 0) {
      toast.error('请至少映射一个字段');
      return;
    }
    // 检查必填字段
    const hasName = Object.values(mapping).includes('name') || Object.values(mapping).includes('product_name');
    if (!hasName) {
      toast.error('请映射"产品名称"字段（必填）');
      return;
    }
    performImport(mapping);
  };

  // 执行导入
  const performImport = async (fieldMapping: Record<string, string>) => {
    setStep('importing');
    setImporting(true);
    try {
      const res = await fetch('/api/tables/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: excelData, fieldMapping }),
      });
      const data = await res.json();

      if (data.success) {
        setResult({
          imported_count: data.imported_count || 0,
          skipped_count: data.skipped_count || 0,
          failed_count: data.failed_count || 0,
          duplicate_count: data.duplicate_count || 0,
          details: data.details || [],
        });
        setStep('result');
        const total = (data.imported_count || 0) + (data.skipped_count || 0) + (data.failed_count || 0);
        toast.success(`导入完成：成功 ${data.imported_count}/${total} 条`);
      } else {
        toast.error(data.error || '导入失败');
        setStep('mapping');
      }
    } catch {
      toast.error('网络错误，请重试');
      setStep('mapping');
    } finally {
      setImporting(false);
    }
  };

  // 重置
  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setExcelHeaders([]);
    setExcelData([]);
    setResult(null);
  };

  const steps = [
    { key: 'upload', label: '上传文件', icon: Upload },
    { key: 'mapping', label: '字段映射', icon: FileSpreadsheet },
    { key: 'importing', label: '导入中', icon: Loader2 },
    { key: 'result', label: '导入结果', icon: CheckCircle },
  ];
  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">产品导入</h1>
            <p className="text-gray-500">从 Excel 文件批量导入产品数据</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.open('/api/products/template')}>
          <Download className="h-4 w-4 mr-2" />
          下载模板
        </Button>
      </div>

      {/* 步骤条 */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = i <= stepIndex;
          const current = s.key === step;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <div className={`h-px flex-1 ${i <= stepIndex ? 'bg-blue-500' : 'bg-gray-200'}`} />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                current ? 'bg-blue-50 text-blue-600 font-medium' : active ? 'text-blue-500' : 'text-gray-400'
              }`}>
                <Icon className={`h-4 w-4 ${s.key === 'importing' && importing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: 上传文件 */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>上传 Excel 文件</CardTitle>
            <CardDescription>支持 .xlsx / .xls / .csv 格式</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                拖拽文件到此处，或点击选择文件
              </p>
              <p className="text-xs text-gray-400 mt-2">
                支持 Excel (.xlsx, .xls) 和 CSV 文件
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-700 mb-2">导入须知</h4>
              <ul className="text-xs text-blue-600 space-y-1">
                <li>1. 请先下载模板，按模板格式填写产品数据</li>
                <li>2. 第一行必须为列标题（如：产品名称、型号、价格等）</li>
                <li>3. 导入时会自动进行判重检查，重复数据将被跳过</li>
                <li>4. 支持智能字段映射，系统会自动匹配列名到对应字段</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: 字段映射 */}
      {step === 'mapping' && file && (
        <div className="space-y-4">
          {/* 文件信息 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {excelData.length} 行数据 · {excelHeaders.length} 列
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  重新选择
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 字段映射组件 */}
          <ImportFieldMapping
            excelHeaders={excelHeaders}
            excelData={excelData}
            onConfirm={handleMappingConfirm}
            onCancel={handleReset}
          />
        </div>
      )}

      {/* Step 3: 导入中 */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-lg font-medium">正在导入数据...</p>
            <p className="text-sm text-gray-500 mt-1">
              共 {excelData.length} 条数据，请勿关闭页面
            </p>
            <Progress value={undefined} className="mt-6 max-w-xs mx-auto" />
          </CardContent>
        </Card>
      )}

      {/* Step 4: 导入结果 */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                导入完成
              </CardTitle>
              <CardDescription>
                {file?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{result.imported_count}</p>
                  <p className="text-xs text-green-600 mt-1">导入成功</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{result.duplicate_count}</p>
                  <p className="text-xs text-blue-600 mt-1">重复跳过</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped_count}</p>
                  <p className="text-xs text-yellow-600 mt-1">数据跳过</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{result.failed_count}</p>
                  <p className="text-xs text-red-600 mt-1">导入失败</p>
                </div>
              </div>

              {/* 失败详情 */}
              {result.details.filter((d: any) => d.status === 'failed').length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    失败详情
                  </h4>
                  <div className="max-h-40 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>行号</TableHead>
                          <TableHead>产品名称</TableHead>
                          <TableHead>失败原因</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.details
                          .filter((d: any) => d.status === 'failed')
                          .slice(0, 20)
                          .map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{d.row || i + 1}</TableCell>
                              <TableCell className="text-sm">{d.name || '-'}</TableCell>
                              <TableCell className="text-sm text-red-600">{d.reason || '未知错误'}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              继续导入
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/admin/import-logs')}>
                <Eye className="h-4 w-4 mr-2" />
                查看导入日志
              </Button>
              <Button onClick={() => router.push('/admin/products')}>
                <ArrowRight className="h-4 w-4 mr-2" />
                查看产品列表
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
