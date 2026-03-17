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

type ClassRecord = {
  id: string;
  name: string;
  studentIds: string[];
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

const mapManagedUser = (user: User) => ({
  id: user.id,
  email: user.email ?? "",
  role: user.user_metadata?.role as ManagedRole,
  name: (user.user_metadata?.name as string | undefined) ?? "",
  classId: (user.user_metadata?.classId as string | undefined) ?? "",
  className: (user.user_metadata?.className as string | undefined) ?? "",
  plainPassword:
    (user.user_metadata?.password_plain as string | undefined) ?? "",
  academic: mapAcademicRecord(user.user_metadata),
});

const parseClasses = (metadata: User["user_metadata"]): ClassRecord[] => {
  const rawClasses = (metadata?.classes ?? []) as unknown;
  if (!Array.isArray(rawClasses)) {
    return [];
  }

  return rawClasses
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const studentIds = Array.isArray(record.studentIds)
        ? record.studentIds
            .filter((item) => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim())
        : [];

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        studentIds: Array.from(new Set(studentIds)),
      };
    })
    .filter((value): value is ClassRecord => value !== null);
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
  const existingAcademic = mapAcademicRecord(userData.user.user_metadata);

  const parsedMonthly = Array.isArray(nextAcademic?.monthlyTests)
    ? nextAcademic.monthlyTests
    : existingAcademic.monthlyTests;

  const updatedAcademic: AcademicRecord = {
    academicYear:
      typeof nextAcademic?.academicYear === "string" &&
      nextAcademic.academicYear.trim()
        ? nextAcademic.academicYear
        : existingAcademic.academicYear,
    monthlyTests: [
      toBoundedNumber(parsedMonthly[0], 0, 100),
      toBoundedNumber(parsedMonthly[1], 0, 100),
      toBoundedNumber(parsedMonthly[2], 0, 100),
      toBoundedNumber(parsedMonthly[3], 0, 100),
    ],
    midTerm: toBoundedNumber(nextAcademic?.midTerm ?? existingAcademic.midTerm, 0, 100),
    finalTerm: toBoundedNumber(
      nextAcademic?.finalTerm ?? existingAcademic.finalTerm,
      0,
      100,
    ),
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
      academic: updatedAcademic,
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

  return NextResponse.json({ user: mapManagedUser(data.user) });
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
    const { data: usersData, error: listUsersError } = await auth.adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listUsersError) {
      return NextResponse.json({ error: listUsersError.message }, { status: 400 });
    }

    const users = usersData.users ?? [];
    const adminUser = users.find((user) => user.email === ADMIN_EMAIL);

    if (!adminUser) {
      return NextResponse.json({ error: "Admin account not found." }, { status: 404 });
    }

    const classes = parseClasses(adminUser.user_metadata);
    const nextClasses = classes.map((classRecord) => ({
      ...classRecord,
      studentIds: classRecord.studentIds.filter((studentId) => studentId !== id),
    }));

    const existingAdminMetadata =
      (adminUser.user_metadata ?? {}) as Record<string, unknown>;

    const { error: adminUpdateError } = await auth.adminClient.auth.admin.updateUserById(
      adminUser.id,
      {
        user_metadata: {
          ...existingAdminMetadata,
          classes: nextClasses,
        },
      },
    );

    if (adminUpdateError) {
      return NextResponse.json(
        { error: adminUpdateError.message },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await auth.adminClient.auth.admin.deleteUser(id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ message: "User deleted." });
}
