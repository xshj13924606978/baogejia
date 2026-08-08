#!/bin/bash
set -e
echo "=== Checking containers ==="
docker ps --format "table {{.Names}}|{{.Image}}|{{.Status}}"

# 查找数据库容器
DB_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "db|postgres|supabase" | head -1)

if [ -z "$DB_CONTAINER" ]; then
  echo "Trying Supabase local..."
  # Maybe using Supabase local, find the postgres container
  DB_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i "postgres\|supabase_db" | head -1)
fi

if [ -z "$DB_CONTAINER" ]; then
  echo "ERROR: No database container found. Listing all containers:"
  docker ps --format "{{.Names}}"
  exit 1
fi

echo "Database container: $DB_CONTAINER"

docker exec "$DB_CONTAINER" psql -U postgres -d quote_db -c "
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
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
"

echo "=== notifications table created, verifying ==="
docker exec "$DB_CONTAINER" psql -U postgres -d quote_db -c "\dt notifications"
