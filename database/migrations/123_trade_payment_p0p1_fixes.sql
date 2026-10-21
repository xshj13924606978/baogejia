-- ============================================================
-- 迁移 123：交易与支付模块 P0 + P1 修复（#20260831-1600）
--
-- 对应审计报告 #[202608311500] 的以下问题：
--   P0-2 无到期定时任务 → 新增批量过期 SQL 函数，由 scheduler 每日调度
--   P0-3 提现收款账户可任意指定 → withdraw_accounts 增加实名 + 服务端归属校验
--   P1-5 会员升降级 → 新增会员差价流水表
--   P1-8 商城实物无收货地址 → mall_exchanges.shipping_address
--   P1-9 提现防刷 → trade_config 增加最大额度/每日次数/实名开关
--   P1-10 提现无冻结 → users.frozen_points + 三个原子冻结/解冻/扣减函数
--   P1-11 品牌入驻无资质 → brand_vendors 增加资质与审核留痕字段
--
-- 设计原则：
--   1. 全部幂等（IF NOT EXISTS / ON CONFLICT DO NOTHING），可重复执行
--   2. 不使用 BEGIN/COMMIT 包裹（生产通过 exec_sql RPC 执行，不支持事务包裹）
--   3. 冻结积分与 users.points / user_token_balance.points_balance 三处存储保持同步
-- ============================================================


-- ------------------------------------------------------------
-- 1. users.frozen_points：冻结积分余额
--    语义：users.points = 可用积分（冻结时已扣除）
--          users.frozen_points = 已冻结、待扣减的积分
--          用户「总持有」= users.points + users.frozen_points
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_points INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN users.frozen_points IS '冻结中积分（提现申请冻结，打款时真正扣除；拒绝/失败则解冻回 users.points）';

-- ------------------------------------------------------------
-- 2. withdraw_accounts：实名认证字段
-- ------------------------------------------------------------
ALTER TABLE withdraw_accounts ADD COLUMN IF NOT EXISTS real_name TEXT;
ALTER TABLE withdraw_accounts ADD COLUMN IF NOT EXISTS id_card_no TEXT;
ALTER TABLE withdraw_accounts ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
COMMENT ON COLUMN withdraw_accounts.real_name IS '实名姓名（提现实名认证）';
COMMENT ON COLUMN withdraw_accounts.id_card_no IS '身份证号（脱敏存储由应用层处理）';
COMMENT ON COLUMN withdraw_accounts.verified_at IS '实名认证通过时间';

-- ------------------------------------------------------------
-- 3. points_withdraw：冻结流水关联
-- ------------------------------------------------------------
ALTER TABLE points_withdraw ADD COLUMN IF NOT EXISTS freeze_reference_id TEXT;
COMMENT ON COLUMN points_withdraw.freeze_reference_id IS '冻结积分的幂等 reference_id（= withdraw_freeze_{id}），用于解冻/扣减时精确匹配';

CREATE INDEX IF NOT EXISTS idx_points_withdraw_user_status
  ON points_withdraw (user_id, status);
CREATE INDEX IF NOT EXISTS idx_points_withdraw_user_created
  ON points_withdraw (user_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. mall_exchanges：实物商品收货地址
-- ------------------------------------------------------------
ALTER TABLE mall_exchanges ADD COLUMN IF NOT EXISTS shipping_address JSONB;
COMMENT ON COLUMN mall_exchanges.shipping_address IS '实物收货地址 {receiver, phone, province, city, district, detail, zip_code}';

-- ------------------------------------------------------------
-- 5. brand_vendors：入驻资质 + 审核留痕
-- ------------------------------------------------------------
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS business_license TEXT;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS license_image_url TEXT;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS legal_person TEXT;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS qualifications JSONB;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE brand_vendors ADD COLUMN IF NOT EXISTS reject_reason TEXT;
COMMENT ON COLUMN brand_vendors.business_license IS '统一社会信用代码（18 位）';
COMMENT ON COLUMN brand_vendors.license_image_url IS '营业执照图片 URL';
COMMENT ON COLUMN brand_vendors.legal_person IS '法人代表姓名';
COMMENT ON COLUMN brand_vendors.qualifications IS '资质材料 JSON 数组 [{name, url, expired_at}]';
COMMENT ON COLUMN brand_vendors.reviewed_at IS '最近一次审核时间';
COMMENT ON COLUMN brand_vendors.reviewed_by IS '审核人 users.id';
COMMENT ON COLUMN brand_vendors.reject_reason IS '审核拒绝原因';


-- ------------------------------------------------------------
-- 5.5 user_memberships.plan_id 允许为空
--     积分商城「会员卡」类虚拟商品发放会员天数时，并不对应任何 membership_plans
--     套餐，需要一个「无套餐」的订阅记录（P1-7）。
-- ------------------------------------------------------------
ALTER TABLE user_memberships ALTER COLUMN plan_id DROP NOT NULL;
COMMENT ON COLUMN user_memberships.plan_id IS '套餐 ID；为空表示非套餐来源（如积分商城发放会员天数）';

-- ------------------------------------------------------------
-- 6. 会员升降级差价流水（P1-5）
--    升级补差价扣费 / 降级退差额，均落一条流水，可查询、可审计
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_level_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('renew', 'upgrade', 'downgrade')),
  from_level_code TEXT,
  to_level_code TEXT,
  from_plan_id UUID REFERENCES membership_plans(id),
  to_plan_id UUID REFERENCES membership_plans(id),
  remaining_days INTEGER NOT NULL DEFAULT 0,
  price_diff NUMERIC NOT NULL DEFAULT 0,
  points_used INTEGER NOT NULL DEFAULT 0,
  pay_method TEXT NOT NULL DEFAULT 'cash' CHECK (pay_method IN ('cash', 'points')),
  order_no TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE membership_level_changes IS '会员续费/升级/降级差价流水（#20260831-1600 P1-5）';

