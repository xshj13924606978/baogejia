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

  const host = 'db.tjbnjrcgmyiwudqptfhc.supabase.co';

  // Resolve IPv4 address manually to avoid IPv6 issues
  const dns = require('dns');
  const { promisify } = require('util');
  let ipv4Host: string;

  try {
    const addresses: string[] = await promisify(dns.resolve4)(host);
    ipv4Host = addresses[0];
  } catch {
    // Fallback to hostname
    ipv4Host = host;
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: ipv4Host,
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false, servername: host },
      connectionTimeoutMillis: 15000,
    });
    await pool.query(sql);
    await pool.end();
    return NextResponse.json({ success: true, method: 'pg-ipv4', host: ipv4Host });
  } catch (pgErr: any) {
    return NextResponse.json({ error: pgErr.message }, { status: 500 });
  }
}
