'use client';

import { useState } from 'react';
import MultiUploadDialog from './multi-upload-dialog';

interface Drawing {
  id: string;
  name: string;
  type: 'CAD' | '工艺流程图' | '布置图' | '安装图' | '其他';
  project: string;
  version: string;
  size: string;
  uploadDate: string;
  description: string;
  source?: 'local' | 'weblink' | 'clouddrive';
  sourceUrl?: string;
}

export default function DrawingLibrary() {
  const [drawings, setDrawings] = useState<Drawing[]>([
    {
      id: '1',
      name: '污水处理厂工艺流程图.dwg',
      type: '工艺流程图',
      project: '某市污水处理厂',
      version: 'V2.0',
      size: '8.5 MB',
      uploadDate: '2026-02-18',
      description: '主要工艺流程图'
    },
    {
      id: '2',
      name: '设备平面布置图.dwg',
      type: '布置图',
      project: '工业园区供水管网',
      version: 'V1.5',
      size: '12.3 MB',
      uploadDate: '2026-02-17',
      description: '设备布置平面图'
    },
    {
      id: '3',
      name: '一体化设备安装图.dwg',
      type: '安装图',
      project: '一体化设备安装',
      version: 'V1.0',
      size: '5.2 MB',
      uploadDate: '2026-02-16',
      description: '设备安装详图'
    },
    {
      id: '4',
      name: '管道走向图.dwg',
      type: '布置图',
      project: '某市污水处理厂',
      version: 'V2.1',
      size: '6.8 MB',
      uploadDate: '2026-02-15',
      description: '管道走向布置图'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const drawingTypes = ['全部', 'CAD', '工艺流程图', '布置图', '安装图', '其他'];

  const filteredDrawings = drawings.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (searchTerm) {
      return item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             item.project.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleUpload = () => {
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    const newDrawing: Drawing = {
      id: String(drawings.length + 1),
      name: file.name,
      type: 'CAD',
      project: '自定义项目',
      version: 'V1.0',
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      uploadDate: new Date().toISOString().split('T')[0],
      description: '通过本地文件上传的图纸',
      source: 'local'
    };
    setDrawings([...drawings, newDrawing]);
  };

  const handleWebLinkUpload = (url: string, content: string) => {
    const newDrawing: Drawing = {
      id: String(drawings.length + 1),
      name: content.substring(0, 50) + '...',
      type: '工艺流程图',
      project: '网络来源',
      version: 'V1.0',
      size: '-',
      uploadDate: new Date().toISOString().split('T')[0],
      description: content.substring(0, 200),
      source: 'weblink',
      sourceUrl: url
    };
    setDrawings([...drawings, newDrawing]);
  };

  const handleCloudFileUpload = (url: string, fileName: string) => {
    const newDrawing: Drawing = {
      id: String(drawings.length + 1),
      name: fileName,
      type: 'CAD',
      project: '网盘分享',
      version: 'V1.0',
      size: '-',
      uploadDate: new Date().toISOString().split('T')[0],
      description: '网盘分享文件',
      source: 'clouddrive',
      sourceUrl: url
    };
    setDrawings([...drawings, newDrawing]);
  };

  const handleRefresh = () => {
    // 刷新当前模块
    alert('刷新功能：重新加载图纸库数据');
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🖼️</span> 图纸库
          <span className="text-sm font-normal text-gray-500 ml-2">
            {drawings.length}张图纸
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
          >
            <span>📤</span> 上传图纸
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
        {drawingTypes.map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type === '全部' ? 'all' : type)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              (type === '全部' ? 'all' : type) === filterType
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="搜索图纸名称、项目..."
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

      {/* 图纸列表 - 网格视图 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDrawings.map(item => (
          <div key={item.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
            <div className="aspect-video bg-gray-100 rounded mb-3 flex items-center justify-center text-4xl">
              📐
            </div>
            <div className="font-medium truncate mb-1">{item.name}</div>
            <div className="text-sm text-gray-500 mb-1">{item.project}</div>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>{item.type}</span>
              <span>{item.size}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {item.version}
              </span>
              <div className="flex gap-2">
                <button className="text-xs text-blue-600 hover:text-blue-800">预览</button>
                <button className="text-xs text-green-600 hover:text-green-800">下载</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 空状态 */}
      {filteredDrawings.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🖼️</div>
          <div>暂无图纸</div>
          <button className="mt-3 px-4 py-2 bg-green-500 text-white rounded text-sm">
            上传第一张图纸
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
          moduleType="drawing"
        />
      )}
    </div>
  );
}
