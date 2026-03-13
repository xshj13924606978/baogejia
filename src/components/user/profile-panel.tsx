'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/contexts/UserContext';
import { Mail, Phone, Building, MapPin, Edit2 } from 'lucide-react';

export default function ProfilePanel() {
  const { user } = useUser();

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">个人资料</CardTitle>
          <CardDescription>管理您的个人信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-blue-100">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-lg">
                {user?.name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm">
              <Edit2 className="h-3 w-3 mr-2" />
              更换头像
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>姓名</Label>
              <Input value={user?.name || '用户'} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label>邮箱</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <Input value={user?.email || 'user@example.com'} readOnly className="bg-gray-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>手机</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <Input value="138****8888" readOnly className="bg-gray-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>公司</Label>
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-gray-400" />
                <Input value="兴绿环境" readOnly className="bg-gray-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>地址</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                <Input value="上海市浦东新区" readOnly className="bg-gray-50" />
              </div>
            </div>
          </div>

          <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-700">保存修改</Button>
        </CardContent>
      </Card>
    </div>
  );
}
