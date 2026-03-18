import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type ClassRecord = {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

type StudentRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  class_id: string | null;
};

type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
};

type TeacherRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
};

type SubjectRow = {
  id: string;
  class_id: string;
  name: string;
};

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

const fetchClassesWithStudents = async (adminClient: SupabaseClient) => {
  const [
    { data: classesData, error: classesError },
    { data: studentsData, error: studentsError },
    { data: teachersData, error: teachersError },
    { data: subjectsData, error: subjectsError },
  ] =
    await Promise.all([
      adminClient
        .from("classes")
        .select("id, name, teacher_id")
        .order("name", { ascending: true }),
      adminClient
        .from("students")
        .select("id, auth_user_id, name, email, class_id")
        .order("name", { ascending: true }),
      adminClient.from("teachers").select("id, auth_user_id, name"),
      adminClient
        .from("subjects")
        .select("id, class_id, name")
        .order("name", { ascending: true }),
    ]);

  if (classesError) {
    throw new Error(classesError.message);
  }

  if (studentsError) {
    throw new Error(studentsError.message);
  }

  if (teachersError) {
    throw new Error(teachersError.message);
  }

  if (subjectsError) {
    throw new Error(subjectsError.message);
  }

  const classRows = (classesData ?? []) as ClassRow[];
  const studentRows = (studentsData ?? []) as StudentRow[];
  const teacherRows = (teachersData ?? []) as TeacherRow[];
  const subjectRows = (subjectsData ?? []) as SubjectRow[];
  const classNameById = new Map(classRows.map((item) => [item.id, item.name]));
  const teacherById = new Map(teacherRows.map((teacher) => [teacher.id, teacher]));
  const subjectsByClassId = new Map<string, Array<{ id: string; name: string }>>();

  for (const subject of subjectRows) {
    const existing = subjectsByClassId.get(subject.class_id) ?? [];
    existing.push({ id: subject.id, name: subject.name });
    subjectsByClassId.set(subject.class_id, existing);
  }

  const classes: ClassRecord[] = classRows.map((classRow) => ({
    id: classRow.id,
    name: classRow.name,
    teacherId:
      classRow.teacher_id && teacherById.get(classRow.teacher_id)?.auth_user_id
        ? (teacherById.get(classRow.teacher_id)?.auth_user_id as string)
        : "",
    teacherName: classRow.teacher_id
      ? teacherById.get(classRow.teacher_id)?.name ?? ""
      : "",
    studentIds: studentRows
      .filter((student) => student.class_id === classRow.id)
      .map((student) => student.auth_user_id ?? student.id),
    subjects: subjectsByClassId.get(classRow.id) ?? [],
  }));

  const students = studentRows.map((student) => ({
    id: student.auth_user_id ?? student.id,
    name: student.name,
    email: student.email,
    classId: student.class_id ?? "",
    className: student.class_id ? classNameById.get(student.class_id) ?? "" : "",
  }));

  return { classes, students };
};

export async function GET(request: Request) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await fetchClassesWithStudents(auth.adminClient);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load classes." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    teacherId?: string;
  };

  const name = (body.name ?? "").trim();
  const teacherId = (body.teacherId ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Class name is required." }, { status: 400 });
  }

  const insertPayload: { name: string; teacher_id?: string | null } = { name };
  if (teacherId) {
    const { data: teacherData, error: teacherLookupError } = await auth.adminClient
      .from("teachers")
      .select("id")
      .eq("auth_user_id", teacherId)
      .maybeSingle();

    if (teacherLookupError) {
      return NextResponse.json({ error: teacherLookupError.message }, { status: 400 });
    }

    if (!teacherData) {
      return NextResponse.json({ error: "Selected teacher not found." }, { status: 400 });
    }

    insertPayload.teacher_id = teacherData.id as string;
  }

  const { error } = await auth.adminClient
    .from("classes")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "Class already exists." : error.message },
      { status: 400 },
    );
  }

  try {
    const result = await fetchClassesWithStudents(auth.adminClient);

    return NextResponse.json(
      {
        message: "Class created.",
        ...result,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: "Class created.",
        error: error instanceof Error ? error.message : "Failed to reload classes.",
      },
      { status: 201 },
    );
  }
}
