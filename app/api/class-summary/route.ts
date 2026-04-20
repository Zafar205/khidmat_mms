import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type UserRole = "admin" | "teacher";

type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
};

type TeacherRow = {
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

type SubjectRow = {
  id: string;
  name: string;
};

type MarkRow = {
  student_id: string;
  subject_id: string;
  monthly_test_1: number;
  monthly_test_2: number;
  monthly_test_3: number;
  monthly_test_4: number;
  mid_term: number;
  final_term: number;
};

type RankedStudent = {
  rank: number;
  studentId: string;
  studentName: string;
  email: string;
  monthlyTests: [number, number, number, number];
  monthlyAverage: number;
  midTerm: number;
  finalTerm: number;
  overallPercent: number;
  attendancePercent: number;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

const toAttendancePercent = (present: number, total: number) => {
  if (total <= 0) {
    return 0;
  }

  return Number(((present / total) * 100).toFixed(2));
};

const rankStudents = <T extends { studentName: string; overallPercent: number }>(
  students: T[],
) => {
  const sorted = [...students].sort(
    (a, b) =>
      b.overallPercent - a.overallPercent ||
      a.studentName.localeCompare(b.studentName),
  );

  let currentRank = 0;
  let previousScore: number | null = null;

  return sorted.map((student, index) => {
    if (previousScore === null || student.overallPercent !== previousScore) {
      currentRank = index + 1;
      previousScore = student.overallPercent;
    }

    return {
      ...student,
      rank: currentRank,
    };
  });
};

const getAuthContext = async (request: Request) => {
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

  let role: UserRole | null = null;
  if (userData.user.email === ADMIN_EMAIL) {
    role = "admin";
  } else if (userData.user.user_metadata?.role === "teacher") {
    role = "teacher";
  }

  if (!role) {
    return {
      ok: false as const,
      status: 403,
      error: "Only teacher and super admin can access class summary.",
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
    role,
    authUserId: userData.user.id,
    adminClient,
  };
};

const getTeacherClassId = async (
  adminClient: SupabaseClient,
  authUserId: string,
) => {
  const { data: teacherData, error: teacherError } = await adminClient
    .from("teachers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (teacherError) {
    throw new HttpError(400, teacherError.message);
  }

  if (!teacherData) {
    throw new HttpError(404, "Teacher account not found.");
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
    throw new HttpError(400, classError.message);
  }

  if (!classData?.id) {
    throw new HttpError(404, "No class is assigned to you.");
  }

  return classData.id as string;
};

const buildClassSummary = async (adminClient: SupabaseClient, classId: string) => {
  const { data: classData, error: classError } = await adminClient
    .from("classes")
    .select("id, name, teacher_id")
    .eq("id", classId)
    .maybeSingle();

  if (classError) {
    throw new HttpError(400, classError.message);
  }

  if (!classData) {
    throw new HttpError(404, "Class not found.");
  }

  const classRecord = classData as ClassRow;

  let teacherName = "";
  if (classRecord.teacher_id) {
    const { data: teacherData, error: teacherError } = await adminClient
      .from("teachers")
      .select("name")
      .eq("id", classRecord.teacher_id)
      .maybeSingle();

    if (teacherError) {
      throw new HttpError(400, teacherError.message);
    }

    teacherName = (teacherData?.name as string | undefined) ?? "";
  }

  const [
    { data: studentsData, error: studentsError },
    { data: subjectsData, error: subjectsError },
  ] = await Promise.all([
    adminClient
      .from("students")
      .select(
        "id, auth_user_id, name, email, attendance_present, attendance_total",
      )
      .eq("class_id", classRecord.id)
      .order("name", { ascending: true }),
    adminClient
      .from("subjects")
      .select("id, name")
      .eq("class_id", classRecord.id)
      .order("name", { ascending: true }),
  ]);

  if (studentsError) {
    throw new HttpError(400, studentsError.message);
  }

  if (subjectsError) {
    throw new HttpError(400, subjectsError.message);
  }

  const students = (studentsData ?? []) as StudentRow[];
  const subjects = (subjectsData ?? []) as SubjectRow[];
  const studentIds = students.map((student) => student.id);
  const subjectIds = subjects.map((subject) => subject.id);

  const { data: marksData, error: marksError } =
    studentIds.length > 0 && subjectIds.length > 0
      ? await adminClient
          .from("student_marks")
          .select(
            "student_id, subject_id, monthly_test_1, monthly_test_2, monthly_test_3, monthly_test_4, mid_term, final_term",
          )
          .in("student_id", studentIds)
          .in("subject_id", subjectIds)
      : { data: [], error: null };

  if (marksError) {
    throw new HttpError(400, marksError.message);
  }

  const marks = (marksData ?? []) as MarkRow[];
  const marksByStudentAndSubject = new Map<string, MarkRow>();

  for (const mark of marks) {
    marksByStudentAndSubject.set(`${mark.student_id}:${mark.subject_id}`, mark);
  }

  const studentRows = students.map((student) => {
    const subjectScores = subjects.map((subject) => {
      const row = marksByStudentAndSubject.get(`${student.id}:${subject.id}`);

      return {
        monthlyTest1: Number(row?.monthly_test_1 ?? 0),
        monthlyTest2: Number(row?.monthly_test_2 ?? 0),
        monthlyTest3: Number(row?.monthly_test_3 ?? 0),
        monthlyTest4: Number(row?.monthly_test_4 ?? 0),
        midTerm: Number(row?.mid_term ?? 0),
        finalTerm: Number(row?.final_term ?? 0),
      };
    });

    const monthlyTests: [number, number, number, number] = [
      avg(subjectScores.map((score) => score.monthlyTest1)),
      avg(subjectScores.map((score) => score.monthlyTest2)),
      avg(subjectScores.map((score) => score.monthlyTest3)),
      avg(subjectScores.map((score) => score.monthlyTest4)),
    ];

    const midTerm = avg(subjectScores.map((score) => score.midTerm));
    const finalTerm = avg(subjectScores.map((score) => score.finalTerm));
    const monthlyAverage = avg([...monthlyTests]);
    const overallPercent = avg([...monthlyTests, midTerm, finalTerm]);
    const attendancePercent = toAttendancePercent(
      Number(student.attendance_present ?? 0),
      Number(student.attendance_total ?? 0),
    );

    return {
      studentId: student.auth_user_id ?? student.id,
      studentName: student.name,
      email: student.email,
      monthlyAverage,
      monthlyTests,
      midTerm,
      finalTerm,
      overallPercent,
      attendancePercent,
    };
  });

  const rankedStudents = rankStudents(studentRows);

  const studentRankings: RankedStudent[] = rankedStudents.map((student) => ({
    rank: student.rank,
    studentId: student.studentId,
    studentName: student.studentName,
    email: student.email,
    monthlyTests: student.monthlyTests,
    monthlyAverage: student.monthlyAverage,
    midTerm: student.midTerm,
    finalTerm: student.finalTerm,
    overallPercent: student.overallPercent,
    attendancePercent: student.attendancePercent,
  }));

  const topStudents = studentRankings.slice(0, 5);

  const subjectSummaries = subjects.map((subject) => {
    const perStudentRows = students.map((student) => {
      const mark = marksByStudentAndSubject.get(`${student.id}:${subject.id}`);

      const monthlyTests: [number, number, number, number] = [
        Number(mark?.monthly_test_1 ?? 0),
        Number(mark?.monthly_test_2 ?? 0),
        Number(mark?.monthly_test_3 ?? 0),
        Number(mark?.monthly_test_4 ?? 0),
      ];

      const midTerm = Number(mark?.mid_term ?? 0);
      const finalTerm = Number(mark?.final_term ?? 0);
      const overallPercent = avg([...monthlyTests, midTerm, finalTerm]);

      return {
        studentId: student.auth_user_id ?? student.id,
        studentName: student.name,
        email: student.email,
        monthlyTests,
        midTerm,
        finalTerm,
        overallPercent,
      };
    });

    const monthlyTests: [number, number, number, number] = [
      avg(perStudentRows.map((row) => row.monthlyTests[0])),
      avg(perStudentRows.map((row) => row.monthlyTests[1])),
      avg(perStudentRows.map((row) => row.monthlyTests[2])),
      avg(perStudentRows.map((row) => row.monthlyTests[3])),
    ];

    const midTerm = avg(perStudentRows.map((row) => row.midTerm));
    const finalTerm = avg(perStudentRows.map((row) => row.finalTerm));
    const overallPercent = avg([...monthlyTests, midTerm, finalTerm]);

    const rankedBySubject = rankStudents(perStudentRows).slice(0, 3).map((row) => ({
      rank: row.rank,
      studentName: row.studentName,
      overallPercent: row.overallPercent,
    }));

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      monthlyTests,
      midTerm,
      finalTerm,
      overallPercent,
      topStudents: rankedBySubject,
      studentMarks: perStudentRows.map((row) => ({
        studentId: row.studentId,
        studentName: row.studentName,
        email: row.email,
        monthlyTests: row.monthlyTests,
        midTerm: row.midTerm,
        finalTerm: row.finalTerm,
      })),
    };
  });

  const classAveragesMonthlyTests: [number, number, number, number] = [
    avg(studentRows.map((student) => student.monthlyTests[0])),
    avg(studentRows.map((student) => student.monthlyTests[1])),
    avg(studentRows.map((student) => student.monthlyTests[2])),
    avg(studentRows.map((student) => student.monthlyTests[3])),
  ];

  const classAveragesMidTerm = avg(studentRows.map((student) => student.midTerm));
  const classAveragesFinalTerm = avg(studentRows.map((student) => student.finalTerm));
  const classAveragesOverall = avg(studentRows.map((student) => student.overallPercent));
  const classAttendancePercent = avg(
    studentRows.map((student) => student.attendancePercent),
  );

  const passingStudents = studentRows.filter(
    (student) => student.overallPercent >= 40,
  ).length;

  const passRate =
    studentRows.length > 0
      ? Number(((passingStudents / studentRows.length) * 100).toFixed(2))
      : 0;

  return {
    classId: classRecord.id,
    className: classRecord.name,
    teacherName,
    studentsCount: students.length,
    generatedAt: new Date().toISOString(),
    classAverages: {
      monthlyTests: classAveragesMonthlyTests,
      midTerm: classAveragesMidTerm,
      finalTerm: classAveragesFinalTerm,
      overallPercent: classAveragesOverall,
      attendancePercent: classAttendancePercent,
      passRate,
    },
    topStudents,
    studentRankings,
    subjectSummaries,
  };
};

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const queryClassId = url.searchParams.get("classId")?.trim() ?? "";

    const classId =
      auth.role === "admin"
        ? queryClassId
        : await getTeacherClassId(auth.adminClient, auth.authUserId);

    if (!classId) {
      throw new HttpError(400, "Class id is required.");
    }

    const summary = await buildClassSummary(auth.adminClient, classId);

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load class summary.",
      },
      { status: 400 },
    );
  }
}
