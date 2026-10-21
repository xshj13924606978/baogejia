'use client';

import { Loader2, CheckCircle, XCircle, RotateCw } from 'lucide-react';

export interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

interface UploadProgressProps {
  tasks: UploadTask[];
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
}

export default function UploadProgress({ tasks, onRetry, onCancel }: UploadProgressProps) {
  if (tasks.length === 0) return null;

  const uploadingCount = tasks.filter(t => t.status === 'uploading').length;

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-lg border z-50">
      <div className="p-3 border-b flex justify-between items-center">
        <h3 className="font-medium text-sm">
          上传进度 ({tasks.length})
          {uploadingCount > 0 && <span className="text-blue-500 ml-1">{uploadingCount}个进行中</span>}
        </h3>
        {tasks.every(t => t.status !== 'uploading') && (
          <button
            onClick={() => onCancel?.('__close__')}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            关闭
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-3">
        {tasks.map(task => (
          <div key={task.id} className="text-sm">
            <div className="flex justify-between items-center">
              <span className="truncate mr-2">{task.name}</span>
              {task.status === 'uploading' && (
                <span className="text-blue-500 text-xs whitespace-nowrap">{task.progress}%</span>
              )}
              {task.status === 'success' && (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
              {task.status === 'error' && (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              )}
            </div>
            {task.status === 'uploading' && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            )}
            {task.status === 'error' && task.error && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-red-500 text-xs truncate">{task.error}</span>
                {onRetry && (
                  <button
                    className="text-blue-500 text-xs ml-2 flex-shrink-0 hover:underline flex items-center gap-0.5"
                    onClick={() => onRetry(task.id)}
                  >
                    <RotateCw className="h-3 w-3" />重试
                  </button>
                )}
              </div>
            )}
            {task.status === 'success' && (
              <div className="text-xs text-gray-400 mt-0.5">等待管理员审核</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
