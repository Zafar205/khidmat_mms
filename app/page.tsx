"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type UserRole = "admin" | "teacher" | "student";
type ManagedRole = "teacher" | "student";
type AdminSection = "teachers" | "students" | "classes";
type AcademicRecord = {
  academicYear: string;
  monthlyTests: [number, number, number, number];
  midTerm: number;
  finalTerm: number;
  attendancePresent: number;
  attendanceTotal: number;
};

type ManagedUser = {
  id: string;
  email: string;
  role: ManagedRole;
  name: string;
  classId: string;
  className: string;
  plainPassword: string;
  academic: AcademicRecord;
};

type ClassRecord = {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  subjects: Array<{
    id: string;
    name: string;
  }>;
};

type ClassEditState = {
  name: string;
  teacherId: string;
  studentIds: string[];
};

type UserEditState = {
  email: string;
  name: string;
  password: string;
  academicYear: string;
  monthlyTests: [string, string, string, string];
  midTerm: string;
  finalTerm: string;
  attendancePresent: string;
  attendanceTotal: string;
};

type StudentReport = {
  student: {
    id: string;
    name: string;
    email: string;
    classId: string;
    className: string;
    academic: AcademicRecord;
    overallPercent: number;
    attendancePercent: number;
    subjectMarks: Array<{
      subjectId: string;
      subjectName: string;
      monthlyTest1: number;
      monthlyTest2: number;
      monthlyTest3: number;
      monthlyTest4: number;
      midTerm: number;
      finalTerm: number;
    }>;
  };
  classSummary: {
    className: string;
    studentsCount: number;
    monthlyTests: number[];
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    attendancePercent: number;
  };
};

type TeacherStudent = {
  id: string;
  name: string;
  email: string;
  attendancePresent: number;
  attendanceTotal: number;
  marks: Array<{
    subjectId: string;
    subjectName: string;
    monthlyTest1: number;
    monthlyTest2: number;
    monthlyTest3: number;
    monthlyTest4: number;
    midTerm: number;
    finalTerm: number;
  }>;
};

type TeacherAssignableStudent = {
  id: string;
  name: string;
  email: string;
};

type TeacherStudentMarkEdit = {
  subjectId: string;
  subjectName: string;
  monthlyTest1: string;
  monthlyTest2: string;
  monthlyTest3: string;
  monthlyTest4: string;
  midTerm: string;
  finalTerm: string;
};

type TeacherStudentEditState = {
  name: string;
  email: string;
  attendancePresent: string;
  attendanceTotal: string;
  marks: TeacherStudentMarkEdit[];
};

type TeacherStudentsResponse = {
  classAssigned: boolean;
  message?: string;
  teacherName?: string;
  classRecord?: {
    id: string;
    name: string;
  };
  subjects: Array<{
    id: string;
    name: string;
  }>;
  students: TeacherStudent[];
  assignableStudents?: TeacherAssignableStudent[];
};

type StudentSubjectMarkEdit = {
  subjectId: string;
  subjectName: string;
  monthlyTest1: string;
  monthlyTest2: string;
  monthlyTest3: string;
  monthlyTest4: string;
  midTerm: string;
  finalTerm: string;
};

type StudentMarksResponse = {
  classAssigned: boolean;
  classId: string;
  className: string;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    monthlyTest1: number;
    monthlyTest2: number;
    monthlyTest3: number;
    monthlyTest4: number;
    midTerm: number;
    finalTerm: number;
  }>;
};

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";
const ADMIN_PASSWORD = "123456";

const sectionRoleMap: Record<Exclude<AdminSection, "classes">, ManagedRole> = {
  teachers: "teacher",
  students: "student",
};

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

const toScoreString = (value: number) => value.toString();

const parseScore = (value: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, parsed));
};

const parseAttendance = (value: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(1000, parsed));
};

const getClassEditState = (classRecord: ClassRecord): ClassEditState => ({
  name: classRecord.name,
  teacherId: classRecord.teacherId,
  studentIds: classRecord.studentIds,
});

type NotificationBannerProps = {
  message: string;
  onClose: () => void;
  className?: string;
};

