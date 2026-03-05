'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Banknote, 
  Receipt, 
  FileText,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { useQuote } from '@/contexts/QuoteContext';

export default function SupplierPanel() {
  const { quoteData, updateSupplierInfo } = useQuote();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(quoteData?.supplierInfo || {
    companyName: '兴绿环境科技有限公司',
    contactPerson: '张经理',
    phone: '021-12345678',
    email: 'zhang@xinglv.com',
    address: '上海市浦东新区xx路123号',
    bankName: '中国建设银行上海分行',
    bankAccount: '3100 1234 5678 9012 345',
    taxNumber: '91310115MA1H123456'
  });

  const handleSave = () => {
    updateSupplierInfo(formData);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              供应方信息
            </CardTitle>
            <CardDescription>管理您的公司信息和账户</CardDescription>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit2 className="h-3 w-3 mr-2" />
              编辑
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="h-3 w-3 mr-2" />
                取消
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-3 w-3 mr-2" />
                保存
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">公司名称</Label>
            {editing ? (
              <Input 
                value={formData.companyName} 
                onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm font-medium p-2 bg-gray-50 rounded">{formData.companyName}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">联系人</Label>
            {editing ? (
              <Input 
                value={formData.contactPerson} 
                onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm font-medium p-2 bg-gray-50 rounded">{formData.contactPerson}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Phone className="h-3 w-3" /> 电话
            </Label>
            {editing ? (
              <Input 
                value={formData.phone} 
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.phone}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" /> 邮箱
            </Label>
            {editing ? (
              <Input 
                value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.email}</p>
            )}
          </div>
          <div className="col-span-2 space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="h-3 w-3" /> 地址
            </Label>
            {editing ? (
              <Input 
                value={formData.address} 
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="h-8 text-sm"
              />
            ) : (
              <p className="text-sm p-2 bg-gray-50 rounded">{formData.address}</p>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">银行信息</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Banknote className="h-3 w-3" /> 开户银行
              </Label>
              {editing ? (
                <Input 
                  value={formData.bankName} 
                  onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.bankName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Receipt className="h-3 w-3" /> 银行账号
              </Label>
              {editing ? (
                <Input 
                  value={formData.bankAccount} 
                  onChange={(e) => setFormData({...formData, bankAccount: e.target.value})}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.bankAccount}</p>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <FileText className="h-3 w-3" /> 税号
              </Label>
              {editing ? (
                <Input 
                  value={formData.taxNumber} 
                  onChange={(e) => setFormData({...formData, taxNumber: e.target.value})}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.taxNumber}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
