-- ============================================================
-- 迁移 124：系统管理与配置模块 P0 + P1 修复
-- 对话窗：#[20260831-1700]
-- 来源审计：#[202608311700]（第三轮：系统管理与配置模块）
--
-- 覆盖问题：
--   P0-1 禁用/删除用户 API 层生效（配合 auth-utils 校验 status/deleted_at）
--   P0-3 管理员改积分走原子 RPC（set_points_atomic 已具备，本迁移补流水对齐）
--   P0-4 管理员写操作审计日志 → admin_audit_logs 表
--   P1-1 积分流水 point_logs 补写 reference_id（重写 6 个原子函数）
--   P1-3 新建正确类型的审计日志表（替代类型错配的 permission_audit_logs）
--   P1-6 全局异常日志 → system_error_logs 表
--   P1-7 统一配置读取 → unified_config 视图
--   P1-8 用户软删除 → users.deleted_at + soft_delete_user()
--   P1-10 user_logs.session_id 由 uuid 放宽为 text（原类型导致无法写入）
--   P1-11 SMTP 密码加密存储 → smtp_password_encrypted / password_encrypted
--
-- 幂等：全部使用 IF NOT EXISTS / CREATE OR REPLACE，可重复执行
-- ============================================================

-- ============================================================
-- 1. 管理员审计日志表（P0-4 / P1-3）
--    说明：permission_audit_logs 的 user_id 为 bigint，与 users.id(uuid)
--    类型不符且存量为脏数据，无法关联真实用户。本表采用正确类型，
--    作为 #[20260831-1700] 起管理员写操作的唯一审计落点。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid,                       -- 操作人（管理员）users.id
    user_email      text,                       -- 操作人邮箱快照
    user_role       text,                       -- 操作人角色快照
    action          varchar(32)  NOT NULL,      -- CREATE/UPDATE/DELETE/GRANT/REVOKE/VIEW/LOGIN_FAIL 等
    resource_type   varchar(128) NOT NULL,      -- 资源类型：user/config/points/role/...
    resource_id     text,                       -- 资源标识
    old_value       jsonb,                      -- 变更前快照
    new_value       jsonb,                      -- 变更后快照
    changes         jsonb,                      -- 字段级差异 {field:{old,new}}
    reason          text,                       -- 操作说明
    ip_address      inet,
    user_agent      text,
    status          varchar(16)  NOT NULL DEFAULT 'success',  -- success/failure
    error_message   text,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.admin_audit_logs IS '管理员操作审计日志（#[20260831-1700]）：user_id 为 uuid，正确关联 users.id';
COMMENT ON COLUMN public.admin_audit_logs.action IS '操作类型：CREATE/UPDATE/DELETE/GRANT/REVOKE/VIEW/LOGIN_FAIL/SOFT_DELETE 等';
COMMENT ON COLUMN public.admin_audit_logs.resource_type IS '资源类型：user/config/points/role/notification/...';

CREATE INDEX IF NOT EXISTS idx_admin_audit_user_id    ON public.admin_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action     ON public.admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource   ON public.admin_audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_status     ON public.admin_audit_logs (status);

-- RLS：仅 service_role 可写（与 user_logs 一致），避免 anon 伪造审计
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='admin_audit_logs' AND policyname='service_role_full_access'
    ) THEN
        CREATE POLICY service_role_full_access ON public.admin_audit_logs
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ============================================================
-- 2. 系统异常日志表（P1-6）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level          varchar(16) NOT NULL DEFAULT 'error',  -- error/warn/fatal
    source         varchar(64),                            -- 来源：api/route/lib/scheduler
    error_type     varchar(128),                           -- 异常类型名
    message        text        NOT NULL,
    stack          text,                                   -- 异常堆栈
    request_method varchar(16),
    request_path   text,
    status_code    integer,
    user_id        uuid,
    ip_address     inet,
    user_agent     text,
    metadata       jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_error_logs IS '系统异常日志（#[20260831-1700] P1-6）：全局异常捕获落库，替代仅 console.error';

