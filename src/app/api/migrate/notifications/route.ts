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

  // Try 1: Session pooler port 6543 with project-prefixed user
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: `postgresql://postgres.tjbnjrcgmyiwudqptfhc:${encodeURIComponent(serviceKey)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=no-verify`,
      connectionTimeoutMillis: 15000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pooler-6543', logs });
  } catch (e: any) {
    logs.push(`pooler-6543: ${e.message}`);

    // Try 2: Transaction pooler port 5432 with db password (not service key)
    try {
      const dbPassword = process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || serviceKey;
      const { Pool: Pool2 } = await import('pg');
      const pool2 = new Pool2({
        host: 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres',
        password: dbPassword,
        database: 'postgres',
        ssl: { rejectUnauthorized: false, servername: 'tjbnjrcgmyiwudqptfhc' },
        connectionTimeoutMillis: 15000,
      });
      await pool2.query(sql);
      await pool2.end();
      return NextResponse.json({ success: true, method: 'pooler-5432-alt', logs });
    } catch (e2: any) {
      logs.push(`pooler-5432-alt: ${e2.message}`);
    }
  }

  return NextResponse.json({ error: 'All methods failed', logs }, { status: 500 });
}
