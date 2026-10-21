import { NextResponse } from 'next/server';

const DISABLED_RESPONSE = {
  success: false,
  error: 'migration-endpoint-disabled',
} as const;

export function migrationEndpointDisabled() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 });
}
