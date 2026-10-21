/**
 * 认证页面文案常量 —— 唯一文案来源
 * 页面内禁止硬编码可见文案，全部从本文件读取。
 * 当前覆盖：登录页 /login（#20260820-1430 起）、注册页 /register、完善信息 /complete-profile（#20260820-1600 起）
 */

export const LOGIN_TEXT = {
  // 标题区
  logoChar: '报',
  cardTitle: '欢迎回来',
  subtitlePhone: '使用手机号+验证码登录',
  subtitlePassword: '使用用户名、姓名、邮箱或手机号+密码登录',
  subtitleQrcode: '正在打开微信授权二维码...',

  // 登录方式 Tab
  tabPhone: '手机验证码',
  tabPassword: '密码登录',
  tabQrcode: '扫码登录',

  // 手机验证码登录表单
  phoneLabel: '手机号',
  phonePlaceholder: '请输入11位手机号',
  phoneError: '请输入正确的11位手机号',
  codeLabel: '验证码',
  codePlaceholder: '6位验证码',
  sendCodeButton: '获取验证码',
  phoneLoginHint: '未注册的手机号验证后将自动创建账号',
  phoneSubmit: '手机号验证码登录',

  // 密码登录表单
  accountLabel: '账号',
  accountPlaceholder: '请输入用户名、姓名、邮箱或手机号',
  accountError: '请输入正确的用户名、姓名、邮箱或手机号',
  accountHint: '支持用户名、姓名、邮箱或手机号登录',
  passwordLabel: '密码',
  passwordPlaceholder: '请输入密码',
  passwordSubmit: '登录',

  // 通用按钮态
  submitting: '登录中...',

  // 第三方登录
  thirdPartyDivider: '其他登录方式',

  // 底部入口
  registerLink: '还没有账号？立即注册 →',
  enterpriseEntry: '企业服务入口',

  // 扫码登录页
  wechatScan: '微信扫码',
  back: '返回',

  // Toast / 错误提示文案
  toast: {
    phoneRequired: '请输入手机号',
    phoneInvalid: '手机号格式不正确',
    codeRequired: '请输入验证码',
    codeSent: '验证码已发送',
    codeSentDesc: '请查收短信验证码',
    sendFailed: '发送失败',
    retryLater: '请稍后重试',
    networkError: '网络错误，请检查网络连接',
    loginSuccess: '登录成功',
    welcomeBack: '欢迎回来',
    loginFailed: '登录失败',
    codeWrong: '验证码错误或已过期',
    passwordRequired: '请输入密码',
    accountWrong: '账号或密码错误',
    nameNotSupported: '姓名暂不支持登录，请使用用户名、邮箱或手机号',
    // #[20260822-2028] 姓名登录支持：重名时提醒用户改用其他方式
    nameNotUnique: '存在多个相同姓名的用户，请使用用户名、邮箱或手机号登录',
  },
} as const;

export type LoginText = typeof LOGIN_TEXT;

/**
 * 注册页文案 —— /register（#20260820-1600 起，#20260821-0930 调整）
 * 仅手机号+验证码，注册后引导补全用户名/密码/微信绑定。
 */
export const REGISTER_TEXT = {
  logoChar: '报',
  cardTitle: '注册账号',
  cardDescription: '仅需手机号+验证码，30 秒完成注册',

  // 表单
  phoneLabel: '手机号',
  phonePlaceholder: '请输入11位手机号',
  phoneError: '请输入正确的11位手机号',
  codeLabel: '短信验证码',
  codePlaceholder: '6位验证码',
  sendCodeButton: '获取验证码',
  resendAfter: (seconds: number) => `${seconds}s后重发`,
  sendingCode: '发送中...',
  submit: '注 册',
  submitting: '注册中...',
  loading: '加载中...',

  // 邀请
  inviteBanner: '已通过好友邀请注册，注册成功后好友将获得积分奖励',
  inviteCode: (code: string) => `邀请码：${code}`,

  // 底部
  loginLink: '已有账号？',
  loginAction: '去登录',

  // Toast
  toast: {
    phoneRequired: '请输入手机号',
    phoneInvalid: '手机号格式不正确',
    codeRequired: '请输入短信验证码',
    codeSent: '验证码已发送',
    codeSentDesc: '请输入收到的短信验证码',
    sendFailed: '验证码发送失败',
    networkError: '网络错误，请检查网络连接',
    registerSuccess: '注册成功',
    registerSuccessDesc: '正在跳转完善账号信息...',
    registerFailed: '注册失败',
  },
} as const;

export type RegisterText = typeof REGISTER_TEXT;

/**
 * 完善信息页文案 —— /complete-profile（#20260820-1600 起，#[20260829-1700] 重构）
 * 注册/登录成功后的可选引导页：仅显示缺失项（用户名/姓名），
 * 密码与微信绑定已移除（密码在「账号安全」中设置，微信在扫码流程中自动绑定）。
 */
export const COMPLETE_PROFILE_TEXT = {
  logoChar: '报',
  cardTitle: '完善账号信息',
  cardDescription: '只需补充下方缺失项，填完即可直接进入系统',
  allCompleteTitle: '账号信息已完善',
  allCompleteDesc: '没有需要补充的信息，正在进入系统…',

  // 用户名
  usernameLabel: '用户名',
  usernameRequired: '用户名',
  usernamePlaceholder: '设置一个喜欢的用户名',
  usernameTaken: '用户名已被占用，请换一个',
  usernameHint: '字母、数字、下划线或中文，2-30 位',

  // 姓名
  nameLabel: '姓名',
  namePlaceholder: '请输入您的姓名',
  nameHint: '用于线下核验与客服联系',

  // 密码（账号安全页使用；完善信息页已不再展示）
  passwordLabel: '设置密码',
  passwordPlaceholder: '至少8位密码',
  passwordShort: '密码至少8位',
  passwordHint: '设置后可用「手机号/用户名+密码」登录',

  // 微信绑定（账号安全页使用；完善信息页已不再展示）
  wechatBindTitle: '绑定微信',
  wechatBindHint: '绑定后可用微信扫码登录',
  wechatBindButton: '绑定微信',
  wechatBound: '已绑定微信',
  wechatNotConfigured: '微信登录暂未开通，请稍后再试',

  // 操作
  submit: '保存并进入',
  skip: '跳过，稍后再完善',
  submitting: '保存中...',
  success: '账号信息已保存',
  skipSuccess: '可稍后在「账户中心」完善',

  // Toast
  toast: {
    saveSuccess: '保存成功',
    saveFailed: '保存失败，请重试',
    notLoggedIn: '请先登录后再完善信息',
  },
} as const;

export type CompleteProfileText = typeof COMPLETE_PROFILE_TEXT;

/**
 * 微信 OAuth 相关文案（#20260820-1600 起）
 */
export const WECHAT_TEXT = {
  notConfigured: '微信登录暂未开通，请使用手机号或密码登录',
  bindFail: '微信绑定失败，请稍后重试',
  bindAlready: '该微信已绑定其他账号',
  bindSuccess: '微信绑定成功',
  oauthUrlFail: '获取微信登录信息失败，请稍后重试',
  missingCredential: '微信登录未配置，请联系管理员',
  missingState: '登录状态校验失败，请重新发起扫码',
} as const;

export type WechatText = typeof WECHAT_TEXT;
