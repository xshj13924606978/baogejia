/**
 * 产品/价格库相关文案常量 —— 唯一文案来源
 * 页面内禁止硬编码可见文案，全部从本文件读取。
 * 当前覆盖：产品导入判重弹窗（#20260820-1130-6）
 */

export const PRODUCT_TEXT = {
  // 导入判重弹窗（价格库 price-library.tsx + admin 导入页 共用文案）
  importDuplicate: {
    title: '检测到重复产品',
    // 价格库弹窗描述（高亮数字由 JSX 渲染，拆分三段）
    priceLibraryDetectedPrefix: '本次导入检测到',
    priceLibraryDetectedSuffix:
      '条与现有产品重复的数据（按后台判重配置判断），尚未导入，请选择处理方式。',
    skipDescription:
      '「跳过重复」将仅导入新产品；「覆盖更新」将把重复产品提交管理员审核，审核通过后才会用本次导入的数据覆盖更新产品。',
    reasonLabel: '覆盖原因',
    reasonRequiredMark: '*',
    reasonPlaceholder: '请说明覆盖更新的原因',
    reasonHint: '提交后不会立即生效，需管理员审核通过后才会覆盖更新产品数据。',
    skipButton: '跳过重复',
    overwriteButton: '覆盖更新',
    submitOverwriteButton: '确认提交覆盖申请',
    cancelButton: '取消',
    submitting: '提交中...',
    // 校验与提示
    reasonRequiredToast: '请填写覆盖更新的原因（管理员审核需要）',
    submittedMessage: (count: number) =>
      `已提交 ${count} 条覆盖更新申请，等待管理员审核通过后生效`,
    // admin 导入页弹窗专属文案
    adminDialogDescription: (count: number) =>
      `本次导入发现 ${count} 条重复产品，请选择处理方式。`,
    adminNewProductsMessage: (count: number) => `另有 ${count} 条新产品可导入。`,
    adminReasonLabel: '覆盖原因（选择覆盖时必填）',
    adminReasonPlaceholder: '请说明覆盖原因，提交后将由管理员审核通过后才生效',
    adminOverwriteButton: '覆盖重复（提交审核）',
    adminReasonRequiredToast: '请填写覆盖原因',
    // 重复产品对比表头
    duplicateTable: {
      name: '产品名称',
      model: '型号',
      brand: '品牌',
      category: '分类',
      existingPrice: '现有指导价',
      newPrice: '新指导价',
    },
  },

  // 价格库导入进度文案（price-library.tsx）
  importProgress: {
    preparing: '正在准备导入...',
    // 判重预检进行中提示（同步贡献中心上传价格表 #20260821-2100 逻辑，#[20260822-1000]）
    prechecking: '正在检测与现有产品的重复情况，请稍候…',
    precheckingTitle: '正在检测重复产品',
    importing: (current: number, total: number) => `正在导入第 ${current}/${total} 条...`,
    skipped: (count: number) => `，跳过 ${count} 条重复`,
    failed: (count: number) => `，${count} 条失败`,
    completed: (successCount: number, suffix: string) =>
      `导入完成！成功 ${successCount} 条${suffix}`,
    completedEmpty: '导入完成，本次未新增或更新任何产品。',
    completedAllDuplicate: (count: number, mode: 'skip' | 'overwrite') =>
      mode === 'overwrite'
        ? `本次导入的 ${count} 条产品均与现有产品重复，已提交覆盖更新申请，等待管理员审核。`
        : `本次导入的 ${count} 条产品均与现有产品重复，已自动跳过。`,
    completedAllFailed: (count: number) =>
      `导入完成，${count} 条全部失败，请查看下方失败原因。`,
    completedWithApproval: (count: number) =>
      `已提交 ${count} 条覆盖更新申请，已进入管理员审批流程，审核通过后才会更新产品数据。`,
    failedWithError: (message: string) => `导入失败：${message}`,
    unknownError: '未知错误',
  },

  // admin 产品导入页文案（src/app/admin/products/import/page.tsx）
  adminImport: {
    mappingRequiredToast: '请至少映射一个字段',
    mappingNameRequiredToast: '请映射"产品名称"字段（必填）',
    importFailedToast: '导入失败',
    networkErrorToast: '网络错误，请重试',
    importCompletedToast: (success: number, total: number) =>
      `导入完成：成功 ${success}/${total} 条`,
  },
} as const;

export type ProductText = typeof PRODUCT_TEXT;
