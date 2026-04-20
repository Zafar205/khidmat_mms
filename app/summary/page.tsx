"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

const ADMIN_EMAIL = "mohamedalzafar@gmail.com";
const SUMMARY_CACHE_PREFIX = "rlps.summary.cache.v4";
const SUMMARY_CACHE_INVALIDATION_KEY = "rlps.summary.cache.invalidation.v1";
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

type UserRole = "admin" | "teacher";

type ClassRecord = {
  id: string;
  name: string;
};

type StudentSummaryRow = {
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

type ExamScoreSource = {
  monthlyTests?: number[];
  midTerm: number;
  finalTerm: number;
};

type SubjectStudentMark = {
  studentId: string;
  studentName: string;
  email: string;
  monthlyTests: [number, number, number, number];
  midTerm: number;
  finalTerm: number;
};

type SubjectSummary = {
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
  studentMarks?: SubjectStudentMark[];
};

type ExamKey =
  | "monthlyTest1"
  | "monthlyTest2"
  | "monthlyTest3"
  | "monthlyTest4"
  | "midTerm"
  | "finalTerm";

type ExamTab = {
  key: ExamKey;
  label: string;
};

type ExamRankingRow = {
  rank: number;
  studentId: string;
  studentName: string;
  email: string;
  score: number;
  attendancePercent: number;
};

type ExamSummaryData = {
  key: ExamKey;
  label: string;
  graded: boolean;
  average: number;
  passRate: number;
  rankings: ExamRankingRow[];
  topStudents: ExamRankingRow[];
};

type ExamSubjectColumn = {
  subjectId: string;
  subjectName: string;
};

type ExamStudentSubjectRow = {
  studentId: string;
  studentName: string;
  email: string;
  marksBySubjectId: Record<string, number>;
};

type ExamStudentSubjectMatrix = {
  key: ExamKey;
  label: string;
  graded: boolean;
  subjects: ExamSubjectColumn[];
  rows: ExamStudentSubjectRow[];
};

const EXAM_TABS: ExamTab[] = [
  { key: "monthlyTest1", label: "MT 1" },
  { key: "monthlyTest2", label: "MT 2" },
  { key: "monthlyTest3", label: "MT 3" },
  { key: "monthlyTest4", label: "MT 4" },
  { key: "midTerm", label: "Mid" },
  { key: "finalTerm", label: "Final" },
];

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
    monthlyTests: [number, number, number, number];
    monthlyAverage: number;
    midTerm: number;
    finalTerm: number;
    overallPercent: number;
    attendancePercent: number;
  }>;
  studentRankings: StudentSummaryRow[];
  subjectSummaries: SubjectSummary[];
};

type CachedSummaryPayload = {
  savedAt: number;
  invalidationToken: string;
  summary: ClassSummary;
};

const getSummaryInvalidationToken = () => {
  if (typeof window === "undefined") {
    return "0";
  }

  return window.localStorage.getItem(SUMMARY_CACHE_INVALIDATION_KEY) ?? "0";
};

const getSummaryCacheKey = (
  role: UserRole,
  classId: string,
  authUserId: string,
) =>
  role === "teacher"
    ? `${SUMMARY_CACHE_PREFIX}:teacher:${authUserId || "unknown"}`
    : `${SUMMARY_CACHE_PREFIX}:admin:${classId}`;

const readSummaryFromCache = (
  role: UserRole,
  classId: string,
  authUserId: string,
) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cacheKey = getSummaryCacheKey(role, classId, authUserId);
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as Partial<CachedSummaryPayload>;
    if (
      typeof payload.savedAt !== "number" ||
      typeof payload.invalidationToken !== "string" ||
      !payload.summary
    ) {
      return null;
    }

    if (payload.invalidationToken !== getSummaryInvalidationToken()) {
      return null;
    }

    if (Date.now() - payload.savedAt > SUMMARY_CACHE_TTL_MS) {
      return null;
    }

    return payload.summary as ClassSummary;
  } catch {
    return null;
  }
};

