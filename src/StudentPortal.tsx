
import {
  useEffect,
  useState
} from "react";

type StudentPortalProps = {
  token: string;
  displayName: string;
  onLogout: () => void;
};

type StudentDashboardData = {
  student: {
    userId: string;
    code: string;
    displayName: string;
    classId: string;
  };
  classroom: {
    classId: string;
    name: string;
    grade: string;
    schoolYear: string;
  } | null;
  assignments: unknown[];
  stats: {
    assigned: number;
    completed: number;
    average: number | null;
  };
};

function StudentPortal({
  token,
  displayName,
  onLogout
}: StudentPortalProps) {
  const [
    dashboard,
    setDashboard
  ] =
    useState<
      StudentDashboardData |
      null
    >(null);

  const [
    loading,
    setLoading
  ] =
    useState(true);

  const [
    error,
    setError
  ] =
    useState("");

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            "/api/student-dashboard",
            {
              headers: {
                "x-student-token":
                  token,

                Authorization:
                  "Bearer " +
                  token
              }
            }
          );

        const result =
          await response.json() as {
            ok?: boolean;
            error?: string;
            student?:
              StudentDashboardData["student"];
            classroom?:
              StudentDashboardData["classroom"];
            assignments?:
              unknown[];
            stats?:
              StudentDashboardData["stats"];
          };

        if (
          response.status ===
          401
        ) {
          onLogout();
          return;
        }

        if (
          !response.ok ||
          !result.student ||
          !result.stats
        ) {
          throw new Error(
            result.error ||
            "تعذر تحميل صفحة الطالب."
          );
        }

        if (!cancelled) {
          setDashboard({
            student:
              result.student,

            classroom:
              result.classroom ||
              null,

            assignments:
              result.assignments ||
              [],

            stats:
              result.stats
          });
        }
      }
      catch (loadError) {
        if (!cancelled) {
          setError(
            loadError
            instanceof Error
              ? loadError.message
              : "تعذر تحميل الصفحة."
          );
        }
      }
      finally {
        if (!cancelled) {
          setLoading(
            false
          );
        }
      }
    }

    void load();

    return () => {
      cancelled =
        true;
    };
  }, [
    token,
    onLogout
  ]);

  return (
    <main
      className="student-portal"
      dir="rtl"
    >
      <header className="student-topbar">
        <div className="student-brand">
          <span className="student-logo">
            EB
          </span>

          <div>
            <h1>
              ExamBank 2.0
            </h1>

            <p>
              بوابة الطالب للتدريب والواجبات
            </p>
          </div>
        </div>

        <button
          className="student-logout"
          onClick={
            onLogout
          }
        >
          تسجيل الخروج
        </button>
      </header>

      <section className="student-shell">
        {loading && (
          <div className="platform-loading">
            ⏳ جارٍ تحميل حسابك...
          </div>
        )}

        {error && (
          <div className="platform-error">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          dashboard && (
          <>
            <section className="student-welcome-card">
              <div>
                <span className="platform-eyebrow">
                  Student Portal
                </span>

                <h2>
                  مرحبًا{" "}
                  {dashboard
                    .student
                    .displayName ||
                    displayName}
                </h2>

                <p>
                  {dashboard.classroom
                    ? (
                        dashboard
                          .classroom
                          .name +
                        (
                          dashboard
                            .classroom
                            .grade
                            ? " · " +
                              dashboard
                                .classroom
                                .grade
                            : ""
                        )
                      )
                    : "لم يتم ربط حسابك بصف بعد."}
                </p>
              </div>

              <div className="student-code-chip">
                الكود:{" "}
                <strong>
                  {
                    dashboard
                      .student
                      .code
                  }
                </strong>
              </div>
            </section>

            <section className="student-stat-grid">
              <article>
                <strong>
                  {
                    dashboard
                      .stats
                      .assigned
                  }
                </strong>

                <span>
                  مهام
                </span>
              </article>

              <article>
                <strong>
                  {
                    dashboard
                      .stats
                      .completed
                  }
                </strong>

                <span>
                  مكتملة
                </span>
              </article>

              <article>
                <strong>
                  {dashboard
                    .stats
                    .average ===
                    null
                    ? "—"
                    : dashboard
                        .stats
                        .average +
                      "%"}
                </strong>

                <span>
                  المعدل
                </span>
              </article>
            </section>

            <section className="student-main-grid">
              <article className="student-panel">
                <div className="student-panel-heading">
                  <div>
                    <span className="platform-eyebrow">
                      Assignments
                    </span>

                    <h3>
                      المهام والواجبات
                    </h3>
                  </div>

                  <span className="phase-chip">
                    Phase 2.0B
                  </span>
                </div>

                <div className="student-empty-state">
                  <span>
                    📝
                  </span>

                  <strong>
                    حساب الطالب جاهز
                  </strong>

                  <p>
                    في المرحلة التالية ستظهر هنا الواجبات
                    والاختبارات التي يرسلها المعلم.
                  </p>
                </div>
              </article>

              <article className="student-panel student-next-panel">
                <span className="platform-eyebrow">
                  Coming Next
                </span>

                <h3>
                  ما الذي سيضاف؟
                </h3>

                <ul>
                  <li>
                    حل الواجبات أونلاين
                  </li>
                  <li>
                    حفظ الإجابات تلقائيًا
                  </li>
                  <li>
                    تصحيح فوري للأسئلة الموضوعية
                  </li>
                  <li>
                    متابعة التقدم حسب الموضوع
                  </li>
                </ul>
              </article>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default StudentPortal;