CREATE INDEX IF NOT EXISTS idx_sys_err_created_at ON public.system_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_err_level      ON public.system_error_logs (level);
CREATE INDEX IF NOT EXISTS idx_sys_err_source     ON public.system_error_logs (source);
CREATE INDEX IF NOT EXISTS idx_sys_err_user_id    ON public.system_error_logs (user_id);

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='system_error_logs' AND policyname='service_role_full_access'
    ) THEN
        CREATE POLICY service_role_full_access ON public.system_error_logs
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ============================================================
-- 3. 用户软删除（P1-8）
-- ============================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.users.deleted_at IS '软删除时间（NULL=未删除）。#[20260831-1700] P1-8：删除用户改为软删除，保留业务数据';
COMMENT ON COLUMN public.users.deleted_by IS '执行删除的管理员 users.id';

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users (deleted_at) WHERE deleted_at IS NOT NULL;

/**
 * 软删除用户（P1-8）
 *  - 打 deleted_at / deleted_by 标记，status 置 'deleted'
 *  - 递增 session_version → 已签发 token 全部失效（P0-1 联动）
 *  - 释放 email / username 唯一键（加 .deleted.<时间戳> 后缀），允许该标识重新注册
 *  - 清理 OAuth 绑定（避免 openid 被已删账号长期占用导致无法重新绑定）
 *  - 保留全部业务数据（quotes / conversations / point_logs / ...）
 */
CREATE OR REPLACE FUNCTION public.soft_delete_user(
    p_user_id     uuid,
    p_operator_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user     RECORD;
    v_suffix   TEXT;
    v_operator uuid;
BEGIN
    SELECT id, email, username, status, deleted_at
      INTO v_user
      FROM users
     WHERE id = p_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    IF v_user.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'reason', '用户已处于删除状态', 'already_deleted', true);
    END IF;

    -- deleted_by 为 uuid + FK users.id：非法 UUID 置空避免外键失败
    BEGIN
        v_operator := p_operator_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_operator := NULL;
    END;
    IF v_operator IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = v_operator) THEN
        v_operator := NULL;
    END IF;

    v_suffix := '.deleted.' || to_char(now(), 'YYYYMMDDHH24MISS');

    UPDATE users
       SET deleted_at   = now(),
           deleted_by   = v_operator,
           status       = 'deleted',
           -- 递增会话版本，使全部已签发 token 立即失效
           session_version = COALESCE(session_version, 0) + 1,
           -- 释放唯一键，允许同一邮箱/用户名重新注册
           email        = COALESCE(email, '')    || v_suffix,
           username     = COALESCE(username, '') || v_suffix,
           updated_at   = now()
     WHERE id = p_user_id;

    -- 清理第三方绑定（表存在时才清理）
    IF to_regclass('public.user_oauth_bindings') IS NOT NULL THEN
        DELETE FROM user_oauth_bindings WHERE user_id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'deleted_at', now(),
        'session_invalidated', true
    );
END;
$function$;

COMMENT ON FUNCTION public.soft_delete_user(uuid, uuid) IS '软删除用户：保留数据 + 会话失效 + 释放唯一键（#[20260831-1700] P1-8）';

-- ============================================================
-- 4. user_logs.session_id 放宽为 text（P1-10）
--    原为 uuid 类型，而会话标识由 session token 派生（32 位 hex 字符串），
--    类型不匹配导致插入被静默拒绝/回退为 NULL → 131/134 条 session_id 为空。
-- ============================================================
ALTER TABLE public.user_logs ALTER COLUMN session_id TYPE text USING session_id::text;

COMMENT ON COLUMN public.user_logs.session_id IS '会话标识（由 session token 派生的稳定 32 位 hex），用于串联同一会话的操作序列（#[20260831-1700] P1-10）';

