// One-time migration: create notifications table via @supabase/supabase-js
const { createClient } = require('@supabase/supabase-js');

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

(async () => {
  const supabase = createClient('https://tjbnjrcgmyiwudqptfhc.supabase.co', serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Try using the sql endpoint (requires pg_graphql or similar)
    const { error } = await supabase.rpc('exec_sql', {
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
    });
    if (error) {
      console.error('FAILED (rpc):', error.message);
      process.exit(1);
    }
    console.log('SUCCESS: notifications table created');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
})();