CREATE INDEX IF NOT EXISTS idx_membership_level_changes_user
  ON membership_level_changes (user_id, created_at DESC);


-- ------------------------------------------------------------
-- 7. 积分冻结 / 解冻 / 扣减 原子函数（P1-10）
--    三处存储同步：users.points + users.frozen_points + user_token_balance.points_balance
--    point_logs / point_records 双写流水，reference_id 幂等
-- ------------------------------------------------------------

-- 7.1 冻结：可用积分 → 冻结积分
CREATE OR REPLACE FUNCTION public.freeze_points_atomic(
  p_user_id uuid,
  p_points integer,
  p_type text DEFAULT 'withdraw_freeze',
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_available INTEGER;
    v_frozen INTEGER;
    v_new_available INTEGER;
    v_new_frozen INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分必须为正整数');
    END IF;

    -- 幂等：同一 reference_id 已处理则直接返回成功
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已冻结', 'frozen_points', v_new_frozen);
        END IF;
    END IF;

    SELECT COALESCE(points, 0), COALESCE(frozen_points, 0)
    INTO v_available, v_frozen
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    IF v_available < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '可用积分不足');
    END IF;

    v_new_available := v_available - p_points;
    v_new_frozen := v_frozen + p_points;
    v_type := COALESCE(p_type, 'withdraw_freeze');
    v_desc := COALESCE(p_description, '积分冻结');

    UPDATE users
    SET points = v_new_available,
        frozen_points = v_new_frozen,
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{points}', to_jsonb(v_new_available)
        ),
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 流水双写（balance_after 记「可用余额」）
    INSERT INTO point_logs (user_id, points, type, description, balance_after)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_available);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_available, p_reference_id);

    -- 同步第三处存储：可用余额
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'available_points', v_new_available,
        'frozen_points', v_new_frozen
    );
END;
$function$;


-- 7.2 解冻：冻结积分 → 可用积分（拒绝 / 打款失败）
CREATE OR REPLACE FUNCTION public.unfreeze_points_atomic(
  p_user_id uuid,
  p_points integer,
  p_type text DEFAULT 'withdraw_refund',
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_available INTEGER;
    v_frozen INTEGER;
    v_new_available INTEGER;
    v_new_frozen INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '解冻积分必须为正整数');
    END IF;

    -- 幂等：解冻流水已存在则跳过（reference_id 需与冻结时不同，见服务层约定）
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已解冻', 'frozen_points', v_new_frozen);
        END IF;
    END IF;

    SELECT COALESCE(points, 0), COALESCE(frozen_points, 0)
    INTO v_available, v_frozen
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    IF v_frozen < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分不足，无法解冻');
    END IF;

    v_new_available := v_available + p_points;
    v_new_frozen := v_frozen - p_points;
    v_type := COALESCE(p_type, 'withdraw_refund');
    v_desc := COALESCE(p_description, '积分解冻退回');

    UPDATE users
    SET points = v_new_available,
        frozen_points = v_new_frozen,
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{points}', to_jsonb(v_new_available)
        ),
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO point_logs (user_id, points, type, description, balance_after)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_available);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_available, p_reference_id);

    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'available_points', v_new_available,
        'frozen_points', v_new_frozen
    );
END;
$function$;


