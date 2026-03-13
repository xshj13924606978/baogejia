import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';

interface UsePermissionReturn {
  hasPermission: boolean;
  loading: boolean;
  checkResult: {
    allowed: boolean;
    requiredLevel: number;
    requiredPoints: number;
    userLevel: number;
    userPoints: number;
    message: string;
  } | null;
}

/**
 * 权限检查钩子
 *
 * @param moduleCode - 模块代码（可选）
 * @param apiPath - API路径（可选）
 * @param method - HTTP方法（可选）
 * @returns 权限检查结果
 *
 * @example
 * // 检查模块权限
 * const { hasPermission, loading } = usePermission('product.search');
 *
 * // 检查API权限
 * const { hasPermission, checkResult } = usePermission(undefined, '/api/admin/levels', 'GET');
 */
export const usePermission = (
  moduleCode?: string,
  apiPath?: string,
  method?: string
): UsePermissionReturn => {
  const { user } = useUser();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkResult, setCheckResult] = useState<UsePermissionReturn['checkResult']>(null);

  useEffect(() => {
    if (!user) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    const check = async () => {
      setLoading(true);
      try {
        if (moduleCode) {
          // 检查模块权限
          const res = await fetch(
            `/api/user/level/check-module?userId=${user.id}&moduleCode=${moduleCode}`
          );
          const data = await res.json();

          if (data.success) {
            setHasPermission(data.hasPermission);
          } else {
            setHasPermission(false);
          }
        } else if (apiPath && method) {
          // 检查API权限
          const res = await fetch(
            `/api/user/level/check-api?userId=${user.id}&apiPath=${apiPath}&method=${method}`
          );
          const data = await res.json();

          if (data.success) {
            setHasPermission(data.result.allowed);
            setCheckResult(data.result);
          } else {
            setHasPermission(false);
          }
        }
      } catch (error) {
        console.error('权限检查失败:', error);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user?.id, moduleCode, apiPath, method]);

  return { hasPermission, loading, checkResult };
};
