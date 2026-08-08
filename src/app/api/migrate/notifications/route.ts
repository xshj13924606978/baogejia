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

  const logs: string[] = [];
  const hostname = 'db.tjbnjrcgmyiwudqptfhc.supabase.co';

  // Try 1: dns.resolve4 -> connect via IPv4
  try {
    const dns = require('dns');
    const { promisify } = require('util');
    const resolve4 = promisify(dns.resolve4);
    const addresses: string[] = await resolve4(hostname);
    const ipv4 = addresses[0];
    logs.push(`dns.resolve4 OK: ${ipv4}`);

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: ipv4,
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pg-ipv4', logs });
  } catch (e1: any) {
    logs.push(`Try1(pg-ipv4): ${e1.message}`);

    // Try 2: pg with pooler (force IPv4 via pooler)
    try {
      // Force IPv4 DNS
      const dns = require('dns');
      dns.setDefaultResultOrder?.('ipv4first');

      const { Pool } = await import('pg');
      const pool = new Pool({
        host: 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.tjbnjrcgmyiwudqptfhc',
        password: serviceKey,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      await pool.query(sql);
      await pool.end();
      return NextResponse.json({ success: true, method: 'pg-pooler-5432', logs });
    } catch (e2: any) {
      logs.push(`Try2(pg-pooler-5432): ${e2.message}`);

      // Try 3: using supabase-js to create table via REST API
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          'https://tjbnjrcgmyiwudqptfhc.supabase.co',
          serviceKey,
          { auth: { persistSession: false } }
        );

        // Check if table exists first
        const { data: testRow, error: testErr } = await supabase
          .from('notifications')
          .select('id')
          .limit(1);

        if (testErr) {
          logs.push(`Try3(table-check): table doesn't exist yet - ${testErr.message}`);
        } else {
          // Table already exists
          return NextResponse.json({ success: true, method: 'already-exists', logs });
        }
      } catch (e3: any) {
        logs.push(`Try3(supabase-js): ${e3.message}`);
      }
    }
  }

  return NextResponse.json({ error: 'All methods failed', logs }, { status: 500 });
}
