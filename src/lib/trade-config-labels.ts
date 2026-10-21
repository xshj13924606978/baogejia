// 配置Key → 中文描述映射（#[202608301500] 交易配置页面汉化）
// name: 列表中主显示的中文名称
// description: 辅助说明（未命中映射时回退到 DB trade_config.description）
// 说明：trade_config 表的 config_key 是模块点分命名（如 brand.match_weights），
// 列表直接展示不友好，这里维护一份静态中英映射；新增配置键时建议同步补充本表。
export const TRADE_CONFIG_LABELS: Record<string, { name: string; description: string }> = {
  'brand.match_weights': {
    name: '品牌匹配权重',
    description: '品牌匹配时各维度权重配置',
  },
  'mall.cash_enabled': {
    name: '商城现金购买开关',
    description: '启用/禁用商城现金购买',
  },
  'membership.default_discount': {
    name: '会员默认折扣',
    description: '会员等级默认折扣率',
  },
  'payment.alipay.enabled': {
    name: '支付宝支付开关',
    description: '启用/禁用支付宝支付',
  },
  'payment.default_method': {
    name: '默认支付方式',
    description: '系统默认支付方式',
  },
  'payment.order_expire_minutes': {
    name: '订单过期时间',
    description: '订单自动过期时间（分钟）',
  },
  'payment.wechat.enabled': {
    name: '微信支付开关',
    description: '启用/禁用微信支付',
  },
  'payment.wechat.config': {
    name: '微信支付配置',
    description: '微信支付 APIv3 凭据（appid/mchid/私钥/证书/回调地址等），修改后实时生效',
  },
  'points.recharge_rate': {
    name: '积分充值比例',
    description: '1元=多少积分',
  },
  'points.token_rate': {
    name: '积分Token兑换比例',
    description: '1积分=多少Tokens',
  },
  'points.split_rates': {
    name: '资料下载分成比例',
    description: '创作者与平台积分分成比例',
  },
  'token.enabled': {
    name: 'Token购买开关',
    description: '启用/禁用Token购买',
  },
  'points.withdraw_min': {
    name: '最低提现积分',
    description: '用户提现所需最低积分',
  },
  'points.withdraw_rate': {
    name: '积分提现比例',
    description: '多少积分=1元',
  },
};

// #[202608301900] 各配置Key的 JSON 字段中文说明（仅 UI 展示，不改动存储的 JSON 键名）
// key: config_key；value: JSON 字段名 → 中文说明
// 核心原则：配置值存储的是程序可解析的 JSON，键名不能直接汉化，否则代码无法读取；
// 编辑弹窗通过本表在 UI 层展示字段含义，帮助用户理解每个字段的用途。
export const TRADE_CONFIG_FIELD_LABELS: Record<string, Record<string, string>> = {
  'brand.match_weights': {
    rating: '评分权重',
    total_paid: '累计付费金额权重',
    view_count: '曝光次数权重',
    order_count: '成单次数权重',
    priority_level: '付费等级权重',
  },
  'points.recharge_rate': {
    rate: '兑换比例（1元=积分）',
  },
  'points.token_rate': {
    rate: '兑换比例（1积分=Tokens）',
  },
  'points.split_rates': {
    creator_rate: '创作者分成比例',
    platform_rate: '平台分成比例',
  },
  'points.withdraw_rate': {
    rate: '提现比例（积分=1元）',
  },
  'points.withdraw_min': {
    min: '最低提现积分',
  },
  'membership.default_discount': {
    discount: '默认折扣率',
  },
  'payment.order_expire_minutes': {
    minutes: '订单过期分钟数',
  },
  'payment.default_method': {
    method: '默认支付方式',
  },
  'mall.cash_enabled': {
    enabled: '是否启用',
  },
  'payment.wechat.enabled': {
    enabled: '是否启用',
  },
  'payment.wechat.config': {
    appid: 'AppID',
    mchid: '商户号',
    apiV3Key: 'APIv3 密钥',
    serialNo: '证书序列号',
    privateKey: '商户私钥',
    notifyUrl: '回调地址',
    platformPublicKey: '平台证书公钥',
  },
  'payment.alipay.enabled': {
    enabled: '是否启用',
  },
  'token.enabled': {
    enabled: '是否启用',
  },
};