CREATE INDEX IF NOT EXISTS idx_user_logs_session_id ON public.user_logs (session_id) WHERE session_id IS NOT NULL;

-- ============================================================
-- 5. SMTP 密码加密存储（P1-11）
--    新增密文列与加密标记；应用侧写入密文后，明文列置空。
--    保留 smtp_password 列用于平滑过渡（双读：优先密文，回退明文）。
-- ============================================================
ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS smtp_password_encrypted text;
ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS password_encrypted     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_settings.smtp_password_encrypted IS 'SMTP 密码密文（AES-256-GCM，Base64），#[20260831-1700] P1-11';
COMMENT ON COLUMN public.email_settings.password_encrypted IS 'smtp_password_encrypted 是否为有效密文';

-- ============================================================
-- 6. 积分原子函数：point_logs 补写 reference_id（P1-1）
--    根因：6 个函数的 INSERT INTO point_logs 均未包含 reference_id，
--    而 point_records 有写 → 双表脱节、审计追溯与幂等失效。
--    修复：point_logs 与 point_records 使用同一 reference_id。
-- ============================================================

-- 6.1 add_points_atomic
CREATE OR REPLACE FUNCTION public.add_points_atomic(
    p_user_id uuid, p_points integer, p_type text DEFAULT 'earn'::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_old_points INTEGER; v_new_points INTEGER;
    v_old_total  INTEGER; v_new_total  INTEGER;
    v_type TEXT; v_desc TEXT;
    v_new_level INTEGER; v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已处理', 'new_points', v_old_points);
        END IF;
    END IF;

    SELECT COALESCE((metadata->>'points')::INTEGER, 0),
           COALESCE((metadata->>'total_points')::INTEGER, 0)
      INTO v_old_points, v_old_total
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF v_old_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    v_new_points := v_old_points + p_points;
    v_new_total  := v_old_total + CASE WHEN p_points > 0 THEN p_points ELSE 0 END;
    v_type := COALESCE(p_type, CASE WHEN p_points > 0 THEN 'earn' ELSE 'spend' END);
    v_desc := COALESCE(p_description, CASE WHEN p_points > 0 THEN '积分增加' ELSE '积分扣除' END);

    UPDATE users
       SET metadata = jsonb_set(
               jsonb_set(
                   jsonb_set(COALESCE(metadata, '{}'::jsonb), '{points}', to_jsonb(v_new_points)),
                   '{total_points}', to_jsonb(v_new_total)
               ),
               '{last_points_update}', to_jsonb(NOW()::text)
           ),
           points = v_new_points,
           total_points = v_new_total,
           updated_at = NOW()
     WHERE id = p_user_id;

    -- 流水双写（P1-1：point_logs 补写 reference_id，与 point_records 对齐）
    INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_points, p_reference_id);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_points, p_reference_id);

    SELECT COALESCE(MAX(level), 1) INTO v_new_level FROM level_definitions WHERE required_points <= v_new_points;
    SELECT COALESCE(MIN(required_points), v_new_points) INTO v_next_level_points FROM level_definitions WHERE required_points > v_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, v_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'new_points', v_new_points,
                              'new_total_points', v_new_total, 'level', v_new_level);
END;
$function$;