-- 7.3 扣减冻结积分（打款成功，真正扣除，不再退回可用余额）
CREATE OR REPLACE FUNCTION public.consume_frozen_points_atomic(
  p_user_id uuid,
  p_points integer,
  p_type text DEFAULT 'withdraw',
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_available INTEGER;
    v_frozen INTEGER;
    v_new_frozen INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_existing RECORD;
BEGIN
    IF p_points IS NULL OR p_points <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', '扣减积分必须为正整数');
    END IF;

    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id AND reference_id = p_reference_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已扣减', 'frozen_points', v_new_frozen);
        END IF;
    END IF;

    SELECT COALESCE(points, 0), COALESCE(frozen_points, 0)
    INTO v_available, v_frozen
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    IF v_frozen < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '冻结积分不足，无法扣减');
    END IF;

    v_new_frozen := v_frozen - p_points;
    v_type := COALESCE(p_type, 'withdraw');
    v_desc := COALESCE(p_description, '冻结积分扣减');

    UPDATE users
    SET frozen_points = v_new_frozen,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 可用余额未变，流水 balance_after 仍记可用余额
    INSERT INTO point_logs (user_id, points, type, description, balance_after)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_available);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_available, p_reference_id);

    -- 第三处存储保持可用余额不变（无需更新，但保持一致）
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_available, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'available_points', v_available,
        'frozen_points', v_new_frozen
    );
END;
$function$;


-- ------------------------------------------------------------
-- 8. 批量过期函数（P0-2，由 scheduler 每日调用）
-- ------------------------------------------------------------

-- 8.1 会员到期：active 且 end_date < now → expired，并降级 user_levels
CREATE OR REPLACE FUNCTION public.expire_expired_memberships()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_expired_count INTEGER := 0;
    v_downgraded_count INTEGER := 0;
    v_rec RECORD;
    v_level_num INTEGER;
    v_cur_level INTEGER;
BEGIN
    FOR v_rec IN
        SELECT id, user_id, level_code
        FROM user_memberships
        WHERE status = 'active'
          AND end_date < NOW()
    LOOP
        UPDATE user_memberships
        SET status = 'expired', updated_at = NOW()
        WHERE id = v_rec.id;
        v_expired_count := v_expired_count + 1;

        -- 会员等级 → 数字等级映射（与 membership-service.ts MEMBERSHIP_LEVEL_MAP 一致）
        v_level_num := CASE v_rec.level_code
            WHEN 'vip' THEN 2
            WHEN 'premium' THEN 4
            WHEN 'enterprise' THEN 5
            ELSE NULL
        END;

        IF v_level_num IS NOT NULL THEN
            SELECT level INTO v_cur_level
            FROM user_levels
            WHERE user_id = v_rec.user_id;

            -- 仅当当前等级恰为会员带来的等级时才降回 1，避免覆盖积分升级的更高等级
            IF v_cur_level IS NOT NULL AND v_cur_level = v_level_num THEN
                UPDATE user_levels
                SET level = 1, updated_at = NOW()
                WHERE user_id = v_rec.user_id;
                v_downgraded_count := v_downgraded_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'expired', v_expired_count,
        'downgraded', v_downgraded_count
    );
END;
$function$;


-- 8.2 会员到期提醒：end_date 在 N 天内到期且未提醒过 → 返回待提醒列表
--     幂等：同一 subscription_id + days_left 组合只提醒一次（靠 notifications.data 唯一判定，服务层处理）
CREATE OR REPLACE FUNCTION public.get_memberships_expiring_soon(p_within_days INTEGER DEFAULT 7)
RETURNS TABLE (
  subscription_id UUID,
  user_id UUID,
  level_code TEXT,
  end_date TIMESTAMPTZ,
  days_left INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT
        um.id,
        um.user_id,
        um.level_code,
        um.end_date,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (um.end_date - NOW())) / 86400))::INTEGER AS days_left
    FROM user_memberships um
    WHERE um.status = 'active'
      AND um.end_date >= NOW()
      AND um.end_date <= NOW() + (p_within_days || ' days')::INTERVAL
    ORDER BY um.end_date ASC;
$function$;


-- 8.3 品牌权益到期：priority_expire_at < now → 重算最高未过期等级，无则降为 0
CREATE OR REPLACE FUNCTION public.expire_expired_brand_priorities()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_expired_count INTEGER := 0;
    v_rec RECORD;
    v_max_level INTEGER;
    v_latest_end TIMESTAMPTZ;
