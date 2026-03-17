import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type ManagedRole = "teacher" | "student";

type ClassRecord = {
  id: string;
  name: string;
  studentIds: string[];
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
};

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

  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return {
      ok: false as const,
      status: 400,
      error: error.message,
    };
  }

  const users = data.users ?? [];
  const adminUser = users.find((user) => user.email === ADMIN_EMAIL);

  if (!adminUser) {
    return {
      ok: false as const,
      status: 404,
      error: "Admin account not found.",
    };
  }

  const studentUsers = users.filter(
    (user) => user.user_metadata?.role === ("student" satisfies ManagedRole),
  );

  return {
    ok: true as const,
    adminClient,
    adminUser,
    studentUsers,
  };
};

const mapStudent = (student: User) => ({
  id: student.id,
  name: (student.user_metadata?.name as string | undefined) ?? "",
  email: student.email ?? "",
  classId: (student.user_metadata?.classId as string | undefined) ?? "",
  className: (student.user_metadata?.className as string | undefined) ?? "",
});

export async function GET(request: Request) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const classes = parseClasses(auth.adminUser.user_metadata).map((classRecord) => ({
    ...classRecord,
    studentIds: classRecord.studentIds.filter((studentId) =>
      auth.studentUsers.some((student) => student.id === studentId),
    ),
  }));

  return NextResponse.json({
    classes,
    students: auth.studentUsers.map(mapStudent),
  });
}

export async function POST(request: Request) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Class name is required." }, { status: 400 });
  }

  const classes = parseClasses(auth.adminUser.user_metadata);
  const hasDuplicate = classes.some(
    (existingClass) => existingClass.name.toLowerCase() === name.toLowerCase(),
  );

  if (hasDuplicate) {
    return NextResponse.json({ error: "Class already exists." }, { status: 400 });
  }

  const nextClasses: ClassRecord[] = [
    ...classes,
    {
      id: randomUUID(),
      name,
      studentIds: [],
    },
  ];

  const existingMetadata = (auth.adminUser.user_metadata ?? {}) as Record<string, unknown>;
  const { data, error } = await auth.adminClient.auth.admin.updateUserById(auth.adminUser.id, {
    user_metadata: {
      ...existingMetadata,
      classes: nextClasses,
    },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create class." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      message: "Class created.",
      classes: nextClasses,
    },
    { status: 201 },
  );
}
