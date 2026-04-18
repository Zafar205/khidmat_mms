import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeacherRow = {
  id: string;
};

type ClassRow = {
  id: string;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const getTeacherClassContext = async (request: Request) => {
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

  if (userData.user.user_metadata?.role !== "teacher") {
    return {
      ok: false as const,
      status: 403,
      error: "Only teacher can manage subjects.",
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: teacherData, error: teacherError } = await adminClient
    .from("teachers")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (teacherError) {
    return {
      ok: false as const,
      status: 400,
      error: teacherError.message,
    };
  }

  if (!teacherData) {
    return {
      ok: false as const,
      status: 403,
      error: "No class is assigned to you.",
    };
  }

  const teacher = teacherData as TeacherRow;

  const { data: classData, error: classError } = await adminClient
    .from("classes")
    .select("id")
    .eq("teacher_id", teacher.id)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (classError) {
    return {
      ok: false as const,
      status: 400,
      error: classError.message,
    };
  }

  if (!classData) {
    return {
      ok: false as const,
      status: 403,
      error: "No class is assigned to you.",
    };
  }

  return {
    ok: true as const,
    adminClient,
    classRecord: classData as ClassRow,
  };
};

export async function POST(request: Request) {
  const auth = await getTeacherClassContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Subject name is required." }, { status: 400 });
  }

  const { data: subjectData, error: subjectError } = await auth.adminClient
    .from("subjects")
    .insert({
      class_id: auth.classRecord.id,
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