const writeSummaryToCache = (
  role: UserRole,
  classId: string,
  authUserId: string,
  summary: ClassSummary,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const payload: CachedSummaryPayload = {
    savedAt: Date.now(),
    invalidationToken: getSummaryInvalidationToken(),
    summary,
  };

  try {
    const cacheKey = getSummaryCacheKey(role, classId, authUserId);
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    return;
  }
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

const formatExamValue = (value: number, graded: boolean) =>
  graded ? formatPercent(value) : "Not Graded";

const getExamScore = (source: ExamScoreSource, examKey: ExamKey) => {
  const rawMonthlyTests = source.monthlyTests;
  const monthlyTests: [number, number, number, number] =
    Array.isArray(rawMonthlyTests) && rawMonthlyTests.length === 4
      ? [
          Number(rawMonthlyTests[0] ?? 0),
          Number(rawMonthlyTests[1] ?? 0),
          Number(rawMonthlyTests[2] ?? 0),
          Number(rawMonthlyTests[3] ?? 0),
        ]
      : [0, 0, 0, 0];

  switch (examKey) {
    case "monthlyTest1":
      return monthlyTests[0];
    case "monthlyTest2":
      return monthlyTests[1];
    case "monthlyTest3":
      return monthlyTests[2];
    case "monthlyTest4":
      return monthlyTests[3];
    case "midTerm":
      return source.midTerm;
    case "finalTerm":
      return source.finalTerm;
    default:
      return 0;
  }
};

const rankRowsByScore = (
  rows: Array<Omit<ExamRankingRow, "rank">>,
): ExamRankingRow[] => {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName),
  );

  let currentRank = 0;
  let previousScore: number | null = null;

  return sorted.map((row, index) => {
    if (previousScore === null || row.score !== previousScore) {
      currentRank = index + 1;
      previousScore = row.score;
    }

    return {
      ...row,
      rank: currentRank,
    };
  });
};

const buildExamSummaries = (summary: ClassSummary): ExamSummaryData[] =>
  EXAM_TABS.map((exam) => {
    const rows = summary.studentRankings.map((student) => ({
      studentId: student.studentId,
      studentName: student.studentName,
      email: student.email,
      score: getExamScore(student, exam.key),
      attendancePercent: student.attendancePercent,
    }));

    const graded = rows.some((row) => row.score > 0);

    if (!graded || rows.length === 0) {
      return {
        key: exam.key,
        label: exam.label,
        graded: false,
        average: 0,
        passRate: 0,
        rankings: [],
        topStudents: [],
      };
    }

    const rankings = rankRowsByScore(rows);
    const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
    const average = Number((totalScore / rows.length).toFixed(2));
    const passingStudents = rows.filter((row) => row.score >= 40).length;
    const passRate = Number(((passingStudents / rows.length) * 100).toFixed(2));

    return {
      key: exam.key,
      label: exam.label,
      graded: true,
      average,
      passRate,
      rankings,
      topStudents: rankings.slice(0, 5),
    };
  });

