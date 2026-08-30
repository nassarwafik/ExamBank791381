const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, listJson } = require("../lib/platform-storage");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGNMENT_PREFIX = "platform/assignments/";
const SUBMISSION_PREFIX = "platform/submissions/";

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * power) / power;
}

function timestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function inRange(value, fromMs, toMs) {
  if (!fromMs && !toMs) return true;
  const t = timestamp(value);
  if (!t) return false;
  if (fromMs && t < fromMs) return false;
  if (toMs && t > toMs) return false;
  return true;
}

function assignmentDate(assignment) {
  return assignment.dueAt || assignment.openAt || assignment.createdAt || assignment.updatedAt || "";
}

function latestAttempt(submission) {
  const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
  if (!attempts.length) return null;
  return [...attempts].sort((a, b) => timestamp(a.submittedAt) - timestamp(b.submittedAt)).at(-1) || null;
}

function average(values) {
  const nums = values.map(number).filter(Number.isFinite);
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 1) : null;
}

function trendDelta(points) {
  const values = points.map(point => number(point.percentage));
  if (values.length < 2) return 0;
  if (values.length >= 4) {
    const previous = average(values.slice(-4, -2)) ?? 0;
    const recent = average(values.slice(-2)) ?? 0;
    return round(recent - previous, 1);
  }
  return round(values.at(-1) - values[0], 1);
}

function trendLabel(delta) {
  if (delta >= 5) return "improving";
  if (delta <= -5) return "declining";
  return "stable";
}

function studentName(student) {
  return String(student?.displayName || [student?.firstName, student?.familyName].filter(Boolean).join(" ") || "طالب");
}

function qid(question, index) {
  return String(question?.examQuestionId || question?.id || question?.number || index + 1);
}

function classAggregate(classId, assignments, students, submissionMap) {
  const classStudents = students.filter(student => String(student.classId || "") === classId && student.active !== false && student.archived !== true);
  const classAssignments = assignments.filter(assignment => String(assignment.classId || "") === classId);
  let submitted = 0;
  let pendingReview = 0;
  const percentages = [];

  for (const assignment of classAssignments) {
    for (const student of classStudents) {
      const submission = submissionMap.get(String(assignment.assignmentId) + "|" + String(student.userId));
      const attempt = latestAttempt(submission);
      if (!attempt) continue;
      submitted += 1;
      percentages.push(number(attempt.percentage));
      if (attempt.finalized === false) pendingReview += 1;
    }
  }

  const expected = classStudents.length * classAssignments.length;
  return {
    students: classStudents.length,
    assignments: classAssignments.length,
    expected,
    submitted,
    missing: Math.max(0, expected - submitted),
    pendingReview,
    completionRate: expected ? round(submitted / expected * 100, 1) : 0,
    average: average(percentages)
  };
}

