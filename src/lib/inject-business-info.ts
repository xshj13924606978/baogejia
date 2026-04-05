/**
 * 商务信息注入工具
 * 将用户的商务信息和选中客户信息注入到 AI 生成内容中
 */

export interface BusinessProfile {
  companyName?: string;
  companyAddress?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccount?: string;
}

export interface CustomerInfo {
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  projectName?: string;
}

/**
 * 构建供应方上下文信息（用于 system prompt）
 */
export function buildSupplierContext(info: BusinessProfile): string {
  if (!info || !info.companyName) return '';
  return `
【供应方信息】
公司名称：${info.companyName || '待填写'}
联系人：${info.contactPerson || '待填写'}
联系电话：${info.phone || '待填写'}
电子邮箱：${info.email || '待填写'}
公司地址：${info.companyAddress || '待填写'}
税号：${info.taxNumber || '待填写'}
开户行：${info.bankName || '待填写'}
银行账号：${info.bankAccount || '待填写'}
`;
}

/**
 * 构建客户/采购方上下文信息（用于 system prompt）
 */
export function buildCustomerContext(info: CustomerInfo): string {
  if (!info || !info.companyName) return '';
  return `
【采购方/客户信息】
客户名称：${info.companyName || '待填写'}
联系人：${info.contactPerson || '待填写'}
联系电话：${info.phone || '待填写'}
电子邮箱：${info.email || '待填写'}
客户地址：${info.address || '待填写'}
项目名称：${info.projectName || ''}
`;
}

/**
 * 替换内容中的商务信息占位符
 */
export function injectBusinessInfo(content: string, info: BusinessProfile): string {
  if (!info) return content;

  const now = new Date();
  const replacements: Record<string, string> = {
    '{{公司名称}}': info.companyName || '',
    '{{公司地址}}': info.companyAddress || '',
    '{{联系人}}': info.contactPerson || '',
    '{{联系电话}}': info.phone || '',
    '{{邮箱}}': info.email || '',
    '{{税号}}': info.taxNumber || '',
    '{{开户行}}': info.bankName || '',
    '{{账号}}': info.bankAccount || '',
    '{{日期}}': now.toLocaleDateString('zh-CN'),
    '{{报价单号}}': `QT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
  };

  let result = content;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

/**
 * 生成报价单号
 */
export function generateQuoteNumber(): string {
  const now = new Date();
  return `QT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}
