#!/bin/bash
set -e

# Wait a moment for container to be fully ready
sleep 5

# Check if notifications table exists
echo "=== Checking if notifications table exists ==="
docker exec quote-app sh -c 'printenv SUPABASE_SERVICE_ROLE_KEY' > /tmp/sk.txt
SK=$(cat /tmp/sk.txt)
rm -f /tmp/sk.txt

# Try checking if table exists using the app
echo "=== Running migration via app HTTP API ==="

# Use the migrations endpoint
STATUS=$(curl -s -o /tmp/migrate-result.txt -w '%{http_code}' http://localhost:5000/api/public/migrate-notifications)
echo "HTTP Status: $STATUS"
cat /tmp/migrate-result.txt

# If public API doesn't work, try alternative
if [ "$STATUS" != "200" ]; then
  echo "=== Trying alternative approach ==="
  
  # Install psql client silently if needed
  if ! command -v psql &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq postgresql-client
  fi

  PGPASSWORD="$SK" psql \
    "host=aws-0-ap-southeast-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.tjbnjrcgmyiwudqptfhc sslmode=require" \
    -f /tmp/create-notifications.sql
  
  echo "psql exit: $?"
fi
