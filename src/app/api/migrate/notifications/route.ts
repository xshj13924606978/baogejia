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

  const logs: string[] = [];

  // Approach 1: REST API /sql endpoint
  try {
    const res = await fetch('https://tjbnjrcgmyiwudqptfhc.supabase.co/rest/v1/sql', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'sql',
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      return NextResponse.json({ success: true, method: 'sql-endpoint', result: text, logs });
    }
    logs.push(`sql-endpoint: ${res.status} ${text.slice(0, 200)}`);
  } catch (e: any) {
    logs.push(`sql-endpoint err: ${e.message}`);
  }

  // Approach 2: pg direct, resolve via fetch and then connect
  try {
    const { Pool } = await import('pg');
    // Use IP directly - try to resolve via included DNS
    const os = require('os');
    logs.push(`os.networkInterfaces: ${JSON.stringify(Object.keys(os.networkInterfaces()))}`);

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
    return NextResponse.json({ success: true, method: 'pg-direct', logs });
  } catch (e2: any) {
    logs.push(`pg-direct: ${e2.message}`);
  }

  // Approach 3: pooler on port 5432
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pooler-5432', logs });
  } catch (e3: any) {
    logs.push(`pooler-5432: ${e3.message}`);
  }

  return NextResponse.json({ error: 'All methods failed', logs }, { status: 500 });
}
