-- 检查 manufacturer_payments 表结构
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'manufacturer_payments'
ORDER BY ordinal_position;

-- 如果表不存在，创建它
CREATE TABLE IF NOT EXISTS manufacturer_payments (
    id BIGSERIAL PRIMARY KEY,
    manufacturer_id UUID REFERENCES users(id),
    manufacturer_name VARCHAR(255),
    order_id BIGINT,
    amount DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'pending',
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_manufacturer_payments_manufacturer_id ON manufacturer_payments(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_manufacturer_payments_category ON manufacturer_payments(category);
CREATE INDEX IF NOT EXISTS idx_manufacturer_payments_payment_date ON manufacturer_payments(payment_date);

-- 插入一些测试数据
INSERT INTO manufacturer_payments (manufacturer_id, manufacturer_name, amount, status, category, payment_date)
SELECT 
    id,
    name,
    CASE floor(random() * 5)
        WHEN 0 THEN 125000
        WHEN 1 THEN 98000
        WHEN 2 THEN 76000
        WHEN 3 THEN 54000
        ELSE 32000
    END,
    CASE floor(random() * 3)
        WHEN 0 THEN 'completed'
        WHEN 1 THEN 'pending'
        ELSE 'processing'
    END,
    CASE floor(random() * 4)
        WHEN 0 THEN '搅拌设备'
        WHEN 1 THEN '泵类'
        WHEN 2 THEN '阀门'
        ELSE '电机'
    END,
    NOW() - (random() * interval '90 days')
FROM users 
WHERE role = 'manufacturer' 
   OR email LIKE '%supplier%'
   OR email LIKE '%vendor%'
LIMIT 10
ON CONFLICT DO NOTHING;
