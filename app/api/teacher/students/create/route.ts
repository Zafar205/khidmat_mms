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

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase config. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
  }

  const publicClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await publicClient.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  if (userData.user.user_metadata?.role !== "teacher") {
    return NextResponse.json({ error: "Only teacher can create students." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
  };

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, email, and password are required." },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
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
    return NextResponse.json({ error: teacherError.message }, { status: 400 });
  }

  if (!teacherData) {
    return NextResponse.json({ error: "No class is assigned to you." }, { status: 403 });
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
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  if (!classData) {
    return NextResponse.json({ error: "No class is assigned to you." }, { status: 403 });
  }

  const classRecord = classData as ClassRow;

  const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "student",
      name,
      password_plain: password,
    },
  });

  if (createUserError) {
    return NextResponse.json({ error: createUserError.message }, { status: 400 });
  }

  if (!createdUserData.user) {
    return NextResponse.json({ error: "User was not created." }, { status: 400 });
  }

  const createdUser = createdUserData.user;

  const { error: insertStudentError } = await adminClient.from("students").insert({
    auth_user_id: createdUser.id,
    name,
    email,
    class_id: classRecord.id,
    academic_year: "2025-2026",
    attendance_present: 0,
    attendance_total: 0,
  });

  if (insertStudentError) {
    await adminClient.auth.admin.deleteUser(createdUser.id);
    return NextResponse.json({ error: insertStudentError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      message: "Student created and assigned to your class.",
      student: {
        id: createdUser.id,
        name,
        email,
      },
    },
    { status: 201 },
  );
}