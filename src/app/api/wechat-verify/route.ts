import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('143dae63d03958336bf3198a6c43ec07', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