-- 6.2 deduct_points_atomic
CREATE OR REPLACE FUNCTION public.deduct_points_atomic(
    p_user_id uuid, p_points integer, p_type text DEFAULT 'spend'::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_current_points INTEGER; v_new_points INTEGER;
    v_type TEXT; v_desc TEXT;
    v_new_level INTEGER; v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records WHERE user_id = p_user_id AND reference_id = p_reference_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已处理', 'new_points', v_current_points);
        END IF;
    END IF;

    SELECT COALESCE((metadata->>'points')::INTEGER, 0) INTO v_current_points
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF v_current_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在', 'new_points', 0);
    END IF;

    IF v_current_points < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '积分不足', 'new_points', v_current_points);
    END IF;

    v_new_points := v_current_points - p_points;
    v_type := COALESCE(p_type, 'spend');
    v_desc := COALESCE(p_description, '积分扣除');

    UPDATE users
       SET metadata = jsonb_set(
               jsonb_set(COALESCE(metadata, '{}'::jsonb), '{points}', to_jsonb(v_new_points)),
               '{last_points_update}', to_jsonb(NOW()::text)
           ),
           points = v_new_points,
           updated_at = NOW()
     WHERE id = p_user_id;

    -- 流水双写（负数表示扣除；P1-1 补写 reference_id）
    INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_points, p_reference_id);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_points, p_reference_id);

    SELECT COALESCE(MAX(level), 1) INTO v_new_level FROM level_definitions WHERE required_points <= v_new_points;
    SELECT COALESCE(MIN(required_points), v_new_points) INTO v_next_level_points FROM level_definitions WHERE required_points > v_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, v_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'new_points', v_new_points, 'level', v_new_level);
END;
$function$;

-- 6.3 set_points_atomic（管理员设置积分，P0-3 依赖）
CREATE OR REPLACE FUNCTION public.set_points_atomic(
    p_user_id uuid, p_new_points integer, p_type text DEFAULT NULL::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_old_points INTEGER; v_diff INTEGER;
    v_type TEXT; v_desc TEXT;
    v_new_level INTEGER; v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records WHERE user_id = p_user_id AND reference_id = p_reference_id LIMIT 1;
        IF FOUND THEN
            SELECT COALESCE((metadata->>'points')::integer, 0) INTO v_old_points FROM users WHERE id = p_user_id;
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已处理', 'new_points', v_old_points);
        END IF;
    END IF;

    SELECT COALESCE((metadata->>'points')::integer, 0) INTO v_old_points
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF v_old_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    v_diff := p_new_points - v_old_points;
    v_type := COALESCE(p_type, CASE WHEN v_diff > 0 THEN 'admin_grant' WHEN v_diff < 0 THEN 'admin_deduct' ELSE 'admin_set' END);
    v_desc := COALESCE(p_description, '管理员设置积分');

    UPDATE users
       SET metadata = jsonb_set(
               jsonb_set(
                   jsonb_set(COALESCE(metadata, '{}'::jsonb), '{points}', to_jsonb(p_new_points)),
                   '{total_points}', to_jsonb(
                       CASE WHEN v_diff > 0 THEN COALESCE((metadata->>'total_points')::integer, 0) + v_diff
                            ELSE COALESCE((metadata->>'total_points')::integer, 0) END
                   )
               ),
               '{last_points_update}', to_jsonb(NOW()::text)
           ),
           points = p_new_points,
           updated_at = NOW()
     WHERE id = p_user_id;

    IF v_diff <> 0 THEN
        -- 流水双写（P1-1 补写 reference_id）
        INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
        VALUES (p_user_id, v_diff, v_type, v_desc, p_new_points, p_reference_id);

        INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
        VALUES (p_user_id, v_diff, v_type, v_desc, p_new_points, p_reference_id);
    END IF;

    SELECT COALESCE(MAX(level), 1) INTO v_new_level FROM level_definitions WHERE required_points <= p_new_points;
    SELECT COALESCE(MIN(required_points), p_new_points) INTO v_next_level_points FROM level_definitions WHERE required_points > p_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, p_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, p_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'old_points', v_old_points,
                              'new_points', p_new_points, 'diff', v_diff, 'level', v_new_level);
END;
$function$;

