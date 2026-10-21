import { redirect } from 'next/navigation';

// 原「会员管理-字段权限」页面已合并到「等级权限配置」统一入口
export default function MembershipFieldsPage() {
  redirect('/admin/membership/level-permissions');
}
