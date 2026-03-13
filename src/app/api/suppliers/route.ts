import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    // 只返回第一条供应方记录（通常只有一个）
    const { data, error } = await db.from('suppliers').select('*').limit(1).single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // 将 snake_case 转换为 camelCase
    if (data) {
      const camelCaseData: Record<string, any> = {};
      Object.keys(data).forEach((key) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        camelCaseData[camelKey] = data[key];
      });
      return NextResponse.json({ supplier: camelCaseData });
    }

    return NextResponse.json({ supplier: null });
  } catch (error) {
    console.error('Failed to load supplier:', error);
    return NextResponse.json({ error: 'Failed to load supplier' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const supplierData = await request.json();

    const now = new Date().toISOString();

    // 将 camelCase 转换为 snake_case
    const snakeCaseData: Record<string, any> = {};
    Object.keys(supplierData).forEach((key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      snakeCaseData[snakeKey] = supplierData[key];
    });

    // 检查是否已有供应方记录
    const { data: existing } = await db.from('suppliers').select('id').limit(1).single();

    let result;

    if (existing) {
      // 更新现有记录
      const { data, error } = await db
        .from('suppliers')
        .update({
          ...snakeCaseData,
          updated_at: now})
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // 创建新记录
      const { data, error } = await db
        .from('suppliers')
        .insert({
          ...snakeCaseData,
          created_at: now,
          updated_at: now})
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ supplier: result });
  } catch (error) {
    console.error('Failed to save supplier:', error);
    return NextResponse.json({ error: 'Failed to save supplier' }, { status: 500 });
  }
}
