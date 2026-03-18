import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeacherRow = {
  id: string;
};

type ClassRow = {
  id: string;
};

type StudentRow = {
  id: string;
  class_id: string | null;
};

type MarkInput = {
  subjectId: string;
  monthlyTest1: number;
  monthlyTest2: number;
  monthlyTest3: number;
  monthlyTest4: number;
  midTerm: number;
  finalTerm: number;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const toBoundedNumber = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    return NextResponse.json({ error: "Only teacher can update students." }, { status: 403 });
  }

  const { id: studentAuthUserId } = await context.params;
  if (!studentAuthUserId) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    marks?: MarkInput[];
    attendancePresent?: number;
    attendanceTotal?: number;
  };

  if (!Array.isArray(body.marks)) {
    return NextResponse.json({ error: "Marks payload is required." }, { status: 400 });
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

  const { data: studentData, error: studentError } = await adminClient
    .from("students")
    .select("id, class_id")
    .eq("auth_user_id", studentAuthUserId)
    .maybeSingle();

  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 400 });
  }

  if (!studentData) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const student = studentData as StudentRow;

  if (student.class_id !== classRecord.id) {
    return NextResponse.json(
      { error: "You can only update students in your assigned class." },
      { status: 403 },
    );
  }

  const requestedSubjectIds = Array.from(
    new Set(
      body.marks
        .map((mark) => (typeof mark.subjectId === "string" ? mark.subjectId.trim() : ""))
        .filter((subjectId) => subjectId.length > 0),
    ),
  );

  if (requestedSubjectIds.length === 0) {
    return NextResponse.json({ error: "At least one subject mark is required." }, { status: 400 });
  }

  const { data: classSubjects, error: subjectError } = await adminClient
    .from("subjects")
    .select("id")
    .eq("class_id", classRecord.id)
    .in("id", requestedSubjectIds);

  if (subjectError) {
    return NextResponse.json({ error: subjectError.message }, { status: 400 });
  }

  const validSubjectIds = new Set((classSubjects ?? []).map((subject) => subject.id as string));
  const hasInvalidSubject = requestedSubjectIds.some((subjectId) => !validSubjectIds.has(subjectId));

  if (hasInvalidSubject) {
    return NextResponse.json(
      { error: "One or more subjects are not part of your assigned class." },
      { status: 400 },
    );
  }

  const upsertRows = body.marks.map((mark) => ({
    student_id: student.id,
    subject_id: mark.subjectId,
    monthly_test_1: toBoundedNumber(mark.monthlyTest1, 0, 100),
    monthly_test_2: toBoundedNumber(mark.monthlyTest2, 0, 100),
    monthly_test_3: toBoundedNumber(mark.monthlyTest3, 0, 100),
    monthly_test_4: toBoundedNumber(mark.monthlyTest4, 0, 100),
    mid_term: toBoundedNumber(mark.midTerm, 0, 100),
    final_term: toBoundedNumber(mark.finalTerm, 0, 100),
  }));

  const { error: upsertError } = await adminClient
    .from("student_marks")
    .upsert(upsertRows, { onConflict: "student_id,subject_id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const attendancePresent = toBoundedNumber(body.attendancePresent, 0, 1000);
  const attendanceTotal = toBoundedNumber(body.attendanceTotal, 0, 1000);

  if (attendancePresent > attendanceTotal) {
    return NextResponse.json(
      { error: "Attendance present cannot be greater than attendance total." },
      { status: 400 },
    );
  }

  const { error: attendanceUpdateError } = await adminClient
    .from("students")
    .update({
      attendance_present: attendancePresent,
      attendance_total: attendanceTotal,
    })
    .eq("id", student.id);

  if (attendanceUpdateError) {
    return NextResponse.json({ error: attendanceUpdateError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Student subject marks updated." });
}