app.http("teacherAnalytics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teacher-analytics",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;

      const url = new URL(request.url);
      const requestedClassId = String(url.searchParams.get("classId") || "").trim();
      const fromMs = timestamp(url.searchParams.get("from"));
      const toMs = timestamp(url.searchParams.get("to"));

      const container = getContainer();
      const [classesRaw, usersRaw, assignmentsRaw, submissionsRaw] = await Promise.all([
        listJson(container, CLASS_PREFIX),
        listJson(container, USER_PREFIX),
        listJson(container, ASSIGNMENT_PREFIX),
        listJson(container, SUBMISSION_PREFIX)
      ]);

      const classes = classesRaw
        .filter(item => item?.classId)
        .map(item => ({
          classId: String(item.classId),
          name: String(item.name || ""),
          grade: String(item.grade || ""),
          schoolYear: String(item.schoolYear || ""),
          active: item.active !== false
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar", { numeric: true }));

      const classMap = new Map(classes.map(item => [item.classId, item]));
      const students = usersRaw.filter(item => item?.role === "student");
      const activeStudents = students.filter(item => item.active !== false && item.archived !== true);
      const publishedAll = assignmentsRaw.filter(item => item?.assignmentId && item.status === "published");
      const scopedByDate = publishedAll.filter(item => inRange(assignmentDate(item), fromMs, toMs));
      const scopedAssignments = scopedByDate.filter(item => !requestedClassId || String(item.classId || "") === requestedClassId);
      const scopedStudents = activeStudents.filter(item => !requestedClassId || String(item.classId || "") === requestedClassId);

      const submissionMap = new Map();
      for (const submission of submissionsRaw) {
        const assignmentId = String(submission?.assignmentId || "");
        const studentId = String(submission?.studentId || "");
        if (assignmentId && studentId) submissionMap.set(assignmentId + "|" + studentId, submission);
      }

      const records = [];
      for (const assignment of scopedAssignments) {
        const classStudents = scopedStudents.filter(student => String(student.classId || "") === String(assignment.classId || ""));
        for (const student of classStudents) {
          const submission = submissionMap.get(String(assignment.assignmentId) + "|" + String(student.userId));
          const attempt = latestAttempt(submission);
          records.push({ assignment, student, submission, attempt });
        }
      }

      const submittedRecords = records.filter(record => record.attempt);
      const percentages = submittedRecords.map(record => number(record.attempt.percentage));
      const expected = records.length;
      const submitted = submittedRecords.length;
      const missing = Math.max(0, expected - submitted);
      const pendingReview = submittedRecords.filter(record => record.attempt.finalized === false).length;
      const late = submittedRecords.filter(record => {
        const due = timestamp(record.submission?.dueAtOverride || record.assignment.dueAt);
        return due && timestamp(record.attempt.submittedAt) > due;
      }).length;

      const studentMap = new Map();
      for (const student of scopedStudents) {
        studentMap.set(String(student.userId), {
          userId: String(student.userId),
          displayName: studentName(student),
          identityNumber: String(student.identityNumber || student.code || ""),
          classId: String(student.classId || ""),
          className: classMap.get(String(student.classId || ""))?.name || "",
          active: student.active !== false,
          lastLoginAt: String(student.lastLoginAt || ""),
          assigned: 0,
          completed: 0,
          missing: 0,
          scores: [],
          points: []
        });
      }

      for (const record of records) {
        const item = studentMap.get(String(record.student.userId));
        if (!item) continue;
        item.assigned += 1;
        if (record.attempt) {
          item.completed += 1;
          item.scores.push(number(record.attempt.percentage));
          item.points.push({
            assignmentId: String(record.assignment.assignmentId),
            title: String(record.assignment.title || ""),
            date: assignmentDate(record.assignment),
            percentage: number(record.attempt.percentage)
          });
        } else {
          item.missing += 1;
        }
      }

      const studentSummaries = [...studentMap.values()].map(item => {
        item.points.sort((a, b) => timestamp(a.date) - timestamp(b.date));
        const avg = average(item.scores);
        const delta = trendDelta(item.points);
        const reasons = [];
        if (avg !== null && avg < 60) reasons.push("معدل منخفض");
        if (item.missing >= 2) reasons.push(item.missing + " واجبات غير مسلّمة");
        if (!item.lastLoginAt) reasons.push("لم يسجل الدخول بعد");
        if (delta <= -8) reasons.push("تراجع ملحوظ في الأداء");
        const severity = (avg !== null && avg < 50) || item.missing >= 3 || delta <= -15 ? "high" : reasons.length ? "medium" : "low";
        return {
          userId: item.userId,
          displayName: item.displayName,
          identityNumber: item.identityNumber,
          classId: item.classId,
          className: item.className,
          average: avg,
          assigned: item.assigned,
          completed: item.completed,
          missing: item.missing,
          completionRate: item.assigned ? round(item.completed / item.assigned * 100, 1) : 0,
          trendDelta: delta,
          trend: trendLabel(delta),
          lastLoginAt: item.lastLoginAt,
          needsFollowUp: reasons.length > 0,
          severity,
          reasons
        };
      });

      const followUp = studentSummaries
        .filter(item => item.needsFollowUp)
        .sort((a, b) => {
          const severity = { high: 2, medium: 1, low: 0 };
          return (severity[b.severity] - severity[a.severity]) || (b.missing - a.missing) || ((a.average ?? 101) - (b.average ?? 101));
        })
        .slice(0, 20);

      const topImprovers = studentSummaries
        .filter(item => item.completed >= 2 && item.trendDelta > 0)
        .sort((a, b) => b.trendDelta - a.trendDelta)
        .slice(0, 8);

      const classComparison = classes
        .filter(item => item.active)
        .map(classroom => ({
          classId: classroom.classId,
          name: classroom.name,
          grade: classroom.grade,
          ...classAggregate(classroom.classId, scopedByDate, activeStudents, submissionMap)
        }))
        .filter(item => item.students > 0 || item.assignments > 0)
        .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

      const assignmentTrend = scopedAssignments
        .map(assignment => {
          const assignmentRecords = records.filter(record => String(record.assignment.assignmentId) === String(assignment.assignmentId));
          const assignmentSubmitted = assignmentRecords.filter(record => record.attempt);
          const assignmentPercentages = assignmentSubmitted.map(record => number(record.attempt.percentage));
          return {
            assignmentId: String(assignment.assignmentId),
            classId: String(assignment.classId || ""),
            className: String(assignment.className || classMap.get(String(assignment.classId || ""))?.name || ""),
            title: String(assignment.title || "واجب"),
            dueAt: String(assignment.dueAt || ""),
            date: assignmentDate(assignment),
            students: assignmentRecords.length,
            submitted: assignmentSubmitted.length,
            missing: Math.max(0, assignmentRecords.length - assignmentSubmitted.length),
            pendingReview: assignmentSubmitted.filter(record => record.attempt.finalized === false).length,
            completionRate: assignmentRecords.length ? round(assignmentSubmitted.length / assignmentRecords.length * 100, 1) : 0,
            average: average(assignmentPercentages),
            highest: assignmentPercentages.length ? round(Math.max(...assignmentPercentages), 1) : null,
            lowest: assignmentPercentages.length ? round(Math.min(...assignmentPercentages), 1) : null
          };
        })
        .sort((a, b) => timestamp(a.date) - timestamp(b.date));

      const trendAverages = assignmentTrend.filter(item => item.average !== null).map(item => number(item.average));
      let performanceChange = 0;
      if (trendAverages.length >= 4) {
        performanceChange = round((average(trendAverages.slice(-2)) ?? 0) - (average(trendAverages.slice(-4, -2)) ?? 0), 1);
      } else if (trendAverages.length >= 2) {
        performanceChange = round(trendAverages.at(-1) - trendAverages.at(-2), 1);
      }

      const gradeDistribution = [
        { label: "90–100", min: 90, max: 101 },
        { label: "80–89", min: 80, max: 90 },
        { label: "70–79", min: 70, max: 80 },
        { label: "60–69", min: 60, max: 70 },
        { label: "أقل من 60", min: -1, max: 60 }
      ].map(bin => ({
        label: bin.label,
        count: percentages.filter(value => value >= bin.min && value < bin.max).length
      }));

      const topicMap = new Map();
      for (const record of submittedRecords) {
        const questions = Array.isArray(record.assignment?.examSnapshot?.questions) ? record.assignment.examSnapshot.questions : [];
        const questionMap = new Map(questions.map((question, index) => [qid(question, index), question]));
        const grades = Array.isArray(record.attempt?.questionGrades) ? record.attempt.questionGrades : [];
        for (const grade of grades) {
          if (grade?.manualReview === true && grade?.reviewed !== true) continue;
          const question = questionMap.get(String(grade?.questionId || ""));
          if (!question) continue;
          const topic = String(question.topic || "غير مصنف").trim() || "غير مصنف";
          const maxMarks = number(grade.maxMarks);
          if (maxMarks <= 0) continue;
          const current = topicMap.get(topic) || { topic, score: 0, maxMarks: 0, gradedQuestions: 0 };
          current.score += number(grade.score);
          current.maxMarks += maxMarks;
          current.gradedQuestions += 1;
          topicMap.set(topic, current);
        }
      }

      const topicAnalytics = [...topicMap.values()]
        .map(item => ({
          topic: item.topic,
          average: item.maxMarks ? round(item.score / item.maxMarks * 100, 1) : null,
          gradedQuestions: item.gradedQuestions
        }))
        .sort((a, b) => (a.average ?? 101) - (b.average ?? 101));

      const insights = [];
      if (performanceChange >= 3) {
        insights.push({ tone: "success", title: "اتجاه الأداء إيجابي", text: "متوسط الأداء ارتفع " + Math.abs(performanceChange) + "% مقارنة بالفترة السابقة من الواجبات." });
      } else if (performanceChange <= -3) {
        insights.push({ tone: "warning", title: "يوجد تراجع في الأداء", text: "متوسط الأداء انخفض " + Math.abs(performanceChange) + "%؛ يفضّل مراجعة آخر الواجبات والموضوعات الأضعف." });
      } else if (trendAverages.length >= 2) {
        insights.push({ tone: "info", title: "الأداء مستقر", text: "لا يوجد تغير كبير في متوسط النتائج بين آخر الواجبات." });
      }

      const weakestTopic = topicAnalytics.find(item => item.average !== null && item.average < 70);
      if (weakestTopic) {
        insights.push({ tone: "warning", title: "موضوع يحتاج مراجعة", text: "متوسط الأداء في " + weakestTopic.topic + " هو " + weakestTopic.average + "%، وهو من أضعف الموضوعات حاليًا." });
      }

      const strongestTopic = [...topicAnalytics].reverse().find(item => item.average !== null && item.average >= 85);
      if (strongestTopic) {
        insights.push({ tone: "success", title: "نقطة قوة", text: "الأداء في " + strongestTopic.topic + " قوي بمتوسط " + strongestTopic.average + "% ." });
      }

      if (followUp.length) {
        insights.push({ tone: "warning", title: "طلاب يحتاجون متابعة", text: followUp.length + " طالبًا لديهم مؤشر متابعة مثل انخفاض المعدل أو واجبات ناقصة أو تراجع في الأداء." });
      }
      if (missing) {
        insights.push({ tone: "info", title: "تسليمات ناقصة", text: "يوجد " + missing + " حالة عدم تسليم ضمن النطاق الحالي." });
      }
      if (pendingReview) {
        insights.push({ tone: "info", title: "مراجعة يدوية مطلوبة", text: "هناك " + pendingReview + " تسليمًا يحتوي أسئلة تحتاج مراجعة أو تصحيحًا يدويًا." });
      }

      const neverLogged = scopedStudents.filter(student => !student.lastLoginAt).length;
      if (neverLogged) {
        insights.push({ tone: "warning", title: "طلاب لم يدخلوا بعد", text: neverLogged + " طالبًا فعّالًا لم يسجلوا الدخول إلى المنصة بعد." });
      }

      if (!insights.length) {
        insights.push({ tone: "success", title: "الوضع مستقر", text: "لا توجد مؤشرات تنبيه بارزة في البيانات الحالية." });
      }

      return {
        status: 200,
        jsonBody: {
          ok: true,
          generatedAt: new Date().toISOString(),
          scope: {
            classId: requestedClassId,
            className: classMap.get(requestedClassId)?.name || "كل الصفوف",
            from: fromMs ? new Date(fromMs).toISOString() : "",
            to: toMs ? new Date(toMs).toISOString() : ""
          },
          classes: classes.map(classroom => ({
            ...classroom,
            studentCount: activeStudents.filter(student => String(student.classId || "") === classroom.classId).length
          })),
          kpis: {
            activeClasses: classes.filter(item => item.active).length,
            activeStudents: scopedStudents.length,
            publishedAssignments: scopedAssignments.length,
            submissions: submitted,
            expectedSubmissions: expected,
            missingSubmissions: missing,
            pendingReview,
            lateSubmissions: late,
            completionRate: expected ? round(submitted / expected * 100, 1) : 0,
            average: average(percentages),
            highest: percentages.length ? round(Math.max(...percentages), 1) : null,
            lowest: percentages.length ? round(Math.min(...percentages), 1) : null,
            performanceChange,
            followUpStudents: followUp.length,
            neverLogged
          },
          submissionStatus: {
            submitted,
            missing,
            pendingReview,
            late
          },
          gradeDistribution,
          assignmentTrend: assignmentTrend.slice(-14),
          classComparison,
          topicAnalytics: topicAnalytics.slice(0, 14),
          followUp,
          topImprovers,
          insights: insights.slice(0, 7)
        }
      };
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: error instanceof Error ? error.message : "Teacher analytics failed."
        }
      };
    }
  }
});
