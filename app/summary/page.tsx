"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";

type UserRole = "admin" | "teacher";

type ClassRecord = {
  id: string;
  name: string;
};

type ClassSummary = {
  classId: string;
  className: string;
  teacherName: string;
  studentsCount: number;
  generatedAt: string;
  classAverages: {
    monthlyTests: [number, number, number, number];
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    attendancePercent: number;
    passRate: number;
  };
  topStudents: Array<{
    rank: number;
    studentId: string;
    studentName: string;
    email: string;
    monthlyAverage: number;
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    attendancePercent: number;
  }>;
  studentRankings: Array<{
    rank: number;
    studentId: string;
    studentName: string;
    email: string;
    monthlyAverage: number;
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    attendancePercent: number;
  }>;
  subjectSummaries: Array<{
    subjectId: string;
    subjectName: string;
    monthlyTests: [number, number, number, number];
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    topStudents: Array<{
      rank: number;
      studentName: string;
      overallPercent: number;
    }>;
  }>;
};

type NotificationBannerProps = {
  message: string;
  onClose: () => void;
};

const NotificationBanner = ({ message, onClose }: NotificationBannerProps) => (
  <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-[#632567]/60 bg-[#632567] px-3 py-2 text-sm text-white">
    <p>{message}</p>
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

const formatPercent = (value: number) => `${Number(value.toFixed(2))}%`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSummaryPrintHtml = (summary: ClassSummary) => {
  const studentRows = summary.studentRankings
    .map(
      (student) => `
        <tr>
          <td>${student.rank}</td>
          <td>${escapeHtml(student.studentName)}</td>
          <td>${escapeHtml(student.email)}</td>
          <td>${formatPercent(student.monthlyAverage)}</td>
          <td>${formatPercent(student.midTerm)}</td>
          <td>${formatPercent(student.finalTerm)}</td>
          <td>${formatPercent(student.overallPercent)}</td>
          <td>${formatPercent(student.attendancePercent)}</td>
        </tr>`,
    )
    .join("");

  const subjectRows = summary.subjectSummaries
    .map((subject) => {
      const topStudentsLabel =
        subject.topStudents.length === 0
          ? "No ranking data"
          : subject.topStudents
              .map(
                (student) =>
                  `#${student.rank} ${escapeHtml(student.studentName)} (${formatPercent(student.overallPercent)})`,
              )
              .join(", ");

      return `
        <tr>
          <td>${escapeHtml(subject.subjectName)}</td>
          <td>${formatPercent(subject.monthlyTests[0])}</td>
          <td>${formatPercent(subject.monthlyTests[1])}</td>
          <td>${formatPercent(subject.monthlyTests[2])}</td>
          <td>${formatPercent(subject.monthlyTests[3])}</td>
          <td>${formatPercent(subject.midTerm)}</td>
          <td>${formatPercent(subject.finalTerm)}</td>
          <td>${formatPercent(subject.overallPercent)}</td>
          <td>${topStudentsLabel}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Class Summary - ${escapeHtml(summary.className)}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 24px;
        color: #1b1b1b;
      }

      h1, h2 {
        margin: 0;
      }

      .meta {
        margin-top: 8px;
        color: #444;
      }

      .cards {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 10px;
      }

      .card {
        border: 1px solid #d1d1d1;
        border-radius: 8px;
        padding: 10px;
      }

      .card-title {
        font-size: 12px;
        color: #555;
        margin-bottom: 4px;
      }

      .card-value {
        font-size: 20px;
        font-weight: bold;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }

      th,
      td {
        border: 1px solid #d9d9d9;
        padding: 8px;
        font-size: 12px;
        text-align: left;
      }

      th {
        background: #f4f4f4;
      }

      section {
        margin-top: 20px;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(summary.className)} - Class Summary</h1>
    <p class="meta">Teacher: ${escapeHtml(summary.teacherName || "Not assigned")}</p>
    <p class="meta">Students: ${summary.studentsCount}</p>
    <p class="meta">Generated: ${new Date(summary.generatedAt).toLocaleString()}</p>

    <div class="cards">
      <div class="card"><div class="card-title">MT 1 Avg</div><div class="card-value">${formatPercent(summary.classAverages.monthlyTests[0])}</div></div>
      <div class="card"><div class="card-title">MT 2 Avg</div><div class="card-value">${formatPercent(summary.classAverages.monthlyTests[1])}</div></div>
      <div class="card"><div class="card-title">MT 3 Avg</div><div class="card-value">${formatPercent(summary.classAverages.monthlyTests[2])}</div></div>
      <div class="card"><div class="card-title">MT 4 Avg</div><div class="card-value">${formatPercent(summary.classAverages.monthlyTests[3])}</div></div>
      <div class="card"><div class="card-title">Mid-term Avg</div><div class="card-value">${formatPercent(summary.classAverages.midTerm)}</div></div>
      <div class="card"><div class="card-title">Final-term Avg</div><div class="card-value">${formatPercent(summary.classAverages.finalTerm)}</div></div>
      <div class="card"><div class="card-title">Overall Avg</div><div class="card-value">${formatPercent(summary.classAverages.overallPercent)}</div></div>
      <div class="card"><div class="card-title">Attendance Avg</div><div class="card-value">${formatPercent(summary.classAverages.attendancePercent)}</div></div>
      <div class="card"><div class="card-title">Pass Rate</div><div class="card-value">${formatPercent(summary.classAverages.passRate)}</div></div>
    </div>

    <section>
      <h2>Class Ranking</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Student</th>
            <th>Email</th>
            <th>MT Avg</th>
            <th>Mid</th>
            <th>Final</th>
            <th>Overall</th>
            <th>Attendance</th>
          </tr>
        </thead>
        <tbody>
          ${studentRows || '<tr><td colspan="8">No students found.</td></tr>'}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Subject-wise Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>MT 1</th>
            <th>MT 2</th>
            <th>MT 3</th>
            <th>MT 4</th>
            <th>Mid</th>
            <th>Final</th>
            <th>Overall</th>
            <th>Top Ranked</th>
          </tr>
        </thead>
        <tbody>
          ${subjectRows || '<tr><td colspan="9">No subjects found.</td></tr>'}
        </tbody>
      </table>
    </section>
  </body>
</html>`;
};

type ClassSummaryCardProps = {
  summary: ClassSummary;
  onPrint: () => void;
  onDownloadPdf: () => void;
};

const ClassSummaryCard = ({ summary, onPrint, onDownloadPdf }: ClassSummaryCardProps) => (
  <div className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-5 text-[#632567]">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{summary.className} Summary</h2>
        <p className="mt-1 text-sm text-[#632567]/80">
          Teacher: {summary.teacherName || "Not assigned"} | Students: {summary.studentsCount}
        </p>
        <p className="mt-1 text-sm text-[#632567]/80">
          Generated: {new Date(summary.generatedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDownloadPdf}
          className="rounded-lg bg-[#632567] px-4 py-2 text-sm font-medium text-white hover:bg-[#522053]"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
        >
          Print summary
        </button>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">MT 1 Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.monthlyTests[0])}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">MT 2 Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.monthlyTests[1])}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">MT 3 Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.monthlyTests[2])}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">MT 4 Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.monthlyTests[3])}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">Mid-term Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.midTerm)}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">Final-term Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.finalTerm)}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">Overall Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.overallPercent)}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">Attendance Avg</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.attendancePercent)}</p>
      </div>
      <div className="rounded-lg border border-[#632567]/20 p-3">
        <p className="text-xs uppercase tracking-wide text-[#632567]/70">Pass Rate</p>
        <p className="mt-1 text-xl font-semibold">{formatPercent(summary.classAverages.passRate)}</p>
      </div>
    </div>

    <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
      <h3 className="text-sm font-semibold">Top Ranked Students</h3>
      {summary.topStudents.length === 0 ? (
        <p className="mt-2 text-sm text-[#632567]/85">No students found in this class.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[#632567]/80">
                <th className="border-b border-[#632567]/25 px-2 py-2">Rank</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Student</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Email</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Overall</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {summary.topStudents.map((student) => (
                <tr key={`${summary.classId}-${student.studentId}-top`}>
                  <td className="border-b border-[#632567]/15 px-2 py-2">#{student.rank}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">{student.studentName}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{student.email}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.overallPercent)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.attendancePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
      <h3 className="text-sm font-semibold">Full Class Ranking</h3>
      {summary.studentRankings.length === 0 ? (
        <p className="mt-2 text-sm text-[#632567]/85">No ranking data found.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[#632567]/80">
                <th className="border-b border-[#632567]/25 px-2 py-2">Rank</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Student</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Email</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">MT Avg</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Mid</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Final</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Overall</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {summary.studentRankings.map((student) => (
                <tr key={`${summary.classId}-${student.studentId}-rank`}>
                  <td className="border-b border-[#632567]/15 px-2 py-2">#{student.rank}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">{student.studentName}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{student.email}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.monthlyAverage)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.midTerm)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.finalTerm)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2 font-semibold">{formatPercent(student.overallPercent)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(student.attendancePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
      <h3 className="text-sm font-semibold">Subject-wise Class Marks</h3>
      {summary.subjectSummaries.length === 0 ? (
        <p className="mt-2 text-sm text-[#632567]/85">No subjects found for this class.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[#632567]/80">
                <th className="border-b border-[#632567]/25 px-2 py-2">Subject</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">MT 1</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">MT 2</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">MT 3</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">MT 4</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Mid</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Final</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Overall</th>
                <th className="border-b border-[#632567]/25 px-2 py-2">Top Ranked</th>
              </tr>
            </thead>
            <tbody>
              {summary.subjectSummaries.map((subject) => (
                <tr key={`${summary.classId}-${subject.subjectId}`}>
                  <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">{subject.subjectName}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.monthlyTests[0])}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.monthlyTests[1])}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.monthlyTests[2])}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.monthlyTests[3])}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.midTerm)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2">{formatPercent(subject.finalTerm)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2 font-semibold">{formatPercent(subject.overallPercent)}</td>
                  <td className="border-b border-[#632567]/15 px-2 py-2 text-xs">
                    {subject.topStudents.length === 0
                      ? "No ranking data"
                      : subject.topStudents
                          .map(
                            (student) =>
                              `#${student.rank} ${student.studentName} (${formatPercent(student.overallPercent)})`,
                          )
                          .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);

export default function SummaryPage() {
  const searchParams = useSearchParams();
  const classIdFromQuery = searchParams.get("classId")?.trim() ?? "";

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoadingSession(false);
    };

    void fetchSession();

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

    if (session.user.user_metadata?.role === "teacher") {
      return "teacher";
    }

    return null;
  }, [session]);

  const callAuthedApi = useCallback(
    async (path: string) => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("You are not authenticated.");
      }

      const response = await fetch(path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseData = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: ClassSummary;
        classes?: ClassRecord[];
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Request failed.");
      }

      return responseData;
    },
    [session?.access_token],
  );

  const loadAdminClasses = useCallback(async () => {
    setLoadingClasses(true);
    setSummaryError("");

    try {
      const response = await callAuthedApi("/api/admin/classes");
      const classList = response.classes ?? [];
      setClasses(classList);

      if (classList.length === 0) {
        setSelectedClassId("");
        setSummary(null);
        return;
      }

      const requestedClassExists = classList.some(
        (classRecord) => classRecord.id === classIdFromQuery,
      );

      setSelectedClassId(
        requestedClassExists ? classIdFromQuery : (classList[0]?.id ?? ""),
      );
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : "Unable to load classes.",
      );
    } finally {
      setLoadingClasses(false);
    }
  }, [callAuthedApi, classIdFromQuery]);

  const loadSummary = useCallback(async () => {
    if (!currentRole) {
      return;
    }

    if (currentRole === "admin" && !selectedClassId) {
      setSummary(null);
      return;
    }

    const query =
      currentRole === "admin"
        ? `?classId=${encodeURIComponent(selectedClassId)}`
        : "";

    setLoadingSummary(true);
    setSummaryError("");

    try {
      const response = await callAuthedApi(`/api/class-summary${query}`);
      if (!response.summary) {
        throw new Error("Unable to load summary.");
      }

      setSummary(response.summary);
    } catch (error) {
      setSummary(null);
      setSummaryError(
        error instanceof Error ? error.message : "Unable to load summary.",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [callAuthedApi, currentRole, selectedClassId]);

  useEffect(() => {
    if (currentRole !== "admin") {
      return;
    }

    void loadAdminClasses();
  }, [currentRole, loadAdminClasses]);

  useEffect(() => {
    if (currentRole === "teacher") {
      void loadSummary();
      return;
    }

    if (currentRole === "admin" && selectedClassId) {
      void loadSummary();
    }
  }, [currentRole, selectedClassId, loadSummary]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handlePrint = useCallback((summaryData: ClassSummary) => {
    const printWindow = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=1100,height=800",
    );

    if (!printWindow) {
      setSummaryError("Unable to open print preview. Please allow pop-ups for this site.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildSummaryPrintHtml(summaryData));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, []);

  const handleDownloadPdf = useCallback(async (summaryData: ClassSummary) => {
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = autoTableModule.default as (
        doc: unknown,
        options: Record<string, unknown>,
      ) => void;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const marginLeft = 36;
      const marginRight = 36;
      let currentY = 40;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(64, 25, 67);
      doc.text(`${summaryData.className} - Class Summary`, marginLeft, currentY, {
        maxWidth: pageWidth - marginLeft - marginRight,
      });

      currentY += 22;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Teacher: ${summaryData.teacherName || "Not assigned"} | Students: ${summaryData.studentsCount}`,
        marginLeft,
        currentY,
      );

      currentY += 16;
      doc.text(
        `Generated: ${new Date(summaryData.generatedAt).toLocaleString()}`,
        marginLeft,
        currentY,
      );

      currentY += 18;
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Metric", "Value"]],
        body: [
          ["MT 1 Avg", formatPercent(summaryData.classAverages.monthlyTests[0])],
          ["MT 2 Avg", formatPercent(summaryData.classAverages.monthlyTests[1])],
          ["MT 3 Avg", formatPercent(summaryData.classAverages.monthlyTests[2])],
          ["MT 4 Avg", formatPercent(summaryData.classAverages.monthlyTests[3])],
          ["Mid-term Avg", formatPercent(summaryData.classAverages.midTerm)],
          ["Final-term Avg", formatPercent(summaryData.classAverages.finalTerm)],
          ["Overall Avg", formatPercent(summaryData.classAverages.overallPercent)],
          ["Attendance Avg", formatPercent(summaryData.classAverages.attendancePercent)],
          ["Pass Rate", formatPercent(summaryData.classAverages.passRate)],
        ],
        styles: { fontSize: 10, cellPadding: 5 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        theme: "grid",
      });

      currentY =
        (
          doc as unknown as {
            lastAutoTable?: {
              finalY: number;
            };
          }
        ).lastAutoTable?.finalY ??
        currentY + 80;

      currentY += 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(64, 25, 67);
      doc.text("Top Ranked Students", marginLeft, currentY);

      currentY += 8;
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Rank", "Student", "Email", "Overall", "Attendance"]],
        body:
          summaryData.topStudents.length > 0
            ? summaryData.topStudents.map((student) => [
                `#${student.rank}`,
                student.studentName,
                student.email,
                formatPercent(student.overallPercent),
                formatPercent(student.attendancePercent),
              ])
            : [["-", "No students found", "", "", ""]],
        styles: { fontSize: 9.5, cellPadding: 4 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        theme: "grid",
      });

      currentY =
        (
          doc as unknown as {
            lastAutoTable?: {
              finalY: number;
            };
          }
        ).lastAutoTable?.finalY ??
        currentY + 80;

      currentY += 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(64, 25, 67);
      doc.text("Full Class Ranking", marginLeft, currentY);

      currentY += 8;
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Rank", "Student", "Email", "MT Avg", "Mid", "Final", "Overall", "Attendance"]],
        body:
          summaryData.studentRankings.length > 0
            ? summaryData.studentRankings.map((student) => [
                `#${student.rank}`,
                student.studentName,
                student.email,
                formatPercent(student.monthlyAverage),
                formatPercent(student.midTerm),
                formatPercent(student.finalTerm),
                formatPercent(student.overallPercent),
                formatPercent(student.attendancePercent),
              ])
            : [["-", "No ranking data", "", "", "", "", "", ""]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        theme: "grid",
      });

      currentY =
        (
          doc as unknown as {
            lastAutoTable?: {
              finalY: number;
            };
          }
        ).lastAutoTable?.finalY ??
        currentY + 80;

      currentY += 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(64, 25, 67);
      doc.text("Subject-wise Class Summary", marginLeft, currentY);

      currentY += 8;
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Subject", "MT 1", "MT 2", "MT 3", "MT 4", "Mid", "Final", "Overall", "Top Ranked"]],
        body:
          summaryData.subjectSummaries.length > 0
            ? summaryData.subjectSummaries.map((subject) => [
                subject.subjectName,
                formatPercent(subject.monthlyTests[0]),
                formatPercent(subject.monthlyTests[1]),
                formatPercent(subject.monthlyTests[2]),
                formatPercent(subject.monthlyTests[3]),
                formatPercent(subject.midTerm),
                formatPercent(subject.finalTerm),
                formatPercent(subject.overallPercent),
                subject.topStudents.length === 0
                  ? "No ranking data"
                  : subject.topStudents
                      .map(
                        (student) =>
                          `#${student.rank} ${student.studentName} (${formatPercent(student.overallPercent)})`,
                      )
                      .join(", "),
              ])
            : [["No subjects found", "", "", "", "", "", "", "", ""]],
        styles: { fontSize: 8.5, cellPadding: 4 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        columnStyles: {
          8: { cellWidth: 220 },
        },
        theme: "grid",
      });

      const normalizedClassName = summaryData.className
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const generatedDate = new Date(summaryData.generatedAt);
      const dateToken = [
        generatedDate.getFullYear(),
        String(generatedDate.getMonth() + 1).padStart(2, "0"),
        String(generatedDate.getDate()).padStart(2, "0"),
      ].join("-");

      doc.save(`${normalizedClassName || "class"}-summary-${dateToken}.pdf`);
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : "Unable to generate PDF summary.",
      );
    }
  }, []);

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-[#632567] text-white grid place-items-center px-6">
        <p className="text-white/90">Loading authentication...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#632567] text-white py-10 px-4 sm:px-6 lg:px-10">
        <main className="w-full rounded-2xl border border-white/40 bg-white p-6 text-[#632567] shadow-2xl">
          <h1 className="text-2xl font-bold">Summary</h1>
          <p className="mt-2 text-sm text-[#632567]/85">Please sign in to view class summary.</p>
          <div className="mt-4">
            <Link
              href="/"
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
            >
              Go to sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!currentRole) {
    return (
      <div className="min-h-screen bg-[#632567] text-white py-10 px-4 sm:px-6 lg:px-10">
        <main className="w-full rounded-2xl border border-white/40 bg-white p-6 text-[#632567] shadow-2xl">
          <h1 className="text-2xl font-bold">Summary</h1>
          <p className="mt-2 text-sm text-[#632567]/85">Only teacher and super admin can access this page.</p>
          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
            >
              Sign out
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#632567] text-white py-6 px-3 sm:px-6 lg:px-10">
      <main className="w-full rounded-2xl border border-white/40 bg-white p-4 text-[#632567] shadow-2xl sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Summary</h1>
            <p className="mt-1 text-sm text-[#632567]/85">
              View class-wise student marks, ranking, and export printable summary.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-[#632567]/50 px-4 py-2 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        {currentRole === "admin" ? (
          <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-4">
            <h2 className="text-base font-semibold">Select class</h2>
            <p className="mt-1 text-sm text-[#632567]/85">
              Choose a class to view its summary details.
            </p>

            {loadingClasses ? (
              <p className="mt-3 text-sm text-[#632567]/85">Loading classes...</p>
            ) : classes.length === 0 ? (
              <p className="mt-3 text-sm text-[#632567]/85">No classes found.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedClassId}
                  onChange={(event) => setSelectedClassId(event.target.value)}
                  className="w-full rounded-lg border border-[#632567]/40 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#632567]"
                >
                  {classes.map((classRecord) => (
                    <option key={classRecord.id} value={classRecord.id}>
                      {classRecord.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  disabled={loadingSummary || !selectedClassId}
                  className="rounded-lg border border-[#632567]/50 px-4 py-2.5 text-sm font-medium text-[#632567] hover:bg-[#632567] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingSummary ? "Refreshing..." : "Refresh summary"}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="mt-6 rounded-xl border border-[#632567]/40 bg-white p-4">
            <p className="text-sm text-[#632567]/85">
              Showing summary for your assigned class.
            </p>
          </section>
        )}

        {summaryError ? (
          <NotificationBanner message={summaryError} onClose={() => setSummaryError("")} />
        ) : null}

        {loadingSummary ? (
          <p className="mt-6 text-sm text-[#632567]/85">Loading summary...</p>
        ) : null}

        {!loadingSummary && summary ? (
          <ClassSummaryCard
            summary={summary}
            onPrint={() => handlePrint(summary)}
            onDownloadPdf={() => void handleDownloadPdf(summary)}
          />
        ) : null}

        {!loadingSummary && !summary && !summaryError && currentRole === "admin" && selectedClassId ? (
          <p className="mt-6 text-sm text-[#632567]/85">
            Load summary to view details for this class.
          </p>
        ) : null}
      </main>
    </div>
  );
}
