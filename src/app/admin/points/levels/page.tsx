import { redirect } from 'next/navigation';

// 旧「等级权限配置」页面已迁移至会员管理统一入口
export default function PointsLevelsPage() {
  redirect('/admin/membership/level-permissions');
}
