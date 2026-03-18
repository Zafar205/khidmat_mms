import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type StudentRow = {
  id: string;
  class_id: string | null;
};

type SubjectRow = {
  id: string;
  name: string;
};

type MarkRow = {
  subject_id: string;
  monthly_test_1: number;
  monthly_test_2: number;
  monthly_test_3: number;
  monthly_test_4: number;
  mid_term: number;
  final_term: number;
};

type ClassRow = {
  name: string;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const clampScore = (value: unknown) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, parsed));
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
      error: "Only admin can manage students.",
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

const getStudentAndSubjects = async (
  adminClient: SupabaseClient,
  authUserId: string,
) => {
  const { data: studentData, error: studentError } = await adminClient
    .from("students")
    .select("id, class_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (studentError) {
    throw new Error(studentError.message);
  }

  if (!studentData) {
    throw new Error("Student not found.");
  }

  const student = studentData as StudentRow;

  if (!student.class_id) {
    return {
      classAssigned: false,
      classId: "",
      className: "",
      subjects: [],
    };
  }

  const [{ data: classData, error: classError }, { data: subjectsData, error: subjectsError }] =
    await Promise.all([
      adminClient.from("classes").select("name").eq("id", student.class_id).maybeSingle(),
      adminClient
        .from("subjects")
        .select("id, name")
        .eq("class_id", student.class_id)
        .order("name", { ascending: true }),
    ]);

  if (classError) {
    throw new Error(classError.message);
  }

  if (subjectsError) {
    throw new Error(subjectsError.message);
  }

  const classRecord = (classData ?? null) as ClassRow | null;

  const subjects = (subjectsData ?? []) as SubjectRow[];
  const subjectIds = subjects.map((subject) => subject.id);

  const { data: marksData, error: marksError } = subjectIds.length
    ? await adminClient
        .from("student_marks")
        .select(
          "subject_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
        )
        .eq("student_id", student.id)
        .in("subject_id", subjectIds)
    : { data: [], error: null };

  if (marksError) {
    throw new Error(marksError.message);
  }

  const marksRows = (marksData ?? []) as MarkRow[];
  const marksBySubjectId = new Map(marksRows.map((mark) => [mark.subject_id, mark]));

  return {
    classAssigned: true,
    classId: student.class_id,
    className: classRecord?.name ?? "",
    studentDbId: student.id,
    subjects: subjects.map((subject) => {
      const mark = marksBySubjectId.get(subject.id);
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        monthlyTest1: Number(mark?.monthly_test_1 ?? 0),
        monthlyTest2: Number(mark?.monthly_test_2 ?? 0),
        monthlyTest3: Number(mark?.monthly_test_3 ?? 0),
        monthlyTest4: Number(mark?.monthly_test_4 ?? 0),
        midTerm: Number(mark?.mid_term ?? 0),
        finalTerm: Number(mark?.final_term ?? 0),
      };
    }),
  };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  try {
    const result = await getStudentAndSubjects(auth.adminClient, id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load subject marks." },
      { status: 400 },
    );
  }
}

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
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    marks?: Array<{
      subjectId?: string;
      monthlyTest1?: number;
      monthlyTest2?: number;
      monthlyTest3?: number;
      monthlyTest4?: number;
      midTerm?: number;
      finalTerm?: number;
    }>;
  };

  if (!Array.isArray(body.marks)) {
    return NextResponse.json({ error: "Marks payload is required." }, { status: 400 });
  }

  try {
    const result = await getStudentAndSubjects(auth.adminClient, id);

    if (!result.classAssigned || !result.classId || !result.studentDbId) {
      return NextResponse.json({ error: "Student is not assigned to a class." }, { status: 400 });
    }

    const validSubjectIds = new Set(result.subjects.map((subject) => subject.subjectId));

    const upsertRows = body.marks
      .map((mark) => {
        const subjectId = typeof mark.subjectId === "string" ? mark.subjectId.trim() : "";
        if (!subjectId || !validSubjectIds.has(subjectId)) {
          return null;
        }

        return {
          student_id: result.studentDbId,
          subject_id: subjectId,
          monthly_test_1: clampScore(mark.monthlyTest1),
          monthly_test_2: clampScore(mark.monthlyTest2),
          monthly_test_3: clampScore(mark.monthlyTest3),
          monthly_test_4: clampScore(mark.monthlyTest4),
          mid_term: clampScore(mark.midTerm),
          final_term: clampScore(mark.finalTerm),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (upsertRows.length > 0) {
      const { error: upsertError } = await auth.adminClient
        .from("student_marks")
        .upsert(upsertRows, {
          onConflict: "student_id,subject_id",
        });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ message: "Student subject marks updated." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save subject marks." },
      { status: 400 },
    );
  }
}
