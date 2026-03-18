import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const getAdminAuthContext = async (request: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      ok: false as const,
      status: 500,
      error:
        "Missing Supabase config. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    return {
      ok: false as const,
      status: 401,
      error: "Missing authentication token.",
    };
  }

  const publicClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await publicClient.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      ok: false as const,
      status: 401,
      error: "Invalid session.",
    };
  }

  if (userData.user.email !== ADMIN_EMAIL) {
    return {
      ok: false as const,
      status: 403,
      error: "Only admin can manage classes.",
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    ok: true as const,
    adminClient,
  };
};

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; subjectId: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: classId, subjectId } = await context.params;
  if (!classId || !subjectId) {
    return NextResponse.json(
      { error: "Class id and subject id are required." },
      { status: 400 },
    );
  }

  const { data: subjectData, error: subjectLookupError } = await auth.adminClient
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("class_id", classId)
    .maybeSingle();

  if (subjectLookupError) {
    return NextResponse.json({ error: subjectLookupError.message }, { status: 400 });
  }

  if (!subjectData) {
    return NextResponse.json({ error: "Subject not found in this class." }, { status: 404 });
  }

  const { error: deleteError } = await auth.adminClient
    .from("subjects")
    .delete()
    .eq("id", subjectId)
    .eq("class_id", classId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Subject deleted." });
}
