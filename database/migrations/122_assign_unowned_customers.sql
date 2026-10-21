-- ============================================================
-- 迁移: 122_assign_unowned_customers
-- 对话窗: [#20260831-1430-1] 客户数据归属修复（审计 P0-2）
-- 说明:
--   客户归属存储在 customers.metadata->>'user_id'（jsonb）。
--   历史数据中存在未写入 user_id 的「无主客户」，旧接口对任意登录用户
--   返回这些无主客户（且可删可改），构成跨用户数据泄露。
--
--   本迁移为无主客户补写归属，优先级（只用真实存在的关联数据推断）：
--     1. 报价单反查：quotes.customer_info->>'name' / ->>'customer_name'
--        与客户 company_name 相同 → 取最近一单的 quotes.user_id
--     2. 跟进记录反查：customer_followups.customer_id → 取最近一条的 user_id
--     3. 兜底：平台超管（roles.is_super_admin → is_admin，取最早注册者），
--        保证数据不丢、不留在「无主」状态（无主客户在接口层仅管理员可见）
--
--   关联一致性：报价单通过 customer_info->>'name' 与客户 company_name 关联，
--   本迁移沿用同一口径反查归属，不会改写报价单数据；客户归属不依赖用户
--   生命周期（无外键级联），用户注销/禁用后客户记录与归属保持不变。
--
-- 幂等性: 仅更新 metadata->>'user_id' IS NULL 的客户；索引使用 IF NOT EXISTS。
--         可重复执行，第二次执行影响行数为 0。
-- 执行方式: Supabase SQL Editor 或 exec_sql(sql_query)
--           （不使用 BEGIN/COMMIT，便于通过 Supabase REST 应用）
-- ============================================================

DO $$
DECLARE
  v_by_quote     INTEGER := 0;
  v_by_followup  INTEGER := 0;
  v_by_fallback  INTEGER := 0;
  v_remaining    INTEGER := 0;
  v_fallback_user UUID;
BEGIN
  -- ----------------------------------------------------------
  -- 1. 从报价单反查归属（取最近一单的创建者）
  -- ----------------------------------------------------------
  IF to_regclass('public.quotes') IS NOT NULL THEN
    WITH inferred AS (
      SELECT
        c.id AS customer_id,
        (
          SELECT q.user_id
          FROM public.quotes q
          WHERE q.user_id IS NOT NULL
            AND (
              q.customer_info->>'name' = c.company_name
              OR q.customer_info->>'customer_name' = c.company_name
            )
          ORDER BY q.created_at DESC
          LIMIT 1
        ) AS owner_id
      FROM public.customers c
      WHERE (c.metadata->>'user_id') IS NULL
        AND c.company_name IS NOT NULL
    )
    UPDATE public.customers c
       SET metadata   = COALESCE(c.metadata, '{}'::jsonb)
                        || jsonb_build_object('user_id', i.owner_id::text),
           updated_at = now()
      FROM inferred i
     WHERE c.id = i.customer_id
       AND i.owner_id IS NOT NULL;

    GET DIAGNOSTICS v_by_quote = ROW_COUNT;
  ELSE
    RAISE NOTICE '[122] 步骤1 已跳过：quotes 表不存在';
  END IF;
  RAISE NOTICE '[122] 步骤1 由报价单推断归属: % 行', v_by_quote;

  -- ----------------------------------------------------------
  -- 2. 从客户跟进记录反查归属（取最近一条跟进人）
  -- ----------------------------------------------------------
  IF to_regclass('public.customer_followups') IS NOT NULL THEN
    WITH inferred AS (
      SELECT
        c.id AS customer_id,
        (
          SELECT f.user_id
          FROM public.customer_followups f
          WHERE f.customer_id = c.id
            AND f.user_id IS NOT NULL
          ORDER BY f.created_at DESC
          LIMIT 1
        ) AS owner_id
      FROM public.customers c
      WHERE (c.metadata->>'user_id') IS NULL
    )
    UPDATE public.customers c
       SET metadata   = COALESCE(c.metadata, '{}'::jsonb)
                        || jsonb_build_object('user_id', i.owner_id::text),
           updated_at = now()
      FROM inferred i
     WHERE c.id = i.customer_id
       AND i.owner_id IS NOT NULL;

    GET DIAGNOSTICS v_by_followup = ROW_COUNT;
  ELSE
    RAISE NOTICE '[122] 步骤2 已跳过：customer_followups 表不存在';
  END IF;
  RAISE NOTICE '[122] 步骤2 由跟进记录推断归属: % 行', v_by_followup;

  -- ----------------------------------------------------------
  -- 3. 兜底：仍无归属的客户分配给平台超管（最早注册）
  --    roles 表（迁移 075）驱动；未应用时回退到常见管理员角色码
  -- ----------------------------------------------------------
  SELECT u.id
    INTO v_fallback_user
    FROM public.users u
    LEFT JOIN public.roles r
      ON r.code = u.role
   WHERE COALESCE(r.is_super_admin, false) = true
      OR COALESCE(r.is_admin, false) = true
      OR u.role IN (
           'super_admin', 'SUPER_ADMIN', '超级管理员',
           'admin', 'ADMIN', '管理员', '系统管理员', 'enterprise_admin'
         )
   ORDER BY COALESCE(r.is_super_admin, false) DESC, u.created_at ASC
   LIMIT 1;

  IF v_fallback_user IS NOT NULL THEN
    UPDATE public.customers c
       SET metadata   = COALESCE(c.metadata, '{}'::jsonb)
                        || jsonb_build_object('user_id', v_fallback_user::text),
           updated_at = now()
     WHERE (c.metadata->>'user_id') IS NULL;

    GET DIAGNOSTICS v_by_fallback = ROW_COUNT;
  ELSE
    RAISE NOTICE '[122] 步骤3 已跳过：未找到任何管理员账号，剩余无主客户保持 NULL（接口层仅管理员可见）';
  END IF;
  RAISE NOTICE '[122] 步骤3 兜底分配给超管: % 行（owner=%）', v_by_fallback, v_fallback_user;

  -- ----------------------------------------------------------
  -- 4. 归属查询索引（列表按 metadata->>user_id 过滤）
  -- ----------------------------------------------------------
  CREATE INDEX IF NOT EXISTS idx_customers_metadata_user_id
    ON public.customers ((metadata->>'user_id'));

  -- ----------------------------------------------------------
  -- 5. 校验输出
  -- ----------------------------------------------------------
  SELECT count(*) INTO v_remaining
    FROM public.customers
   WHERE (metadata->>'user_id') IS NULL;

  RAISE NOTICE '============================================';
  RAISE NOTICE '[122] 客户归属修复完成';
  RAISE NOTICE '  由报价单推断:   % 行', v_by_quote;
  RAISE NOTICE '  由跟进记录推断: % 行', v_by_followup;
  RAISE NOTICE '  兜底分配超管:   % 行', v_by_fallback;
  RAISE NOTICE '  剩余无主客户:   % 行（无管理员账号时才会 >0）', v_remaining;
  RAISE NOTICE '============================================';
END $$;