const buildExamStudentSubjectMatrices = (
  summary: ClassSummary,
  examSummaries: ExamSummaryData[],
): ExamStudentSubjectMatrix[] => {
  const subjects = summary.subjectSummaries.map((subject) => ({
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
  }));

  const studentsMap = new Map<
    string,
    { studentId: string; studentName: string; email: string }
  >();

  for (const student of summary.studentRankings) {
    studentsMap.set(student.studentId, {
      studentId: student.studentId,
      studentName: student.studentName,
      email: student.email,
    });
  }

  for (const subject of summary.subjectSummaries) {
    const studentMarks = subject.studentMarks ?? [];

    for (const mark of studentMarks) {
      if (!studentsMap.has(mark.studentId)) {
        studentsMap.set(mark.studentId, {
          studentId: mark.studentId,
          studentName: mark.studentName,
          email: mark.email,
        });
      }
    }
  }

  const sortedStudents = [...studentsMap.values()].sort((a, b) =>
    a.studentName.localeCompare(b.studentName),
  );

  const marksBySubjectAndStudent = new Map<string, Map<string, SubjectStudentMark>>();

  for (const subject of summary.subjectSummaries) {
    marksBySubjectAndStudent.set(
      subject.subjectId,
      new Map((subject.studentMarks ?? []).map((mark) => [mark.studentId, mark])),
    );
  }

  const examSummaryByKey = new Map(
    examSummaries.map((examSummary) => [examSummary.key, examSummary]),
  );

  return EXAM_TABS.map((exam) => {
    const rows: ExamStudentSubjectRow[] = sortedStudents.map((student) => {
      const marksBySubjectId: Record<string, number> = {};

      for (const subject of summary.subjectSummaries) {
        const studentMark = marksBySubjectAndStudent
          .get(subject.subjectId)
          ?.get(student.studentId);

        marksBySubjectId[subject.subjectId] = studentMark
          ? getExamScore(studentMark, exam.key)
          : 0;
      }

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        email: student.email,
        marksBySubjectId,
      };
    });

    return {
      key: exam.key,
      label: exam.label,
      graded: examSummaryByKey.get(exam.key)?.graded ?? false,
      subjects,
      rows,
    };
  });
};

