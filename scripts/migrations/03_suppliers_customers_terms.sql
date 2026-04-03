-- ============================================================================
-- 商务信息相关表（支持现有 API）
-- 创建 suppliers, customers, quote_terms 表
-- 执行时间：2026-03-09
-- 更新时间：2026-04-02 修复：表已存在时补充缺失列
-- ============================================================================

-- 1. 供应商表
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  website VARCHAR(255),
  bank_name VARCHAR(100),
  bank_account VARCHAR(100),
  tax_id VARCHAR(50),
  logo TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 补充 suppliers 表可能缺失的列（表已存在但缺少列时）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'company_name') THEN
    ALTER TABLE suppliers ADD COLUMN company_name VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'contact_person') THEN
    ALTER TABLE suppliers ADD COLUMN contact_person VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'phone') THEN
    ALTER TABLE suppliers ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'email') THEN
    ALTER TABLE suppliers ADD COLUMN email VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'address') THEN
    ALTER TABLE suppliers ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'website') THEN
    ALTER TABLE suppliers ADD COLUMN website VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'bank_name') THEN
    ALTER TABLE suppliers ADD COLUMN bank_name VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'bank_account') THEN
    ALTER TABLE suppliers ADD COLUMN bank_account VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'tax_id') THEN
    ALTER TABLE suppliers ADD COLUMN tax_id VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'logo') THEN
    ALTER TABLE suppliers ADD COLUMN logo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'metadata') THEN
    ALTER TABLE suppliers ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'created_at') THEN
    ALTER TABLE suppliers ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'updated_at') THEN
    ALTER TABLE suppliers ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- 2. 客户表
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  project_name VARCHAR(255),
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  bank_name VARCHAR(100),
  bank_account VARCHAR(100),
  tax_number VARCHAR(50),
  payment_terms TEXT,
  credit_limit DECIMAL(15,2),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 补充 customers 表可能缺失的列
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'project_name') THEN
    ALTER TABLE customers ADD COLUMN project_name VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'bank_name') THEN
    ALTER TABLE customers ADD COLUMN bank_name VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'bank_account') THEN
    ALTER TABLE customers ADD COLUMN bank_account VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'tax_number') THEN
    ALTER TABLE customers ADD COLUMN tax_number VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'payment_terms') THEN
    ALTER TABLE customers ADD COLUMN payment_terms TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'credit_limit') THEN
    ALTER TABLE customers ADD COLUMN credit_limit DECIMAL(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'notes') THEN
    ALTER TABLE customers ADD COLUMN notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'metadata') THEN
    ALTER TABLE customers ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 3. 报价条款表
CREATE TABLE IF NOT EXISTS quote_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  payment_terms TEXT NOT NULL,
  warranty_period VARCHAR(100),
  delivery_period VARCHAR(100),
  validity_period VARCHAR(50),
  remarks TEXT,
  tax_rate DECIMAL(5,2) DEFAULT 13,
  shipping DECIMAL(15,2) DEFAULT 0,
  installation DECIMAL(15,2) DEFAULT 0,
  other_fees DECIMAL(15,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 补充 quote_terms 表可能缺失的列
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'remarks') THEN
    ALTER TABLE quote_terms ADD COLUMN remarks TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'tax_rate') THEN
    ALTER TABLE quote_terms ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 13;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'shipping') THEN
    ALTER TABLE quote_terms ADD COLUMN shipping DECIMAL(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'installation') THEN
    ALTER TABLE quote_terms ADD COLUMN installation DECIMAL(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'other_fees') THEN
    ALTER TABLE quote_terms ADD COLUMN other_fees DECIMAL(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'is_default') THEN
    ALTER TABLE quote_terms ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_terms' AND column_name = 'metadata') THEN
    ALTER TABLE quote_terms ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_suppliers_company_name ON suppliers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_quote_terms_name ON quote_terms(name);
CREATE INDEX IF NOT EXISTS idx_quote_terms_is_default ON quote_terms(is_default);

-- 添加更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 suppliers 表添加触发器
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 customers 表添加触发器
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 quote_terms 表添加触发器
DROP TRIGGER IF EXISTS update_quote_terms_updated_at ON quote_terms;
CREATE TRIGGER update_quote_terms_updated_at
  BEFORE UPDATE ON quote_terms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 插入默认的供应商数据
INSERT INTO suppliers (company_name, contact_person, phone, email, address, website, bank_name, bank_account, tax_id) VALUES
(
  '兴绿环境科技有限公司',
  '张经理',
  '021-12345678',
  'zhang@xinglv.com',
  '上海市浦东新区xx路123号',
  'www.xinglv.com',
  '中国建设银行上海分行',
  '3100 1234 5678 9012 345',
  '91310115MA1H123456'
)
ON CONFLICT DO NOTHING;

-- 插入默认的客户数据
INSERT INTO customers (company_name, project_name, contact_person, phone, email, address) VALUES
(
  'XX工程项目部',
  '污水处理设备采购项目',
  '李工',
  '13912345678',
  'ligong@example.com',
  '江苏省苏州市工业园区'
)
ON CONFLICT DO NOTHING;

-- 插入默认的报价条款数据
INSERT INTO quote_terms (name, payment_terms, warranty_period, delivery_period, validity_period, tax_rate, shipping, installation, other_fees, is_default) VALUES
(
  '标准条款',
  '预付30%，发货前付清70%',
  '整机质保12个月',
  '合同签订后15个工作日内',
  '15天',
  13,
  0,
  0,
  0,
  true
)
ON CONFLICT DO NOTHING;

-- 添加注释
COMMENT ON TABLE suppliers IS '供应商信息表';
COMMENT ON TABLE customers IS '客户信息表';
COMMENT ON TABLE quote_terms IS '报价条款表';
COMMENT ON COLUMN quote_terms.is_default IS '是否为默认条款';
