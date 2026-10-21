'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProfilePanel from '@/components/user/profile-panel';

export default function AccountPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回对话
        </Button>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">账户管理</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <ProfilePanel />
      </div>
    </div>
  );
}
