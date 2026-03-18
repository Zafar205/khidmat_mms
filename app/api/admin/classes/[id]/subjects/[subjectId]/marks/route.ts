import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type StudentRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
};

type StudentMarkRow = {
  student_id: string;
  monthly_test_1: number;
  monthly_test_2: number;
  monthly_test_3: number;
  monthly_test_4: number;
  mid_term: number;
  final_term: number;
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

const clampScore = (value: unknown) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, parsed));
};

const getClassSubjectAndStudents = async (
  adminClient: SupabaseClient,
  classId: string,
  subjectId: string,
) => {
  const { data: subjectData, error: subjectError } = await adminClient
    .from("subjects")
    .select("id, class_id, name")
    .eq("id", subjectId)
    .eq("class_id", classId)
    .maybeSingle();

  if (subjectError) {
    throw new Error(subjectError.message);
  }

  if (!subjectData) {
    throw new Error("Subject not found in this class.");
  }

  const subject = subjectData as SubjectRow;

  const { data: studentsData, error: studentsError } = await adminClient
    .from("students")
    .select("id, auth_user_id, name, email")
    .eq("class_id", classId)
    .order("name", { ascending: true });

  if (studentsError) {
    throw new Error(studentsError.message);
  }

  const students = (studentsData ?? []) as StudentRow[];
  const studentIds = students.map((student) => student.id);

  const { data: marksData, error: marksError } = studentIds.length
    ? await adminClient
        .from("student_marks")
        .select(
          "student_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
        )
        .eq("subject_id", subjectId)
        .in("student_id", studentIds)
    : { data: [], error: null };

  if (marksError) {
    throw new Error(marksError.message);
  }

  const marks = (marksData ?? []) as StudentMarkRow[];
  const marksByStudentId = new Map(marks.map((mark) => [mark.student_id, mark]));

  return {
    subject: {
      id: subject.id,
      classId: subject.class_id,
      name: subject.name,
    },
    students: students.map((student) => {
      const mark = marksByStudentId.get(student.id);
      return {
        id: student.auth_user_id ?? student.id,
        name: student.name,
        email: student.email,
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

  try {
    const result = await getClassSubjectAndStudents(auth.adminClient, classId, subjectId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load marks." },
      { status: 400 },
    );
  }
}

export async function PATCH(
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

  const body = (await request.json().catch(() => ({}))) as {
    marks?: Array<{
      studentId?: string;
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
    const { data: subjectData, error: subjectError } = await auth.adminClient
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("class_id", classId)
      .maybeSingle();

    if (subjectError) {
      return NextResponse.json({ error: subjectError.message }, { status: 400 });
    }

    if (!subjectData) {
      return NextResponse.json({ error: "Subject not found in this class." }, { status: 404 });
    }

    const requestedStudentIds = Array.from(
      new Set(
        body.marks
          .map((item) => (typeof item.studentId === "string" ? item.studentId.trim() : ""))
          .filter((studentId) => studentId.length > 0),
      ),
    );

    const { data: studentsData, error: studentsError } = requestedStudentIds.length
      ? await auth.adminClient
          .from("students")
          .select("id, auth_user_id")
          .eq("class_id", classId)
          .in("auth_user_id", requestedStudentIds)
      : { data: [], error: null };

    if (studentsError) {
      return NextResponse.json({ error: studentsError.message }, { status: 400 });
    }

    const students = (studentsData ?? []) as Array<{ id: string; auth_user_id: string | null }>;
    const studentIdByAuthId = new Map(
      students
        .filter((student) => typeof student.auth_user_id === "string" && student.auth_user_id)
        .map((student) => [student.auth_user_id as string, student.id]),
    );

    const upsertRows = body.marks
      .map((item) => {
        const authStudentId = typeof item.studentId === "string" ? item.studentId.trim() : "";
        const dbStudentId = studentIdByAuthId.get(authStudentId);
        if (!dbStudentId) {
          return null;
        }

        return {
          student_id: dbStudentId,
          subject_id: subjectId,
          monthly_test_1: clampScore(item.monthlyTest1),
          monthly_test_2: clampScore(item.monthlyTest2),
          monthly_test_3: clampScore(item.monthlyTest3),
          monthly_test_4: clampScore(item.monthlyTest4),
          mid_term: clampScore(item.midTerm),
          final_term: clampScore(item.finalTerm),
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

    const result = await getClassSubjectAndStudents(auth.adminClient, classId, subjectId);
    return NextResponse.json({
      message: "Subject marks updated.",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update marks." },
      { status: 400 },
    );
  }
}
