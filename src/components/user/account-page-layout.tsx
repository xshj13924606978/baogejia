'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccountPageLayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function AccountPageLayout({ title, children }: AccountPageLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回对话
        </Button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
