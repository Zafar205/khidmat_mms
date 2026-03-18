import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type ManagedRole = "teacher" | "student";

type AcademicRecord = {
  academicYear: string;
  monthlyTests: [number, number, number, number];
  midTerm: number;
  finalTerm: number;
  attendancePresent: number;
  attendanceTotal: number;
};

type StudentTableRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  class_id: string | null;
  academic_year: string;
  attendance_present: number;
  attendance_total: number;
};

const toBoundedNumber = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
};

const mapAcademicRecord = (metadata: User["user_metadata"]): AcademicRecord => {
  const academic = (metadata?.academic ?? {}) as Record<string, unknown>;
  const monthly = Array.isArray(academic.monthlyTests) ? academic.monthlyTests : [];

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

const mapAcademicFromStudentRow = (student: StudentTableRow | null): AcademicRecord => {
  if (!student) {
    return {
      academicYear: "2025-2026",
      monthlyTests: [0, 0, 0, 0],
      midTerm: 0,
      finalTerm: 0,
      attendancePresent: 0,
      attendanceTotal: 0,
    };
  }

  return {
    academicYear: student.academic_year,
    monthlyTests: [0, 0, 0, 0],
    midTerm: 0,
    finalTerm: 0,
    attendancePresent: Number(student.attendance_present ?? 0),
    attendanceTotal: Number(student.attendance_total ?? 0),
  };
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

const authorizeAdmin = async (request: Request) => {
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
      error: "Only admin can manage users.",
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    academic?: {
      academicYear?: string;
      monthlyTests?: number[];
      midTerm?: number;
      finalTerm?: number;
      attendancePresent?: number;
      attendanceTotal?: number;
    };
  };

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const password = body.password?.trim();
  const nextAcademic = body.academic;

  if (!email && !name && !password && !nextAcademic) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const { data: userData, error: getUserError } = await auth.adminClient.auth.admin.getUserById(id);

  if (getUserError || !userData.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const role = userData.user.user_metadata?.role;
  if (role !== "teacher" && role !== "student") {
    return NextResponse.json({ error: "Only teacher/student users can be edited." }, { status: 400 });
  }

  const existingMetadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;

  const attributes: {
    email?: string;
    password?: string;
    user_metadata?: Record<string, unknown>;
  } = {
    user_metadata: {
      ...existingMetadata,
      name: name ?? (existingMetadata.name as string | undefined) ?? "",
      password_plain:
        password ?? (existingMetadata.password_plain as string | undefined) ?? "",
    },
  };

  if (email) {
    attributes.email = email;
  }

  if (password) {
    attributes.password = password;
  }

  const { data, error } = await auth.adminClient.auth.admin.updateUserById(id, attributes);

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update user." },
      { status: 400 },
    );
  }

  if (role === "teacher") {
    const { error: teacherUpdateError } = await auth.adminClient.from("teachers").upsert(
      {
        auth_user_id: id,
        name: name ?? ((existingMetadata.name as string | undefined) ?? ""),
        email: email ?? data.user.email ?? "",
      },
      { onConflict: "auth_user_id" },
    );

    if (teacherUpdateError) {
      return NextResponse.json({ error: teacherUpdateError.message }, { status: 400 });
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        role: "teacher",
        name: ((data.user.user_metadata?.name as string | undefined) ?? "").trim(),
        classId: "",
        className: "",
        plainPassword: (data.user.user_metadata?.password_plain as string | undefined) ?? "",
        academic: mapAcademicRecord(data.user.user_metadata),
      },
    });
  }

  const { data: existingStudentData } = await auth.adminClient
    .from("students")
    .select(
      "id, auth_user_id, name, email, class_id, academic_year, attendance_present, attendance_total",
    )
    .eq("auth_user_id", id)
    .maybeSingle();

  const existingStudent = (existingStudentData ?? null) as StudentTableRow | null;
  const existingAcademic = existingStudent
    ? mapAcademicFromStudentRow(existingStudent)
    : mapAcademicRecord(data.user.user_metadata);

  const parsedMonthly = Array.isArray(nextAcademic?.monthlyTests)
    ? nextAcademic.monthlyTests
    : existingAcademic.monthlyTests;

  const updatedAcademic: AcademicRecord = {
    academicYear:
      typeof nextAcademic?.academicYear === "string" && nextAcademic.academicYear.trim()
        ? nextAcademic.academicYear
        : existingAcademic.academicYear,
    monthlyTests: [
      toBoundedNumber(parsedMonthly[0], 0, 100),
      toBoundedNumber(parsedMonthly[1], 0, 100),
      toBoundedNumber(parsedMonthly[2], 0, 100),
      toBoundedNumber(parsedMonthly[3], 0, 100),
    ],
    midTerm: toBoundedNumber(nextAcademic?.midTerm ?? existingAcademic.midTerm, 0, 100),
    finalTerm: toBoundedNumber(nextAcademic?.finalTerm ?? existingAcademic.finalTerm, 0, 100),
    attendancePresent: toBoundedNumber(
      nextAcademic?.attendancePresent ?? existingAcademic.attendancePresent,
      0,
      1000,
    ),
    attendanceTotal: toBoundedNumber(
      nextAcademic?.attendanceTotal ?? existingAcademic.attendanceTotal,
      0,
      1000,
    ),
  };

  if (updatedAcademic.attendancePresent > updatedAcademic.attendanceTotal) {
    return NextResponse.json(
      { error: "Attendance present cannot be greater than attendance total." },
      { status: 400 },
    );
  }

  const { data: savedStudent, error: studentUpdateError } = await auth.adminClient
    .from("students")
    .upsert(
      {
        auth_user_id: id,
        name: name ?? ((existingMetadata.name as string | undefined) ?? ""),
        email: email ?? data.user.email ?? "",
        class_id: existingStudent?.class_id ?? null,
        academic_year: updatedAcademic.academicYear,
        attendance_present: updatedAcademic.attendancePresent,
        attendance_total: updatedAcademic.attendanceTotal,
      },
      { onConflict: "auth_user_id" },
    )
    .select("class_id")
    .single();

  if (studentUpdateError) {
    return NextResponse.json({ error: studentUpdateError.message }, { status: 400 });
  }

  let className = "";
  const classId = (savedStudent?.class_id as string | null) ?? "";
  if (classId) {
    const { data: classData } = await auth.adminClient
      .from("classes")
      .select("name")
      .eq("id", classId)
      .maybeSingle();
    className = (classData?.name as string | undefined) ?? "";
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
      role: "student" as ManagedRole,
      name: ((data.user.user_metadata?.name as string | undefined) ?? "").trim(),
      classId,
      className,
      plainPassword: (data.user.user_metadata?.password_plain as string | undefined) ?? "",
      academic: updatedAcademic,
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }

  const { data: userData, error: getUserError } = await auth.adminClient.auth.admin.getUserById(id);

  if (getUserError || !userData.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const role = userData.user.user_metadata?.role;
  if (role !== "teacher" && role !== "student") {
    return NextResponse.json({ error: "Only teacher/student users can be deleted." }, { status: 400 });
  }

  if (role === "student") {
    const { error: deleteStudentRowError } = await auth.adminClient
      .from("students")
      .delete()
      .eq("auth_user_id", id);

    if (deleteStudentRowError) {
      return NextResponse.json({ error: deleteStudentRowError.message }, { status: 400 });
    }
  }

  if (role === "teacher") {
    const { data: teacherData, error: teacherLookupError } = await auth.adminClient
      .from("teachers")
      .select("id")
      .eq("auth_user_id", id)
      .maybeSingle();

    if (teacherLookupError) {
      return NextResponse.json({ error: teacherLookupError.message }, { status: 400 });
    }

    const teacherId = (teacherData?.id as string | undefined) ?? "";
    if (teacherId) {
      const { error: clearClassTeacherError } = await auth.adminClient
        .from("classes")
        .update({ teacher_id: null })
        .eq("teacher_id", teacherId);

      if (clearClassTeacherError) {
        return NextResponse.json({ error: clearClassTeacherError.message }, { status: 400 });
      }
    }

    const { error: deleteTeacherRowError } = await auth.adminClient
      .from("teachers")
      .delete()
      .eq("auth_user_id", id);

    if (deleteTeacherRowError) {
      return NextResponse.json({ error: deleteTeacherRowError.message }, { status: 400 });
    }
  }

  const { error: deleteError } = await auth.adminClient.auth.admin.deleteUser(id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "User deleted." });
}
