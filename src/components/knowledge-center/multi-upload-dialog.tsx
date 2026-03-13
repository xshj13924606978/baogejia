'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface MultiUploadDialogProps {
  onClose: () => void;
  onLocalFileUpload: (file: File) => void;
  onWebLinkUpload: (url: string, content: string) => void;
  onCloudFileUpload: (
    url: string,
    fileName: string,
    description: string,
    extractCode: string
  ) => void;
  onCloudFileWithFile?: (
    url: string,
    fileName: string,
    description: string,
    extractCode: string,
    file: File
  ) => void;
  moduleType: 'document' | 'case' | 'standard' | 'drawing' | 'quota';
  uploading?: boolean;
}

export default function MultiUploadDialog({
  onClose,
  onLocalFileUpload,
  onWebLinkUpload,
  onCloudFileUpload,
  onCloudFileWithFile,
  moduleType,
  uploading = false,
}: MultiUploadDialogProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'weblink' | 'clouddrive'>('local');
  const [webLinkUrl, setWebLinkUrl] = useState('');
  const [cloudDriveUrl, setCloudDriveUrl] = useState('');
  const [cloudFileName, setCloudFileName] = useState('');
  const [cloudFileDescription, setCloudFileDescription] = useState('');
  const [cloudExtractCode, setCloudExtractCode] = useState('');
  const [cloudUploadedFile, setCloudUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const moduleNames = {
    document: '文档',
    case: '案例',
    standard: '规范',
    drawing: '图纸',
    quota: '定额',
  };

  const handleWebLinkSubmit = async () => {
    if (!webLinkUrl.trim()) {
      setParseError('请输入有效的网页链接');
      return;
    }

    setParsing(true);
    setParseError('');

    try {
      // 解析网页内容
      const res = await fetch('/api/knowledge/parse-web-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webLinkUrl }),
      });

      const data = await res.json();

      if (data.success) {
        onWebLinkUpload(webLinkUrl, data.content || data.title || '已提取网页内容');
        setWebLinkUrl('');
        onClose();
      } else {
        setParseError(data.error || '解析网页失败，请检查链接是否有效');
      }
    } catch (error) {
      setParseError('解析网页失败，请检查网络连接');
      console.error('Web link parsing error:', error);
    } finally {
      setParsing(false);
    }
  };

  const handleCloudFileSubmit = async () => {
    if (!cloudDriveUrl.trim()) {
      setParseError('请输入有效的网盘文件链接');
      return;
    }

    const fileName = cloudFileName.trim() || '网盘文件';
    const description = cloudFileDescription.trim() || fileName; // 如果文件说明为空，使用文件名
    const extractCode = cloudExtractCode.trim();

    // 如果用户上传了文件且有对应回调，直接使用文件上传回调
    if (cloudUploadedFile && onCloudFileWithFile) {
      onCloudFileWithFile(cloudDriveUrl, fileName, description, extractCode, cloudUploadedFile);
      setCloudDriveUrl('');
      setCloudFileName('');
      setCloudFileDescription('');
      setCloudExtractCode('');
      setCloudUploadedFile(null);
      onClose();
      return;
    }

    // 如果没有上传文件但有网盘链接和提取码，尝试自动下载
    if (cloudDriveUrl && extractCode && onCloudFileWithFile) {
      setParsing(true);
      setParseError('');

      try {
        // 调用后端 API 解析并下载网盘文件
        const res = await fetch('/api/knowledge/parse-cloud-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cloudDriveUrl, extractCode, moduleType }),
        });

        const data = await res.json();

        if (data.success && data.data) {
          // 将 base64 数据转换为 File 对象
          const byteCharacters = atob(data.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const file = new File([byteArray], data.fileName || fileName, {
            type:
              data.fileType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });

          // 调用文件上传回调
          onCloudFileWithFile(cloudDriveUrl, fileName, description, extractCode, file);

          setCloudDriveUrl('');
          setCloudFileName('');
          setCloudFileDescription('');
          setCloudExtractCode('');
          setCloudUploadedFile(null);
          onClose();
        } else {
          // 自动下载失败，提示用户手动上传
          if (data.requiresManualDownload) {
            setParseError(data.error || '无法自动下载文件，请手动下载文件后上传');
          } else {
            setParseError(data.error || '解析网盘链接失败');
          }
        }
      } catch (error) {
        setParseError('网络错误，无法自动下载文件。请手动下载文件后上传。');
        console.error('Cloud link parsing error:', error);
      } finally {
        setParsing(false);
      }
    } else {
      // 只保存链接信息
      onCloudFileUpload(cloudDriveUrl, fileName, description, extractCode);
      setCloudDriveUrl('');
      setCloudFileName('');
      setCloudFileDescription('');
      setCloudExtractCode('');
      setCloudUploadedFile(null);
      onClose();
    }
  };

  const handleCloudFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCloudUploadedFile(file);
      if (!cloudFileDescription.trim()) {
        setCloudFileDescription(file.name);
      }
      if (!cloudFileName.trim()) {
        setCloudFileName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLocalFileUpload(file);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            📤 上传{moduleNames[moduleType]}
          </h3>
          <button
            onClick={onClose}
            disabled={uploading || parsing}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>

        {/* 上传方式选择标签 */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
          <button
            onClick={() => {
              setActiveTab('local');
              setParseError('');
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'local'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="mr-2">📁</span> 本地文件
          </button>
          <button
            onClick={() => {
              setActiveTab('weblink');
              setParseError('');
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'weblink'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="mr-2">🌐</span> 网页链接
          </button>
          <button
            onClick={() => {
              setActiveTab('clouddrive');
              setParseError('');
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'clouddrive'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="mr-2">☁️</span> 网盘链接
          </button>
        </div>

        {/* 上传内容区域 */}
        <div className="p-6 flex-1 overflow-auto">
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                  <strong>支持的文件格式：</strong>
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {moduleType === 'document' && 'PDF、Word、Excel、PPT、TXT'}
                  {moduleType === 'drawing' && 'CAD (DWG/DXF)、图片 (JPG/PNG)、PDF'}
                  {moduleType === 'case' && 'PDF、Word、Excel、图片'}
                  {moduleType === 'standard' && 'PDF、Word、文本文件'}
                  {moduleType === 'quota' && 'Excel、CSV、TXT'}
                </p>
              </div>

              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <span className="text-6xl mb-4">📂</span>
                  <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-semibold">点击上传</span> 或拖拽文件到此处
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">最大支持 50MB</p>
                </div>
                <input
                  type="file"
                  onChange={handleLocalFileChange}
                  disabled={uploading}
                  className="hidden"
                  accept={
                    moduleType === 'document'
                      ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
                      : moduleType === 'drawing'
                        ? '.dwg,.dxf,.jpg,.jpeg,.png,.pdf'
                        : moduleType === 'case'
                          ? '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
                          : moduleType === 'standard'
                            ? '.pdf,.doc,.docx,.txt'
                            : '.xls,.xlsx,.csv,.txt'
                  }
                />
              </label>
            </div>
          )}

          {activeTab === 'weblink' && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                  <strong>网页链接上传说明：</strong>
                </p>
                <ul className="text-xs text-green-600 dark:text-green-400 space-y-1">
                  <li>• 系统会自动解析网页内容并提取标题和正文</li>
                  <li>• 支持新闻文章、博客、文档页面等</li>
                  <li>• 自动识别并下载页面中的图片资源</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  网页链接
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/article"
                  value={webLinkUrl}
                  onChange={(e) => setWebLinkUrl(e.target.value)}
                  disabled={parsing || uploading}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {parseError && (
                <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button onClick={onClose} disabled={parsing || uploading} variant="outline">
                  取消
                </Button>
                <Button
                  onClick={handleWebLinkSubmit}
                  disabled={parsing || uploading || !webLinkUrl.trim()}
                >
                  {parsing ? '解析中...' : '开始解析并上传'}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'clouddrive' && (
            <div className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
                  <strong>网盘链接上传说明：</strong>
                </p>
                <ul className="text-xs text-purple-600 dark:text-purple-400 space-y-1">
                  <li>
                    • <strong>网盘分享链接</strong>（必填）：支持百度网盘、阿里云盘、腾讯云盘等
                  </li>
                  <li>
                    • <strong>提取码</strong>
                    （可选）：百度网盘填写后可尝试自动下载，其他网盘请先手动下载
                  </li>
                  <li>
                    • <strong>文件说明</strong>
                    （可选）：填写原始文件名便于识别，不填写则使用默认名称
                  </li>
                  <li>
                    • <strong>手动上传</strong>（可选）：如果自动下载失败，可上传从网盘下载的文件
                  </li>
                </ul>
                <div className="mt-3 p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
                  <p className="text-xs text-purple-800 dark:text-purple-200 font-medium mb-2">
                    示例格式：
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-300 font-mono whitespace-pre-wrap">
                    文件说明: 广州金石环保设备有限公司-化粪池产品数据库.xlsx 链接:
                    https://pan.baidu.com/s/1nCFucqkGjuGrebVg2QTDIw?pwd=tfzm 提取码: tfzm 文件名:
                    化粪池产品价格
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  网盘分享链接 <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://pan.baidu.com/s/xxxxxx?pwd=xxxx"
                  value={cloudDriveUrl}
                  onChange={(e) => setCloudDriveUrl(e.target.value)}
                  disabled={uploading}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  提取码
                </label>
                <input
                  type="text"
                  placeholder="如: tfzm（如有提取码请填写）"
                  value={cloudExtractCode}
                  onChange={(e) => setCloudExtractCode(e.target.value)}
                  disabled={uploading}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  💡 填写提取码可尝试自动下载（仅支持百度网盘），不填写则仅保存链接
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  文件说明（原始文件名）
                </label>
                <input
                  type="text"
                  placeholder="如: 广州金石环保设备有限公司-化粪池产品数据库.xlsx"
                  value={cloudFileDescription}
                  onChange={(e) => setCloudFileDescription(e.target.value)}
                  disabled={uploading}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  可选：填写原始文件名，便于后续查找和识别
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                  <strong>📁 上传从网盘下载的文件（可选）</strong>
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  {moduleType === 'quota' &&
                    '如果百度网盘自动下载失败，请手动下载文件后在此上传。系统将自动解析 Excel 内容并进行字段映射。'}
                  {moduleType !== 'quota' &&
                    '如果百度网盘自动下载失败，请手动下载文件后在此上传。系统将自动解析文件内容并导入。'}
                </p>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-4xl mb-2">📥</span>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      <span className="font-semibold">点击上传</span>
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {cloudUploadedFile ? cloudUploadedFile.name : '支持 Excel、PDF 等格式'}
                    </p>
                  </div>
                  <input
                    type="file"
                    onChange={handleCloudFileChange}
                    disabled={uploading}
                    className="hidden"
                    accept={
                      moduleType === 'quota'
                        ? '.xlsx,.xls,.csv,.txt'
                        : '.xlsx,.xls,.pdf,.doc,.docx,.txt'
                    }
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  自定义文件名称（可选）
                </label>
                <input
                  type="text"
                  placeholder="自定义文件名称"
                  value={cloudFileName}
                  onChange={(e) => setCloudFileName(e.target.value)}
                  disabled={uploading}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {parseError && (
                <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button onClick={onClose} disabled={uploading} variant="outline">
                  取消
                </Button>
                <Button
                  onClick={handleCloudFileSubmit}
                  disabled={uploading || !cloudDriveUrl.trim()}
                >
                  {cloudUploadedFile ? '📊 解析并导入' : '🔗 保存链接'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