-- 6.4 freeze_points_atomic
CREATE OR REPLACE FUNCTION public.freeze_points_atomic(
    p_user_id uuid, p_points integer, p_type text DEFAULT 'withdraw_freeze'::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_available INTEGER; v_frozen INTEGER;
    v_new_available INTEGER; v_new_frozen INTEGER;
    v_type TEXT; v_desc TEXT; v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分必须为正整数');
    END IF;
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已冻结');
        END IF;
    END IF;

    SELECT COALESCE(points,0), COALESCE(frozen_points,0) INTO v_available, v_frozen
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;
    IF v_available < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '可用积分不足');
    END IF;

    v_new_available := v_available - p_points;
    v_new_frozen    := v_frozen + p_points;
    v_type := COALESCE(p_type, 'withdraw_freeze');
    v_desc := COALESCE(p_description, '积分冻结');

    UPDATE users
       SET points = v_new_available,
           frozen_points = v_new_frozen,
           metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb), '{points}', to_jsonb(v_new_available)),
           updated_at = NOW()
     WHERE id = p_user_id;

    -- 流水双写（P1-1 补写 reference_id）
    INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_available, p_reference_id);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_available, p_reference_id);

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'available_points', v_new_available, 'frozen_points', v_new_frozen);
END;
$function$;

-- 6.5 unfreeze_points_atomic
CREATE OR REPLACE FUNCTION public.unfreeze_points_atomic(
    p_user_id uuid, p_points integer, p_type text DEFAULT 'withdraw_refund'::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_available INTEGER; v_frozen INTEGER;
    v_new_available INTEGER; v_new_frozen INTEGER;
    v_type TEXT; v_desc TEXT; v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '解冻积分必须为正整数');
    END IF;
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已解冻');
        END IF;
    END IF;

    SELECT COALESCE(points,0), COALESCE(frozen_points,0) INTO v_available, v_frozen
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;
    IF v_frozen < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分不足，无法解冻');
    END IF;

    v_new_available := v_available + p_points;
    v_new_frozen    := v_frozen - p_points;
    v_type := COALESCE(p_type, 'withdraw_refund');
    v_desc := COALESCE(p_description, '积分解冻退回');

    UPDATE users
       SET points = v_new_available,
           frozen_points = v_new_frozen,
           metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb), '{points}', to_jsonb(v_new_available)),
           updated_at = NOW()
     WHERE id = p_user_id;

    -- 流水双写（P1-1 补写 reference_id）
    INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_available, p_reference_id);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_available, p_reference_id);

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'available_points', v_new_available, 'frozen_points', v_new_frozen);
END;
$function$;

-- 6.6 consume_frozen_points_atomic
CREATE OR REPLACE FUNCTION public.consume_frozen_points_atomic(
    p_user_id uuid, p_points integer, p_type text DEFAULT 'withdraw'::text,
    p_description text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_available INTEGER; v_frozen INTEGER; v_new_frozen INTEGER;
    v_type TEXT; v_desc TEXT; v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '扣减积分必须为正整数');
    END IF;
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已扣减');
        END IF;
    END IF;

    SELECT COALESCE(points,0), COALESCE(frozen_points,0) INTO v_available, v_frozen
      FROM users WHERE id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;
    IF v_frozen < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分不足，无法扣减');
    END IF;

    v_new_frozen := v_frozen - p_points;
    v_type := COALESCE(p_type, 'withdraw');
    v_desc := COALESCE(p_description, '冻结积分扣减');

    UPDATE users SET frozen_points = v_new_frozen, updated_at = NOW() WHERE id = p_user_id;

    -- 流水双写（P1-1 补写 reference_id）
    INSERT INTO point_logs (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_available, p_reference_id);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_available, p_reference_id);

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET points_balance = EXCLUDED.points_balance, updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('success', true, 'available_points', v_available, 'frozen_points', v_new_frozen);
END;
$function$;

