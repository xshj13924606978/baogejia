#!/bin/bash
# Force IPv4 pooler connection
export PGPASSWORD="${PGPASSWORD:?Set PGPASSWORD before running this migration}"
psql "host=aws-0-ap-southeast-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.tjbnjrcgmyiwudqptfhc sslmode=require" \
  -f /tmp/create-notifications.sql
echo "exit: $?"
