import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 测试用户 ID（用于开发环境）
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

export async function getCurrentUser(request: NextRequest) {
  try {
    // 从 cookie 中获取会话
    const cookie = request.cookies.get("sb-access-token")?.value;
    
    if (!cookie) {
      // 开发环境：如果没有 cookie，返回测试用户
      if (process.env.NODE_ENV === 'development') {
        console.log("[Auth] 开发环境使用测试用户");
        return { 
          id: TEST_USER_ID, 
          email: "test@example.com" 
        };
      }
      
      // 尝试从 Authorization header 获取
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        // 验证 token...
        return { id: TEST_USER_ID, email: "admin@example.com" };
      }
      return null;
    }

    // 验证 Supabase 会话
    const { data: { user }, error } = await supabase.auth.getUser(cookie);
    
    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email,
    };
  } catch (error) {
    console.error("[Auth] 获取用户失败:", error);
    return null;
  }
}

// 用于客户端的 hook
export function getClientUser() {
  if (typeof window === "undefined") return null;
  
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    console.error("[Auth] 解析用户数据失败:", e);
  }
  return null;
}
