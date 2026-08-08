import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() { return handleMigrate(); }
export async function POST() { return handleMigrate(); }

async function handleMigrate() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  const sql = `
    CREATE TABLE IF NOT EXISTS notifications (
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
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
  `;

  // Approach 1: Supabase SQL REST API (requires both apikey and Authorization headers)
  try {
    const res = await fetch('https://tjbnjrcgmyiwudqptfhc.supabase.co/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok && !text.includes('error') && !text.includes('syntax error')) {
      return NextResponse.json({ success: true, method: 'rpc', result: text });
    }
    if (!res.ok) console.log('[migrate] rpc exec_sql failed:', text.slice(0, 200));
  } catch (e: any) {
    console.log('[migrate] rpc exception:', e.message);
  }

  // Approach 2: pg direct connection with tenant identifier
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: 'db.tjbnjrcgmyiwudqptfhc.supabase.co',
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pg-direct' });
  } catch (pgErr: any) {
    console.log('[migrate] pg-direct failed:', pgErr.message);
  }

  // Approach 3: pg transaction pooler
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: 6543,
      user: `postgres.tjbnjrcgmyiwudqptfhc`,
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pg-pooler' });
  } catch (pgErr2: any) {
    console.log('[migrate] pg-pooler failed:', pgErr2.message);
  }

  return NextResponse.json({ error: 'All migration methods failed' }, { status: 500 });
}
