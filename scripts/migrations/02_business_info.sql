-- ============================================================================
-- 商务信息配置表
-- 用于存储全局的商务信息（供应商、客户、条款等）
-- 执行时间：2026-03-09
-- ============================================================================

-- 创建商务信息表
CREATE TABLE IF NOT EXISTS business_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL UNIQUE, -- supplier, customer, terms
  info_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_business_info_type ON business_info(type);
CREATE INDEX IF NOT EXISTS idx_business_info_updated_at ON business_info(updated_at);

-- 插入默认的商务信息数据
INSERT INTO business_info (type, info_data) VALUES
(
  'supplier',
  '{
    "companyName": "兴绿环境科技有限公司",
    "contactPerson": "张经理",
    "phone": "021-12345678",
    "email": "zhang@xinglv.com",
    "address": "上海市浦东新区xx路123号",
    "bankName": "中国建设银行上海分行",
    "bankAccount": "3100 1234 5678 9012 345",
    "taxNumber": "91310115MA1H123456"
  }'::jsonb
),
(
  'customer',
  '{
    "name": "XX工程项目部",
    "projectName": "污水处理设备采购项目",
    "contactPerson": "李工",
    "phone": "13912345678",
    "email": "ligong@example.com",
    "address": "江苏省苏州市工业园区"
  }'::jsonb
),
(
  'terms',
  '{
    "payment": "预付30%，发货前付清70%",
    "warranty": "整机质保12个月",
    "delivery": "合同签订后15个工作日内",
    "validity": "15天",
    "taxRate": 13,
    "shipping": 0,
    "installation": 0,
    "otherFees": 0
  }'::jsonb
)
ON CONFLICT (type) DO NOTHING;

-- 创建更新时间戳的触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 business_info 表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_business_info_updated_at ON business_info;
CREATE TRIGGER update_business_info_updated_at
  BEFORE UPDATE ON business_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 添加注释
COMMENT ON TABLE business_info IS '商务信息配置表，存储供应商、客户和条款信息';
COMMENT ON COLUMN business_info.type IS '商务信息类型：supplier（供应商）、customer（客户）、terms（条款）';
COMMENT ON COLUMN business_info.info_data IS '商务信息的详细数据（JSON格式）';
