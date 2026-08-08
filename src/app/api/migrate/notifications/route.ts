import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() { return handleMigrate(); }
export async function POST() { return handleMigrate(); }

async function handleMigrate() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  const sql = `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);`;

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: `postgresql://postgres:${encodeURIComponent(serviceKey)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify&options=-c%20reference=tjbnjrcgmyiwudqptfhc`,
      connectionTimeoutMillis: 15000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pooler-options' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
