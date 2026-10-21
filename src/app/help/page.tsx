import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Link2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Rocket,
  Share2,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getSiteConfigValues } from '@/lib/site-config';

export const metadata = {
  title: '帮助中心',
  description: '智能报价系统帮助中心：快速入门、分享指南、联系方式与常见问题',
};

type Step = {
  icon: typeof Rocket;
  title: string;
  summary: string;
  details: string[];
};

const QUICK_START_STEPS: Step[] = [
  {
    icon: Rocket,
    title: '登录系统',
    summary: '使用账号登录，进入对话首页开始使用。',
    details: [
      '打开系统首页，输入账号与密码登录；新用户可点击「注册」创建账号（好友邀请链接注册可获积分奖励）。',
      '登录后进入 AI 对话首页，可直接在输入框描述报价需求。',
      '如忘记密码，可在登录页点击「忘记密码」按提示重置。',
    ],
  },
  {
    icon: Upload,
    title: '上传需求文件',
    summary: '上传产品清单或需求文档，系统自动解析。',
    details: [
      '在对话输入框旁点击「上传文件」，选择产品清单 / 需求文档。',
      '支持 PDF、Excel（xlsx / xls / csv）、Word（doc / docx）与图片（jpg / png），单文件默认不超过 500MB。',
      '文件上传后系统自动解析内容，解析结果可在对话中预览确认，无需手动整理表格。',
    ],
  },
  {
    icon: FileText,
    title: 'AI 生成报价',
    summary: '与 AI 助手对话，快速生成并优化报价方案。',
    details: [
      '用文字描述产品需求（名称、数量、规格），或直接引用已上传的文档。',
      'AI 会列出产品明细、单价与金额建议，可继续对话要求调整数量、折扣、客户信息等。',
      '方案满意后点击「生成报价单」，系统自动编号并保存到「我的报价单」。',
    ],
  },
  {
    icon: Share2,
    title: '管理与分享',
    summary: '在「我的报价单」中管理、导出或分享报价单。',
    details: [
      '进入「我的报价单」可查看、编辑、删除报价单，随时补充客户与供应商信息。',
      '支持一键导出 Excel 存档或打印，也支持生成分享链接给客户在线查看。',
      '分享的报价单仅可查看、不可修改，可随时关闭分享，安全可控。',
    ],
  },
];

