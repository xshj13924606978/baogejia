'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Save, Sparkles, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { LEVEL_METAS } from '@/lib/level-constants';

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

interface LevelInfo {
  id: number;
  name: string;
}

// 兜底等级列表：仅在 API 未返回等级定义（level_definitions 表为空/异常）时使用，
// 正常数据源为数据库，杜绝前端硬编码主导。
// #202608302400 阶段1：名称取自统一常量（用户 / 会员 / 白银 / 黄金 / 白金）
const FALLBACK_LEVELS: LevelInfo[] = LEVEL_METAS.map((m) => ({
  id: m.level,
  name: m.name,
}));

// 各等级对应表单字段名（id -> [input, output]）
const LEVEL_RATE_FIELDS = [
  { id: 1, input: 'level1InputRate', output: 'level1OutputRate' },
  { id: 2, input: 'level2InputRate', output: 'level2OutputRate' },
  { id: 3, input: 'level3InputRate', output: 'level3OutputRate' },
  { id: 4, input: 'level4InputRate', output: 'level4OutputRate' },
  { id: 5, input: 'level5InputRate', output: 'level5OutputRate' },
] as const;

export const PointsConfig: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [levels, setLevels] = useState<LevelInfo[]>(FALLBACK_LEVELS);

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

  // 联动：1元=?Tokens 由「1元=?积分」×「1积分=?Tokens」自动计算（只读，不可手动编辑）
  const yuanToPoints = form.watch('yuanToPoints');
  const pointsToTokens = form.watch('pointsToTokens');
  // 全量 watch：驱动等级卡片徽标的实时刷新
  const watched = form.watch();

  useEffect(() => {
    const a = Number(yuanToPoints) || 0;
    const b = Number(pointsToTokens) || 0;
    const product = a * b;
    if (product > 0 && form.getValues('yuanToTokens') !== product) {
      form.setValue('yuanToTokens', product);
    }
    // form 引用稳定，无需列入依赖
  }, [yuanToPoints, pointsToTokens]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      // #202608302200 配置数据动态同步：基础兑换比例统一从 trade_config 读取
      // （与「交易配置」中心同一数据源，任意一处修改此处实时生效）
      const tradeRes = await fetch('/api/trade/config', { headers: getClientAuthHeaders() });
      const tradeData = await tradeRes.json();
      const cfg = tradeData?.config || {};
      const rechargeRate = Number(cfg['points.recharge_rate']?.rate);
      const tokenRate = Number(cfg['points.token_rate']?.rate);
      const y2p = Number.isFinite(rechargeRate) && rechargeRate > 0 ? rechargeRate : 100;
      const p2t = Number.isFinite(tokenRate) && tokenRate > 0 ? tokenRate : 10;
      form.setValue('yuanToPoints', y2p);
      form.setValue('pointsToTokens', p2t);
      form.setValue('yuanToTokens', y2p * p2t);

      // 等级折扣倍率 + 等级名称：仍由 billing config（knowledge_entries）管理
      const res = await fetch('/api/admin/billing/config', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (data.success && data.data) {
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

      // 等级名称来自数据库（level_definitions），API 未返回时保留兜底
      if (data.levels && Array.isArray(data.levels) && data.levels.length > 0) {
        setLevels(data.levels.map((l: { id: number; name: string }) => ({ id: Number(l.id), name: l.name })));
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
      // #202608302200 配置数据动态同步：基础兑换比例写入统一数据源 trade_config
      const writeTradeConfig = async (key: string, value: { rate: number }) => {
        const res = await fetch(`/api/admin/trade/config/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
          body: JSON.stringify({ config_value: value }),
        });
        const body = await res.json();
        if (!body.success) {
          throw new Error(body.error || `写入配置 ${key} 失败`);
        }
      };
      await writeTradeConfig('points.recharge_rate', { rate: values.yuanToPoints });
      await writeTradeConfig('points.token_rate', { rate: values.pointsToTokens });

      // 等级折扣倍率：仍由 billing config 管理（knowledge_entries，消费端读取同一份）
      const res = await fetch('/api/admin/billing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
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
        throw new Error(data.error || '保存失败');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '保存失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 综合折扣（输入+输出倍率均值），用于卡片徽标展示
  const getCombinedDiscountText = (inputRate: number, outputRate: number) => {
    const avg = (Number(inputRate) + Number(outputRate)) / 2;
    if (avg >= 1) return '无折扣';
    const discount = Math.round((1 - avg) * 100);
    return `综合折扣 ${discount}%`;
  };

  // 等级显示名（去重：数据库默认名"等级N"与前缀重复时只显示一个）
  const levelLabel = (level: LevelInfo) => {
    const name = (level.name || '').trim();
    if (!name || name === `等级${level.id}` || name === `等级 ${level.id}`) {
      return `等级 ${level.id}`;
    }
    return `等级 ${level.id} · ${name}`;
  };

  // 等级对应的表单字段（防御：数据库等级 id 非连续时兜底）
  const rateFieldsFor = (id: number): { input: keyof PointsConfigValues; output: keyof PointsConfigValues } =>
    LEVEL_RATE_FIELDS.find((f) => f.id === id) ?? {
      input: `level${id}InputRate` as keyof PointsConfigValues,
      output: `level${id}OutputRate` as keyof PointsConfigValues,
    };

  return (
    <Card className="w-full max-w-6xl mx-auto border-border/60 shadow-sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          积分兑换规则
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="mr-1 h-3 w-3" /> 实时联动
          </span>
        </CardTitle>
        <CardDescription>
          配置积分、人民币与 Token 之间的兑换比例，以及各等级用户的折扣倍率
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
                <TabsTrigger value="basic">基础兑换比例</TabsTrigger>
                <TabsTrigger value="level">等级折扣倍率</TabsTrigger>
              </TabsList>

              {/* 基础兑换比例 */}
              <TabsContent value="basic" className="mt-6 w-full">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="yuanToPoints"
                    render={({ field }) => (
                      <FormItem className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                        <FormLabel className="text-sm font-medium text-muted-foreground">
                          1元 = ? 积分
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            className="mt-2 h-11 text-lg font-semibold"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <p className="mt-2 text-xs text-muted-foreground">
                          人民币兑换积分的比例
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pointsToTokens"
                    render={({ field }) => (
                      <FormItem className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                        <FormLabel className="text-sm font-medium text-muted-foreground">
                          1积分 = ? Tokens
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            className="mt-2 h-11 text-lg font-semibold"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <p className="mt-2 text-xs text-muted-foreground">
                          积分兑换 Token 的比例
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="yuanToTokens"
                    render={({ field }) => (
                      <FormItem className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-accent/5 to-background p-5 shadow-sm">
                        <FormLabel className="flex items-center gap-2 text-sm font-medium">
                          1元 = ? Tokens
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles className="mr-1 h-3 w-3" /> 自动联动
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            disabled
                            className="mt-2 h-11 text-lg font-semibold bg-background/80"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <p className="mt-2 text-xs text-muted-foreground">
                          自动计算 = 1元积分 × 1积分Tokens，不可手动编辑
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* 等级折扣倍率 */}
              <TabsContent value="level" className="mt-6 w-full space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-1 text-muted-foreground">
                    <p className="font-medium text-foreground">折扣倍率说明</p>
                    <p>倍率 1.0 = 无折扣；倍率 0.8 = 打 8 折（实际扣费 = 原始 Token × 0.8）；倍率 0.6 = 打 6 折。</p>
                    <p>输入和输出 Token 可分别设置倍率，卡片徽标显示综合折扣。</p>
                  </div>
                </div>

                {levels.map((level) => (
                  <div
                    key={level.id}
                    className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-base font-semibold">
                        {levelLabel(level)}
                      </h4>
                      <span
                        className={
                          level.id === 1
                            ? 'inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'
                            : 'inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        }
                      >
                        {getCombinedDiscountText(
                          watched[rateFieldsFor(level.id).input] ?? 1,
                          watched[rateFieldsFor(level.id).output] ?? 1
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`${rateFieldsFor(level.id).input}` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              输入 Token 倍率
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                className="mt-1.5 h-10 font-medium"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`${rateFieldsFor(level.id).output}` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              输出 Token 倍率
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                className="mt-1.5 h-10 font-medium"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end border-t pt-5">
              <Button type="submit" disabled={loading} className="min-w-32">
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
