'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Calendar,
  Truck,
  Shield,
  CreditCard,
  Edit2,
  Save,
  X,
  Percent,
} from 'lucide-react';
import { useQuote } from '@/contexts/QuoteContext';

export default function TermsPanel() {
  const { quoteData, updateTerms } = useQuote();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(
    quoteData?.terms || {
      payment: '预付30%，发货前付清70%',
      warranty: '整机质保12个月',
      delivery: '合同签订后15个工作日内',
      validity: '15天',
      taxRate: 13,
      shipping: 0,
      installation: 0,
      otherFees: 0,
    }
  );

  const handleSave = () => {
    updateTerms(formData);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              商务条款
            </CardTitle>
            <CardDescription>设置报价条款和费用</CardDescription>
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
        <div className="space-y-3">
          <h4 className="text-sm font-medium">费用设置</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Percent className="h-3 w-3" /> 税率 (%)
              </Label>
              {editing ? (
                <Input
                  type="number"
                  value={formData.taxRate}
                  onChange={(e) =>
                    setFormData({ ...formData, taxRate: parseFloat(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.taxRate}%</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">运费 (元)</Label>
              {editing ? (
                <Input
                  type="number"
                  value={formData.shipping}
                  onChange={(e) =>
                    setFormData({ ...formData, shipping: parseFloat(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">¥{formData.shipping}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">安装费 (元)</Label>
              {editing ? (
                <Input
                  type="number"
                  value={formData.installation}
                  onChange={(e) =>
                    setFormData({ ...formData, installation: parseFloat(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">¥{formData.installation}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">其他费用 (元)</Label>
              {editing ? (
                <Input
                  type="number"
                  value={formData.otherFees}
                  onChange={(e) =>
                    setFormData({ ...formData, otherFees: parseFloat(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">¥{formData.otherFees}</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <h4 className="text-sm font-medium mb-3">条款设置</h4>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> 付款方式
              </Label>
              {editing ? (
                <Textarea
                  value={formData.payment}
                  onChange={(e) => setFormData({ ...formData, payment: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.payment}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Shield className="h-3 w-3" /> 质保期
              </Label>
              {editing ? (
                <Input
                  value={formData.warranty}
                  onChange={(e) => setFormData({ ...formData, warranty: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.warranty}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Truck className="h-3 w-3" /> 交货期
              </Label>
              {editing ? (
                <Input
                  value={formData.delivery}
                  onChange={(e) => setFormData({ ...formData, delivery: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.delivery}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> 报价有效期
              </Label>
              {editing ? (
                <Input
                  value={formData.validity}
                  onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm p-2 bg-gray-50 rounded">{formData.validity}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
