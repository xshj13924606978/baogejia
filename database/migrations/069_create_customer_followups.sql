-- 069_create_customer_followups.sql
-- 客户跟进记录表（admin + user 双端共用）
-- 依赖：customers(id BIGINT)、users(id UUID)

CREATE TABLE IF NOT EXISTS customer_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  followup_type VARCHAR(50) NOT NULL DEFAULT 'call',
  content TEXT NOT NULL,
  next_followup_date TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_followups_customer_id ON customer_followups USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_user_id ON customer_followups USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_followups_created_at ON customer_followups USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_next_date ON customer_followups USING btree (next_followup_date);
CREATE INDEX IF NOT EXISTS idx_followups_status ON customer_followups USING btree (status);

-- updated_at 自动更新触发器（如果数据库已有 update_updated_at_column 函数则复用）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'CREATE TRIGGER trg_followups_updated_at BEFORE UPDATE ON customer_followups
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END $$;

-- 说明：API 层用 service role 访问，暂不启用 RLS。