const SHARE_STEPS: Step[] = [
  {
    icon: Link2,
    title: '生成分享链接',
    summary: '找到目标报价单，点击「分享」生成链接。',
    details: [
      '进入「我的报价单」，打开目标报价单。',
      '点击页面上的「分享」按钮，系统自动生成一条分享链接。',
      '复制链接即可发送给客户（微信、邮件、短信均可）。',
    ],
  },
  {
    icon: ExternalLink,
    title: '客户在线查看',
    summary: '客户无需登录，打开链接即可查看报价内容。',
    details: [
      '客户通过浏览器打开链接，无需注册或登录。',
      '可查看产品明细、金额汇总、客户信息与商务条款等正式报价内容。',
      '移动端访问自动适配，方便客户随时查看。',
    ],
  },
  {
    icon: Lock,
    title: '安全可控',
    summary: '分享内容只读，可随时关闭。',
    details: [
      '分享出去的内容仅可查看，客户无法修改或再次分享编辑。',
      '不想继续展示时，关闭分享即可让链接立即失效。',
      '报价单被删除后，对应分享链接同步失效。',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: '导出与存档',
    summary: '同时支持导出 Excel 本地存档。',
    details: [
      '在报价单详情页点击「导出」，可下载 Excel 文件。',
      '导出的文件包含产品明细与金额汇总，方便打印、入档或线下审批。',
      '导出的表格样式整洁，可直接用于商务发送。',
    ],
  },
];

type FaqItem = {
  question: string;
  answer: ReactNode;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: '如何开始使用报价系统？',
    answer: (
      <>
        <p>注册并登录后即可进入对话首页使用，整体流程如下：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>打开系统首页，注册并登录账号。</li>
          <li>在输入框直接描述报价需求，或上传产品清单 / 需求文档。</li>
          <li>AI 助手解析需求后生成报价方案，你可以在对话中持续调整。</li>
          <li>方案满意后生成报价单，到「我的报价单」管理与分享。</li>
        </ol>
        <p className="mt-2">如果从未使用过，建议先阅读上方「快速入门」的四步指南。</p>
      </>
    ),
  },
  {
    question: '如何生成一份报价单？',
    answer: (
      <>
        <p>在对话中描述产品或上传需求文件，AI 生成报价方案后，按以下步骤保存为正式报价单：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>核对 AI 生成的产品明细、数量与金额，可通过对话要求修改。</li>
          <li>补充客户名称、联系方式与收货信息（可选，但建议填写完整）。</li>
          <li>设置税率、折扣与商务条款，确认总金额无误。</li>
          <li>点击「生成报价单」，系统自动生成报价编号并保存。</li>
          <li>到「我的报价单」可随时查看、编辑或分享该报价单。</li>
        </ol>
        <p className="mt-2">注意：生成后仍可编辑（草稿状态下），但对外分享前请再次核对金额与条款。</p>
      </>
    ),
  },
  {
    question: '报价单可以导出或分享吗？具体怎么操作？',
    answer: (
      <>
        <p>可以，支持两种方式对外输出报价单：</p>
        <p className="mt-2">
          <strong>方式一：分享链接（在线查看）</strong>
        </p>
        <ol className="list-decimal list-inside space-y-1">
          <li>进入「我的报价单」，打开目标报价单。</li>
          <li>点击「分享」生成分享链接，复制后发给客户。</li>
          <li>客户无需登录即可在线查看正式报价内容。</li>
        </ol>
        <p className="mt-2">
          <strong>方式二：导出 Excel（本地存档）</strong>
        </p>
        <ol className="list-decimal list-inside space-y-1">
          <li>在报价单详情页点击「导出」，下载 Excel 文件。</li>
          <li>导出文件包含完整产品明细与金额汇总，可直接打印或入档。</li>
        </ol>
        <p className="mt-2">详细说明请参考上方「分享报价单」板块。</p>
      </>
    ),
  },
  {
    question: '如何关闭分享或让分享链接失效？',
    answer: (
      <>
        <p>分享链接支持随时关闭，保障报价信息安全：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>进入「我的报价单」，打开已分享的报价单。</li>
          <li>点击「分享」区域中的关闭 / 停止分享操作。</li>
          <li>关闭后链接立即失效，客户再次打开将无法查看。</li>
        </ol>
        <p className="mt-2">
          另外，删除报价单也会同步使对应分享链接失效。分享内容始终为只读，客户无法修改报价数据。
        </p>
      </>
    ),
  },
  {
    question: '积分如何获得和使用？',
    answer: (
      <>
        <p>
          <strong>获得积分：</strong>注册赠送、每日登录、邀请好友、上传文件、完成任务等均可获得积分，邀请好友奖励可在后台「积分兑换规则」中查看默认数值。
        </p>
        <p className="mt-2">
          <strong>消耗积分：</strong>AI 对话、解析文档、生成 / 优化报价方案、导出报价等操作会消耗积分，不同操作消耗不同。
        </p>
        <p className="mt-2">
          可在「我的积分」中查看积分明细（获得 / 消耗记录），余额不足时系统会提示并可点击「立即充值」购买套餐。
        </p>
      </>
    ),
  },
  {
    question: '积分不足（提示 402）无法继续对话怎么办？',
    answer: (
      <>
        <p>当积分不足以继续对话时，系统会提示当前剩余积分与所需积分，可按以下方式处理：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>在提示弹窗中点击「立即充值」，打开充值弹窗。</li>
          <li>选择充值套餐（套餐与兑换比例以系统配置为准），确认订单并完成支付。</li>
          <li>支付成功后积分实时到账，可继续对话生成报价。</li>
        </ol>
        <p className="mt-2">
          此外，也可通过每日登录、邀请好友等免费方式获取积分；如需了解充值规则，可联系管理员。
        </p>
      </>
    ),
  },
  {
    question: '产品价格库是什么？为什么看不到部分字段？',
    answer: (
      <>
        <p>
          <strong>产品价格库</strong>用于集中维护产品、厂家与价格信息，供报价时快速调用，避免重复询价。
        </p>
        <p className="mt-2">
          出于商业安全考虑，以下 5 个字段属于<strong>敏感字段</strong>，仅管理员（admin / super_admin）可见：
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>厂家 / 供应商（supplier）</li>
          <li>联系人（contact_person）与联系电话（contact_phone）</li>
          <li>进价 / 成本价（cost_price）与最低售价（min_price）</li>
        </ul>
        <p className="mt-2">普通用户只能维护自己创建的产品，非管理员无法查看他人产品的敏感价格信息。</p>
      </>
    ),
  },
  {
    question: '上传文件支持哪些格式？大小有限制吗？',
    answer: (
      <>
        <p>系统支持以下文件格式用于报价需求解析：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>PDF 文档（.pdf）</li>
          <li>Excel 表格（.xlsx / .xls / .csv）</li>
          <li>Word 文档（.doc / .docx）</li>
          <li>图片（.jpg / .png 等，可拍照上传产品照片）</li>
        </ul>
        <p className="mt-2">
          单文件大小默认不超过 500MB（具体以系统配置为准）。文件越大解析时间越长，建议上传清晰、结构完整的清单文件以获得更准确的解析结果。
        </p>
      </>
    ),
  },
  {
    question: '如何邀请好友并获取奖励？',
    answer: (
      <>
        <p>邀请好友注册成功后，你将获得积分奖励：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>点击用户菜单中的「邀请好友」，生成专属邀请链接。</li>
          <li>将链接通过微信 / 邮件等方式分享给好友。</li>
          <li>好友通过链接注册成功后，系统自动为你发放邀请积分奖励。</li>
          <li>奖励发放后，可在「我的积分」中查看积分明细。</li>
        </ol>
        <p className="mt-2">每成功邀请一位好友注册，可获得的奖励积分以系统「积分兑换规则」配置为准。</p>
      </>
    ),
  },
  {
    question: '遇到问题如何联系客服或反馈？',
    answer: (
      <>
        <p>可通过以下渠道获得帮助：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>直接在对话中向 AI 助手提问，大部分操作问题可即时解答。</li>
          <li>查阅本页「联系我们」中的邮箱、电话与工作时间，工作时间内有专人响应。</li>
          <li>功能异常或建议类问题，建议通过邮件反馈并附上截图，便于快速定位。</li>
        </ul>
        <p className="mt-2">紧急问题优先通过电话联系，普通咨询可邮件留言，我们会在工作时间内尽快回复。</p>
      </>
    ),
  },
];

