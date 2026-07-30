import { describe, it, expect } from 'vitest';

describe('session-token top-level guard', () => {
  const originalSecret = process.env.SESSION_TOKEN_SECRET;

  afterEach(() => {
    process.env.SESSION_TOKEN_SECRET = originalSecret;
  });

  it('should throw when SESSION_TOKEN_SECRET is not set', async () => {
    delete process.env.SESSION_TOKEN_SECRET;

    // 动态 import 触发模块顶层检查
    await expect(
      () => import('@/lib/session-token')
    ).rejects.toThrow('[安全] 环境变量 SESSION_TOKEN_SECRET 未设置');
  });
});
