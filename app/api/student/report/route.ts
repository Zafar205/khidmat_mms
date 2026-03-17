import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "teacher" | "student";

type AcademicRecord = {
  academicYear: string;
  monthlyTests: [number, number, number, number];
  midTerm: number;
  finalTerm: number;
  attendancePresent: number;
  attendanceTotal: number;

};

const toBoundedNumber = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
};

const mapAcademicRecord = (metadata: User["user_metadata"]): AcademicRecord => {
  const academic = (metadata?.academic ?? {}) as Record<string, unknown>;
  const monthly = Array.isArray(academic.monthlyTests)
    ? academic.monthlyTests
    : [];

  return {
    academicYear:
      typeof academic.academicYear === "string" && academic.academicYear.trim()
        ? academic.academicYear
        : "2025-2026",
    monthlyTests: [
      toBoundedNumber(monthly[0], 0, 100),
      toBoundedNumber(monthly[1], 0, 100),
      toBoundedNumber(monthly[2], 0, 100),
      toBoundedNumber(monthly[3], 0, 100),
    ],
    midTerm: toBoundedNumber(academic.midTerm, 0, 100),
    finalTerm: toBoundedNumber(academic.finalTerm, 0, 100),
    attendancePresent: toBoundedNumber(academic.attendancePresent, 0, 1000),
    attendanceTotal: toBoundedNumber(academic.attendanceTotal, 0, 1000),
  };
};

const buildAssessmentList = (academic: AcademicRecord) => [
  ...academic.monthlyTests,
  academic.midTerm,
  academic.finalTerm,
];

const calculateOverallPercent = (academic: AcademicRecord) => {
  const allAssessments = buildAssessmentList(academic);
  const total = allAssessments.reduce((sum, score) => sum + score, 0);
  return Number((total / allAssessments.length).toFixed(2));
};

const calculateAttendancePercent = (academic: AcademicRecord) => {
  if (academic.attendanceTotal <= 0) {
    return 0;
  }

  return Number(
    ((academic.attendancePresent / academic.attendanceTotal) * 100).toFixed(2),
  );
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

  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const users = data.users ?? [];
  const studentUsers = users.filter((user) => user.user_metadata?.role === "student");
  const targetStudent = studentUsers.find((user) => user.id === requestedStudentId);

  if (!targetStudent) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const studentAcademic = mapAcademicRecord(targetStudent.user_metadata);
  const studentOverallPercent = calculateOverallPercent(studentAcademic);
  const studentAttendancePercent = calculateAttendancePercent(studentAcademic);
  const studentClassId =
    (targetStudent.user_metadata?.classId as string | undefined)?.trim() ?? "";
  const studentClassName =
    (targetStudent.user_metadata?.className as string | undefined)?.trim() ?? "";

  const classCohort = studentClassId
    ? studentUsers.filter(
        (student) =>
          ((student.user_metadata?.classId as string | undefined)?.trim() ?? "") ===
          studentClassId,
      )
    : studentUsers;

  const classRecords = classCohort.map((student) => mapAcademicRecord(student.user_metadata));
  const classCount = classRecords.length;

  const classMonthlyAverages: [number, number, number, number] = [0, 0, 0, 0];
  let classMidTerm = 0;
  let classFinalTerm = 0;
  let classOverall = 0;
  let classAttendance = 0;

  for (const record of classRecords) {
    classMonthlyAverages[0] += record.monthlyTests[0];
    classMonthlyAverages[1] += record.monthlyTests[1];
    classMonthlyAverages[2] += record.monthlyTests[2];
    classMonthlyAverages[3] += record.monthlyTests[3];
    classMidTerm += record.midTerm;
    classFinalTerm += record.finalTerm;
    classOverall += calculateOverallPercent(record);
    classAttendance += calculateAttendancePercent(record);
  }

  const average = (value: number) =>
    classCount === 0 ? 0 : Number((value / classCount).toFixed(2));

  const classSummary = {
    className: studentClassName || "All Students",
    studentsCount: classCount,
    monthlyTests: classMonthlyAverages.map(average),
    midTerm: average(classMidTerm),
    finalTerm: average(classFinalTerm),
    overallPercent: average(classOverall),
    attendancePercent: average(classAttendance),
  };

  return NextResponse.json({
    student: {
      id: targetStudent.id,
      name: (targetStudent.user_metadata?.name as string | undefined) ?? "",
      email: targetStudent.email ?? "",
      classId: studentClassId,
      className: studentClassName,
      academic: studentAcademic,
      overallPercent: studentOverallPercent,
      attendancePercent: studentAttendancePercent,
    },
    classSummary,
  });
}