BEGIN
    FOR v_rec IN
        SELECT id
        FROM brand_vendors
        WHERE priority_expire_at IS NOT NULL
          AND priority_expire_at < NOW()
          AND COALESCE(priority_level, 0) > 0
    LOOP
        -- 重算：该品牌所有「已完成且未过期」的权益中的最高等级
        SELECT MAX(bp.priority_level), MAX(bp.end_date)
        INTO v_max_level, v_latest_end
        FROM brand_payments bp
        WHERE bp.brand_id = v_rec.id
          AND bp.status = 'completed'
          AND bp.end_date IS NOT NULL
          AND bp.end_date >= NOW();

        UPDATE brand_vendors
        SET priority_level = COALESCE(v_max_level, 0),
            priority_expire_at = v_latest_end,
            is_verified = (COALESCE(v_max_level, 0) > 0 AND is_verified),
            updated_at = NOW()
        WHERE id = v_rec.id;

        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN jsonb_build_object('expired', v_expired_count);
END;
$function$;


-- 8.4 品牌权益即将到期列表（用于续费提醒）
CREATE OR REPLACE FUNCTION public.get_brand_priorities_expiring_soon(p_within_days INTEGER DEFAULT 7)
RETURNS TABLE (
  brand_id UUID,
  user_id UUID,
  brand_name TEXT,
  priority_level INTEGER,
  priority_expire_at TIMESTAMPTZ,
  days_left INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT
        bv.id,
        bv.user_id,
        bv.brand_name,
        bv.priority_level,
        bv.priority_expire_at,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (bv.priority_expire_at - NOW())) / 86400))::INTEGER AS days_left
    FROM brand_vendors bv
    WHERE bv.status = 'approved'
      AND bv.priority_expire_at IS NOT NULL
      AND bv.priority_expire_at >= NOW()
      AND bv.priority_expire_at <= NOW() + (p_within_days || ' days')::INTERVAL
    ORDER BY bv.priority_expire_at ASC;
$function$;


-- ------------------------------------------------------------
-- 9. trade_config 新增配置项（动态生效，无需重启）
-- ------------------------------------------------------------
INSERT INTO trade_config (config_key, config_value, config_type, description, category, is_active)
VALUES
  ('withdraw.max_points',        '{"max": 50000}'::jsonb,  'number',  '单笔提现最大积分额度（0 或负=不限制）',                 'withdraw',   true),
  ('withdraw.daily_limit',       '{"count": 3}'::jsonb,    'json',    '每用户每日最多提现申请次数（0 或负=不限制）',           'withdraw',   true),
  ('withdraw.require_realname',  '{"enabled": true}'::jsonb,'boolean','提现是否强制实名认证（校验 withdraw_accounts.real_name）','withdraw',  true),
  ('membership.points_enabled',  '{"enabled": true}'::jsonb,'boolean','会员套餐是否开放积分支付通道',                           'membership', true),
  ('points.membership_rate',     '{"rate": 100}'::jsonb,   'number',  '会员积分支付汇率：多少积分 = 1 元',                     'membership', true),
  ('membership.expire_notify_days','{"days": [7, 3, 1]}'::jsonb, 'json', '会员到期提前提醒天数（站内信，按天幂等）',           'membership', true),
  ('brand.expire_notify_days',   '{"days": [7, 3, 1]}'::jsonb, 'json', '品牌权益到期提前提醒天数（站内信，按天幂等）',         'brand',      true),
  ('scheduler.expiry_check',     '{"enabled": true, "schedule": "10 1 * * *", "notify_days": 7}'::jsonb, 'json', '到期检查定时任务配置（开关 / cron 表达式 / 提醒提前天数）', 'system', true)
ON CONFLICT (config_key) DO NOTHING;


-- ------------------------------------------------------------
-- 10. 积分流水类型字典（与 point_logs.type 对齐）
--     category CHECK: reward / consume / system
-- ------------------------------------------------------------
INSERT INTO point_log_types (type_code, type_name, category, icon_name, display_order, is_reversible, description)
VALUES
  ('withdraw_freeze',   '提现冻结',   'consume', 'snowflake', 61, false, '申请提现时冻结积分（可用余额减少，冻结余额增加）'),
  ('withdraw_refund',   '提现退回',   'reward',  'undo-2',    62, false, '提现被拒绝或打款失败，冻结积分解冻退回可用余额'),
  ('membership_purchase','会员购买',  'consume', 'crown',     63, false, '积分支付购买/续费/升级会员套餐'),
  ('membership_refund', '会员退差',   'reward',  'undo-2',    64, false, '会员降级退差额，积分退回')
ON CONFLICT (type_code) DO NOTHING;

-- 补充已存在但未注册的商城兑换/提现类型（幂等）
INSERT INTO point_log_types (type_code, type_name, category, icon_name, display_order, is_reversible, description)
VALUES
  ('mall_exchange', '商城兑换', 'consume', 'shopping-bag', 60, false, '积分商城兑换/购买商品')
ON CONFLICT (type_code) DO NOTHING;
