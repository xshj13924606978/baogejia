'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const pointsConfigSchema = z.object({
  // 基础兑换比例
  yuanToPoints: z.number().min(1, '必须大于0'),
  pointsToTokens: z.number().min(1, '必须大于0'),
  yuanToTokens: z.number().min(1, '必须大于0'),
  // 等级折扣倍率
  level1InputRate: z.number().min(0).max(10),
  level1OutputRate: z.number().min(0).max(10),
  level2InputRate: z.number().min(0).max(10),
  level2OutputRate: z.number().min(0).max(10),
  level3InputRate: z.number().min(0).max(10),
  level3OutputRate: z.number().min(0).max(10),
  level4InputRate: z.number().min(0).max(10),
  level4OutputRate: z.number().min(0).max(10),
  level5InputRate: z.number().min(0).max(10),
  level5OutputRate: z.number().min(0).max(10),
});

type PointsConfigValues = z.infer<typeof pointsConfigSchema>;

// 等级定义
const LEVELS = [
  { id: 1, name: '免费用户', description: '基础用户，无折扣' },
  { id: 2, name: '普通会员', description: '付费用户，享受小额折扣' },
  { id: 3, name: 'VIP会员', description: 'VIP用户，享受中等折扣' },
  { id: 4, name: '企业会员', description: '企业用户，享受较大折扣' },
  { id: 5, name: '超级会员', description: '超级用户，享受最大折扣' },
];

export const PointsConfig: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  const form = useForm<PointsConfigValues>({
    resolver: zodResolver(pointsConfigSchema),
    defaultValues: {
      yuanToPoints: 100,
      pointsToTokens: 10,
      yuanToTokens: 1000,
      // 默认折扣倍率
      level1InputRate: 1.0,
      level1OutputRate: 1.0,
      level2InputRate: 0.9,
      level2OutputRate: 0.9,
      level3InputRate: 0.8,
      level3OutputRate: 0.8,
      level4InputRate: 0.7,
      level4OutputRate: 0.7,
      level5InputRate: 0.6,
      level5OutputRate: 0.6,
    },
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/billing/config');
      const data = await res.json();
      if (data.success && data.data) {
        // 设置基础兑换比例
        form.setValue('yuanToPoints', data.data.yuanToPoints || 100);
        form.setValue('pointsToTokens', data.data.pointsToTokens || 10);
        form.setValue('yuanToTokens', data.data.yuanToTokens || 1000);

        // 设置等级折扣倍率
        form.setValue('level1InputRate', data.data.level1InputRate ?? 1.0);
        form.setValue('level1OutputRate', data.data.level1OutputRate ?? 1.0);
        form.setValue('level2InputRate', data.data.level2InputRate ?? 0.9);
        form.setValue('level2OutputRate', data.data.level2OutputRate ?? 0.9);
        form.setValue('level3InputRate', data.data.level3InputRate ?? 0.8);
        form.setValue('level3OutputRate', data.data.level3OutputRate ?? 0.8);
        form.setValue('level4InputRate', data.data.level4InputRate ?? 0.7);
        form.setValue('level4OutputRate', data.data.level4OutputRate ?? 0.7);
        form.setValue('level5InputRate', data.data.level5InputRate ?? 0.6);
        form.setValue('level5OutputRate', data.data.level5OutputRate ?? 0.6);
      }
    } catch (error) {
      toast({
        title: '错误',
        description: '获取配置失败',
        variant: 'destructive',
      });
    }
  };

  const onSubmit = async (values: PointsConfigValues) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/billing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: '成功',
          description: '保存成功',
        });
        // 重新获取配置以更新显示
        await fetchConfig();
      } else {
        toast({
          title: '错误',
          description: data.error || '保存失败',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '错误',
        description: '保存失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getDiscountText = (rate: number) => {
    if (rate === 1) return '无折扣';
    const discount = Math.round((1 - rate) * 100);
    return `享受 ${discount}% 折扣`;
  };

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <CardTitle>积分兑换规则</CardTitle>
        <CardDescription>
          配置积分、人民币与 Token 之间的兑换比例，以及各等级用户的折扣倍率
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">基础兑换比例</TabsTrigger>
                <TabsTrigger value="level">等级折扣倍率</TabsTrigger>
              </TabsList>

              {/* 基础兑换比例 */}
              <TabsContent value="basic" className="space-y-6 mt-6 w-full">
                <div className="max-w-2xl">
                  <FormField
                  control={form.control}
                  name="yuanToPoints"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>1元 = ? 积分</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        设置人民币与积分的兑换比例
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pointsToTokens"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>1积分 = ? Tokens</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        设置积分与 Token 的兑换比例
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="yuanToTokens"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>1元 = ? Tokens</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        设置人民币与 Token 的直接兑换比例
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
              </TabsContent>

              {/* 等级折扣倍率 */}
              <TabsContent value="level" className="space-y-6 mt-6 w-full">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">折扣倍率说明</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 倍率为 1.0 表示无折扣</li>
                    <li>• 倍率为 0.8 表示享受 20% 折扣（实际扣费 = 原始 token × 0.8）</li>
                    <li>• 倍率为 0.6 表示享受 40% 折扣</li>
                    <li>• 输入和输出 Token 可以设置不同的折扣倍率</li>
                  </ul>
                </div>

                {LEVELS.map((level) => (
                  <div key={level.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">
                        等级 {level.id} - {level.name}
                      </h4>
                      <span className="text-sm text-muted-foreground">{level.description}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`level${level.id}InputRate` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>输入 Token 倍率</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              {getDiscountText(field.value)}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`level${level.id}OutputRate` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>输出 Token 倍率</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              {getDiscountText(field.value)}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button type="submit" disabled={loading}>
                <Save className="mr-2 h-4 w-4" />
                {loading ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
