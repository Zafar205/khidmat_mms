import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

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

  const studentUsers = users.filter((user) => user.user_metadata?.role === "student");

  return {
    ok: true as const,
    adminClient,
    adminUser,
    studentUsers,
  };
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Class id is required." }, { status: 400 });
  }

  const classes = parseClasses(auth.adminUser.user_metadata);
  const classIndex = classes.findIndex((existingClass) => existingClass.id === id);

  if (classIndex < 0) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    studentIds?: string[];
  };

  const nextName = typeof body.name === "string" ? body.name.trim() : undefined;
  const nextStudentIdsRaw = Array.isArray(body.studentIds) ? body.studentIds : undefined;

  if (nextName !== undefined && !nextName) {
    return NextResponse.json({ error: "Class name cannot be empty." }, { status: 400 });
  }

  if (nextName) {
    const duplicateName = classes.some(
      (existingClass, index) =>
        index !== classIndex &&
        existingClass.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (duplicateName) {
      return NextResponse.json({ error: "Class name already exists." }, { status: 400 });
    }
  }

  const validStudentIds = new Set(auth.studentUsers.map((student) => student.id));
  const nextStudentIds =
    nextStudentIdsRaw === undefined
      ? classes[classIndex].studentIds
      : Array.from(
          new Set(
            nextStudentIdsRaw.filter(
              (studentId) => typeof studentId === "string" && validStudentIds.has(studentId),
            ),
          ),
        );

  const updatedClass: ClassRecord = {
    ...classes[classIndex],
    name: nextName ?? classes[classIndex].name,
    studentIds: nextStudentIds,
  };

  const selectedStudentIds = new Set(updatedClass.studentIds);
  const nextClasses = classes.map((classRecord, index) => {
    if (index === classIndex) {
      return updatedClass;
    }

    return {
      ...classRecord,
      studentIds: classRecord.studentIds.filter(
        (studentId) => !selectedStudentIds.has(studentId),
      ),
    };
  });

  const existingAdminMetadata =
    (auth.adminUser.user_metadata ?? {}) as Record<string, unknown>;

  const { data: adminUpdateData, error: adminUpdateError } =
    await auth.adminClient.auth.admin.updateUserById(auth.adminUser.id, {
      user_metadata: {
        ...existingAdminMetadata,
        classes: nextClasses,
      },
    });

  if (adminUpdateError || !adminUpdateData.user) {
    return NextResponse.json(
      { error: adminUpdateError?.message ?? "Failed to update class." },
      { status: 400 },
    );
  }

  const finalAssignmentByStudent = new Map<string, { classId: string; className: string }>();
  for (const classRecord of nextClasses) {
    for (const studentId of classRecord.studentIds) {
      if (!finalAssignmentByStudent.has(studentId)) {
        finalAssignmentByStudent.set(studentId, {
          classId: classRecord.id,
          className: classRecord.name,
        });
      }
    }
  }

  const studentsToUpdate = auth.studentUsers.filter((student) => {
    const nextAssignment = finalAssignmentByStudent.get(student.id);
    const currentClassId =
      (student.user_metadata?.classId as string | undefined)?.trim() ?? "";
    const currentClassName =
      (student.user_metadata?.className as string | undefined)?.trim() ?? "";

    const nextClassId = nextAssignment?.classId ?? "";
    const nextClassName = nextAssignment?.className ?? "";

    return currentClassId !== nextClassId || currentClassName !== nextClassName;
  });

  for (const student of studentsToUpdate) {
    const existingMetadata = (student.user_metadata ?? {}) as Record<string, unknown>;
    const nextAssignment = finalAssignmentByStudent.get(student.id);

    const { error } = await auth.adminClient.auth.admin.updateUserById(student.id, {
      user_metadata: {
        ...existingMetadata,
        classId: nextAssignment?.classId ?? "",
        className: nextAssignment?.className ?? "",
      },
    });

    if (error) {
      return NextResponse.json(
        { error: `Class updated, but failed to update student ${student.email ?? student.id}.` },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    message: "Class updated.",
    classRecord: updatedClass,
    classes: nextClasses,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Class id is required." }, { status: 400 });
  }

  const classes = parseClasses(auth.adminUser.user_metadata);
  const classToDelete = classes.find((classRecord) => classRecord.id === id);

  if (!classToDelete) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const nextClasses = classes.filter((classRecord) => classRecord.id !== id);
  const existingAdminMetadata =
    (auth.adminUser.user_metadata ?? {}) as Record<string, unknown>;

  const { data: adminUpdateData, error: adminUpdateError } =
    await auth.adminClient.auth.admin.updateUserById(auth.adminUser.id, {
      user_metadata: {
        ...existingAdminMetadata,
        classes: nextClasses,
      },
    });

  if (adminUpdateError || !adminUpdateData.user) {
    return NextResponse.json(
      { error: adminUpdateError?.message ?? "Failed to delete class." },
      { status: 400 },
    );
  }

  const studentIdsInDeletedClass = new Set(classToDelete.studentIds);
  const studentsToUpdate = auth.studentUsers.filter((student) => {
    const currentClassId =
      (student.user_metadata?.classId as string | undefined)?.trim() ?? "";
    const currentClassName =
      (student.user_metadata?.className as string | undefined)?.trim() ?? "";

    return (
      currentClassId === id ||
      currentClassName === classToDelete.name ||
      studentIdsInDeletedClass.has(student.id)
    );
  });

  for (const student of studentsToUpdate) {
    const existingMetadata = (student.user_metadata ?? {}) as Record<string, unknown>;

    const { error } = await auth.adminClient.auth.admin.updateUserById(student.id, {
      user_metadata: {
        ...existingMetadata,
        classId: "",
        className: "",
      },
    });

    if (error) {
      return NextResponse.json(
        {
          error: `Class deleted, but failed to unassign student ${student.email ?? student.id}.`,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    message: "Class deleted.",
    classes: nextClasses,
  });
}