export default async function HelpPage() {
  const contacts = await getSiteConfigValues([
    'contact_email',
    'contact_phone',
    'contact_address',
    'service_hours',
  ]);

  const contactItems = [
    { icon: Mail, label: '联系邮箱', value: contacts.contact_email },
    { icon: Phone, label: '联系电话', value: contacts.contact_phone },
    { icon: MapPin, label: '公司地址', value: contacts.contact_address },
    { icon: Clock, label: '客服工作时间', value: contacts.service_hours || '工作日 9:00-18:00' },
  ].filter((item) => item.value);

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <span className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回对话
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            <h1 className="text-lg font-semibold">帮助中心</h1>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          使用指南
        </Badge>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* 快速入门 */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <Rocket className="h-4 w-4 text-blue-500" />
            快速入门
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_START_STEPS.map((step, index) => (
              <Card key={step.title} className="bg-white flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <step.icon className="h-6 w-6 text-blue-500" />
                    <span className="text-xs font-medium text-gray-400">STEP {index + 1}</span>
                  </div>
                  <CardTitle className="text-sm mt-2">{step.title}</CardTitle>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.summary}</p>
                </CardHeader>
                <CardContent className="pt-0 flex-1">
                  <ul className="space-y-2">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 分享报价单 */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <Share2 className="h-4 w-4 text-blue-500" />
            分享报价单
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SHARE_STEPS.map((step, index) => (
              <Card key={step.title} className="bg-white flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <step.icon className="h-6 w-6 text-blue-500" />
                    <span className="text-xs font-medium text-gray-400">0{index + 1}</span>
                  </div>
                  <CardTitle className="text-sm mt-2">{step.title}</CardTitle>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.summary}</p>
                </CardHeader>
                <CardContent className="pt-0 flex-1">
                  <ul className="space-y-2">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 客户与供应方资料库（#[20260901-1300]） */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <Database className="h-4 w-4 text-blue-500" />
            客户与供应方资料库
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="bg-white flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Users className="h-6 w-6 text-blue-500" />
                  <span className="text-xs font-medium text-gray-400">客户</span>
                </div>
                <CardTitle className="text-sm mt-2">客户资料库</CardTitle>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  集中维护客户与联系人信息，报价时一键带入，无需反复填写。
                </p>
              </CardHeader>
              <CardContent className="pt-0 flex-1">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>在用户菜单点击「客户管理」进入，可新增、编辑、删除客户，勾选后支持批量删除。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>可记录公司名称、项目、联系人、电话、邮箱、地址及开票信息（开户行、账号、税号）。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>页面顶部展示客户统计概览，可查看并维护客户跟进记录。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>常用信息可保存为模板，新建客户时一键填充。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>在对话输入框选择客户后，客户信息会自动同步到当前报价单。</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Building2 className="h-6 w-6 text-blue-500" />
                  <span className="text-xs font-medium text-gray-400">供应方</span>
                </div>
                <CardTitle className="text-sm mt-2">供应方资料库</CardTitle>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  管理报价主体与供货渠道信息，让对外报价单信息完整规范。
                </p>
              </CardHeader>
              <CardContent className="pt-0 flex-1">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>在用户菜单点击「供应方资料库」进入，可新增、编辑、删除供应方，勾选后支持批量删除。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>可维护公司名称、联系人、电话、邮箱、地址、网址与开票信息（开户行、账号、税号）。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>可将常用供应方设为默认，页面顶部会显示当前默认供应方，报价时直接选用。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>支持 CSV 批量导入，可快速迁移已有的供应方名单。</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>报价单上的供应方（报价主体）信息取自此处，请保持信息准确。</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 团队协作（#[20260902-0900]） */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <Users className="h-4 w-4 text-blue-500" />
            团队协作
          </h2>
          <Card className="bg-white">
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                创建团队并邀请同事加入，在同一团队内共享报价单、讨论方案。
                团队数据仅对团队成员可见，非成员无法查看。
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <UserPlus className="h-4 w-4 text-blue-500" />
                    邀请成员
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <span>
                        在团队详情页点击「邀请成员」，输入对方邮箱并选择其角色。
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <span>
                        系统会生成邀请链接（7 天内有效、仅可使用一次），复制链接发送给对方。
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <span>对方登录后打开链接，点击「确认加入团队」即可加入。</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-blue-500" />
                    角色与权限
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <span>
                        <strong className="text-gray-700">创建者</strong>
                        ：拥有全部权限，可解散团队，且不可被其他成员移除。
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <span>
                        <strong className="text-gray-700">管理员</strong>
                        ：可邀请与移除成员、调整成员角色、修改团队设置。
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <span>
                        <strong className="text-gray-700">成员</strong>
                        ：可创建与编辑报价单、参与讨论、导出内容。
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <span>
                        <strong className="text-gray-700">访客</strong>
                        ：仅可查看团队内容，不能编辑与讨论。
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  数据安全：你在团队列表中只会看到自己创建或已加入的团队；
                  团队内的共享报价单与讨论内容仅该团队成员可见，其他用户无法访问。
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 权限体系说明（#202608311300） */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            权限体系
          </h2>
          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-50 shrink-0">
                  <ShieldCheck className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold mb-1">会员等级与权限说明</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    了解系统会员等级（L0-L4）、积分体系、功能模块权限、敏感字段可见范围以及常见问题，帮助你更好地使用系统。
                  </p>
                  <Link href="/help/permissions">
                    <span className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700">
                      查看权限体系说明
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </span>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 联系我们 */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <Mail className="h-4 w-4 text-blue-500" />
            联系我们
          </h2>
          <Card className="bg-white">
            <CardContent className="pt-6">
              {contactItems.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {contactItems.map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <item.icon className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-sm text-muted-foreground">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  如有问题，可在对话中直接咨询 AI 助手，或联系系统管理员获取帮助。
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
                紧急问题建议优先电话联系；普通咨询可邮件留言，工作时间内尽快回复。功能异常反馈请附上截图，便于快速定位。
              </p>
            </CardContent>
          </Card>
        </section>

        {/* 常见问题 */}
        <section>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
            <HelpCircle className="h-4 w-4 text-blue-500" />
            常见问题
          </h2>
          <Card className="bg-white">
            <CardContent className="py-2">
              <Accordion type="single" collapsible className="w-full">
                {FAQ_ITEMS.map((item, index) => (
                  <AccordionItem key={item.question} value={`faq-${index}`}>
                    <AccordionTrigger className="text-sm font-medium text-left">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
