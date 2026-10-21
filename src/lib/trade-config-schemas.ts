// 交易配置字段 Schema（#[202608302000] 交易配置表格化改造）
// 将 JSON 配置值拆解为表格字段，UI 层提供中文字段名 + 独立编辑控件 + 修改效果说明。
// 核心原则：存储的 config_value 仍是程序可解析的 JSON（键名保持英文），
// 这里仅定义「如何把 JSON 呈现为可读表格」，不改变数据格式。
// 未在此登记的自定义配置键，编辑弹窗自动回退到 JSON 文本编辑模式。

export interface FieldConfig {
  key: string; // JSON 键名（如 "rating"）
  label: string; // 中文标签（如 "评分权重"）
  type: 'number' | 'string' | 'boolean' | 'select';
  options?: string[]; // select 类型的候选值（存原始值）
  optionLabels?: Record<string, string>; // select 候选值的中文显示（值 → 中文）
  min?: number; // 数值最小值
  max?: number; // 数值最大值
  step?: number; // 数值步进
  hint: string; // 修改效果说明
  placeholder?: string; // 占位符
}

export interface ConfigSchema {
  configKey: string;
  title: string; // 中文名称
  category: string; // 中文分类
  description: string; // 弹窗描述
  fields: FieldConfig[];
  globalHint: string; // 底部全局提示
}

// 功能开关类配置（*.*.enabled）共用字段定义
const ENABLED_FIELD: FieldConfig = {
  key: 'enabled',
  label: '是否启用',
  type: 'boolean',
  hint: 'true=功能开启，false=功能关闭',
};

function enabledSchema(configKey: string, title: string): ConfigSchema {
  return {
    configKey,
    title,
    category: '功能开关',
    description: `${title}开关配置，修改后立即生效。`,
    globalHint: '关闭后前端对应入口立即隐藏，用户无法使用',
    fields: [ENABLED_FIELD],
  };
}

