-- ============================================================================
-- 《报个价》应用数据库迁移脚本 v1.0.0
-- 执行时间：2026-02-25
-- ============================================================================

-- 开启UUID扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. 用户相关表
-- ============================================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  theme VARCHAR(20) DEFAULT 'light',
  language VARCHAR(10) DEFAULT 'zh-CN',
  notifications JSONB DEFAULT '{"email": true, "push": true}'::jsonb,
  quote_defaults JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户配额表
CREATE TABLE IF NOT EXISTS user_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  quotes_today INTEGER DEFAULT 0,
  quotes_total INTEGER DEFAULT 0,
  uploads_today INTEGER DEFAULT 0,
  uploads_total INTEGER DEFAULT 0,
  storage_used BIGINT DEFAULT 0,
  quota_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. 产品相关表
-- ============================================================================

-- 产品价格库表
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  model VARCHAR(100),
  category VARCHAR(100),
  brand VARCHAR(100),
  price DECIMAL(15,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) DEFAULT '台',
  specifications TEXT,
  keywords TEXT,
  verified BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- 产品类别表
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES product_categories(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. 对话和文件相关表
-- ============================================================================

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content JSONB,
  last_message TEXT,
  status VARCHAR(50) DEFAULT 'active',
  message_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 对话文件表
CREATE TABLE IF NOT EXISTS conversation_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_url TEXT,
  file_key VARCHAR(255),
  file_size INTEGER,
  parsed_products JSONB DEFAULT '[]'::jsonb,
  parse_result JSONB,
  parse_level VARCHAR(50),
  confidence INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户上传记录表
CREATE TABLE IF NOT EXISTS user_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_key VARCHAR(255) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  public_url TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. 报价相关表
-- ============================================================================

-- 报价单表
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  products JSONB DEFAULT '[]'::jsonb,
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 13,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  discount_rate DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  supplier_info JSONB,
  customer_info JSONB,
  terms JSONB,
  status VARCHAR(50) DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  valid_until DATE,
  issued_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 5. 知识库相关表
-- ============================================================================

-- 知识库条目表
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- price, document, case, standard, drawing, quota, other
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_key VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  views INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 知识库标签表
CREATE TABLE IF NOT EXISTS knowledge_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 知识库-标签关联表
CREATE TABLE IF NOT EXISTS knowledge_entry_tags (
  entry_id UUID REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES knowledge_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

-- ============================================================================
-- 6. 团队协作表
-- ============================================================================

-- 团队表
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 团队成员表
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- 共享报价表
CREATE TABLE IF NOT EXISTS shared_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES users(id),
  permissions JSONB DEFAULT '{"view": true, "edit": false}'::jsonb,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(quote_id, team_id)
);

-- ============================================================================
-- 7. 评论和通知表
-- ============================================================================

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- quote, knowledge, product
  entity_id UUID NOT NULL,
  parent_id UUID REFERENCES comments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 8. 审核日志表
-- ============================================================================

-- 审核日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 9. 创建索引
-- ============================================================================

-- users 表索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- products 表索引
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_model ON products(model);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_verified ON products(verified);
CREATE INDEX idx_products_created_at ON products(created_at);
CREATE INDEX idx_products_keywords ON products(keywords);

-- conversations 表索引
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversations_status ON conversations(status);

-- conversation_files 表索引
CREATE INDEX idx_conversation_files_conversation_id ON conversation_files(conversation_id);

-- user_uploads 表索引
CREATE INDEX idx_user_uploads_user_id ON user_uploads(user_id);
CREATE INDEX idx_user_uploads_status ON user_uploads(status);
CREATE INDEX idx_user_uploads_created_at ON user_uploads(created_at);

-- quotes 表索引
CREATE INDEX idx_quotes_user_id ON quotes(user_id);
CREATE INDEX idx_quotes_conversation_id ON quotes(conversation_id);
CREATE INDEX idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at);
CREATE INDEX idx_quotes_valid_until ON quotes(valid_until);

-- knowledge_entries 表索引
CREATE INDEX idx_knowledge_entries_user_id ON knowledge_entries(user_id);
CREATE INDEX idx_knowledge_entries_type ON knowledge_entries(type);
CREATE INDEX idx_knowledge_entries_status ON knowledge_entries(status);
CREATE INDEX idx_knowledge_entries_created_at ON knowledge_entries(created_at);
CREATE INDEX idx_knowledge_entries_title ON knowledge_entries(title);

