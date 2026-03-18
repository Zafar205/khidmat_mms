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

const fetchClasses = async (adminClient: SupabaseClient) => {
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
      adminClient.from("students").select("id, auth_user_id, class_id"),
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
  const teacherById = new Map(teacherRows.map((teacher) => [teacher.id, teacher]));
  const subjectsByClassId = new Map<string, Array<{ id: string; name: string }>>();

  for (const subject of subjectRows) {
    const existing = subjectsByClassId.get(subject.class_id) ?? [];
    existing.push({ id: subject.id, name: subject.name });
    subjectsByClassId.set(subject.class_id, existing);
  }

  return classRows.map(
    (classRow): ClassRecord => ({
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
    }),
  );
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Class id is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    teacherId?: string;
    studentIds?: string[];
  };

  const nextName = typeof body.name === "string" ? body.name.trim() : undefined;
  const nextTeacherAuthUserId =
    typeof body.teacherId === "string" ? body.teacherId.trim() || null : undefined;

  if (nextName !== undefined && !nextName) {
    return NextResponse.json({ error: "Class name cannot be empty." }, { status: 400 });
  }

  if (nextName !== undefined || nextTeacherAuthUserId !== undefined) {
    const updatePayload: { name?: string; teacher_id?: string | null } = {};
    if (nextName !== undefined) {
      updatePayload.name = nextName;
    }

    if (nextTeacherAuthUserId !== undefined) {
      if (nextTeacherAuthUserId === null) {
        updatePayload.teacher_id = null;
      } else {
        const { data: teacherData, error: teacherLookupError } = await auth.adminClient
          .from("teachers")
          .select("id")
          .eq("auth_user_id", nextTeacherAuthUserId)
          .maybeSingle();

        if (teacherLookupError) {
          return NextResponse.json({ error: teacherLookupError.message }, { status: 400 });
        }

        if (!teacherData) {
          return NextResponse.json({ error: "Selected teacher not found." }, { status: 400 });
        }

        updatePayload.teacher_id = teacherData.id as string;
      }
    }

    const { error: updateClassError } = await auth.adminClient
      .from("classes")
      .update(updatePayload)
      .eq("id", id);

    if (updateClassError) {
      const duplicate = updateClassError.code === "23505";
      return NextResponse.json(
        { error: duplicate ? "Class name already exists." : updateClassError.message },
        { status: 400 },
      );
    }
  }

  if (Array.isArray(body.studentIds)) {
    const requestedStudentIds = Array.from(
      new Set(
        body.studentIds
          .filter((studentId) => typeof studentId === "string")
          .map((studentId) => studentId.trim())
          .filter((studentId) => studentId.length > 0),
      ),
    );

    const { data: matchedStudents, error: studentLookupError } = await auth.adminClient
      .from("students")
      .select("auth_user_id")
      .in("auth_user_id", requestedStudentIds);

    if (studentLookupError) {
      return NextResponse.json({ error: studentLookupError.message }, { status: 400 });
    }

    const validStudentIds = (matchedStudents ?? [])
      .map((entry) => entry.auth_user_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const { error: clearAssignmentsError } = await auth.adminClient
      .from("students")
      .update({ class_id: null })
      .eq("class_id", id);

    if (clearAssignmentsError) {
      return NextResponse.json({ error: clearAssignmentsError.message }, { status: 400 });
    }

    if (validStudentIds.length > 0) {
      const { error: applyAssignmentsError } = await auth.adminClient
        .from("students")
        .update({ class_id: id })
        .in("auth_user_id", validStudentIds);

      if (applyAssignmentsError) {
        return NextResponse.json({ error: applyAssignmentsError.message }, { status: 400 });
      }
    }
  }

  try {
    const classes = await fetchClasses(auth.adminClient);
    const classRecord = classes.find((classItem) => classItem.id === id);

    return NextResponse.json({
      message: "Class updated.",
      classRecord,
      classes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Class updated.",
        error: error instanceof Error ? error.message : "Failed to reload classes.",
      },
      { status: 200 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Class id is required." }, { status: 400 });
  }

  const { data: classToDelete, error: classLookupError } = await auth.adminClient
    .from("classes")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (classLookupError) {
    return NextResponse.json({ error: classLookupError.message }, { status: 400 });
  }

  if (!classToDelete) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const { error: unassignError } = await auth.adminClient
    .from("students")
    .update({ class_id: null })
    .eq("class_id", id);

  if (unassignError) {
    return NextResponse.json({ error: unassignError.message }, { status: 400 });
  }

  const { error: deleteError } = await auth.adminClient.from("classes").delete().eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  try {
    const classes = await fetchClasses(auth.adminClient);
    return NextResponse.json({
      message: "Class deleted.",
      classes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Class deleted.",
        error: error instanceof Error ? error.message : "Failed to reload classes.",
      },
      { status: 200 },
    );
  }
}