const buildAttendanceRows = (students: StudentSummaryRow[]) =>
  [...students].sort((a, b) => a.studentName.localeCompare(b.studentName));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSummaryPrintHtml = (summary: ClassSummary) => {
  const examSummaries = buildExamSummaries(summary);
  const examSummaryByKey = new Map(
    examSummaries.map((examSummary) => [examSummary.key, examSummary]),
  );

  const cardsHtml = examSummaries
    .map(
      (examSummary) => `
        <div class="card">
          <div class="card-title">${escapeHtml(examSummary.label)} Avg</div>
          <div class="card-value">${formatExamValue(examSummary.average, examSummary.graded)}</div>
        </div>`,
    )
    .join("");

  const examRankingSections = examSummaries
    .map((examSummary) => {
      if (!examSummary.graded) {
        return `
      <section>
        <h2>${escapeHtml(examSummary.label)} Ranking</h2>
        <p class="meta">${escapeHtml(examSummary.label)} is not graded yet.</p>
      </section>`;
      }

      const examRows = examSummary.rankings
        .map(
          (student) => `
            <tr>
              <td>#${student.rank}</td>
              <td>${escapeHtml(student.studentName)}</td>
              <td>${escapeHtml(student.email)}</td>
              <td>${formatPercent(student.score)}</td>
            </tr>`,
        )
        .join("");

      return `
      <section>
        <h2>${escapeHtml(examSummary.label)} Ranking</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Email</th>
              <th>${escapeHtml(examSummary.label)} Score</th>
            </tr>
          </thead>
          <tbody>
            ${examRows || '<tr><td colspan="4">No students found.</td></tr>'}
          </tbody>
        </table>
      </section>`;
    })
    .join("");

  const attendanceRows = buildAttendanceRows(summary.studentRankings)
    .map(
      (student) => `
        <tr>
          <td>${escapeHtml(student.studentName)}</td>
          <td>${escapeHtml(student.email)}</td>
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
          <td>${formatExamValue(subject.monthlyTests[0], examSummaryByKey.get("monthlyTest1")?.graded ?? false)}</td>
          <td>${formatExamValue(subject.monthlyTests[1], examSummaryByKey.get("monthlyTest2")?.graded ?? false)}</td>
          <td>${formatExamValue(subject.monthlyTests[2], examSummaryByKey.get("monthlyTest3")?.graded ?? false)}</td>
          <td>${formatExamValue(subject.monthlyTests[3], examSummaryByKey.get("monthlyTest4")?.graded ?? false)}</td>
          <td>${formatExamValue(subject.midTerm, examSummaryByKey.get("midTerm")?.graded ?? false)}</td>
          <td>${formatExamValue(subject.finalTerm, examSummaryByKey.get("finalTerm")?.graded ?? false)}</td>
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
      ${cardsHtml}
      <div class="card"><div class="card-title">Attendance Avg</div><div class="card-value">${formatPercent(summary.classAverages.attendancePercent)}</div></div>
    </div>

    ${examRankingSections}

    <section>
      <h2>Class Attendance</h2>
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Email</th>
            <th>Attendance</th>
          </tr>
        </thead>
        <tbody>
          ${attendanceRows || '<tr><td colspan="3">No students found.</td></tr>'}
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

const ClassSummaryCard = ({ summary, onPrint, onDownloadPdf }: ClassSummaryCardProps) => {
  const examSummaries = useMemo(() => buildExamSummaries(summary), [summary]);
  const examSubjectMatrices = useMemo(
    () => buildExamStudentSubjectMatrices(summary, examSummaries),
    [summary, examSummaries],
  );
  const [selectedExamKey, setSelectedExamKey] = useState<ExamKey>("monthlyTest1");

  const selectedExam =
    examSummaries.find((examSummary) => examSummary.key === selectedExamKey) ??
    examSummaries[0];
  const attendanceRows = useMemo(
    () => buildAttendanceRows(summary.studentRankings),
    [summary.studentRankings],
  );

  return (
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
        {examSummaries.map((examSummary) => (
          <div
            key={`${summary.classId}-${examSummary.key}-avg`}
            className="rounded-lg border border-[#632567]/20 p-3"
          >
            <p className="text-xs uppercase tracking-wide text-[#632567]/70">
              {examSummary.label} Avg
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatExamValue(examSummary.average, examSummary.graded)}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-[#632567]/20 p-3">
          <p className="text-xs uppercase tracking-wide text-[#632567]/70">Attendance Avg</p>
          <p className="mt-1 text-xl font-semibold">
            {formatPercent(summary.classAverages.attendancePercent)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
        <h3 className="text-sm font-semibold">Exam Tabs</h3>
        <p className="mt-1 text-sm text-[#632567]/85">
          Rankings are calculated separately for each exam.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {examSummaries.map((examSummary) => {
            const isActive = examSummary.key === selectedExamKey;

            return (
              <button
                key={`${summary.classId}-${examSummary.key}-tab`}
                type="button"
                onClick={() => setSelectedExamKey(examSummary.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "border-[#632567] bg-[#632567] text-white"
                    : "border-[#632567]/40 text-[#632567] hover:bg-[#632567]/10"
                }`}
              >
                {examSummary.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
        <h3 className="text-sm font-semibold">
          Top Ranked Students {selectedExam ? `- ${selectedExam.label}` : ""}
        </h3>
        {!selectedExam || !selectedExam.graded ? (
          <p className="mt-2 text-sm text-[#632567]/85">
            {selectedExam?.label ?? "This exam"} is not graded yet.
          </p>
        ) : selectedExam.topStudents.length === 0 ? (
          <p className="mt-2 text-sm text-[#632567]/85">No students found in this class.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[#632567]/80">
                  <th className="border-b border-[#632567]/25 px-2 py-2">Rank</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Student</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Email</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">
                    {selectedExam.label} Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedExam.topStudents.map((student) => (
                  <tr
                    key={`${summary.classId}-${selectedExam.key}-${student.studentId}-top`}
                  >
                    <td className="border-b border-[#632567]/15 px-2 py-2">#{student.rank}</td>
                    <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">
                      {student.studentName}
                    </td>
                    <td className="border-b border-[#632567]/15 px-2 py-2">{student.email}</td>
                    <td className="border-b border-[#632567]/15 px-2 py-2">
                      {formatPercent(student.score)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
        <h3 className="text-sm font-semibold">
          Full Class Ranking {selectedExam ? `- ${selectedExam.label}` : ""}
        </h3>
        {!selectedExam || !selectedExam.graded ? (
          <p className="mt-2 text-sm text-[#632567]/85">
            {selectedExam?.label ?? "This exam"} is not graded yet.
          </p>
        ) : selectedExam.rankings.length === 0 ? (
          <p className="mt-2 text-sm text-[#632567]/85">No ranking data found.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[#632567]/80">
                  <th className="border-b border-[#632567]/25 px-2 py-2">Rank</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Student</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Email</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">
                    {selectedExam.label} Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedExam.rankings.map((student) => (
                  <tr key={`${summary.classId}-${selectedExam.key}-${student.studentId}-rank`}>
                    <td className="border-b border-[#632567]/15 px-2 py-2">#{student.rank}</td>
                    <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">
                      {student.studentName}
                    </td>
                    <td className="border-b border-[#632567]/15 px-2 py-2">{student.email}</td>
                    <td className="border-b border-[#632567]/15 px-2 py-2 font-semibold">
                      {formatPercent(student.score)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
        <h3 className="text-sm font-semibold">Class Attendance</h3>
        {attendanceRows.length === 0 ? (
          <p className="mt-2 text-sm text-[#632567]/85">No students found in this class.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[#632567]/80">
                  <th className="border-b border-[#632567]/25 px-2 py-2">Student</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Email</th>
                  <th className="border-b border-[#632567]/25 px-2 py-2">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((student) => (
                  <tr key={`${summary.classId}-${student.studentId}-attendance`}>
                    <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">
                      {student.studentName}
                    </td>
                    <td className="border-b border-[#632567]/15 px-2 py-2">{student.email}</td>
                    <td className="border-b border-[#632567]/15 px-2 py-2">
                      {formatPercent(student.attendancePercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[#632567]/20 p-3">
        <h3 className="text-sm font-semibold">Subject-wise Class Marks</h3>
        <p className="mt-1 text-sm text-[#632567]/85">
          Expand an exam to view all students with subject-wise marks.
        </p>
        {summary.subjectSummaries.length === 0 ? (
          <p className="mt-2 text-sm text-[#632567]/85">No subjects found for this class.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {examSubjectMatrices.map((examMatrix) => {
              const examGraded = examMatrix.graded;

              return (
                <details
                  key={`${summary.classId}-${examMatrix.key}-subjects`}
                  className="rounded-md border border-[#632567]/20"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-[#632567]">
                    <span>{examMatrix.label}</span>
                    <span className="text-xs font-medium text-[#632567]/75">
                      {examGraded
                        ? `${examMatrix.subjects.length} subject${examMatrix.subjects.length === 1 ? "" : "s"}`
                        : "Not Graded"}
                    </span>
                  </summary>

                  <div className="border-t border-[#632567]/15 p-3">
                    {!examGraded ? (
                      <p className="text-sm text-[#632567]/80">
                        {examMatrix.label} is not graded yet.
                      </p>
                    ) : examMatrix.subjects.length === 0 ? (
                      <p className="text-sm text-[#632567]/80">
                        No subjects found for this class.
                      </p>
                    ) : examMatrix.rows.length === 0 ? (
                      <p className="text-sm text-[#632567]/80">
                        No students found for this class.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] border-collapse text-sm">
                          <thead>
                            <tr className="text-left text-[#632567]/80">
                              <th className="border-b border-[#632567]/25 px-2 py-2">
                                Name
                              </th>
                              {examMatrix.subjects.map((subject) => (
                                <th
                                  key={`${summary.classId}-${examMatrix.key}-${subject.subjectId}-head`}
                                  className="border-b border-[#632567]/25 px-2 py-2"
                                >
                                  {subject.subjectName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {examMatrix.rows.map((studentRow) => (
                              <tr
                                key={`${summary.classId}-${examMatrix.key}-${studentRow.studentId}`}
                              >
                                <td className="border-b border-[#632567]/15 px-2 py-2 font-medium">
                                  {studentRow.studentName}
                                </td>
                                {examMatrix.subjects.map((subject) => (
                                  <td
                                    key={`${summary.classId}-${examMatrix.key}-${studentRow.studentId}-${subject.subjectId}`}
                                    className="border-b border-[#632567]/15 px-2 py-2"
                                  >
                                    {formatPercent(
                                      studentRow.marksBySubjectId[subject.subjectId] ?? 0,
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryPageFallback = () => (
  <div className="min-h-screen bg-[#632567] text-white grid place-items-center px-6">
    <p className="text-white/90">Loading summary...</p>
  </div>
);

function SummaryPageContent() {
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

  const loadSummary = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (!currentRole) {
      return;
    }

    const forceRefresh = options?.forceRefresh ?? false;
    const summaryClassScope = currentRole === "teacher" ? "assigned" : selectedClassId;
    const authUserId = session?.user?.id ?? "";

    if (currentRole === "admin" && !selectedClassId) {
      setSummary(null);
      return;
    }

    if (!forceRefresh) {
      const cachedSummary = readSummaryFromCache(
        currentRole,
        summaryClassScope,
        authUserId,
      );

      if (cachedSummary) {
        setSummary(cachedSummary);
        setSummaryError("");
        setLoadingSummary(false);
        return;
      }
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
      writeSummaryToCache(
        currentRole,
        summaryClassScope,
        authUserId,
        response.summary,
      );
    } catch (error) {
      setSummary(null);
      setSummaryError(
        error instanceof Error ? error.message : "Unable to load summary.",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [callAuthedApi, currentRole, selectedClassId, session?.user?.id]);

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
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 36;
      const marginRight = 36;
      const readBlobAsDataUrl = (blob: Blob) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(typeof reader.result === "string" ? reader.result : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });

      const loadReportLogo = async () => {
        try {
          const response = await fetch("/rlcc_logo.jpg");
          if (!response.ok) {
            return null;
          }

          const blob = await response.blob();
          return await readBlobAsDataUrl(blob);
        } catch {
          return null;
        }
      };

      const logoDataUrl = await loadReportLogo();

      const getLastAutoTableY = () =>
        (
          doc as unknown as {
            lastAutoTable?: {
              finalY: number;
            };
          }
        ).lastAutoTable?.finalY ?? 0;

      const drawSectionHeader = (sectionTitle: string) => {
        const headerTop = 32;
        const logoWidth = 64;
        const logoHeight = 64;
        const textStartX = logoDataUrl ? marginLeft + logoWidth + 14 : marginLeft;
        const textMaxWidth = pageWidth - marginRight - textStartX;

        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "JPEG", marginLeft, headerTop, logoWidth, logoHeight);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.setTextColor(64, 25, 67);
        doc.text(summaryData.className, textStartX, headerTop + 20, {
          maxWidth: textMaxWidth,
        });

        doc.setFontSize(14);
        doc.text(
          `Teacher: ${summaryData.teacherName || "Not assigned"}`,
          textStartX,
          headerTop + 42,
          {
            maxWidth: textMaxWidth,
          },
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(71, 85, 105);
        doc.text(
          `Students: ${summaryData.studentsCount} | Generated: ${new Date(summaryData.generatedAt).toLocaleString()}`,
          textStartX,
          headerTop + 60,
          {
            maxWidth: textMaxWidth,
          },
        );

        const separatorY = headerTop + 78;
        doc.setDrawColor(198, 170, 201);
        doc.setLineWidth(1);
        doc.line(marginLeft, separatorY, pageWidth - marginRight, separatorY);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(64, 25, 67);
        const sectionTitleY = separatorY + 22;
        doc.text(sectionTitle, marginLeft, sectionTitleY);

        // Keep enough vertical gap before the first table/heading on each section page.
        return sectionTitleY + 30;
      };

      const examSummaries = buildExamSummaries(summaryData);
      const attendanceRows = buildAttendanceRows(summaryData.studentRankings);

      const rankingExamKeys: ExamKey[] = [
        "monthlyTest1",
        "monthlyTest2",
        "monthlyTest3",
        "monthlyTest4",
        "midTerm",
      ];
      const rankingExamSummaries = rankingExamKeys
        .map((key) => examSummaries.find((examSummary) => examSummary.key === key))
        .filter((examSummary): examSummary is ExamSummaryData => Boolean(examSummary));

      let currentY = drawSectionHeader("1) Averages Of All Exams");
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Exam", "Average"]],
        body: examSummaries.map((examSummary) => [
          examSummary.label,
          formatExamValue(examSummary.average, examSummary.graded),
        ]),
        styles: { fontSize: 10, cellPadding: 5 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        theme: "grid",
      });

      doc.addPage();
      currentY = drawSectionHeader("2) Class Attendance");
      autoTable(doc, {
        startY: currentY,
        margin: { left: marginLeft, right: marginRight },
        head: [["Student", "Email", "Attendance"]],
        body:
          attendanceRows.length > 0
            ? attendanceRows.map((student) => [
                student.studentName,
                student.email,
                formatPercent(student.attendancePercent),
              ])
            : [["No students found", "", ""]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
        theme: "grid",
      });

      const rankingSectionTitle = "3) 5 Exam Rankings";
      doc.addPage();
      currentY = drawSectionHeader(rankingSectionTitle);

      for (const examSummary of rankingExamSummaries) {
        if (currentY > pageHeight - 150) {
          doc.addPage();
          currentY = drawSectionHeader(`${rankingSectionTitle} (continued)`);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12.5);
        doc.setTextColor(64, 25, 67);
        doc.text(`${examSummary.label} Ranking`, marginLeft, currentY);

        currentY += 8;
        if (!examSummary.graded) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(71, 85, 105);
          doc.text(`${examSummary.label} is not graded yet.`, marginLeft, currentY + 12);
          currentY += 26;
          continue;
        }

        autoTable(doc, {
          startY: currentY,
          margin: { left: marginLeft, right: marginRight },
          head: [["Rank", "Student", `${examSummary.label} Score`]],
          body: examSummary.rankings.map((student) => [
            `#${student.rank}`,
            student.studentName,
            formatPercent(student.score),
          ]),
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 260 },
          },
          theme: "grid",
        });

        currentY = getLastAutoTableY() + 18;
      }

      const examSubjectMatrices = buildExamStudentSubjectMatrices(
        summaryData,
        examSummaries,
      );
      const gradedExamMatrices = examSubjectMatrices.filter((examMatrix) => examMatrix.graded);

      doc.addPage();
      currentY = drawSectionHeader("4) Subject Wise Ranking");

      if (gradedExamMatrices.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text("No graded terms available for subject-wise marks.", marginLeft, currentY + 14);
      } else {
        const subjectSectionTitle = "4) Subject Wise Ranking";

        for (const examMatrix of gradedExamMatrices) {
          if (currentY > pageHeight - 170) {
            doc.addPage();
            currentY = drawSectionHeader(`${subjectSectionTitle} (continued)`);
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(12.5);
          doc.setTextColor(64, 25, 67);
          doc.text(examMatrix.label, marginLeft, currentY);
          currentY += 8;

          if (examMatrix.subjects.length === 0 || examMatrix.rows.length === 0) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            doc.text("No student/subject marks found.", marginLeft, currentY + 12);
            currentY += 26;
            continue;
          }

          autoTable(doc, {
            startY: currentY,
            margin: { left: marginLeft, right: marginRight },
            head: [["Name", ...examMatrix.subjects.map((subject) => subject.subjectName)]],
            body: examMatrix.rows.map((studentRow) => [
              studentRow.studentName,
              ...examMatrix.subjects.map((subject) =>
                formatPercent(studentRow.marksBySubjectId[subject.subjectId] ?? 0),
              ),
            ]),
            styles: { fontSize: 8.5, cellPadding: 3.5 },
            headStyles: { fillColor: [99, 37, 103], textColor: [255, 255, 255] },
            columnStyles: {
              0: { cellWidth: 150 },
            },
            theme: "grid",
          });

          currentY = getLastAutoTableY() + 18;
        }
      }

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
                  onClick={() => void loadSummary({ forceRefresh: true })}
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

export default function SummaryPage() {
  return (
    <Suspense fallback={<SummaryPageFallback />}>
      <SummaryPageContent />
    </Suspense>
  );
}
