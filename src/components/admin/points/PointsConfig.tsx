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

const pointsConfigSchema = z.object({
  yuanToPoints: z.number().min(1, '必须大于0'),
  pointsToTokens: z.number().min(1, '必须大于0'),
  yuanToTokens: z.number().min(1, '必须大于0'),
});

type PointsConfigValues = z.infer<typeof pointsConfigSchema>;

export const PointsConfig: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<PointsConfigValues>({
    resolver: zodResolver(pointsConfigSchema),
    defaultValues: {
      yuanToPoints: 100,
      pointsToTokens: 10,
      yuanToTokens: 1000,
    },
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/billing/config');
      const data = await res.json();
      if (data.success) {
        form.setValue('yuanToPoints', data.data.yuanToPoints);
        form.setValue('pointsToTokens', data.data.pointsToTokens);
        form.setValue('yuanToTokens', data.data.yuanToTokens);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>积分兑换规则</CardTitle>
        <CardDescription>
          配置积分、人民币与 Token 之间的兑换比例
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

            <Button type="submit" disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              {loading ? '保存中...' : '保存配置'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
