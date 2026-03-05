'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        <div className="text-8xl mb-4 animate-bounce">🔒</div>
        
        <h1 className="text-4xl font-bold mb-2 text-gray-800">403</h1>
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">禁止访问</h2>
        
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-left">
          <p className="text-red-700">
            抱歉，您没有权限访问此页面。
          </p>
          <p className="text-sm text-red-600 mt-2">
            这可能是因为：
            <br />• 您的账号角色权限不足
            <br />• 需要特定权限才能访问
            <br />• 页面不存在或已被移除
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            onClick={() => router.back()}
            variant="default"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            返回上一页
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => router.push('/')}
            className="border-gray-300 hover:bg-gray-50"
          >
            返回首页
          </Button>
        </div>

        <div className="mt-8 text-sm text-gray-500">
          如有疑问，请联系管理员
        </div>
      </div>
    </div>
  );
}