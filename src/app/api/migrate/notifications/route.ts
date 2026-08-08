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

  // Approach: pg pooler with tenant via SSL SNI
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: 'aws-0-ap-southeast-1.pooler.supabase.com',
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: {
        rejectUnauthorized: false,
        servername: 'tjbnjrcgmyiwudqptfhc.supabase.co',
      },
      connectionTimeoutMillis: 15000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pooler-sni', logs });
  } catch (e: any) {
    logs.push(`pooler-sni: ${e.message}`);

    // Try pooler with tenant in connection string options
    try {
      const { Pool: Pool2 } = await import('pg');
      const pool2 = new Pool2({
        connectionString: `postgresql://postgres:${encodeURIComponent(serviceKey)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require&options=-c%20reference=tjbnjrcgmyiwudqptfhc`,
        connectionTimeoutMillis: 15000,
      });
      await pool2.query(sql);
      await pool2.end();
      return NextResponse.json({ success: true, method: 'pooler-options', logs });
    } catch (e2: any) {
      logs.push(`pooler-options: ${e2.message}`);

      // Try direct connection with dns.lookup forcing IPv4
      try {
        const dns = require('dns');
        const { promisify } = require('util');
        const lookup = promisify(dns.lookup);

        const { address } = await lookup('db.tjbnjrcgmyiwudqptfhc.supabase.co', { family: 4, all: false });
        logs.push(`dns.lookup IPv4: ${address}`);

        const { Pool: Pool3 } = await import('pg');
        const pool3 = new Pool3({
          host: address,
          port: 5432,
          user: 'postgres',
          password: serviceKey,
          database: 'postgres',
          ssl: { rejectUnauthorized: false, servername: 'db.tjbnjrcgmyiwudqptfhc.supabase.co' },
          connectionTimeoutMillis: 15000,
        });
        await pool3.query(sql);
        await pool3.end();
        return NextResponse.json({ success: true, method: 'pg-dns-lookup', logs });
      } catch (e3: any) {
        logs.push(`pg-dns-lookup: ${e3.message}`);
      }
    }
  }

  return NextResponse.json({ error: 'All methods failed', logs }, { status: 500 });
}