export const CONFIG_SCHEMAS: Record<string, ConfigSchema> = {
  'brand.match_weights': {
    configKey: 'brand.match_weights',
    title: '品牌匹配权重',
    category: '品牌',
    description: '配置品牌排名各维度权重，数值越大该维度越重要',
    globalHint: '数值越大该维度在品牌排名中越重要，所有权重共同决定最终排序',
    fields: [
      {
        key: 'rating',
        label: '评分权重',
        type: 'number',
        min: 0,
        max: 1000,
        step: 1,
        hint: '值越高，品牌评分对排名影响越大',
      },
      {
        key: 'total_paid',
        label: '付费金额权重',
        type: 'number',
        min: 0,
        max: 1000,
        step: 1,
        hint: '值越高，累计付费金额对排名影响越大',
      },
      {
        key: 'view_count',
        label: '曝光次数权重',
        type: 'number',
        min: 0,
        max: 1000,
        step: 1,
        hint: '值越高，曝光次数对排名影响越大',
      },
      {
        key: 'order_count',
        label: '成单次数权重',
        type: 'number',
        min: 0,
        max: 1000,
        step: 1,
        hint: '值越高，成单次数对排名影响越大',
      },
      {
        key: 'priority_level',
        label: '付费等级权重',
        type: 'number',
        min: 0,
        max: 1000,
        step: 1,
        hint: '值越高，付费等级对排名影响越大',
      },
    ],
  },
  'points.recharge_rate': {
    configKey: 'points.recharge_rate',
    title: '积分充值比例',
    category: '系统',
    description: '配置积分充值比例（1元 = 多少积分）',
    globalHint: '修改后所有充值订单立即按新比例计算',
    fields: [
      {
        key: 'rate',
        label: '兑换比例',
        type: 'number',
        min: 1,
        max: 10000,
        step: 1,
        hint: '1元 = 多少积分，数值越大用户充值获得积分越多',
      },
    ],
  },
  'points.token_rate': {
    configKey: 'points.token_rate',
    title: '积分Token兑换比例',
    category: '系统',
    description: '配置积分兑换Token比例（1积分 = 多少Tokens）',
    globalHint: '修改后积分消费计算Token数量立即按新比例计算',
    fields: [
      {
        key: 'rate',
        label: '兑换比例',
        type: 'number',
        min: 1,
        max: 10000,
        step: 1,
        hint: '1积分 = 多少Tokens，数值越大用户积分兑换Tokens越多',
      },
    ],
  },
  'points.split_rates': {
    configKey: 'points.split_rates',
    title: '资料下载分成比例',
    category: '系统',
    description: '配置资料下载积分消费后的创作者与平台分成比例',
    globalHint: 'creator_rate + platform_rate 应等于 1，两值可自动联动',
    fields: [
      {
        key: 'creator_rate',
        label: '创作者分成',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '创作者获得的分成比例（0.7=70%）',
      },
      {
        key: 'platform_rate',
        label: '平台分成',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '平台获得的分成比例（0.3=30%）',
      },
    ],
  },
  'points.withdraw_rate': {
    configKey: 'points.withdraw_rate',
    title: '积分提现比例',
    category: '提现',
    description: '配置积分提现比例（多少积分 = 1元）',
    globalHint: '修改后所有提现申请立即按新比例计算',
    fields: [
      {
        key: 'rate',
        label: '提现比例',
        type: 'number',
        min: 1,
        max: 10000,
        step: 1,
        hint: '多少积分 = 1元，数值越大提现所需积分越多',
      },
    ],
  },
  'points.withdraw_min': {
    configKey: 'points.withdraw_min',
    title: '最低提现积分',
    category: '提现',
    description: '配置用户提现所需的最低积分',
    globalHint: '防刷机制，建议不低于100',
    fields: [
      {
        key: 'min',
        label: '最低提现积分',
        type: 'number',
        min: 0,
        max: 100000,
        step: 100,
        hint: '用户积分达到此数值才能申请提现',
      },
    ],
  },
  'membership.default_discount': {
    configKey: 'membership.default_discount',
    title: '会员默认折扣',
    category: '会员',
    description: '配置会员默认享受的折扣率',
    globalHint: '值越小折扣越大，建议范围0.5-1.0',
    fields: [
      {
        key: 'discount',
        label: '默认折扣率',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '会员默认享受的折扣（0.9=9折，0.8=8折）',
      },
    ],
  },
  'payment.order_expire_minutes': {
    configKey: 'payment.order_expire_minutes',
    title: '订单过期时间',
    category: '支付',
    description: '配置订单自动取消的过期分钟数',
    globalHint: '太短用户来不及支付，太长占用订单资源',
    fields: [
      {
        key: 'minutes',
        label: '过期分钟数',
        type: 'number',
        min: 1,
        max: 10080,
        step: 5,
        hint: '订单创建后多少分钟未支付自动取消',
      },
    ],
  },
  'payment.default_method': {
    configKey: 'payment.default_method',
    title: '默认支付方式',
    category: '支付',
    description: '配置用户支付时默认选中的支付方式',
    globalHint: '可选值：wechat（微信支付）/ alipay（支付宝支付）',
    fields: [
      {
        key: 'method',
        label: '默认支付方式',
        type: 'select',
        options: ['wechat', 'alipay'],
        optionLabels: { wechat: '微信支付', alipay: '支付宝支付' },
        hint: '用户支付时默认选中的支付方式',
      },
    ],
  },
  'mall.cash_enabled': enabledSchema('mall.cash_enabled', '商城现金购买'),
  'payment.wechat.enabled': enabledSchema('payment.wechat.enabled', '微信支付'),
  'payment.alipay.enabled': enabledSchema('payment.alipay.enabled', '支付宝支付'),
  'token.enabled': enabledSchema('token.enabled', 'Token购买'),
  'payment.wechat.config': {
    configKey: 'payment.wechat.config',
    title: '微信支付配置',
    category: '支付',
    description:
      '微信支付 APIv3 凭据配置。修改后实时生效；留空字段会自动回退到 .env 的 WECHAT_* 环境变量。',
    globalHint:
      'appid 必须与 mchid 在微信商户平台（pay.weixin.qq.com → 产品中心 → AppID账号管理）完成绑定，否则统一下单会返回「appid和mch_id不匹配」。私钥与平台证书公钥支持使用 \\n 转义换行。',
    fields: [
      { key: 'appid', label: 'AppID', type: 'string', hint: '商户绑定的公众号/小程序 AppID' },
      { key: 'mchid', label: '商户号', type: 'string', hint: '微信支付商户号（mchid）' },
      {
        key: 'apiV3Key',
        label: 'APIv3 密钥',
        type: 'string',
        hint: '32 位 APIv3 密钥，用于回调数据解密',
      },
      {
        key: 'serialNo',
        label: '证书序列号',
        type: 'string',
        hint: '商户 API 证书序列号',
      },
      {
        key: 'privateKey',
        label: '商户私钥',
        type: 'string',
        hint: 'PEM 格式私钥；可直接粘贴多行，也可用 \\n 转义',
      },
      {
        key: 'notifyUrl',
        label: '回调地址',
        type: 'string',
        hint: '留空则自动使用 BASE_URL + /api/payment/wechat/notify',
      },
      {
        key: 'platformPublicKey',
        label: '平台证书公钥',
        type: 'string',
        hint: '微信支付平台证书公钥（PEM），用于回调验签；留空时以 APIv3 密钥解密兜底',
      },
    ],
  },
};
