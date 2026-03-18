import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TeacherRow = {
  id: string;
  name: string;
};

type ClassRow = {
  id: string;
  name: string;
};

type SubjectRow = {
  id: string;
  name: string;
};

type StudentRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  attendance_present: number;
  attendance_total: number;
};

type StudentMarkRow = {
  student_id: string;
  subject_id: string;
  monthly_test_1: number;
  monthly_test_2: number;
  monthly_test_3: number;
  monthly_test_4: number;
  mid_term: number;
  final_term: number;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

export async function GET(request: Request) {
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
    return NextResponse.json({ error: "Only teacher can access this endpoint." }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: teacherData, error: teacherError } = await adminClient
    .from("teachers")
    .select("id, name")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (teacherError) {
    return NextResponse.json({ error: teacherError.message }, { status: 400 });
  }

  if (!teacherData) {
    return NextResponse.json(
      {
        classAssigned: false,
        message: "No class is assigned to you.",
        students: [],
        subjects: [],
      },
      { status: 200 },
    );
  }

  const teacher = teacherData as TeacherRow;

  const { data: classData, error: classError } = await adminClient
    .from("classes")
    .select("id, name")
    .eq("teacher_id", teacher.id)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  if (!classData) {
    return NextResponse.json(
      {
        classAssigned: false,
        message: "No class is assigned to you.",
        teacherName: teacher.name,
        students: [],
        subjects: [],
      },
      { status: 200 },
    );
  }

  const classRecord = classData as ClassRow;

  const [{ data: subjectsData, error: subjectsError }, { data: studentsData, error: studentsError }] =
    await Promise.all([
      adminClient
        .from("subjects")
        .select("id, name")
        .eq("class_id", classRecord.id)
        .order("name", { ascending: true }),
      adminClient
        .from("students")
        .select("id, auth_user_id, name, email, attendance_present, attendance_total")
        .eq("class_id", classRecord.id)
        .order("name", { ascending: true }),
    ]);

  if (subjectsError) {
    return NextResponse.json({ error: subjectsError.message }, { status: 400 });
  }

  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 400 });
  }

  const subjects = (subjectsData ?? []) as SubjectRow[];
  const studentRows = (studentsData ?? []) as StudentRow[];
  const studentIds = studentRows.map((student) => student.id);

  let marksRows: StudentMarkRow[] = [];
  if (studentIds.length > 0) {
    const { data: marksData, error: marksError } = await adminClient
      .from("student_marks")
      .select(
        "student_id, subject_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
      )
      .in("student_id", studentIds);

    if (marksError) {
      return NextResponse.json({ error: marksError.message }, { status: 400 });
    }

    marksRows = (marksData ?? []) as StudentMarkRow[];
  }

  const marksByStudentAndSubject = new Map<string, StudentMarkRow>();
  for (const row of marksRows) {
    marksByStudentAndSubject.set(`${row.student_id}:${row.subject_id}`, row);
  }

  const students = studentRows
    .filter((student) => typeof student.auth_user_id === "string" && student.auth_user_id.length > 0)
    .map((student) => ({
      id: student.auth_user_id as string,
      name: student.name,
      email: student.email,
      attendancePresent: Number(student.attendance_present ?? 0),
      attendanceTotal: Number(student.attendance_total ?? 0),
      marks: subjects.map((subject) => {
        const row = marksByStudentAndSubject.get(`${student.id}:${subject.id}`);

        return {
          subjectId: subject.id,
          subjectName: subject.name,
          monthlyTest1: Number(row?.monthly_test_1 ?? 0),
          monthlyTest2: Number(row?.monthly_test_2 ?? 0),
          monthlyTest3: Number(row?.monthly_test_3 ?? 0),
          monthlyTest4: Number(row?.monthly_test_4 ?? 0),
          midTerm: Number(row?.mid_term ?? 0),
          finalTerm: Number(row?.final_term ?? 0),
        };
      }),
    }));

  return NextResponse.json({
    classAssigned: true,
    teacherName: teacher.name,
    classRecord,
    subjects,
    students,
  });
}