-- ============================================================
-- 7. 历史流水回填（P1-1 存量修复）
--    point_logs 存量 45 条 reference_id 全为 NULL，与 point_records 通过
--    （user_id, points, type, balance_after, 时间邻近）关联回填。
--    仅在 point_logs.reference_id IS NULL 时写入，幂等可重复执行。
-- ============================================================
CREATE OR REPLACE FUNCTION public.backfill_point_logs_reference_id()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    WITH paired AS (
        SELECT l.id AS log_id, r.reference_id
          FROM point_logs l
          JOIN LATERAL (
              SELECT r.reference_id
                FROM point_records r
               WHERE r.user_id = l.user_id
                 AND r.points  = l.points
                 AND r.type IS NOT DISTINCT FROM l.type
                 AND r.balance_after IS NOT DISTINCT FROM l.balance_after
                 AND r.reference_id IS NOT NULL
                 AND r.created_at BETWEEN l.created_at - INTERVAL '5 seconds'
                                      AND l.created_at + INTERVAL '5 seconds'
               ORDER BY r.created_at
               LIMIT 1
          ) r ON true
         WHERE l.reference_id IS NULL
    )
    UPDATE point_logs l
       SET reference_id = p.reference_id
      FROM paired p
     WHERE l.id = p.log_id
       AND l.reference_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$function$;

COMMENT ON FUNCTION public.backfill_point_logs_reference_id() IS '回填 point_logs 历史缺失的 reference_id（#[20260831-1700] P1-1 存量修复，幂等）';

-- point_logs.reference_id 查询索引（审计追溯与幂等查询）
CREATE INDEX IF NOT EXISTS idx_point_logs_reference_id ON public.point_logs (reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================
-- 8. 统一配置视图（P1-7）
--    双配置源（site_config 49 + trade_config 22）统一读取入口。
--    trade_config.config_value 为 jsonb，统一转 text 输出。
--    本视图仅用于「读」，写入仍按各自归属表进行（避免破坏既有写入逻辑）。
-- ============================================================
CREATE OR REPLACE VIEW public.unified_config AS
SELECT
    s.config_key,
    s.config_value::text      AS config_value,
    COALESCE(s.config_type, 'string') AS config_type,
    COALESCE(s.category, 'general')   AS category,
    s.description,
    COALESCE(s.is_public, false)      AS is_public,
    true                      AS is_active,
    s.updated_at,
    'site_config'::text       AS source_table
FROM public.site_config s
UNION ALL
SELECT
    t.config_key,
    t.config_value::text      AS config_value,
    COALESCE(t.config_type, 'json')   AS config_type,
    COALESCE(t.category, 'system')    AS category,
    t.description,
    false                     AS is_public,
    COALESCE(t.is_active, true)       AS is_active,
    t.updated_at,
    'trade_config'::text      AS source_table
FROM public.trade_config t;

COMMENT ON VIEW public.unified_config IS '统一配置读取视图（#[20260831-1700] P1-7）：合并 site_config 与 trade_config，消除双源读取分歧';

-- ============================================================
-- 9. 审计/异常日志清理（配合既有 cleanup_old_user_logs 90 天策略）
--    默认保留 180 天，由 scheduler 每日调用。
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_system_logs(p_retention_days integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_audit_deleted  INTEGER := 0;
    v_error_deleted  INTEGER := 0;
BEGIN
    DELETE FROM admin_audit_logs  WHERE created_at < now() - (p_retention_days || ' days')::interval;
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM system_error_logs WHERE created_at < now() - (p_retention_days || ' days')::interval;
    GET DIAGNOSTICS v_error_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'admin_audit_logs_deleted',  v_audit_deleted,
        'system_error_logs_deleted', v_error_deleted
    );
END;
$function$;

COMMENT ON FUNCTION public.cleanup_old_system_logs(integer) IS '清理过期审计/异常日志（默认保留 180 天，#[20260831-1700] P1-6/P0-4 配套）';

-- ============================================================
-- 迁移完成标记（便于校验脚本核查）
-- ============================================================
COMMENT ON TABLE public.admin_audit_logs  IS '管理员操作审计日志（迁移 124 / #[20260831-1700]）';
COMMENT ON TABLE public.system_error_logs IS '系统异常日志（迁移 124 / #[20260831-1700]）';
