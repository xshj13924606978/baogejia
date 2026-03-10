'use client';

import { useState } from 'react';
import MultiUploadDialog from './multi-upload-dialog';

interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'xls' | 'other' | 'weblink' | 'clouddrive';
  category: string;
  tags: string[];
  size: string;
  uploadTime: string;
  description: string;
  source?: 'local' | 'weblink' | 'clouddrive';
  sourceUrl?: string;
}

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState<Document[]>([
    {
      id: '1',
      name: '一体化设备说明书.pdf',
      type: 'pdf',
      category: '产品说明书',
      tags: ['一体化设备', '操作手册'],
      size: '2.3 MB',
      uploadTime: '2026-02-18',
      description: '详细操作维护说明'
    },
    {
      id: '2',
      name: '安装调试手册.docx',
      type: 'doc',
      category: '技术文档',
      tags: ['安装', '调试'],
      size: '1.1 MB',
      uploadTime: '2026-02-17',
      description: '现场安装调试指南'
    },
    {
      id: '3',
      name: '维护保养手册.pdf',
      type: 'pdf',
      category: '维护指南',
      tags: ['维护', '保养'],
      size: '1.8 MB',
      uploadTime: '2026-02-16',
      description: '日常维护保养流程'
    },
    {
      id: '4',
      name: '设备参数表.xlsx',
      type: 'xls',
      category: '技术文档',
      tags: ['参数', '规格'],
      size: '0.5 MB',
      uploadTime: '2026-02-15',
      description: '所有设备技术参数'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const categories = ['全部', '产品说明书', '技术文档', '操作手册', '维护指南'];

  const filteredDocs = documents.filter(doc => {
    if (category !== 'all' && doc.category !== category) return false;
    if (searchTerm) {
      return doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             doc.description.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleUpload = () => {
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    setUploading(true);
    // 模拟上传
    setTimeout(() => {
      const newDoc: Document = {
        id: String(documents.length + 1),
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' :
              file.name.endsWith('.doc') || file.name.endsWith('.docx') ? 'doc' :
              file.name.endsWith('.xls') || file.name.endsWith('.xlsx') ? 'xls' : 'other',
        category: '技术文档',
        tags: [],
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        uploadTime: new Date().toISOString().split('T')[0],
        description: '通过本地文件上传',
        source: 'local'
      };
      setDocuments([...documents, newDoc]);
      setUploading(false);
    }, 1000);
  };

  const handleWebLinkUpload = (url: string, content: string) => {
    setUploading(true);
    setTimeout(() => {
      const newDoc: Document = {
        id: String(documents.length + 1),
        name: content.substring(0, 50) + '...',
        type: 'weblink',
        category: '技术文档',
        tags: ['网页链接'],
        size: '-',
        uploadTime: new Date().toISOString().split('T')[0],
        description: content.substring(0, 200),
        source: 'weblink',
        sourceUrl: url
      };
      setDocuments([...documents, newDoc]);
      setUploading(false);
    }, 1000);
  };

  const handleCloudFileUpload = (url: string, fileName: string) => {
    setUploading(true);
    setTimeout(() => {
      const newDoc: Document = {
        id: String(documents.length + 1),
        name: fileName,
        type: 'clouddrive',
        category: '技术文档',
        tags: ['网盘链接'],
        size: '-',
        uploadTime: new Date().toISOString().split('T')[0],
        description: '网盘分享文件',
        source: 'clouddrive',
        sourceUrl: url
      };
      setDocuments([...documents, newDoc]);
      setUploading(false);
    }, 1000);
  };

  const handleRefresh = () => {
    // 刷新当前模块
    alert('刷新功能：重新加载文档库数据');
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📄</span> 技术文档库
          <span className="text-sm font-normal text-gray-500 ml-2">
            {documents.length}个文档
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 flex items-center gap-1"
          >
            <span>📤</span> {uploading ? '上传中...' : '上传文档'}
          </button>
          <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1">
            <span>📁</span> 新建文件夹
          </button>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-slate-500 text-white rounded hover:bg-slate-600 flex items-center gap-1"
            title="刷新当前模块"
          >
            <span>🔄</span> 刷新
          </button>
        </div>
      </div>

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setCategory('all')}
          className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
            category === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
        >
          全部
        </button>
        {categories.slice(1).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              category === cat
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索文档名称、描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        <select className="px-3 py-2 border rounded bg-white">
          <option>按时间排序</option>
          <option>按名称排序</option>
          <option>按大小排序</option>
        </select>
      </div>

      {/* 文档列表 - 网格视图 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.map(doc => (
          <div key={doc.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <span className="text-3xl">
                {doc.type === 'pdf' ? '📕' : doc.type === 'doc' ? '📘' : '📄'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{doc.name}</div>
                <div className="text-xs text-gray-500 mt-1">{doc.size}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {doc.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-2">{doc.description}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3 pt-2 border-t">
              <button className="text-xs text-blue-600 hover:text-blue-800">预览</button>
              <button className="text-xs text-green-600 hover:text-green-800">下载</button>
              <button className="text-xs text-red-600 hover:text-red-800">删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* 空状态 */}
      {filteredDocs.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">📄</div>
          <div>暂无文档</div>
          <button className="mt-3 px-4 py-2 bg-green-500 text-white rounded text-sm">
            上传第一个文档
          </button>
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
        ⚠️ 当前使用模拟数据展示，上传功能开发中。
      </div>

      {/* 多渠道上传对话框 */}
      {showUploadDialog && (
        <MultiUploadDialog
          onClose={() => setShowUploadDialog(false)}
          onLocalFileUpload={handleLocalFileUpload}
          onWebLinkUpload={handleWebLinkUpload}
          onCloudFileUpload={handleCloudFileUpload}
          moduleType="document"
          uploading={uploading}
        />
      )}
    </div>
  );
}
