'use client';

import { useState } from 'react';
import MultiUploadDialog from './multi-upload-dialog';

interface Case {
  id: string;
  name: string;
  type: string;
  industry: string;
  scale: string;
  budget: string;
  completionDate: string;
  description: string;
  tags: string[];
  source?: 'local' | 'weblink' | 'clouddrive';
  sourceUrl?: string;
}

export default function CaseLibrary() {
  const [cases, setCases] = useState<Case[]>([
    {
      id: '1',
      name: '某市污水处理厂升级改造项目',
      type: '污水处理',
      industry: '环保工程',
      scale: '5000m³/d',
      budget: '1200万元',
      completionDate: '2024-06-30',
      description: '老旧污水处理厂升级改造，采用MBR工艺',
      tags: ['MBR', '升级改造', '污水处理']
    },
    {
      id: '2',
      name: '工业园区供水管网改造工程',
      type: '供水工程',
      industry: '市政工程',
      scale: '15km管网',
      budget: '800万元',
      completionDate: '2024-03-15',
      description: '工业园区供水管网全面改造升级',
      tags: ['管网改造', '供水', '工业园区']
    },
    {
      id: '3',
      name: '一体化设备安装项目',
      type: '设备安装',
      industry: '环保设备',
      scale: '3台套',
      budget: '150万元',
      completionDate: '2024-01-20',
      description: '一体化污水处理设备安装调试',
      tags: ['一体化设备', '安装调试', '环保']
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const caseTypes = ['全部', '污水处理', '供水工程', '设备安装', '工业废水'];

  const filteredCases = cases.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (searchTerm) {
      return item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             item.description.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleImport = () => {
    setShowUploadDialog(true);
  };

  const handleLocalFileUpload = (file: File) => {
    const newCase: Case = {
      id: String(cases.length + 1),
      name: file.name.replace(/\.[^/.]+$/, ''),
      type: '设备安装',
      industry: '环保工程',
      scale: '-',
      budget: '-',
      completionDate: new Date().toISOString().split('T')[0],
      description: '通过本地文件导入的案例',
      tags: ['导入案例'],
      source: 'local'
    };
    setCases([...cases, newCase]);
  };

  const handleWebLinkUpload = (url: string, content: string) => {
    const newCase: Case = {
      id: String(cases.length + 1),
      name: content.substring(0, 50) + '...',
      type: '设备安装',
      industry: '环保工程',
      scale: '-',
      budget: '-',
      completionDate: new Date().toISOString().split('T')[0],
      description: content.substring(0, 200),
      tags: ['网页链接'],
      source: 'weblink',
      sourceUrl: url
    };
    setCases([...cases, newCase]);
  };

  const handleCloudFileUpload = (url: string, fileName: string, description: string, extractCode: string) => {
    const newCase: Case = {
      id: String(cases.length + 1),
      name: fileName,
      type: '设备安装',
      industry: '环保工程',
      scale: '-',
      budget: '-',
      completionDate: new Date().toISOString().split('T')[0],
      description: `${description}${extractCode ? ` (提取码: ${extractCode})` : ''}`,
      tags: ['网盘链接'],
      source: 'clouddrive',
      sourceUrl: url
    };
    setCases([...cases, newCase]);
  };

  const handleRefresh = () => {
    // 刷新当前模块
    alert('刷新功能：重新加载案例库数据');
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🏗️</span> 案例库
          <span className="text-sm font-normal text-gray-500 ml-2">
            {cases.length}个案例
          </span>
        </h3>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1">
            <span>➕</span> 新增案例
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
          >
            <span>📥</span> 导入案例
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
        {caseTypes.map(type => (
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
          placeholder="搜索案例名称、描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        <select className="px-3 py-2 border rounded bg-white">
          <option>按时间排序</option>
          <option>按预算排序</option>
          <option>按规模排序</option>
        </select>
      </div>

      {/* 案例列表 */}
      <div className="space-y-4">
        {filteredCases.map(item => (
          <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-bold text-base mb-2">{item.name}</h4>
                <p className="text-sm text-gray-600 mb-3">{item.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">类型：</span>
                    <span className="font-medium">{item.type}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">行业：</span>
                    <span className="font-medium">{item.industry}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">规模：</span>
                    <span className="font-medium">{item.scale}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">预算：</span>
                    <span className="font-medium text-red-600">{item.budget}</span>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <span className="text-gray-500">完成时间：</span>
                    <span className="font-medium">{item.completionDate}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {item.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ml-4">
                <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                  查看详情
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 空状态 */}
      {filteredCases.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <div className="text-5xl mb-3">🏗️</div>
          <div>暂无案例</div>
          <button className="mt-3 px-4 py-2 bg-blue-500 text-white rounded text-sm">
            添加第一个案例
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
          moduleType="case"
        />
      )}
    </div>
  );
}
