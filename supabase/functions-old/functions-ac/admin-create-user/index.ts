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
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
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
      throw new Error("Invalid token");
    }
    const { data: userRole, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleError || userRole?.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }
    const { full_name, email, phone, role, password } = await req.json();
    if (!full_name || !email || !role) {
      throw new Error("Full name, email and role are required");
    }
    const validRoles = [
      "admin",
      "manager",
      "staff",
      "viewer"
    ];
    if (!validRoles.includes(role)) {
      throw new Error("Invalid role");
    }
    console.log(`Admin ${user.email} creating user ${email} with role ${role}`);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || "TempPass123!",
      email_confirm: true,
      user_metadata: {
        full_name,
        created_by: user.id,
        created_at: new Date().toISOString()
      }
    });
    if (createError) {
      console.error("User creation error:", createError);
      throw new Error(`Failed to create user: ${createError.message}`);
    }
    if (!newUser.user) {
      throw new Error("User creation failed - no user returned");
    }
    await new Promise((resolve)=>setTimeout(resolve, 100));
    const { error: roleUpsertError } = await supabaseAdmin.from("user_roles").upsert({
      user_id: newUser.user.id,
      role
    }, {
      onConflict: "user_id"
    });
    if (roleUpsertError) {
      console.error("Role upsert error:", roleUpsertError);
    }
    const { error: profileUpsertError } = await supabaseAdmin.from("profiles").upsert({
      id: newUser.user.id,
      full_name,
      phone: phone || null
    }, {
      onConflict: "id"
    });
    if (profileUpsertError) {
      console.error("Profile upsert error:", profileUpsertError);
    }
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name,
        phone,
        role
      }
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Admin invite error:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
