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

type TeacherTableRow = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
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

const mapAcademicFromStudentRow = (student: StudentTableRow | undefined): AcademicRecord => {
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

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data: usersData, error: usersError }, { data: studentRows, error: studentsError }, { data: teacherRows, error: teachersError }, { data: classRows, error: classesError }] =
    await Promise.all([
      auth.adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      auth.adminClient
        .from("students")
        .select(
          "id, auth_user_id, name, email, class_id, academic_year, attendance_present, attendance_total",
        ),
      auth.adminClient.from("teachers").select("id, auth_user_id, name, email"),
      auth.adminClient.from("classes").select("id, name"),
    ]);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 400 });
  }

  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 400 });
  }

  if (teachersError) {
    return NextResponse.json({ error: teachersError.message }, { status: 400 });
  }

  if (classesError) {
    return NextResponse.json({ error: classesError.message }, { status: 400 });
  }

  const studentByAuthId = new Map(
    ((studentRows ?? []) as StudentTableRow[])
      .filter((row) => row.auth_user_id)
      .map((row) => [row.auth_user_id as string, row]),
  );

  const teacherByAuthId = new Map(
    ((teacherRows ?? []) as TeacherTableRow[])
      .filter((row) => row.auth_user_id)
      .map((row) => [row.auth_user_id as string, row]),
  );

  const classNameById = new Map(
    (classRows ?? []).map((row) => [row.id as string, row.name as string]),
  );

  const users = (usersData.users ?? [])
    .filter(
      (user) => user.user_metadata?.role === "teacher" || user.user_metadata?.role === "student",
    )
    .map((user) => {
      const role = user.user_metadata?.role as ManagedRole;
      const teacherRow = teacherByAuthId.get(user.id);
      const studentRow = studentByAuthId.get(user.id);
      const academic =
        role === "student"
          ? mapAcademicFromStudentRow(studentRow) ?? mapAcademicRecord(user.user_metadata)
          : mapAcademicRecord(user.user_metadata);
      const classId = role === "student" ? studentRow?.class_id ?? "" : "";

      return {
        id: user.id,
        email: user.email ?? (role === "student" ? studentRow?.email ?? "" : teacherRow?.email ?? ""),
        role,
        name:
          (role === "student" ? studentRow?.name : teacherRow?.name) ??
          ((user.user_metadata?.name as string | undefined) ?? ""),
        classId,
        className: classId ? classNameById.get(classId) ?? "" : "",
        plainPassword: (user.user_metadata?.password_plain as string | undefined) ?? "",
        academic,
      };
    });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    role?: ManagedRole;
  };

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role = body.role;

  if (!name || !email || !password || !role) {
    return NextResponse.json(
      { error: "Name, email, password, and role are required." },
      { status: 400 },
    );
  }

  if (role !== "teacher" && role !== "student") {
    return NextResponse.json({ error: "Role must be teacher or student." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role,
      name,
      password_plain: password,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "User was not created." }, { status: 400 });
  }

  const createdUser = data.user;

  if (role === "teacher") {
    const { error: insertTeacherError } = await auth.adminClient.from("teachers").insert({
      auth_user_id: createdUser.id,
      name,
      email,
    });

    if (insertTeacherError) {
      await auth.adminClient.auth.admin.deleteUser(createdUser.id);
      return NextResponse.json({ error: insertTeacherError.message }, { status: 400 });
    }
  }

  if (role === "student") {
    const { error: insertStudentError } = await auth.adminClient.from("students").insert({
      auth_user_id: createdUser.id,
      name,
      email,
      academic_year: "2025-2026",
      attendance_present: 0,
      attendance_total: 0,
    });

    if (insertStudentError) {
      await auth.adminClient.auth.admin.deleteUser(createdUser.id);
      return NextResponse.json({ error: insertStudentError.message }, { status: 400 });
    }
  }

  const academic: AcademicRecord = {
    academicYear: "2025-2026",
    monthlyTests: [0, 0, 0, 0],
    midTerm: 0,
    finalTerm: 0,
    attendancePresent: 0,
    attendanceTotal: 0,
  };

  return NextResponse.json(
    {
      user: {
        id: createdUser.id,
        email,
        role,
        name,
        classId: "",
        className: "",
        plainPassword: password,
        academic,
      },
    },
    { status: 201 },
  );
}