-- teams 表索引
CREATE INDEX idx_teams_owner_id ON teams(owner_id);

-- team_members 表索引
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- comments 表索引
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);

-- notifications 表索引
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- audit_logs 表索引
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- 10. 创建更新时间触发器
-- ============================================================================

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为各表添加触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_quotas_updated_at BEFORE UPDATE ON user_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_entries_updated_at BEFORE UPDATE ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 11. 插入基础数据
-- ============================================================================

-- 插入默认产品类别
INSERT INTO product_categories (name, description, sort_order) VALUES
  ('搅拌设备', '搅拌罐、反应釜、混合机等', 10),
  ('泵类', '离心泵、螺杆泵、隔膜泵等', 20),
  ('阀门', '蝶阀、球阀、闸阀等', 30),
  ('管道', '管道、法兰、弯头等', 40),
  ('电机', '电动机、减速机等', 50),
  ('仪表', '传感器、变送器、控制器等', 60),
  ('过滤设备', '过滤器、滤芯等', 70),
  ('换热设备', '换热器、冷凝器等', 80)
ON CONFLICT (name) DO NOTHING;

-- 插入知识库标签
INSERT INTO knowledge_tags (name) VALUES
  ('技术文档'), ('案例分享'), ('行业标准'), ('图纸'), ('报价模板'), ('培训资料')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 12. 创建视图
-- ============================================================================

-- 用户统计视图
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
  u.id,
  u.email,
  u.username,
  u.role,
  u.status,
  u.created_at,
  COUNT(DISTINCT q.id) as quote_count,
  COUNT(DISTINCT k.id) as knowledge_count,
  COUNT(DISTINCT c.id) as conversation_count,
  COALESCE(SUM(q.total_amount), 0) as total_quote_amount
FROM users u
LEFT JOIN quotes q ON q.user_id = u.id
LEFT JOIN knowledge_entries k ON k.user_id = u.id
LEFT JOIN conversations c ON c.user_id = u.id
GROUP BY u.id, u.email, u.username, u.role, u.status, u.created_at;

-- 热门产品视图
CREATE OR REPLACE VIEW popular_products AS
SELECT 
  p.id,
  p.name,
  p.model,
  p.category,
  p.price,
  COUNT(DISTINCT q.id) as quote_count,
  AVG(q.total_amount) as avg_quote_amount
FROM products p
LEFT JOIN quotes q ON q.products::jsonb @> jsonb_build_array(jsonb_build_object('name', p.name))
GROUP BY p.id, p.name, p.model, p.category, p.price
ORDER BY quote_count DESC;

-- ============================================================================
-- 13. 创建函数
-- ============================================================================

-- 生成报价单号
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  month_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  year_prefix = to_char(NOW(), 'YYYY');
  month_prefix = to_char(NOW(), 'MM');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM quotes
  WHERE quote_number LIKE year_prefix || month_prefix || '%';
  
  NEW.quote_number = year_prefix || month_prefix || LPAD(sequence_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为quotes表添加触发器
CREATE TRIGGER trg_generate_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- ============================================================================
-- 14. 创建RLS策略
-- ============================================================================

-- 启用行级安全
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的数据
CREATE POLICY users_view_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY products_view_all ON products
  FOR SELECT USING (true);

CREATE POLICY products_insert ON products
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY conversations_manage ON conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY quotes_manage ON quotes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY knowledge_view_approved ON knowledge_entries
  FOR SELECT USING (status = 'approved' OR auth.uid() = user_id);

CREATE POLICY knowledge_manage ON knowledge_entries
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 15. 注释
-- ============================================================================

COMMENT ON TABLE users IS '用户信息表';
COMMENT ON TABLE products IS '产品价格库';
COMMENT ON TABLE quotes IS '报价单表';
COMMENT ON TABLE knowledge_entries IS '知识库条目表';
COMMENT ON COLUMN products.price IS '产品参考价（元）';
COMMENT ON COLUMN quotes.total_amount IS '报价总金额（含税）';

-- ============================================================================
-- 迁移完成
-- ============================================================================

SELECT '数据库迁移完成！' as migration_status;