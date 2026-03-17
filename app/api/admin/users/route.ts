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

  const { data, error } = await auth.adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const users = (data.users ?? [])
    .filter((user) => user.user_metadata?.role === "teacher" || user.user_metadata?.role === "student")
    .map(mapManagedUser);

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

  return NextResponse.json({ user: mapManagedUser(data.user) }, { status: 201 });
}
