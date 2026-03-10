'use client';

import { useState } from 'react';
import MultiUploadDialog from './multi-upload-dialog';

interface Standard {
  id: string;
  code: string;
  name: string;
  type: '国标' | '行标' | '地标' | '企标';
  industry: string;
  publishDate: string;
  status: '现行' | '废止' | '修订中';
  description: string;
  source?: 'local' | 'weblink' | 'clouddrive';
  sourceUrl?: string;
}

export default function StandardLibrary() {
  const [standards, setStandards] = useState<Standard[]>([
    {
      id: '1',
      code: 'GB 50014-2021',
      name: '室外排水设计标准',
      type: '国标',
      industry: '建筑给排水',
      publishDate: '2021-04-09',
      status: '现行',
      description: '室外排水工程设计标准'
    },
    {
      id: '2',
      code: 'GB 50242-2002',
      name: '建筑给水排水及采暖工程施工质量验收规范',
      type: '国标',
      industry: '建筑给排水',
      publishDate: '2002-03-01',
      status: '现行',
      description: '建筑给水排水工程施工质量验收'
    },
    {
      id: '3',
      code: 'CJJ 68-2016',
      name: '城镇排水管道检测与评估技术规程',
      type: '行标',
      industry: '市政工程',
      publishDate: '2016-06-01',
      status: '现行',
      description: '城镇排水管道检测与评估'
    },
    {
      id: '4',
      code: 'DBJ 15-67-2019',
      name: '广东省城镇污水处理厂运行管理规程',
      type: '地标',
      industry: '环保工程',
      publishDate: '2019-05-01',
      status: '现行',
      description: '广东省地方标准'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const standardTypes = ['全部', '国标', '行标', '地标', '企标'];
  const statusTypes = ['全部', '现行', '废止', '修订中'];

  const filteredStandards = standards.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (searchTerm) {
      return item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
             item.name.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case '现行': return 'bg-green-100 text-green-700';
      case '废止': return 'bg-red-100 text-red-700';
      case '修订中': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case '国标': return 'bg-blue-100 text-blue-700';
      case '行标': return 'bg-purple-100 text-purple-700';
      case '地标': return 'bg-orange-100 text-orange-700';
      case '企标': return 'bg-teal-100 text-teal-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleImport = () => {
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    const newStandard: Standard = {
      id: String(standards.length + 1),
      code: '自定义-' + String(standards.length + 1),
      name: file.name.replace(/\.[^/.]+$/, ''),
      type: '企标',
      industry: '自定义',
      publishDate: new Date().toISOString().split('T')[0],
      status: '现行',
      description: '通过本地文件导入的规范',
      source: 'local'
    };
    setStandards([...standards, newStandard]);
  };

  const handleWebLinkUpload = (url: string, content: string) => {
    const newStandard: Standard = {
      id: String(standards.length + 1),
      code: '链接-' + String(standards.length + 1),
      name: content.substring(0, 50) + '...',
      type: '企标',
      industry: '自定义',
      publishDate: new Date().toISOString().split('T')[0],
      status: '现行',
      description: content.substring(0, 200),
      source: 'weblink',
      sourceUrl: url
    };
    setStandards([...standards, newStandard]);
  };

  const handleCloudFileUpload = (url: string, fileName: string, description: string, extractCode: string) => {
    const newStandard: Standard = {
      id: String(standards.length + 1),
      code: '网盘-' + String(standards.length + 1),
      name: fileName,
      type: '企标',
      industry: '自定义',
      publishDate: new Date().toISOString().split('T')[0],
      status: '现行',
      description: `${description}${extractCode ? ` (提取码: ${extractCode})` : ''}`,
      source: 'clouddrive',
      sourceUrl: url
    };
    setStandards([...standards, newStandard]);
  };

  const handleCloudFileWithFile = (url: string, fileName: string, description: string, extractCode: string, file: File) => {
    // 直接使用文件上传功能
    handleLocalFileUpload(file);
  };

  const handleRefresh = () => {
    // 刷新当前模块
    alert('刷新功能：重新加载标准库数据');
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📋</span> 规范库
          <span className="text-sm font-normal text-gray-500 ml-2">
            {standards.length}条规范
          </span>
        </h3>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1">
            <span>➕</span> 新增规范
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
          >
            <span>📥</span> 导入规范
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

      {/* 筛选栏 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="p-2 border rounded bg-white"
        >
          {standardTypes.map(type => (
            <option key={type} value={type === '全部' ? 'all' : type}>{type}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-2 border rounded bg-white"
        >
          {statusTypes.map(status => (
            <option key={status} value={status === '全部' ? 'all' : status}>{status}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索规范编号或名称"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="p-2 border rounded"
        />
      </div>

      {/* 规范列表 */}
      <div className="border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">规范编号</th>
              <th className="px-3 py-2 text-left">规范名称</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">行业</th>
              <th className="px-3 py-2 text-left">发布日期</th>
              <th className="px-3 py-2 text-left">状态</th>
            </tr>
          </thead>
          <tbody>
            {filteredStandards.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono font-medium">{item.code}</td>
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(item.type)}`}>
                    {item.type}
                  </span>
                </td>
                <td className="px-3 py-2">{item.industry}</td>
                <td className="px-3 py-2">{item.publishDate}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 空状态 */}
      {filteredStandards.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">📋</div>
          <div>暂无规范</div>
          <button className="mt-3 px-4 py-2 bg-blue-500 text-white rounded text-sm">
            添加第一条规范
          </button>
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
        ⚠️ 当前使用模拟数据展示，导入功能开发中。
      </div>

      {/* 多渠道上传对话框 */}
      {showUploadDialog && (
        <MultiUploadDialog
          onClose={() => setShowUploadDialog(false)}
          onLocalFileUpload={handleLocalFileUpload}
          onWebLinkUpload={handleWebLinkUpload}
          onCloudFileUpload={handleCloudFileUpload}
          onCloudFileWithFile={handleCloudFileWithFile}
          moduleType="standard"
        />
      )}
    </div>
  );
}
