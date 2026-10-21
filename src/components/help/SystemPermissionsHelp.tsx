'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertTriangle,
  Award,
  Coins,
  Eye,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

/**
 * 系统权限体系帮助文档组件
 * 对话窗: [#202608311300-权限体系帮助文档生成]
 *
 * 设计：
 *  - 等级名称、积分阈值、权限矩阵全部从 /api/help/permissions 动态读取
 *  - 硬编码的仅是展示结构与文案，数据以数据库（member_levels 等）为准
 *  - 样式与 /help 帮助中心一致（灰底 + 白卡片 + 蓝色主色）
 */

// ---------- 类型（与 member-level-service 返回结构对齐） ----------
interface FieldPermission {
  field_key: string;
  field_label: string;
  has_permission: boolean;
  sort_order: number;
}

interface ModulePermission {
  module_key: string;
  module_label: string;
  has_permission: boolean;
  sort_order: number;
}

interface LevelInfo {
  level_code: string;
  level_name: string;
  required_points: number;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  daily_quota: number;
  max_files: number;
  max_chat_messages: number;
  description: string | null;
  field_permissions: FieldPermission[];
  module_permissions: ModulePermission[];
}

interface RoleTag {
  code: string;
  name_zh: string;
  name_en: string;
  is_super_admin: boolean;
  is_admin: boolean;
  description: string | null;
  level_priority: number;
}

interface PermissionsData {
  levels: LevelInfo[];
  roles: RoleTag[];
}

// 等级徽章配色（L0-L4，与系统 level-constants 的 1 灰/2 蓝/3 银/4 金/5 紫 一致）
const LEVEL_BADGE_CLASS: Record<string, string> = {
  L0: 'bg-gray-500',
  L1: 'bg-blue-500',
  L2: 'bg-slate-500',
  L3: 'bg-amber-500',
  L4: 'bg-purple-600',
};

const getLevelBadge = (code: string): string =>
  LEVEL_BADGE_CLASS[code] ?? 'bg-gray-500';

/** 模块权限列头（按后台配置顺序展示，缺失时回退完整定义） */
const MODULE_FALLBACK_ORDER: { module_key: string; module_label: string }[] = [
  { module_key: 'chat', module_label: '智能对话' },
  { module_key: 'quote_generate', module_label: '报价生成' },
  { module_key: 'history', module_label: '历史记录' },
  { module_key: 'edit', module_label: '编辑' },
  { module_key: 'preview', module_label: '预览' },
  { module_key: 'enhance_proposal', module_label: '方案增强' },
  { module_key: 'knowledge_download', module_label: '资料下载' },
  { module_key: 'data_export', module_label: '数据导出' },
  { module_key: 'customer_manage', module_label: '客户管理' },
];

/** 字段权限列头（敏感字段，按后台配置顺序展示） */
const FIELD_FALLBACK_ORDER: { field_key: string; field_label: string }[] = [
  { field_key: 'can_view_min_price', field_label: '最低售价' },
  { field_key: 'can_view_cost_price', field_label: '成本价' },
  { field_key: 'can_view_manufacturer', field_label: '厂家' },
  { field_key: 'can_view_contact', field_label: '联系人' },
  { field_key: 'can_view_phone', field_label: '电话' },
];

