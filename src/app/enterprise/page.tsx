'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Building2, Upload, CheckCircle, Clock, XCircle, ArrowLeft } from 'lucide-react';

export default function EnterprisePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { submitEnterpriseApplication, getEnterpriseStatus, enterpriseLogin } = useUser();
  
  const [activeTab, setActiveTab] = useState('apply');
  const [loading, setLoading] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [status, setStatus] = useState<any>(null);
  
  // 表单数据
  const [formData, setFormData] = useState({
    companyName: '',
    businessLicense: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    companyAddress: ''
  });

  // 处理输入变化
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // 提交认证申请
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证表单
    if (!formData.companyName || !formData.businessLicense || !formData.contactPerson || !formData.contactPhone) {
      toast({
        title: "请填写完整信息",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await submitEnterpriseApplication({
        ...formData,
        licenseImage: 'mock-license.jpg' // 模拟营业执照图片
      });
      
      if (result.success && result.applicationId) {
        setApplicationId(result.applicationId);
        toast({
          title: "申请已提交",
          description: "我们将在1-2个工作日内完成审核",
          duration: 5000,
        });
        setActiveTab('status');
        // 延迟一下再查询状态
        setTimeout(() => {
          checkStatus(result.applicationId);
        }, 1000);
      } else {
        toast({
          title: "提交失败",
          description: result.error || "请稍后重试",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('提交失败:', error);
      toast({
        title: "提交失败",
        description: "请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 查询状态
  const checkStatus = async (id?: string) => {
    const checkId = id || applicationId;
    if (!checkId) {
      toast({
        title: "请输入申请编号",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    setLoading(true);
    const result = await getEnterpriseStatus(checkId);
    setStatus(result);
    setLoading(false);
  };

  // 企业登录
  const handleEnterpriseLogin = async () => {
    if (!applicationId) {
      toast({
        title: "请输入企业ID",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await enterpriseLogin(
        applicationId,
        'employee-001',
        'mock-token-employee-001'
      );
      
      if (result.success) {
        toast({
          title: "登录成功",
          description: "欢迎进入企业管理后台",
          duration: 2000,
        });
        router.push('/admin');
      } else {
        toast({
          title: "登录失败",
          description: result.error || "请检查企业信息",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('登录失败:', error);
      toast({
        title: "登录失败",
        description: "请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* 返回按钮 */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push('/login')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回登录
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <Building2 className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl">企业服务</CardTitle>
            <CardDescription>
              企业认证后开通团队管理后台，享受更多专业服务
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="apply">企业认证</TabsTrigger>
                <TabsTrigger value="status">状态查询</TabsTrigger>
              </TabsList>

              {/* 企业认证表单 */}
              <TabsContent value="apply">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">基本信息</h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">公司名称</label>
                      <Input
                        name="companyName"
                        value={formData.companyName}
                        onChange={handleChange}
                        placeholder="请输入公司全称"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">营业执照号</label>
                      <Input
                        name="businessLicense"
                        value={formData.businessLicense}
                        onChange={handleChange}
                        placeholder="请输入营业执照注册号"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">营业执照照片</label>
                      <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer transition-colors">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-500">点击上传营业执照照片</p>
                        <p className="text-xs text-gray-400 mt-1">支持 jpg、png 格式，文件大小不超过 5MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">联系人信息</h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">联系人姓名</label>
                      <Input
                        name="contactPerson"
                        value={formData.contactPerson}
                        onChange={handleChange}
                        placeholder="请输入联系人姓名"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">联系电话</label>
                      <Input
                        name="contactPhone"
                        value={formData.contactPhone}
                        onChange={handleChange}
                        placeholder="请输入联系电话"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">联系邮箱</label>
                      <Input
                        name="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={handleChange}
                        placeholder="请输入联系邮箱"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">公司地址</label>
                      <Textarea
                        name="companyAddress"
                        value={formData.companyAddress}
                        onChange={handleChange}
                        placeholder="请输入公司详细地址"
                        rows={3}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? '提交中...' : '提交认证申请'}
                  </Button>
                </form>
              </TabsContent>

              {/* 状态查询 */}
              <TabsContent value="status">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">申请编号</label>
                    <div className="flex gap-2">
                      <Input
                        value={applicationId}
                        onChange={(e) => setApplicationId(e.target.value)}
                        placeholder="请输入申请编号"
                      />
                      <Button
                        variant="outline"
                        onClick={() => checkStatus()}
                        disabled={loading}
                      >
                        查询
                      </Button>
                    </div>
                  </div>

                  {status && (
                    <div className="border rounded-lg p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        {status.status === 'approved' && (
                          <>
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            <span className="font-medium text-green-600">审核通过</span>
                          </>
                        )}
                        {status.status === 'pending' && (
                          <>
                            <Clock className="h-6 w-6 text-yellow-500" />
                            <span className="font-medium text-yellow-600">审核中</span>
                          </>
                        )}
                        {status.status === 'rejected' && (
                          <>
                            <XCircle className="h-6 w-6 text-red-500" />
                            <span className="font-medium text-red-600">审核未通过</span>
                          </>
                        )}
                        {status.status === 'not_found' && (
                          <span className="text-gray-500">未找到申请记录</span>
                        )}
                      </div>

                      {status.application && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                          <p><span className="font-medium">公司名称：</span>{status.application.companyName}</p>
                          <p><span className="font-medium">提交时间：</span>{new Date(status.application.submittedAt).toLocaleString()}</p>
                          {status.application.approvedAt && (
                            <p><span className="font-medium">审核时间：</span>{new Date(status.application.approvedAt).toLocaleString()}</p>
                          )}
                          {status.application.rejectReason && (
                            <p className="text-red-500"><span className="font-medium">拒绝原因：</span>{status.application.rejectReason}</p>
                          )}
                        </div>
                      )}

                      {status.status === 'approved' && (
                        <Button
                          className="w-full"
                          onClick={handleEnterpriseLogin}
                          disabled={loading}
                        >
                          {loading ? '登录中...' : '进入企业管理后台'}
                        </Button>
                      )}

                      {status.status === 'pending' && (
                        <p className="text-sm text-center text-gray-500">
                          我们将在审核通过后发送邮件通知您
                        </p>
                      )}

                      {status.status === 'rejected' && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setActiveTab('apply')}
                        >
                          重新提交申请
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
