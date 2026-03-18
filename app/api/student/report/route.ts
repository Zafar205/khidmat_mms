import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UserRole = "admin" | "teacher" | "student";

type StudentRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  class_id: string | null;
  academic_year: string;
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

type SubjectRow = {
  id: string;
  name: string;
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const avg = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
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

  const currentRole = userData.user.user_metadata?.role as UserRole | undefined;
  if (!currentRole) {
    return NextResponse.json({ error: "User role missing." }, { status: 403 });
  }

  const studentIdParam = new URL(request.url).searchParams.get("studentId")?.trim();
  const requestedStudentId =
    currentRole === "student" ? userData.user.id : studentIdParam || userData.user.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: targetStudentData, error: targetStudentError } = await adminClient
    .from("students")
    .select("id, auth_user_id, name, email, class_id, academic_year, attendance_present, attendance_total")
    .eq("auth_user_id", requestedStudentId)
    .maybeSingle();

  if (targetStudentError) {
    return NextResponse.json({ error: targetStudentError.message }, { status: 400 });
  }

  if (!targetStudentData) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const student = targetStudentData as StudentRow;
  const classId = student.class_id ?? "";

  let className = "";
  if (classId) {
    const { data: classData } = await adminClient
      .from("classes")
      .select("name")
      .eq("id", classId)
      .maybeSingle();
    className = (classData?.name as string | undefined) ?? "";
  }

  const [subjectsResult, studentMarksResult] = await Promise.all([
    classId
      ? adminClient.from("subjects").select("id, name").eq("class_id", classId).order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    adminClient
      .from("student_marks")
      .select(
        "student_id, subject_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
      )
      .eq("student_id", student.id),
  ]);

  if (subjectsResult.error) {
    return NextResponse.json({ error: subjectsResult.error.message }, { status: 400 });
  }

  if (studentMarksResult.error) {
    return NextResponse.json({ error: studentMarksResult.error.message }, { status: 400 });
  }

  const subjects = (subjectsResult.data ?? []) as SubjectRow[];
  const studentMarks = (studentMarksResult.data ?? []) as StudentMarkRow[];
  const studentMarkBySubject = new Map(studentMarks.map((row) => [row.subject_id, row]));

  const subjectMarks = subjects.map((subject) => {
    const mark = studentMarkBySubject.get(subject.id);

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
  });

  const monthlyTests: [number, number, number, number] = [
    avg(subjectMarks.map((mark) => mark.monthlyTest1)),
    avg(subjectMarks.map((mark) => mark.monthlyTest2)),
    avg(subjectMarks.map((mark) => mark.monthlyTest3)),
    avg(subjectMarks.map((mark) => mark.monthlyTest4)),
  ];

  const midTerm = avg(subjectMarks.map((mark) => mark.midTerm));
  const finalTerm = avg(subjectMarks.map((mark) => mark.finalTerm));
  const overallPercent = avg([...monthlyTests, midTerm, finalTerm]);

  const attendancePercent =
    student.attendance_total > 0
      ? Number(((student.attendance_present / student.attendance_total) * 100).toFixed(2))
      : 0;

  let classSummary = {
    className: className || "All Students",
    studentsCount: 0,
    monthlyTests: [0, 0, 0, 0],
    midTerm: 0,
    finalTerm: 0,
    overallPercent: 0,
    attendancePercent: 0,
  };

  if (classId) {
    const { data: classStudentsData, error: classStudentsError } = await adminClient
      .from("students")
      .select("id, attendance_present, attendance_total")
      .eq("class_id", classId);

    if (classStudentsError) {
      return NextResponse.json({ error: classStudentsError.message }, { status: 400 });
    }

    const classStudents = classStudentsData ?? [];
    const classStudentIds = classStudents.map((row) => row.id as string);

    const { data: classMarksData, error: classMarksError } = classStudentIds.length
      ? await adminClient
          .from("student_marks")
          .select(
            "student_id, subject_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
          )
          .in("student_id", classStudentIds)
      : { data: [], error: null };

    if (classMarksError) {
      return NextResponse.json({ error: classMarksError.message }, { status: 400 });
    }

    const classMarks = (classMarksData ?? []) as StudentMarkRow[];

    const classMonthly: [number, number, number, number] = [
      avg(classMarks.map((row) => Number(row.monthly_test_1 ?? 0))),
      avg(classMarks.map((row) => Number(row.monthly_test_2 ?? 0))),
      avg(classMarks.map((row) => Number(row.monthly_test_3 ?? 0))),
      avg(classMarks.map((row) => Number(row.monthly_test_4 ?? 0))),
    ];

    const classMid = avg(classMarks.map((row) => Number(row.mid_term ?? 0)));
    const classFinal = avg(classMarks.map((row) => Number(row.final_term ?? 0)));
    const classOverall = avg([...classMonthly, classMid, classFinal]);

    const classAttendancePercent = avg(
      classStudents.map((row) => {
        const present = Number(row.attendance_present ?? 0);
        const total = Number(row.attendance_total ?? 0);
        return total > 0 ? (present / total) * 100 : 0;
      }),
    );

    classSummary = {
      className: className || "All Students",
      studentsCount: classStudents.length,
      monthlyTests: classMonthly,
      midTerm: classMid,
      finalTerm: classFinal,
      overallPercent: classOverall,
      attendancePercent: Number(classAttendancePercent.toFixed(2)),
    };
  }

  return NextResponse.json({
    student: {
      id: student.auth_user_id ?? student.id,
      name: student.name,
      email: student.email,
      classId,
      className,
      academic: {
        academicYear: student.academic_year,
        monthlyTests,
        midTerm,
        finalTerm,
        attendancePresent: Number(student.attendance_present ?? 0),
        attendanceTotal: Number(student.attendance_total ?? 0),
      },
      overallPercent,
      attendancePercent,
      subjectMarks,
    },
    classSummary,
  });
}
