'use client';

import { useSwitch } from './switch-manager';

export default function FixedSwitcher() {
  const { fileGroupId, files, currentChoice, isLoading, setChoice } = useSwitch();

  if (!fileGroupId || !files || files.length === 0) {
    return null;
  }

  // 获取文件摘要
  const getFileSummary = () => {
    const excelCount = files.filter(
      (f: any) => f.type?.includes('sheet') || f.productCount > 0
    ).length;
    const docCount = files.filter(
      (f: any) => f.type?.includes('pdf') || f.type?.includes('image')
    ).length;
    const totalProducts = files.reduce((sum: number, f: any) => sum + (f.productCount || 0), 0);
    return { excelCount, docCount, totalProducts };
  };

  const summary = getFileSummary();

  // 切换选项
  const handleSelect = async (choice: string) => {
    if (isLoading || choice === currentChoice) return;

    setChoice(choice);

    // 触发切换事件
    const event = new CustomEvent('switch-change', {
      detail: { fileGroupId, choice },
    });
    window.dispatchEvent(event);
  };

  // 获取选项样式
  const getButtonStyle = (choice: string) => {
    const baseStyle =
      'flex-1 px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between';

    if (choice === currentChoice) {
      const colors =
        {
          quote: 'bg-blue-500 text-white shadow-md',
          proposal: 'bg-green-500 text-white shadow-md',
          both: 'bg-purple-500 text-white shadow-md',
        }[choice] || 'bg-gray-500 text-white';
      return `${baseStyle} ${colors}`;
    }

    const colors =
      {
        quote: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200',
        proposal: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
        both: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200',
      }[choice] || 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200';

    return `${baseStyle} ${colors} ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-6">
      {/* 文件摘要 */}
      <div className="flex items-center gap-4 mb-3 text-sm text-gray-600">
        <span>📁 {files.length}个文件</span>
        {summary.excelCount > 0 && (
          <span>
            📊 {summary.excelCount}个表格 ({summary.totalProducts}个产品)
          </span>
        )}
        {summary.docCount > 0 && <span>📄 {summary.docCount}个文档</span>}
      </div>

      {/* 切换按钮 */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSelect('quote')}
          disabled={isLoading}
          className={getButtonStyle('quote')}
        >
          <span className="flex items-center gap-2">
            <span>📊</span> 生成报价单
          </span>
          {currentChoice === 'quote' && (
            <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded-full">当前</span>
          )}
        </button>

        <button
          onClick={() => handleSelect('proposal')}
          disabled={isLoading}
          className={getButtonStyle('proposal')}
        >
          <span className="flex items-center gap-2">
            <span>📝</span> 生成方案
          </span>
          {currentChoice === 'proposal' && (
            <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded-full">当前</span>
          )}
        </button>

        <button
          onClick={() => handleSelect('both')}
          disabled={isLoading}
          className={getButtonStyle('both')}
        >
          <span className="flex items-center gap-2">
            <span>📑</span> 生成方案（内含报价）
          </span>
          {currentChoice === 'both' && (
            <span className="bg-white bg-opacity-20 text-xs px-2 py-1 rounded-full">当前</span>
          )}
        </button>
      </div>

      {/* 进度条 */}
      {isLoading && (
        <div className="mt-4">
          <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-progress"></div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-sm text-blue-700">
                {currentChoice === 'quote' && '正在生成报价单...'}
                {currentChoice === 'proposal' && '正在生成方案...'}
                {currentChoice === 'both' && '正在生成方案（内含报价）...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
