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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: classId } = await context.params;
  if (!classId) {
    return NextResponse.json({ error: "Class id is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Subject name is required." }, { status: 400 });
  }

  const { data: classData, error: classError } = await auth.adminClient
    .from("classes")
    .select("id")
    .eq("id", classId)
    .maybeSingle();

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  if (!classData) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const { data: subjectData, error: subjectError } = await auth.adminClient
    .from("subjects")
    .insert({
      class_id: classId,
      name,
    })
    .select("id, class_id, name")
    .single();

  if (subjectError) {
    const duplicate = subjectError.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Subject already exists in this class." : subjectError.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      message: "Subject added.",
      subject: {
        id: subjectData.id,
        classId: subjectData.class_id,
        name: subjectData.name,
      },
    },
    { status: 201 },
  );
}