const NotificationBanner = ({
  message,
  onClose,
  className = "mt-4",
}: NotificationBannerProps) => (
  <div
    className={`${className} flex items-center justify-between gap-3 rounded-md border border-[#632567]/60 bg-[#632567] px-3 py-2 text-sm text-white`}
  >
    <p className="text-white">{message}</p>
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={onClose}
      className="rounded px-2 py-0.5 text-sm font-semibold text-white hover:bg-white/20"
    >
      x
    </button>
  </div>
);

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [adminSection, setAdminSection] = useState<AdminSection>("teachers");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<ManagedRole>("teacher");
  const [createUserError, setCreateUserError] = useState("");
  const [createUserMessage, setCreateUserMessage] = useState("");
  const [isCreateUserSubmitting, setIsCreateUserSubmitting] = useState(false);
  const [createUserExpanded, setCreateUserExpanded] = useState(false);

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersError, setUsersError] = useState("");
  const [usersMessage, setUsersMessage] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUserId, setSavingUserId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [userEdits, setUserEdits] = useState<Record<string, UserEditState>>({});
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [studentReportError, setStudentReportError] = useState("");
  const [loadingStudentReport, setLoadingStudentReport] = useState(false);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classEdits, setClassEdits] = useState<Record<string, ClassEditState>>({});
  const [newClassName, setNewClassName] = useState("");
  const [newClassTeacherId, setNewClassTeacherId] = useState("");
  const [classesError, setClassesError] = useState("");
  const [classesMessage, setClassesMessage] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [isCreateClassSubmitting, setIsCreateClassSubmitting] = useState(false);
  const [savingClassId, setSavingClassId] = useState("");
  const [deletingClassId, setDeletingClassId] = useState("");
  const [expandedClassId, setExpandedClassId] = useState("");
  const [classStudentSearch, setClassStudentSearch] = useState<Record<string, string>>({});
  const [newSubjectNameByClass, setNewSubjectNameByClass] = useState<Record<string, string>>({});
  const [addingSubjectClassId, setAddingSubjectClassId] = useState("");
  const [deletingSubjectKey, setDeletingSubjectKey] = useState("");
  const [studentSubjectMarks, setStudentSubjectMarks] = useState<
    Record<
      string,
      {
        classAssigned: boolean;
        className: string;
        marks: StudentSubjectMarkEdit[];
      }
    >
  >({});
  const [loadingStudentMarksUserId, setLoadingStudentMarksUserId] = useState("");
  const [teacherStudents, setTeacherStudents] = useState<TeacherStudent[]>([]);
  const [teacherClassName, setTeacherClassName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherClassAssigned, setTeacherClassAssigned] = useState(false);
  const [teacherMessage, setTeacherMessage] = useState("");
  const [teacherError, setTeacherError] = useState("");
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
  const [savingTeacherStudentId, setSavingTeacherStudentId] = useState("");
  const [teacherEdits, setTeacherEdits] = useState<
    Record<string, TeacherStudentEditState>
  >({});
  const [editingTeacherStudentId, setEditingTeacherStudentId] = useState("");
  const [teacherAssignableStudents, setTeacherAssignableStudents] = useState<
    TeacherAssignableStudent[]
  >([]);
  const [teacherStudentSearch, setTeacherStudentSearch] = useState("");
  const [assigningTeacherStudentId, setAssigningTeacherStudentId] = useState("");
  const [teacherNewStudentName, setTeacherNewStudentName] = useState("");
  const [teacherNewStudentEmail, setTeacherNewStudentEmail] = useState("");
  const [teacherNewStudentPassword, setTeacherNewStudentPassword] = useState("");
  const [isCreatingTeacherStudent, setIsCreatingTeacherStudent] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoadingSession(false);
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const currentRole = useMemo<UserRole | null>(() => {
    if (!session?.user) {
      return null;
    }

    if (session.user.email === ADMIN_EMAIL) {
      return "admin";
    }

    const roleFromMetadata = session.user.user_metadata?.role;
    if (roleFromMetadata === "teacher" || roleFromMetadata === "student") {
      return roleFromMetadata;
    }

    return null;
  }, [session]);

  const usersForActiveSection = useMemo(() => {
    if (adminSection === "classes") {
      return [];
    }

    const activeRole = sectionRoleMap[adminSection];
    return managedUsers.filter((user) => user.role === activeRole);
  }, [adminSection, managedUsers]);

  useEffect(() => {
    if (adminSection === "teachers") {
      setNewUserRole("teacher");
      return;
    }

    if (adminSection === "students") {
      setNewUserRole("student");
    }
  }, [adminSection]);

  useEffect(() => {
    setCreateUserExpanded(false);
  }, [adminSection]);

  const classAssignableStudents = useMemo(
    () => managedUsers.filter((user) => user.role === "student"),
    [managedUsers],
  );

  const teacherUsers = useMemo(
    () => managedUsers.filter((user) => user.role === "teacher"),
    [managedUsers],
  );

  const classAssignmentByStudent = useMemo(() => {
    const assignments = new Map<string, string>();

    for (const classRecord of classes) {
      const edit = classEdits[classRecord.id] ?? getClassEditState(classRecord);

      for (const studentId of edit.studentIds) {
        if (!assignments.has(studentId)) {
          assignments.set(studentId, classRecord.id);
        }
      }
    }

    return assignments;
  }, [classEdits, classes]);

  const callAdminApi = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("You are not authenticated.");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      if (options.body) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(path, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers ?? {}),
        },
      });

      const responseData = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        users?: ManagedUser[];
        classes?: ClassRecord[];
        classRecord?: ClassRecord;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Request failed.");
      }

      return responseData;
    },
    [session?.access_token],
  );

  const applyUserEditsFromList = useCallback((users: ManagedUser[]) => {
    const nextEdits: Record<string, UserEditState> = {};

    for (const user of users) {
      nextEdits[user.id] = {
        email: user.email,
        name: user.name,
        password: "",
        academicYear: user.academic.academicYear,
        monthlyTests: user.academic.monthlyTests.map(toScoreString) as [
          string,
          string,
          string,
          string,
        ],
        midTerm: toScoreString(user.academic.midTerm),
        finalTerm: toScoreString(user.academic.finalTerm),
        attendancePresent: user.academic.attendancePresent.toString(),
        attendanceTotal: user.academic.attendanceTotal.toString(),
      };
    }

    setUserEdits(nextEdits);
  }, []);

  const applyClassEditsFromList = useCallback((classList: ClassRecord[]) => {
    const nextEdits: Record<string, ClassEditState> = {};
    const nextSearch: Record<string, string> = {};

    for (const classRecord of classList) {
      nextEdits[classRecord.id] = getClassEditState(classRecord);
      nextSearch[classRecord.id] = "";
    }

    setClassEdits(nextEdits);
    setClassStudentSearch(nextSearch);
  }, []);

  const loadManagedUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError("");

    try {
      const result = await callAdminApi("/api/admin/users", {
        method: "GET",
      });

      const users = result.users ?? [];
      setManagedUsers(users);
      applyUserEditsFromList(users);
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Unable to load users.",
      );
    } finally {
      setLoadingUsers(false);
    }
  }, [applyUserEditsFromList, callAdminApi]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setClassesError("");

    try {
      const result = await callAdminApi("/api/admin/classes", {
        method: "GET",
      });

      const classList = result.classes ?? [];
      setClasses(classList);
      applyClassEditsFromList(classList);
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to load classes.",
      );
    } finally {
      setLoadingClasses(false);
    }
  }, [applyClassEditsFromList, callAdminApi]);

  const loadStudentReport = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      return;
    }

    setLoadingStudentReport(true);
    setStudentReportError("");

    try {
      const response = await fetch("/api/student/report", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseData = (await response.json().catch(() => ({}))) as {
        error?: string;
        student?: StudentReport["student"];
        classSummary?: StudentReport["classSummary"];
      };

      if (!response.ok || !responseData.student || !responseData.classSummary) {
        throw new Error(responseData.error ?? "Unable to load report.");
      }

      setStudentReport({
        student: responseData.student,
        classSummary: responseData.classSummary,
      });
    } catch (error) {
      setStudentReportError(
        error instanceof Error ? error.message : "Unable to load report.",
      );
    } finally {
      setLoadingStudentReport(false);
    }
  }, [session?.access_token]);

  const callTeacherApi = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("You are not authenticated.");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      if (options.body) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(path, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers ?? {}),
        },
      });

      const responseData = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Request failed.");
      }

      return responseData;
    },
    [session?.access_token],
  );

  const loadTeacherStudents = useCallback(async () => {
    setLoadingTeacherStudents(true);
    setTeacherError("");

    try {
      const response = await callTeacherApi("/api/teacher/students", {
        method: "GET",
      });

      const data = response as TeacherStudentsResponse;
      const classAssigned = Boolean(data.classAssigned);
      const students = data.students ?? [];

      setTeacherClassAssigned(classAssigned);
      setTeacherClassName(data.classRecord?.name ?? "");
      setTeacherName(data.teacherName ?? "");
      setTeacherMessage(data.message ?? "");
      setTeacherStudents(students);
      setTeacherAssignableStudents(data.assignableStudents ?? []);

      const nextEdits: Record<string, TeacherStudentEditState> = {};
      for (const student of students) {
        nextEdits[student.id] = {
          name: student.name,
          email: student.email,
          attendancePresent: student.attendancePresent.toString(),
          attendanceTotal: student.attendanceTotal.toString(),
          marks: student.marks.map((mark) => ({
            subjectId: mark.subjectId,
            subjectName: mark.subjectName,
            monthlyTest1: toScoreString(mark.monthlyTest1),
            monthlyTest2: toScoreString(mark.monthlyTest2),
            monthlyTest3: toScoreString(mark.monthlyTest3),
            monthlyTest4: toScoreString(mark.monthlyTest4),
            midTerm: toScoreString(mark.midTerm),
            finalTerm: toScoreString(mark.finalTerm),
          })),
        };
      }

      setTeacherEdits(nextEdits);
    } catch (error) {
      setTeacherError(
        error instanceof Error ? error.message : "Unable to load class students.",
      );
      setTeacherClassAssigned(false);
      setTeacherClassName("");
      setTeacherStudents([]);
      setTeacherAssignableStudents([]);
    } finally {
      setLoadingTeacherStudents(false);
    }
  }, [callTeacherApi]);

  useEffect(() => {
    if (currentRole !== "admin") {
      return;
    }

    void loadManagedUsers();
    void loadClasses();
  }, [currentRole, loadClasses, loadManagedUsers]);

  useEffect(() => {
    if (currentRole !== "student") {
      return;
    }

    void loadStudentReport();
  }, [currentRole, loadStudentReport]);

  useEffect(() => {
    if (currentRole !== "teacher") {
      return;
    }

    void loadTeacherStudents();
  }, [currentRole, loadTeacherStudents]);

  const handleAdminBootstrap = async () => {
    const signupResult = await supabase.auth.signUp({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      options: {
        data: {
          role: "admin",
        },
      },
    });

    if (signupResult.error) {
      return { ok: false as const, message: signupResult.error.message };
    }

    const signInResult = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (signInResult.error) {
      return { ok: false as const, message: signInResult.error.message };
    }

    return { ok: true as const };
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setIsAuthSubmitting(true);

    try {
      const signInResult = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInResult.error) {
        setAuthMessage("Signed in successfully.");
        return;
      }

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const bootstrap = await handleAdminBootstrap();
        if (!bootstrap.ok) {
          setAuthError(bootstrap.message);
          return;
        }

        setAuthMessage("Admin account initialized and signed in.");
        return;
      }

      setAuthError(signInResult.error.message);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setCreateUserError("");
    setCreateUserMessage("");
    setIsCreateUserSubmitting(true);

    try {
      await callAdminApi("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      setCreateUserMessage(
        `${roleLabel[newUserRole]} account created. This user can now sign in with the same credentials.`,
      );
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("teacher");
      await loadManagedUsers();
    } catch (error) {
      setCreateUserError(
        error instanceof Error ? error.message : "Unable to create user.",
      );
    } finally {
      setIsCreateUserSubmitting(false);
    }
  };

  const handleCreateClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClassesError("");
    setClassesMessage("");
    setIsCreateClassSubmitting(true);

    try {
      await callAdminApi("/api/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          name: newClassName,
          teacherId: newClassTeacherId,
        }),
      });

      setClassesMessage("Class created successfully.");
      setNewClassName("");
      setNewClassTeacherId("");
      await loadClasses();
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to create class.",
      );
    } finally {
      setIsCreateClassSubmitting(false);
    }
  };

  const handleClassEditField = (
    classId: string,
    field: keyof ClassEditState,
    value: string | string[],
  ) => {
    setClassEdits((previous) => {
      const existing = previous[classId] ?? {
        name: "",
        teacherId: "",
        studentIds: [],
      };

      return {
        ...previous,
        [classId]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const handleClassSearchChange = (classId: string, value: string) => {
    setClassStudentSearch((previous) => ({
      ...previous,
      [classId]: value,
    }));
  };

  const handleClassRowToggle = (classId: string) => {
    setExpandedClassId((previous) => (previous === classId ? "" : classId));
  };

  const handleAddSubjectToClass = async (classId: string) => {
    const name = (newSubjectNameByClass[classId] ?? "").trim();
    if (!name) {
      setClassesError("Subject name is required.");
      return;
    }

    setClassesError("");
    setClassesMessage("");
    setAddingSubjectClassId(classId);

    try {
      const response = (await callAdminApi(`/api/admin/classes/${classId}/subjects`, {
        method: "POST",
        body: JSON.stringify({ name }),
      })) as {
        message?: string;
        subject?: {
          id: string;
          name: string;
        };
      };

      setNewSubjectNameByClass((previous) => ({
        ...previous,
        [classId]: "",
      }));
      setClassesMessage(response.message ?? "Subject added.");

      await loadClasses();
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to add subject.",
      );
    } finally {
      setAddingSubjectClassId("");
    }
  };

  const handleDeleteSubjectFromClass = async (
    classId: string,
    subjectId: string,
    subjectName: string,
  ) => {
    const confirmed = window.confirm(`Delete subject "${subjectName}"?`);
    if (!confirmed) {
      return;
    }

    const subjectKey = `${classId}:${subjectId}`;
    setClassesError("");
    setClassesMessage("");
    setDeletingSubjectKey(subjectKey);

    try {
      await callAdminApi(`/api/admin/classes/${classId}/subjects/${subjectId}`, {
        method: "DELETE",
      });

      setClassesMessage("Subject deleted.");
      await loadClasses();
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to delete subject.",
      );
    } finally {
      setDeletingSubjectKey("");
    }
  };


  const loadStudentSubjectMarks = useCallback(
    async (userId: string) => {
      setUsersError("");
      setLoadingStudentMarksUserId(userId);

      try {
        const response = (await callAdminApi(`/api/admin/students/${userId}/marks`, {
          method: "GET",
        })) as StudentMarksResponse;

        setStudentSubjectMarks((previous) => ({
          ...previous,
          [userId]: {
            classAssigned: response.classAssigned,
            className: response.className,
            marks: (response.subjects ?? []).map((subject) => ({
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              monthlyTest1: toScoreString(subject.monthlyTest1),
              monthlyTest2: toScoreString(subject.monthlyTest2),
              monthlyTest3: toScoreString(subject.monthlyTest3),
              monthlyTest4: toScoreString(subject.monthlyTest4),
              midTerm: toScoreString(subject.midTerm),
              finalTerm: toScoreString(subject.finalTerm),
            })),
          },
        }));
      } catch (error) {
        setUsersError(
          error instanceof Error
            ? error.message
            : "Unable to load student subject marks.",
        );
      } finally {
        setLoadingStudentMarksUserId("");
      }
    },
    [callAdminApi],
  );

  const handleStudentSubjectMarkField = (
    userId: string,
    subjectId: string,
    field: keyof Omit<StudentSubjectMarkEdit, "subjectId" | "subjectName">,
    value: string,
  ) => {
    setStudentSubjectMarks((previous) => {
      const existing = previous[userId];
      if (!existing) {
        return previous;
      }

      return {
        ...previous,
        [userId]: {
          ...existing,
          marks: existing.marks.map((mark) =>
            mark.subjectId === subjectId ? { ...mark, [field]: value } : mark,
          ),
        },
      };
    });
  };

  const handleStudentToggleInClass = (classId: string, studentId: string) => {
    setClassEdits((previous) => {
      const existing = previous[classId] ?? {
        name: "",
        teacherId: "",
        studentIds: [],
      };

      const isCurrentlySelected = existing.studentIds.includes(studentId);

      if (isCurrentlySelected) {
        return {
          ...previous,
          [classId]: {
            ...existing,
            studentIds: existing.studentIds.filter((id) => id !== studentId),
          },
        };
      }

      const nextState: Record<string, ClassEditState> = { ...previous };

      for (const classRecord of classes) {
        const currentEdit = nextState[classRecord.id] ?? getClassEditState(classRecord);
        nextState[classRecord.id] = {
          ...currentEdit,
          studentIds:
            classRecord.id === classId
              ? Array.from(new Set([...currentEdit.studentIds, studentId]))
              : currentEdit.studentIds.filter((id) => id !== studentId),
        };
      }

      return nextState;
    });
  };

  const handleSaveClass = async (classId: string) => {
    const edit = classEdits[classId];
    if (!edit) {
      return;
    }

    setClassesError("");
    setClassesMessage("");
    setSavingClassId(classId);

    try {
      await callAdminApi(`/api/admin/classes/${classId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name,
          teacherId: edit.teacherId,
          studentIds: edit.studentIds,
        }),
      });

      setClassesMessage("Class saved successfully.");
      await loadClasses();
      await loadManagedUsers();
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to update class.",
      );
    } finally {
      setSavingClassId("");
    }
  };

  const handleUserEditField = (
    userId: string,
    field: keyof UserEditState,
    value: string,
  ) => {
    setUserEdits((previous) => ({
      ...previous,
      [userId]: {
        ...(previous[userId] ?? {
          email: "",
          name: "",
          password: "",
          academicYear: "2025-2026",
          monthlyTests: ["0", "0", "0", "0"] as [string, string, string, string],
          midTerm: "0",
          finalTerm: "0",
          attendancePresent: "0",
          attendanceTotal: "0",
        }),
        [field]: value,
      },
    }));
  };

  const handleSaveUser = async (userId: string) => {
    const edit = userEdits[userId];
    if (!edit) {
      return;
    }

    const user = managedUsers.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }

    setUsersError("");
    setUsersMessage("");
    setSavingUserId(userId);

    try {
      const payload: {
        email?: string;
        name?: string;
        password?: string;
        academic?: AcademicRecord;
      } = {
        email: edit.email,
        name: edit.name,
      };

      payload.academic = {
        academicYear: edit.academicYear.trim() || "2025-2026",
        monthlyTests: [
          parseScore(edit.monthlyTests[0]),
          parseScore(edit.monthlyTests[1]),
          parseScore(edit.monthlyTests[2]),
          parseScore(edit.monthlyTests[3]),
        ],
        midTerm: parseScore(edit.midTerm),
        finalTerm: parseScore(edit.finalTerm),
        attendancePresent: parseAttendance(edit.attendancePresent),
        attendanceTotal: parseAttendance(edit.attendanceTotal),
      };

      if (edit.password.trim()) {
        payload.password = edit.password.trim();
      }

      await callAdminApi(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (user.role === "student") {
        const markState = studentSubjectMarks[userId];
        if (markState && markState.classAssigned) {
          await callAdminApi(`/api/admin/students/${userId}/marks`, {
            method: "PATCH",
            body: JSON.stringify({
              marks: markState.marks.map((mark) => ({
                subjectId: mark.subjectId,
                monthlyTest1: parseScore(mark.monthlyTest1),
                monthlyTest2: parseScore(mark.monthlyTest2),
                monthlyTest3: parseScore(mark.monthlyTest3),
                monthlyTest4: parseScore(mark.monthlyTest4),
                midTerm: parseScore(mark.midTerm),
                finalTerm: parseScore(mark.finalTerm),
              })),
            }),
          });
        }
      }

      setUsersMessage("User updated successfully.");
      await loadManagedUsers();
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Unable to update user.",
      );
    } finally {
      setSavingUserId("");
    }
  };

  const handleToggleUserEdit = async (user: ManagedUser) => {
    const nextEditingUserId = editingUserId === user.id ? "" : user.id;
    setEditingUserId(nextEditingUserId);

    if (nextEditingUserId && user.role === "student") {
      await loadStudentSubjectMarks(user.id);
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    const confirmed = window.confirm(
      `Delete ${user.role} \"${user.name || user.email}\"? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setUsersError("");
    setUsersMessage("");
    setDeletingUserId(user.id);

    try {
      await callAdminApi(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      if (editingUserId === user.id) {
        setEditingUserId("");
      }

      setUsersMessage("User deleted successfully.");
      await loadManagedUsers();
      await loadClasses();
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Unable to delete user.",
      );
    } finally {
      setDeletingUserId("");
    }
  };

  const handleDeleteClass = async (classRecord: ClassRecord) => {
    const confirmed = window.confirm(
      `Delete class \"${classRecord.name}\"? Assigned students will be unassigned.`,
    );

    if (!confirmed) {
      return;
    }

    setClassesError("");
    setClassesMessage("");
    setDeletingClassId(classRecord.id);

    try {
      await callAdminApi(`/api/admin/classes/${classRecord.id}`, {
        method: "DELETE",
      });

      if (expandedClassId === classRecord.id) {
        setExpandedClassId("");
      }

      setClassesMessage("Class deleted successfully.");
      await loadClasses();
      await loadManagedUsers();
    } catch (error) {
      setClassesError(
        error instanceof Error ? error.message : "Unable to delete class.",
      );
    } finally {
      setDeletingClassId("");
    }
  };

  const handleSignOut = async () => {
    setAuthError("");
    setAuthMessage("");
    await supabase.auth.signOut();
  };

  const handleTeacherSubjectField = (
    userId: string,
    subjectId: string,
    field: keyof Omit<TeacherStudentMarkEdit, "subjectId" | "subjectName">,
    value: string,
  ) => {
    setTeacherEdits((previous) => ({
      ...previous,
      [userId]: {
        ...(previous[userId] ?? {
          name: "",
          email: "",
          attendancePresent: "0",
          attendanceTotal: "0",
          marks: [],
        }),
        marks: (previous[userId]?.marks ?? []).map((mark) =>
          mark.subjectId === subjectId ? { ...mark, [field]: value } : mark,
        ),
      },
    }));
  };

  const handleTeacherAttendanceField = (
    userId: string,
    field: "attendancePresent" | "attendanceTotal",
    value: string,
  ) => {
    setTeacherEdits((previous) => ({
      ...previous,
      [userId]: {
        ...(previous[userId] ?? {
          name: "",
          email: "",
          attendancePresent: "0",
          attendanceTotal: "0",
          marks: [],
        }),
        [field]: value,
      },
    }));
  };

  const handleSaveTeacherStudent = async (studentId: string) => {
    const edit = teacherEdits[studentId];
    if (!edit) {
      return;
    }

    const normalizedMarks = edit.marks.map((mark) => ({
      subjectId: mark.subjectId,
      subjectName: mark.subjectName,
      monthlyTest1: parseScore(mark.monthlyTest1),
      monthlyTest2: parseScore(mark.monthlyTest2),
      monthlyTest3: parseScore(mark.monthlyTest3),
      monthlyTest4: parseScore(mark.monthlyTest4),
      midTerm: parseScore(mark.midTerm),
      finalTerm: parseScore(mark.finalTerm),
    }));
    const normalizedAttendancePresent = parseAttendance(edit.attendancePresent);
    const normalizedAttendanceTotal = parseAttendance(edit.attendanceTotal);

    if (normalizedAttendancePresent > normalizedAttendanceTotal) {
      setTeacherError("Attendance present cannot be greater than attendance total.");
      return;
    }

    setTeacherError("");
    setTeacherMessage("");
    setSavingTeacherStudentId(studentId);

    try {
      await callTeacherApi(`/api/teacher/students/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          marks: normalizedMarks.map((mark) => ({
            subjectId: mark.subjectId,
            monthlyTest1: mark.monthlyTest1,
            monthlyTest2: mark.monthlyTest2,
            monthlyTest3: mark.monthlyTest3,
            monthlyTest4: mark.monthlyTest4,
            midTerm: mark.midTerm,
            finalTerm: mark.finalTerm,
          })),
          attendancePresent: normalizedAttendancePresent,
          attendanceTotal: normalizedAttendanceTotal,
        }),
      });

      setTeacherMessage("Student subject marks updated.");

      setTeacherStudents((previous) =>
        previous.map((student) =>
          student.id === studentId
            ? {
                ...student,
                attendancePresent: normalizedAttendancePresent,
                attendanceTotal: normalizedAttendanceTotal,
                marks: normalizedMarks,
              }
            : student,
        ),
      );

      setTeacherEdits((previous) => ({
        ...previous,
        [studentId]: {
          ...(previous[studentId] ?? {
            name: edit.name,
            email: edit.email,
            attendancePresent: normalizedAttendancePresent.toString(),
            attendanceTotal: normalizedAttendanceTotal.toString(),
            marks: [],
          }),
          name: edit.name,
          email: edit.email,
          attendancePresent: normalizedAttendancePresent.toString(),
          attendanceTotal: normalizedAttendanceTotal.toString(),
          marks: normalizedMarks.map((mark) => ({
            subjectId: mark.subjectId,
            subjectName: mark.subjectName,
            monthlyTest1: toScoreString(mark.monthlyTest1),
            monthlyTest2: toScoreString(mark.monthlyTest2),
            monthlyTest3: toScoreString(mark.monthlyTest3),
            monthlyTest4: toScoreString(mark.monthlyTest4),
            midTerm: toScoreString(mark.midTerm),
            finalTerm: toScoreString(mark.finalTerm),
          })),
        },
      }));
    } catch (error) {
      setTeacherError(
        error instanceof Error ? error.message : "Unable to update student record.",
      );
    } finally {
      setSavingTeacherStudentId("");
    }
  };

  const handleAssignStudentToTeacherClass = async (studentId: string) => {
    setTeacherError("");
    setTeacherMessage("");
    setAssigningTeacherStudentId(studentId);

    try {
      const response = (await callTeacherApi("/api/teacher/students", {
        method: "POST",
        body: JSON.stringify({ studentId }),
      })) as {
        message?: string;
      };

      setTeacherStudentSearch("");
      await loadTeacherStudents();
      setTeacherMessage(response.message ?? "Student assigned to your class.");
    } catch (error) {
      setTeacherError(
        error instanceof Error ? error.message : "Unable to assign student to your class.",
      );
    } finally {
      setAssigningTeacherStudentId("");
    }
  };

  const handleCreateTeacherStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTeacherError("");
    setTeacherMessage("");
    setIsCreatingTeacherStudent(true);

    try {
      const response = (await callTeacherApi("/api/teacher/students/create", {
        method: "POST",
        body: JSON.stringify({
          name: teacherNewStudentName,
          email: teacherNewStudentEmail,
          password: teacherNewStudentPassword,
        }),
      })) as {
        message?: string;
      };

      setTeacherNewStudentName("");
      setTeacherNewStudentEmail("");
      setTeacherNewStudentPassword("");
      await loadTeacherStudents();
      setTeacherMessage(response.message ?? "Student created and assigned to your class.");
    } catch (error) {
      setTeacherError(
        error instanceof Error ? error.message : "Unable to create student.",
      );
    } finally {
      setIsCreatingTeacherStudent(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-[#632567] text-white grid place-items-center px-6">
        <p className="text-white/90">Loading authentication...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#632567] text-white py-14 px-6">
        <main className="mx-auto w-full max-w-xl rounded-2xl border border-white/40 bg-white p-8 shadow-2xl text-[#632567]">
          <h1 className="text-3xl font-bold tracking-tight">Sign In</h1>
          <p className="mt-3 text-[#632567]/85">
            RLCC Marks Management System access for admin, teachers, and students.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
            <div>
              <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-[#632567] outline-none ring-0 focus:border-[#632567]"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-[#632567] outline-none ring-0 focus:border-[#632567]"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {authError ? (
              <NotificationBanner
                message={authError}
                onClose={() => setAuthError("")}
                className=""
              />
            ) : null}

            {authMessage ? (
              <NotificationBanner
                message={authMessage}
                onClose={() => setAuthMessage("")}
                className=""
              />
            ) : null}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              className="w-full rounded-lg bg-[#632567] px-4 py-3 font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAuthSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (currentRole === "student") {
    return (
      <div className="min-h-screen bg-[#632567] text-white py-6 px-3 sm:px-6 lg:px-10">
        <main className="w-full rounded-2xl border border-white/40 bg-white p-4 text-[#632567] shadow-2xl sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Student Dashboard</h1>
              <p className="mt-1 text-sm text-[#632567]/85">
                Academic year {studentReport?.student.academic.academicYear ?? "2025-2026"} performance and attendance report.
              </p>
              <p className="mt-1 text-sm text-[#632567]/85">
                Class: {studentReport?.student.className || "Not assigned yet"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>

          {studentReportError ? (
            <NotificationBanner
              message={studentReportError}
              onClose={() => setStudentReportError("")}
              className="mt-5"
            />
          ) : null}

          {loadingStudentReport ? (
            <p className="mt-5 text-sm text-[#632567]/85">Loading report...</p>
          ) : null}

          {!loadingStudentReport && studentReport ? (
            <>
              <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
                <h2 className="text-xl font-semibold">Subject-wise Marks</h2>
                <p className="mt-1 text-sm text-[#632567]/85">
                  Your marks broken down by each subject.
                </p>

                {studentReport.student.subjectMarks.length === 0 ? (
                  <p className="mt-3 text-sm text-[#632567]/85">
                    No subjects found for your class yet.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[960px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-[#632567]/80">
                          <th className="border-b border-[#632567]/25 px-2 py-2">Subject</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">MT 1</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">MT 2</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">MT 3</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">MT 4</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">Mid</th>
                          <th className="border-b border-[#632567]/25 px-2 py-2">Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentReport.student.subjectMarks.map((subject) => (
                          <tr key={subject.subjectId}>
                            <td className="border-b border-[#632567]/15 px-2 py-2 font-semibold text-[#632567]">
                              {subject.subjectName}
                            </td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.monthlyTest1}%</td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.monthlyTest2}%</td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.monthlyTest3}%</td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.monthlyTest4}%</td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.midTerm}%</td>
                            <td className="border-b border-[#632567]/15 px-2 py-2">{subject.finalTerm}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
                <h2 className="text-xl font-semibold">Class Attendance Snapshot</h2>
                <p className="mt-2 text-sm text-[#632567]/85">
                  Your attendance: {studentReport.student.attendancePercent}% | {studentReport.classSummary.className} average attendance: {studentReport.classSummary.attendancePercent}%
                </p>
              </section>
            </>
          ) : null}
        </main>
      </div>
    );
  }

  if (currentRole === "teacher") {
    const teacherSearchQuery = teacherStudentSearch.trim().toLowerCase();
    const filteredTeacherAssignableStudents = teacherAssignableStudents.filter((student) => {
      const label = `${student.name} ${student.email}`.toLowerCase();
      return teacherSearchQuery ? label.includes(teacherSearchQuery) : true;
    });

    return (
      <div className="min-h-screen bg-[#632567] text-white py-6 px-3 sm:px-6 lg:px-10">
        <main className="w-full rounded-2xl border border-white/40 bg-white p-4 text-[#632567] shadow-2xl sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
              <p className="mt-1 text-sm text-[#632567]/85">
                {teacherName ? `Welcome, ${teacherName}.` : "Manage marks and attendance for your class students."}
              </p>
              <p className="mt-1 text-sm text-[#632567]/85">
                Class: {teacherClassName || "Not assigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
                onClick={() => void loadTeacherStudents()}
              >
                Refresh
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </div>

          {teacherError ? (
            <NotificationBanner
              message={teacherError}
              onClose={() => setTeacherError("")}
              className="mt-5"
            />
          ) : null}

          {teacherMessage ? (
            <NotificationBanner
              message={teacherMessage}
              onClose={() => setTeacherMessage("")}
              className="mt-5"
            />
          ) : null}

          {loadingTeacherStudents ? (
            <p className="mt-5 text-sm text-[#632567]/85">Loading assigned class students...</p>
          ) : null}

          {!loadingTeacherStudents && !teacherClassAssigned ? (
            <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
              <h2 className="text-xl font-semibold">No class assignment</h2>
              <p className="mt-2 text-sm text-[#632567]/85">
                No class is assigned to you.
              </p>
            </section>
          ) : null}

          {!loadingTeacherStudents && teacherClassAssigned ? (
            <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
              <h2 className="text-xl font-semibold">Create Student</h2>
              <p className="mt-1 text-sm text-[#632567]/85">
                Create a student account and automatically assign it to your class.
              </p>

              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreateTeacherStudent}>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                    Student name
                  </label>
                  <input
                    type="text"
                    value={teacherNewStudentName}
                    onChange={(event) => setTeacherNewStudentName(event.target.value)}
                    placeholder="Student name"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                    Student email
                  </label>
                  <input
                    type="email"
                    value={teacherNewStudentEmail}
                    onChange={(event) => setTeacherNewStudentEmail(event.target.value)}
                    placeholder="student@example.com"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                    Temporary password
                  </label>
                  <input
                    type="password"
                    value={teacherNewStudentPassword}
                    onChange={(event) => setTeacherNewStudentPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isCreatingTeacherStudent}
                    className="rounded-lg bg-[#632567] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingTeacherStudent ? "Creating..." : "Create student"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {!loadingTeacherStudents && teacherClassAssigned ? (
            <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
              <h2 className="text-xl font-semibold">Assign Students</h2>
              <p className="mt-1 text-sm text-[#632567]/85">
                Add unassigned students to your class.
              </p>

              <input
                type="text"
                value={teacherStudentSearch}
                onChange={(event) => setTeacherStudentSearch(event.target.value)}
                placeholder="Search students by name or email"
                className="mt-3 w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
              />

              {teacherAssignableStudents.length === 0 ? (
                <p className="mt-2 text-sm text-[#632567]/85">
                  No unassigned students are available.
                </p>
              ) : !teacherSearchQuery ? (
                <p className="mt-2 text-sm text-[#632567]/85">
                  Start typing to search students.
                </p>
              ) : filteredTeacherAssignableStudents.length === 0 ? (
                <p className="mt-2 text-sm text-[#632567]/85">No students match your search.</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {filteredTeacherAssignableStudents.map((student) => (
                    <div
                      key={`teacher-assign-${student.id}`}
                      className="rounded-lg border border-[#632567]/20 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[#632567]">{student.name}</p>
                      <p className="mt-0.5 text-xs text-[#632567]/75 break-all">{student.email}</p>
                      <button
                        type="button"
                        onClick={() => void handleAssignStudentToTeacherClass(student.id)}
                        disabled={assigningTeacherStudentId === student.id}
                        className="mt-2 rounded-lg bg-[#632567] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {assigningTeacherStudentId === student.id ? "Adding..." : "Add to class"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {!loadingTeacherStudents && teacherClassAssigned && teacherStudents.length === 0 ? (
            <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
              <h2 className="text-xl font-semibold">Class Students</h2>
              <p className="mt-2 text-sm text-[#632567]/85">
                No students found in your assigned class.
              </p>
            </section>
          ) : null}

          {!loadingTeacherStudents && teacherClassAssigned && teacherStudents.length > 0 ? (
            <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5">
              <h2 className="text-xl font-semibold">Class Students</h2>
              <p className="mt-1 text-sm text-[#632567]/85">
                Update subject-wise marks for students in your class only.
              </p>

              <div className="mt-4 space-y-4">
                {teacherStudents.map((student) => {
                  const isEditing = editingTeacherStudentId === student.id;
                  const edit = teacherEdits[student.id] ?? {
                    name: student.name,
                    email: student.email,
                    attendancePresent: student.attendancePresent.toString(),
                    attendanceTotal: student.attendanceTotal.toString(),
                    marks: student.marks.map((mark) => ({
                      subjectId: mark.subjectId,
                      subjectName: mark.subjectName,
                      monthlyTest1: toScoreString(mark.monthlyTest1),
                      monthlyTest2: toScoreString(mark.monthlyTest2),
                      monthlyTest3: toScoreString(mark.monthlyTest3),
                      monthlyTest4: toScoreString(mark.monthlyTest4),
                      midTerm: toScoreString(mark.midTerm),
                      finalTerm: toScoreString(mark.finalTerm),
                    })),
                  };

                  return (
                    <article
                      key={student.id}
                      className="rounded-xl border border-[#632567]/40 bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">Student</p>
                            <p className="mt-1 text-lg font-medium text-[#632567]">{student.name}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">Email</p>
                            <p className="mt-1 text-sm font-medium text-[#632567] break-all">{student.email}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setEditingTeacherStudentId((previous) =>
                              previous === student.id ? "" : student.id,
                            )
                          }
                          className="rounded-lg border border-[#632567]/50 px-3 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                      </div>

                      {isEditing ? (
                        <>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                Attendance Present
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                value={edit.attendancePresent}
                                onChange={(event) =>
                                  handleTeacherAttendanceField(
                                    student.id,
                                    "attendancePresent",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                Attendance Total
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                value={edit.attendanceTotal}
                                onChange={(event) =>
                                  handleTeacherAttendanceField(
                                    student.id,
                                    "attendanceTotal",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4 space-y-4">
                            {edit.marks.map((mark) => (
                              <div
                                key={`${student.id}-${mark.subjectId}`}
                                className="rounded-lg border border-[#632567]/25 p-3"
                              >
                                <p className="text-sm font-semibold text-[#632567]">{mark.subjectName}</p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Monthly Test 1 (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.monthlyTest1}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "monthlyTest1",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Monthly Test 2 (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.monthlyTest2}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "monthlyTest2",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Monthly Test 3 (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.monthlyTest3}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "monthlyTest3",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Monthly Test 4 (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.monthlyTest4}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "monthlyTest4",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Mid-term (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.midTerm}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "midTerm",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-[#632567]/75">
                                      Final-term (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2 text-sm outline-none focus:border-[#632567]"
                                      value={mark.finalTerm}
                                      onChange={(event) =>
                                        handleTeacherSubjectField(
                                          student.id,
                                          mark.subjectId,
                                          "finalTerm",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => void handleSaveTeacherStudent(student.id)}
                              disabled={savingTeacherStudentId === student.id}
                              className="rounded-lg bg-[#632567] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingTeacherStudentId === student.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#632567] text-white py-6 px-3 sm:px-6 lg:px-10">
      <main className="flex w-full flex-col gap-6 rounded-2xl border border-white/40 bg-white p-4 shadow-2xl text-[#632567] sm:p-6 md:flex-row">
        <aside className="md:w-64 md:shrink-0">
          <div className="rounded-xl border border-[#632567]/40 bg-white p-4">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-[#632567]/85">Manage teachers, students, and classes</p>
          </div>

          <nav className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setAdminSection("teachers")}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                adminSection === "teachers"
                  ? "bg-[#632567] text-white"
                  : "border border-[#632567]/50 text-[#632567] hover:bg-[#632567] hover:text-white"
              }`}
            >
              Teachers
            </button>
            <button
              type="button"
              onClick={() => setAdminSection("students")}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                adminSection === "students"
                  ? "bg-[#632567] text-white"
                  : "border border-[#632567]/50 text-[#632567] hover:bg-[#632567] hover:text-white"
              }`}
            >
              Students
            </button>
            <button
              type="button"
              onClick={() => setAdminSection("classes")}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                adminSection === "classes"
                  ? "bg-[#632567] text-white"
                  : "border border-[#632567]/50 text-[#632567] hover:bg-[#632567] hover:text-white"
              }`}
            >
              Classes
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-[#632567]/50 px-3 py-2.5 text-left text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </nav>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          {adminSection !== "classes" ? (
          <div className="rounded-xl border border-[#632567]/40 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Create User</h2>
                <p className="mt-1 text-sm text-[#632567]/85">
                  Create teacher and student accounts with name, email, and password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateUserExpanded((previous) => !previous)}
                className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
              >
                {createUserExpanded ? "Close" : "Add user"}
              </button>
            </div>

            {createUserExpanded ? (
              <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
                <div>
                  <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="new-user-name">
                    Name
                  </label>
                  <input
                    id="new-user-name"
                    type="text"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 outline-none focus:border-[#632567]"
                    value={newUserName}
                    onChange={(event) => setNewUserName(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="new-user-email">
                    Email
                  </label>
                  <input
                    id="new-user-email"
                    type="email"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 outline-none focus:border-[#632567]"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="new-user-password">
                    Password
                  </label>
                  <input
                    id="new-user-password"
                    type="text"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 outline-none focus:border-[#632567]"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#632567]/85" htmlFor="new-user-role">
                    Role
                  </label>
                  <select
                    id="new-user-role"
                    className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 outline-none focus:border-[#632567]"
                    value={newUserRole}
                    onChange={(event) => setNewUserRole(event.target.value as ManagedRole)}
                  >
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  {createUserError ? (
                    <NotificationBanner
                      message={createUserError}
                      onClose={() => setCreateUserError("")}
                      className=""
                    />
                  ) : null}

                  {createUserMessage ? (
                    <NotificationBanner
                      message={createUserMessage}
                      onClose={() => setCreateUserMessage("")}
                      className=""
                    />
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isCreateUserSubmitting}
                    className="w-full rounded-lg bg-[#632567] px-4 py-3 font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreateUserSubmitting ? "Creating account..." : "Create account"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-[#632567]/80">
                Click &quot;Add user&quot; to expand this form.
              </p>
            )}
          </div>
          ) : null}

          <div className="rounded-xl border border-[#632567]/40 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold">
                {adminSection === "teachers"
                  ? "Teachers List"
                  : adminSection === "students"
                    ? "Students List"
                    : "Classes"}
              </h2>
              <button
                type="button"
                onClick={() =>
                  void (adminSection === "classes" ? loadClasses() : loadManagedUsers())
                }
                className="rounded-lg border border-[#632567]/50 px-3 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
              >
                Refresh
              </button>
            </div>

            {adminSection === "classes" && classesError ? (
              <NotificationBanner
                message={classesError}
                onClose={() => setClassesError("")}
                className="mt-4"
              />
            ) : null}

            {adminSection === "classes" && classesMessage ? (
              <NotificationBanner
                message={classesMessage}
                onClose={() => setClassesMessage("")}
                className="mt-4"
              />
            ) : null}

            {adminSection !== "classes" && usersError ? (
              <NotificationBanner
                message={usersError}
                onClose={() => setUsersError("")}
                className="mt-4"
              />
            ) : null}

            {adminSection !== "classes" && usersMessage ? (
              <NotificationBanner
                message={usersMessage}
                onClose={() => setUsersMessage("")}
                className="mt-4"
              />
            ) : null}

            {adminSection === "classes" && loadingClasses ? (
              <p className="mt-4 text-sm text-[#632567]/85">Loading classes...</p>
            ) : null}

            {adminSection !== "classes" && loadingUsers ? (
              <p className="mt-4 text-sm text-[#632567]/85">Loading users...</p>
            ) : null}

            {adminSection !== "classes" && !loadingUsers && usersForActiveSection.length === 0 ? (
              <p className="mt-4 text-sm text-[#632567]/85">
                No {adminSection === "teachers" ? "teachers" : "students"} found yet.
              </p>
            ) : null}

            {adminSection !== "classes" ? (
            <div className="mt-4 space-y-4">
              {usersForActiveSection.map((user) => {
                const edit = userEdits[user.id] ?? {
                  email: user.email,
                  name: user.name,
                  password: "",
                  academicYear: user.academic.academicYear,
                  monthlyTests: user.academic.monthlyTests.map(toScoreString) as [
                    string,
                    string,
                    string,
                    string,
                  ],
                  midTerm: toScoreString(user.academic.midTerm),
                  finalTerm: toScoreString(user.academic.finalTerm),
                  attendancePresent: user.academic.attendancePresent.toString(),
                  attendanceTotal: user.academic.attendanceTotal.toString(),
                };
                const isEditing = editingUserId === user.id;

                return (
                  <article
                    key={user.id}
                    className="rounded-xl border border-[#632567]/40 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[#632567]/75">Name</p>
                          <p className="mt-1 text-lg font-medium text-[#632567]">{edit.name}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[#632567]/75">Email</p>
                          <p className="mt-1 text-lg font-medium text-[#632567] break-all">{edit.email}</p>
                          {user.role === "student" ? (
                            <p className="mt-1 text-xs text-[#632567]/80">
                              Class: {user.className || "Not assigned"}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserEdit(user)}
                          className="rounded-lg border border-[#632567]/50 px-3 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user)}
                          disabled={deletingUserId === user.id}
                          className="rounded-lg border border-red-500/70 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingUserId === user.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                              Name
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                              value={edit.name}
                              onChange={(event) =>
                                handleUserEditField(user.id, "name", event.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                              Email
                            </label>
                            <input
                              type="email"
                              className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                              value={edit.email}
                              onChange={(event) =>
                                handleUserEditField(user.id, "email", event.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                              New password
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                              value={edit.password}
                              onChange={(event) =>
                                handleUserEditField(user.id, "password", event.target.value)
                              }
                              placeholder="Leave blank to keep current password"
                            />
                          </div>
                        </div>

                        {user.role === "student" ? (
                          <div className="mt-4 rounded-lg border border-[#632567]/30 bg-white p-4">
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">
                              Student academics and attendance
                            </p>

                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                                  Academic year
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                                  value={edit.academicYear}
                                  onChange={(event) =>
                                    handleUserEditField(user.id, "academicYear", event.target.value)
                                  }
                                  placeholder="2025-2026"
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                                  Attendance present
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={1000}
                                  className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                                  value={edit.attendancePresent}
                                  onChange={(event) =>
                                    handleUserEditField(
                                      user.id,
                                      "attendancePresent",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                                  Attendance total
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={1000}
                                  className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                                  value={edit.attendanceTotal}
                                  onChange={(event) =>
                                    handleUserEditField(
                                      user.id,
                                      "attendanceTotal",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            {loadingStudentMarksUserId === user.id ? (
                              <p className="mt-4 text-sm text-[#632567]/85">
                                Loading subject marks...
                              </p>
                            ) : null}

                            {loadingStudentMarksUserId !== user.id ? (
                              (() => {
                                const markState = studentSubjectMarks[user.id];

                                if (!markState) {
                                  return (
                                    <p className="mt-4 text-sm text-[#632567]/85">
                                      Open this student record again to load subject marks.
                                    </p>
                                  );
                                }

                                if (!markState.classAssigned) {
                                  return (
                                    <p className="mt-4 text-sm text-[#632567]/85">
                                      Assign this student to a class first to manage subject marks.
                                    </p>
                                  );
                                }

                                if (markState.marks.length === 0) {
                                  return (
                                    <p className="mt-4 text-sm text-[#632567]/85">
                                      No subjects found in {markState.className || "the assigned class"}.
                                    </p>
                                  );
                                }

                                return (
                                  <div className="mt-4 rounded-lg border border-[#632567]/25 p-3">
                                    <p className="text-sm font-semibold text-[#632567]">
                                      Subject marks ({markState.className})
                                    </p>

                                    <div className="mt-3 overflow-x-auto">
                                      <table className="w-full min-w-[820px] border-collapse text-sm">
                                        <thead>
                                          <tr className="text-left text-[#632567]/80">
                                            <th className="border-b border-[#632567]/25 px-2 py-2">Subject</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">MT 1</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">MT 2</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">MT 3</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">MT 4</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">Mid</th>
                                            <th className="border-b border-[#632567]/25 px-2 py-2">Final</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {markState.marks.map((mark) => (
                                            <tr key={`${user.id}-${mark.subjectId}`}>
                                              <td className="border-b border-[#632567]/15 px-2 py-2 font-medium text-[#632567]">
                                                {mark.subjectName}
                                              </td>
                                              {([
                                                "monthlyTest1",
                                                "monthlyTest2",
                                                "monthlyTest3",
                                                "monthlyTest4",
                                                "midTerm",
                                                "finalTerm",
                                              ] as const).map((field) => (
                                                <td
                                                  key={`${user.id}-${mark.subjectId}-${field}`}
                                                  className="border-b border-[#632567]/15 px-2 py-2"
                                                >
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    className="w-20 rounded-lg border border-[#632567]/40 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#632567]"
                                                    value={mark[field]}
                                                    onChange={(event) =>
                                                      handleStudentSubjectMarkField(
                                                        user.id,
                                                        mark.subjectId,
                                                        field,
                                                        event.target.value,
                                                      )
                                                    }
                                                  />
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5">
                          <p className="text-xs uppercase tracking-wide text-[#632567]/75">
                            Current stored password
                          </p>
                          <p className="mt-1 text-sm text-[#632567]">
                            {user.plainPassword || "Not available for this account yet."}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleSaveUser(user.id)}
                          disabled={savingUserId === user.id}
                          className="mt-4 rounded-lg bg-[#632567] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingUserId === user.id ? "Saving..." : "Save"}
                        </button>
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
            ) : null}

            {adminSection === "classes" ? (
              <div className="mt-4 space-y-4">
                <form
                  className="rounded-xl border border-[#632567]/30 bg-white p-4"
                  onSubmit={handleCreateClass}
                >
                  <h3 className="text-base font-semibold">Create Class</h3>
                  <p className="mt-1 text-sm text-[#632567]/85">
                    Create a class, assign a teacher, then assign students to it.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                      value={newClassName}
                      onChange={(event) => setNewClassName(event.target.value)}
                      placeholder="Class name (e.g. Grade 9-A)"
                      required
                    />

                    <select
                      className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                      value={newClassTeacherId}
                      onChange={(event) => setNewClassTeacherId(event.target.value)}
                    >
                      <option value="">No teacher assigned</option>
                      {teacherUsers.map((teacher) => (
                        <option key={`new-class-teacher-${teacher.id}`} value={teacher.id}>
                          {teacher.name || teacher.email}
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      disabled={isCreateClassSubmitting}
                      className="rounded-lg bg-[#632567] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreateClassSubmitting ? "Creating..." : "Create class"}
                    </button>
                  </div>
                </form>

                {!loadingClasses && classes.length === 0 ? (
                  <p className="text-sm text-[#632567]/85">No classes found yet.</p>
                ) : null}

                {classes.map((classRecord) => {
                  const edit = classEdits[classRecord.id] ?? getClassEditState(classRecord);
                  const isExpanded = expandedClassId === classRecord.id;
                  const searchQuery = (classStudentSearch[classRecord.id] ?? "")
                    .trim()
                    .toLowerCase();
                  const filteredStudents = classAssignableStudents.filter((student) => {
                    const assignedClassId = classAssignmentByStudent.get(student.id) ?? "";
                    if (assignedClassId && assignedClassId !== classRecord.id) {
                      return false;
                    }

                    const label = `${student.name} ${student.email}`.toLowerCase();
                    return searchQuery ? label.includes(searchQuery) : true;
                  });
                  const studentsInClass = classAssignableStudents.filter((student) =>
                    edit.studentIds.includes(student.id),
                  );

                  return (
                    <article
                      key={classRecord.id}
                      className="rounded-xl border border-[#632567]/40 bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => handleClassRowToggle(classRecord.id)}
                          className="flex-1 rounded-lg border border-[#632567]/30 px-3 py-2.5 text-left hover:bg-[#632567]/5"
                        >
                          <p className="text-sm font-semibold text-[#632567]">{edit.name}</p>
                          <p className="mt-1 text-xs text-[#632567]/75">
                            {studentsInClass.length} student{studentsInClass.length === 1 ? "" : "s"}
                          </p>
                          <p className="mt-1 text-xs text-[#632567]/75">
                            Teacher: {classRecord.teacherName || "Not assigned"}
                          </p>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleClassRowToggle(classRecord.id)}
                            className="rounded-lg border border-[#632567]/50 px-4 py-2.5 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
                          >
                            {isExpanded ? "Close" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteClass(classRecord)}
                            disabled={deletingClassId === classRecord.id}
                            className="rounded-lg border border-red-500/70 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingClassId === classRecord.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <>
                          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                            <div>
                              <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                                Class name
                              </label>
                              <input
                                type="text"
                                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                                value={edit.name}
                                onChange={(event) =>
                                  handleClassEditField(classRecord.id, "name", event.target.value)
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-xs uppercase tracking-wide text-[#632567]/75">
                                Class teacher
                              </label>
                              <select
                                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                                value={edit.teacherId}
                                onChange={(event) =>
                                  handleClassEditField(
                                    classRecord.id,
                                    "teacherId",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">No teacher assigned</option>
                                {teacherUsers.map((teacher) => (
                                  <option key={`${classRecord.id}-teacher-${teacher.id}`} value={teacher.id}>
                                    {teacher.name || teacher.email}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleSaveClass(classRecord.id)}
                              disabled={savingClassId === classRecord.id}
                              className="rounded-lg bg-[#632567] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingClassId === classRecord.id ? "Saving..." : "Save class"}
                            </button>
                          </div>

                          <div className="mt-4 rounded-lg border border-[#632567]/30 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">
                              Subjects
                            </p>

                            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                              <input
                                type="text"
                                value={newSubjectNameByClass[classRecord.id] ?? ""}
                                onChange={(event) =>
                                  setNewSubjectNameByClass((previous) => ({
                                    ...previous,
                                    [classRecord.id]: event.target.value,
                                  }))
                                }
                                placeholder="Add subject (e.g. Mathematics)"
                                className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                              />

                              <button
                                type="button"
                                onClick={() => void handleAddSubjectToClass(classRecord.id)}
                                disabled={addingSubjectClassId === classRecord.id}
                                className="rounded-lg bg-[#632567] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#522053] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {addingSubjectClassId === classRecord.id ? "Adding..." : "Add subject"}
                              </button>
                            </div>

                            {classRecord.subjects.length === 0 ? (
                              <p className="mt-2 text-sm text-[#632567]/85">
                                No subjects added yet.
                              </p>
                            ) : (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {classRecord.subjects.map((subject) => (
                                  <button
                                    key={`${classRecord.id}-subject-${subject.id}`}
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteSubjectFromClass(
                                        classRecord.id,
                                        subject.id,
                                        subject.name,
                                      )
                                    }
                                    disabled={
                                      deletingSubjectKey === `${classRecord.id}:${subject.id}`
                                    }
                                    className="rounded-lg border border-[#632567]/30 px-3 py-2 text-sm text-[#632567] hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    title="Click to delete subject"
                                  >
                                    {deletingSubjectKey === `${classRecord.id}:${subject.id}`
                                      ? "Deleting..."
                                      : subject.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 rounded-lg border border-[#632567]/30 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">
                              Students in this class
                            </p>
                            {studentsInClass.length === 0 ? (
                              <p className="mt-2 text-sm text-[#632567]/85">No students assigned yet.</p>
                            ) : (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {studentsInClass.map((student) => (
                                  <p
                                    key={`${classRecord.id}-in-class-${student.id}`}
                                    className="rounded-lg border border-[#632567]/20 px-3 py-2 text-sm text-[#632567]"
                                  >
                                    {student.name || student.email}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 rounded-lg border border-[#632567]/30 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-[#632567]/75">
                              Assign students
                            </p>

                            <input
                              type="text"
                              value={classStudentSearch[classRecord.id] ?? ""}
                              onChange={(event) =>
                                handleClassSearchChange(classRecord.id, event.target.value)
                              }
                              placeholder="Search students by name or email"
                              className="mt-3 w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                            />

                            {classAssignableStudents.length === 0 ? (
                              <p className="mt-2 text-sm text-[#632567]/85">
                                No students available to assign.
                              </p>
                            ) : !searchQuery ? (
                              <p className="mt-2 text-sm text-[#632567]/85">
                                Start typing to search students.
                              </p>
                            ) : filteredStudents.length === 0 ? (
                              <p className="mt-2 text-sm text-[#632567]/85">No students match your search.</p>
                            ) : (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {filteredStudents.map((student) => {
                                  const isSelected = edit.studentIds.includes(student.id);

                                  return (
                                    <label
                                      key={`${classRecord.id}-${student.id}`}
                                      className="flex items-center gap-2 rounded-lg border border-[#632567]/20 px-3 py-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() =>
                                          handleStudentToggleInClass(classRecord.id, student.id)
                                        }
                                      />
                                      <span className="text-[#632567]">
                                        {student.name || student.email}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
