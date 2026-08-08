import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() { return handleMigrate(); }
export async function POST() { return handleMigrate(); }

async function handleMigrate() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  try {
    // Use Supabase REST API to execute raw SQL via the query endpoint
    // POST https://<project>.supabase.co/rest/v1/sql
    const res = await fetch('https://tjbnjrcgmyiwudqptfhc.supabase.co/rest/v1/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'sql',
        'Prefer': 'tx=commit',
      },
      body: JSON.stringify({
        query: `
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
        `
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      // Fallback: try pg library with transaction pooler
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({
          host: process.env.SUPABASE_DB_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com',
          port: parseInt(process.env.SUPABASE_DB_PORT || '6543'),
          user: process.env.SUPABASE_DB_USER || 'postgres',
          password: serviceKey,
          database: 'postgres',
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 10000,
        });
        await pool.query(`
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
        `);
        await pool.end();
        return NextResponse.json({ success: true, message: 'notifications table created (fallback pg)', method: 'pg' });
      } catch (pgErr: any) {
        return NextResponse.json({ error: `SQL returned ${res.status}: ${text}, pg fallback: ${pgErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'notifications table created', result: text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
