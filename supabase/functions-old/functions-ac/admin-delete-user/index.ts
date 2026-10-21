import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
import { getCorsHeaders } from "../_shared/cors.ts";
serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({
        error: "Server is missing service role key"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const authHeader = req.headers.get("Authorization");
    const headerToken = authHeader?.replace("Bearer ", "");
    const altHeaderToken = req.headers.get("x-user-access-token") ?? "";
    let bodyToken = "";
    if (!headerToken && !altHeaderToken) {
      try {
        const contentType = req.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const body = await req.json();
          if (body && typeof body === "object") {
            bodyToken = body.access_token ?? "";
          }
        }
      } catch  {
        bodyToken = "";
      }
    }
    const token = headerToken || altHeaderToken || bodyToken;
    if (!token) {
      return new Response(JSON.stringify({
        error: "Missing access token"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: "Invalid token"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: userRole, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleError || userRole?.role !== "admin") {
      return new Response(JSON.stringify({
        error: "Unauthorized: Admin access required"
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const body = await req.json();
    const userId = body?.userId;
    if (!userId) {
      return new Response(JSON.stringify({
        error: "Missing userId"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({
        error: "You cannot delete your own account"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("Auth delete error:", deleteAuthError);
      return new Response(JSON.stringify({
        error: `Failed to delete user: ${deleteAuthError.message}`
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