export default function SystemPermissionsHelp() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/help/permissions', {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || '加载失败');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- 加载 / 错误状态 ----------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="mt-3 text-sm">正在加载权限体系数据…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm text-muted-foreground">
          {error || '数据加载失败，请稍后重试'}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </button>
      </div>
    );
  }

  // 按 sort_order 排序等级（DB 权威顺序）
  const levels = [...data.levels]
    .filter((l) => l.is_enabled)
    .sort((a, b) => a.sort_order - b.sort_order);

  const moduleOrder =
    levels.length > 0 && levels[0].module_permissions.length > 0
      ? [...levels[0].module_permissions]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => ({ module_key: m.module_key, module_label: m.module_label }))
      : MODULE_FALLBACK_ORDER;

  const fieldOrder =
    levels.length > 0 && levels[0].field_permissions.length > 0
      ? [...levels[0].field_permissions]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((f) => ({ field_key: f.field_key, field_label: f.field_label }))
      : FIELD_FALLBACK_ORDER;

  const getModulePerm = (level: LevelInfo, key: string): boolean =>
    level.module_permissions.find((m) => m.module_key === key)?.has_permission ??
    false;

  const getFieldPerm = (level: LevelInfo, key: string): boolean =>
    level.field_permissions.find((f) => f.field_key === key)?.has_permission ??
    false;

  return (
    <div className="space-y-8">
      {/* ==================== 一、会员等级说明 ==================== */}
      <section id="levels">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <Award className="h-4 w-4 text-blue-500" />
          会员等级说明
        </h2>
        <Card className="bg-white overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">等级</th>
                    <th className="px-4 py-3 font-medium">所需积分</th>
                    <th className="px-4 py-3 font-medium">每日查询配额</th>
                    <th className="px-4 py-3 font-medium">最大文件数</th>
                    <th className="px-4 py-3 font-medium">最大聊天消息数</th>
                    <th className="px-4 py-3 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((level) => (
                    <tr
                      key={level.level_code}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${getLevelBadge(
                            level.level_code
                          )}`}
                        >
                          {level.level_name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {level.level_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {level.required_points > 0
                          ? `${level.required_points} 积分`
                          : '注册即享'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {level.daily_quota} 次
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {level.max_files} 个
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {level.max_chat_messages} 条
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {level.description || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 升级方式 */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Zap className="h-4 w-4 text-blue-500" />
                自动升级
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              积分累计达到等级阈值后自动升级，等级随积分增长实时生效，无需手动操作。
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Coins className="h-4 w-4 text-amber-500" />
                积分兑换
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              在「个人中心 → 权限升级」中用积分兑换临时等级，按天计费，到期后自动回落。
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                管理员设置
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              企业合作 / 特殊权益等场景，可由系统管理员直接为您设置等级或开通权限。
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ==================== 二、积分体系说明 ==================== */}
      <section id="points">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <Coins className="h-4 w-4 text-blue-500" />
          积分体系说明
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">积分获取</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  注册赠送、每日登录奖励
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  上传文件、解析文档、数据被采用
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  邀请好友注册奖励
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">积分消耗</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  AI 智能对话（按 tokens 计费）
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  文档解析、方案增强与数据导出
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  积分兑换临时等级 / 商城兑换
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">积分与等级</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              积分是升级的唯一依据：积分越多等级越高，可解锁更多功能模块与敏感字段。
              等级权益基于<strong className="text-gray-700">累计积分</strong>
              判断，兑换临时等级期间按临时等级享受权益，到期后按当前积分对应的等级恢复。
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ==================== 三、模块权限矩阵 ==================== */}
      <section id="modules">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <Sparkles className="h-4 w-4 text-blue-500" />
          模块权限矩阵
        </h2>
        <Card className="bg-white overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">功能模块</th>
                    {levels.map((level) => (
                      <th key={level.level_code} className="px-4 py-3 text-center font-medium">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${getLevelBadge(
                            level.level_code
                          )}`}
                        >
                          {level.level_name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {moduleOrder.map((mod) => (
                    <tr
                      key={mod.module_key}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3 font-medium">{mod.module_label}</td>
                      {levels.map((level) => {
                        const allowed = getModulePerm(level, mod.module_key);
                        return (
                          <td key={level.level_code} className="px-4 py-3 text-center">
                            {allowed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                可用
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-400">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                                不可用
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          注：矩阵以系统「等级权限配置」为准，管理员可随时调整。
        </p>
      </section>

      {/* ==================== 四、字段权限矩阵 ==================== */}
      <section id="fields">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <Eye className="h-4 w-4 text-blue-500" />
          字段权限矩阵
        </h2>
        <Card className="bg-white overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">敏感字段</th>
                    {levels.map((level) => (
                      <th key={level.level_code} className="px-4 py-3 text-center font-medium">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${getLevelBadge(
                            level.level_code
                          )}`}
                        >
                          {level.level_name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fieldOrder.map((field) => (
                    <tr
                      key={field.field_key}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3 font-medium">{field.field_label}</td>
                      {levels.map((level) => {
                        const visible = getFieldPerm(level, field.field_key);
                        return (
                          <td key={level.level_code} className="px-4 py-3 text-center">
                            {visible ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                可见
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-400">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                                不可见
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          注：产品价格库中厂家、联系人、电话、成本价、最低售价为敏感字段，仅对满足等级要求的账号展示。
        </p>
      </section>

      {/* ==================== 五、常见问题 ==================== */}
      <section id="faq">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <HelpCircle className="h-4 w-4 text-blue-500" />
          常见问题
        </h2>
        <Card className="bg-white">
          <CardContent className="py-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="faq-level">
                <AccordionTrigger className="text-sm font-medium text-left">
                  如何查看当前等级？
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  打开右上角「个人中心」，在「会员中心」或「权限升级」中即可查看当前等级、
                  积分进度与距离下一等级的差距；也可以在对话中直接向 AI 助手询问「我的等级」。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-downgrade">
                <AccordionTrigger className="text-sm font-medium text-left">
                  等级会自动降级吗？
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  由积分自动升级获得的等级不会因积分消耗而降级，等级按
                  <strong className="text-gray-700">累计积分</strong> 判断。
                  仅<strong className="text-gray-700">积分兑换 / 付费购买</strong>的临时等级
                  在到期后会回落：系统自动按当前积分重新计算应得等级并恢复。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-expire">
                <AccordionTrigger className="text-sm font-medium text-left">
                  积分会过期吗？
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  不会。系统积分长期有效，不会自动清零或过期；积分变动明细可在
                  「个人中心 → 积分中心」中随时查询。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-exchange">
                <AccordionTrigger className="text-sm font-medium text-left">
                  兑换临时等级后，等级会覆盖永久等级吗？
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  不会覆盖。兑换的临时等级在有效期内<strong className="text-gray-700">
                  临时生效</strong>，享受对应等级的全部权益；有效期结束后自动恢复为
                  积分对应的永久等级，您原有的积分与等级进度不受影响。
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </section>

      {/* ==================== 附：系统角色说明 ==================== */}
      {data.roles.length > 0 && (
        <section id="roles" className="pb-2">
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            系统角色说明
          </h2>
          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-2">
                {data.roles.map((role) => (
                  <Badge
                    key={role.code}
                    variant={role.is_super_admin ? 'default' : 'secondary'}
                    className="gap-1"
                  >
                    {role.name_zh}
                    {role.is_super_admin && (
                      <span className="text-[10px] opacity-80">超管</span>
                    )}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                除会员等级外，系统设有管理员角色负责后台管理、内容审核与用户服务；
                普通用户不涉及管理员角色。
              </p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
