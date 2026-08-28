
import {
  useEffect,
  useMemo,
  useState
} from "react";

import AssignmentsPanel from "./AssignmentsPanel";

type TeacherPlatformProps = {
  token: string;
  currentExam: unknown | null;
};

type Classroom = {
  classId: string;
  name: string;
  grade: string;
  schoolYear: string;
  active: boolean;
  studentCount: number;
  createdAt: string;
};

type Student = {
  userId: string;
  code: string;
  displayName: string;
  classId: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string;
};

type ApiError = {
  ok?: boolean;
  error?: string;
};

function TeacherPlatform({
  token,
  currentExam
}: TeacherPlatformProps) {
  const [
    classes,
    setClasses
  ] =
    useState<
      Classroom[]
    >([]);

  const [
    students,
    setStudents
  ] =
    useState<
      Student[]
    >([]);

  const [
    selectedClassId,
    setSelectedClassId
  ] =
    useState("");

  const [
    loading,
    setLoading
  ] =
    useState(false);

  const [
    actionBusy,
    setActionBusy
  ] =
    useState(false);

  const [
    error,
    setError
  ] =
    useState("");

  const [
    notice,
    setNotice
  ] =
    useState("");

  const [
    newClassName,
    setNewClassName
  ] =
    useState("");

  const [
    newClassGrade,
    setNewClassGrade
  ] =
    useState("");

  const [
    newSchoolYear,
    setNewSchoolYear
  ] =
    useState(
      String(
        new Date()
          .getFullYear()
      ) +
      "-" +
      String(
        new Date()
          .getFullYear() +
        1
      )
    );

  const [
    newStudentCode,
    setNewStudentCode
  ] =
    useState("");

  const [
    newStudentName,
    setNewStudentName
  ] =
    useState("");

  const [
    newStudentPassword,
    setNewStudentPassword
  ] =
    useState("");

  const [
    credentialBox,
    setCredentialBox
  ] =
    useState<{
      name: string;
      code: string;
      password: string;
    } | null>(
      null
    );

  const selectedClass =
    useMemo(
      () =>
        classes.find(
          classroom =>
            classroom.classId ===
            selectedClassId
        ) ||
        null,
      [
        classes,
        selectedClassId
      ]
    );

  async function teacherApi<T>(
    url: string,
    options:
      RequestInit = {}
  ): Promise<T> {
    const headers =
      new Headers(
        options.headers ||
        {}
      );

    headers.set(
      "Content-Type",
      "application/json"
    );

    headers.set(
      "x-builder-token",
      token
    );

    headers.set(
      "Authorization",
      "Bearer " +
      token
    );

    const response =
      await fetch(
        url,
        {
          ...options,
          headers
        }
      );

    const result =
      await response.json() as
        T &
        ApiError;

    if (!response.ok) {
      throw new Error(
        result.error ||
        "حدث خطأ."
      );
    }

    return result;
  }

  async function loadClasses(
    preserveSelection =
      true
  ) {
    setLoading(true);
    setError("");

    try {
      const result =
        await teacherApi<{
          ok: true;
          classes:
            Classroom[];
        }>(
          "/api/classrooms"
        );

      const loaded =
        result.classes ||
        [];

      setClasses(
        loaded
      );

      if (
        !preserveSelection ||
        !selectedClassId ||
        !loaded.some(
          classroom =>
            classroom.classId ===
            selectedClassId
        )
      ) {
        const firstActive =
          loaded.find(
            classroom =>
              classroom.active
          ) ||
          loaded[0];

        setSelectedClassId(
          firstActive
            ?.classId ||
          ""
        );
      }
    }
    catch (loadError) {
      setError(
        loadError
        instanceof Error
          ? loadError.message
          : "تعذر تحميل الصفوف."
      );
    }
    finally {
      setLoading(
        false
      );
    }
  }

  async function loadStudents(
    classId:
      string
  ) {
    if (!classId) {
      setStudents([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result =
        await teacherApi<{
          ok: true;
          students:
            Student[];
        }>(
          "/api/students?classId=" +
          encodeURIComponent(
            classId
          )
        );

      setStudents(
        result.students ||
        []
      );
    }
    catch (loadError) {
      setError(
        loadError
        instanceof Error
          ? loadError.message
          : "تعذر تحميل الطلاب."
      );
    }
    finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    void loadClasses(
      false
    );
  }, []);

  useEffect(() => {
    if (
      selectedClassId
    ) {
      void loadStudents(
        selectedClassId
      );
    }
    else {
      setStudents([]);
    }
  }, [
    selectedClassId
  ]);

  async function createClass() {
    if (
      !newClassName
        .trim() ||
      actionBusy
    ) {
      return;
    }

    setActionBusy(true);
    setError("");
    setNotice("");

    try {
      const result =
        await teacherApi<{
          ok: true;
          classroom:
            Classroom;
        }>(
          "/api/classrooms",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                action:
                  "create",

                name:
                  newClassName
                    .trim(),

                grade:
                  newClassGrade
                    .trim(),

                schoolYear:
                  newSchoolYear
                    .trim()
              })
          }
        );

      setNewClassName("");
      setNewClassGrade("");

      await loadClasses(
        false
      );

      setSelectedClassId(
        result
          .classroom
          .classId
      );

      setNotice(
        "✓ تم إنشاء الصف."
      );
    }
    catch (createError) {
      setError(
        createError
        instanceof Error
          ? createError.message
          : "تعذر إنشاء الصف."
      );
    }
    finally {
      setActionBusy(
        false
      );
    }
  }

  async function toggleClassArchive(
    classroom:
      Classroom
  ) {
    if (actionBusy) {
      return;
    }

    setActionBusy(true);
    setError("");
    setNotice("");

    try {
      await teacherApi<{
        ok: true;
        active:
          boolean;
      }>(
        "/api/classrooms",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              action:
                classroom.active
                  ? "archive"
                  : "unarchive",

              classId:
                classroom
                  .classId
            })
        }
      );

      await loadClasses();

      setNotice(
        classroom.active
          ? "✓ تم أرشفة الصف."
          : "✓ تم تفعيل الصف."
      );
    }
    catch (archiveError) {
      setError(
        archiveError
        instanceof Error
          ? archiveError.message
          : "تعذر تعديل الصف."
      );
    }
    finally {
      setActionBusy(
        false
      );
    }
  }

  async function createStudent() {
    if (
      !selectedClassId ||
      !newStudentCode
        .trim() ||
      !newStudentName
        .trim() ||
      actionBusy
    ) {
      return;
    }

    setActionBusy(true);
    setError("");
    setNotice("");
    setCredentialBox(
      null
    );

    try {
      const result =
        await teacherApi<{
          ok: true;

          student:
            Student;

          temporaryPassword:
            string;
        }>(
          "/api/students",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                action:
                  "create",

                classId:
                  selectedClassId,

                code:
                  newStudentCode
                    .trim(),

                displayName:
                  newStudentName
                    .trim(),

                password:
                  newStudentPassword
              })
          }
        );

      setCredentialBox({
        name:
          result
            .student
            .displayName,

        code:
          result
            .student
            .code,

        password:
          result
            .temporaryPassword
      });

      setNewStudentCode("");
      setNewStudentName("");
      setNewStudentPassword("");

      await Promise.all([
        loadStudents(
          selectedClassId
        ),
        loadClasses()
      ]);

      setNotice(
        "✓ تم إنشاء حساب الطالب. احفظ كلمة المرور الظاهرة الآن."
      );
    }
    catch (createError) {
      setError(
        createError
        instanceof Error
          ? createError.message
          : "تعذر إنشاء الطالب."
      );
    }
    finally {
      setActionBusy(
        false
      );
    }
  }

  async function resetPassword(
    student:
      Student
  ) {
    if (actionBusy) {
      return;
    }

    const confirmed =
      window.confirm(
        "إنشاء كلمة مرور جديدة للطالب " +
        student.displayName +
        "؟"
      );

    if (!confirmed) {
      return;
    }

    setActionBusy(true);
    setError("");
    setNotice("");
    setCredentialBox(
      null
    );

    try {
      const result =
        await teacherApi<{
          ok: true;

          temporaryPassword:
            string;
        }>(
          "/api/students",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                action:
                  "resetPassword",

                userId:
                  student.userId
              })
          }
        );

      setCredentialBox({
        name:
          student
            .displayName,

        code:
          student.code,

        password:
          result
            .temporaryPassword
      });

      setNotice(
        "✓ تم تغيير كلمة المرور."
      );
    }
    catch (resetError) {
      setError(
        resetError
        instanceof Error
          ? resetError.message
          : "تعذر تغيير كلمة المرور."
      );
    }
    finally {
      setActionBusy(
        false
      );
    }
  }

  async function toggleStudent(
    student:
      Student
  ) {
    if (actionBusy) {
      return;
    }

    setActionBusy(true);
    setError("");
    setNotice("");

    try {
      await teacherApi<{
        ok: true;
        active:
          boolean;
      }>(
        "/api/students",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              action:
                "toggleActive",

              userId:
                student.userId
            })
        }
      );

      await loadStudents(
        selectedClassId
      );

      setNotice(
        student.active
          ? "✓ تم تعطيل حساب الطالب."
          : "✓ تم تفعيل حساب الطالب."
      );
    }
    catch (toggleError) {
      setError(
        toggleError
        instanceof Error
          ? toggleError.message
          : "تعذر تعديل الحساب."
      );
    }
    finally {
      setActionBusy(
        false
      );
    }
  }

  return (
    <section
      className="teacher-platform"
      dir="rtl"
    >
      <div className="teacher-platform-inner">
        <section className="platform-hero">
          <div>
            <span className="platform-eyebrow">
              ExamBank 2.0
            </span>

            <h2>
              الصفوف وحسابات الطلاب
            </h2>

            <p>
              هذه هي البنية الأساسية لبوابة الطالب.
              كلمات المرور لا تُحفظ كنص واضح، ولا ننصح
              باستخدام رقم هوية الطالب ككود دخول.
            </p>
          </div>

          <div className="platform-hero-stat">
            <strong>
              {
                classes.filter(
                  classroom =>
                    classroom.active
                ).length
              }
            </strong>

            <span>
              صفوف فعّالة
            </span>
          </div>
        </section>

        {error && (
          <div className="platform-error">
            {error}
          </div>
        )}

        {notice && (
          <div className="platform-notice">
            {notice}
          </div>
        )}

        {credentialBox && (
          <section className="credential-box">
            <div>
              <span className="platform-eyebrow">
                بيانات دخول جديدة
              </span>

              <h3>
                {
                  credentialBox
                    .name
                }
              </h3>
            </div>

            <div className="credential-values">
              <div>
                <span>
                  الكود
                </span>

                <strong>
                  {
                    credentialBox
                      .code
                  }
                </strong>
              </div>

              <div>
                <span>
                  كلمة المرور
                </span>

                <strong>
                  {
                    credentialBox
                      .password
                  }
                </strong>
              </div>
            </div>

            <p>
              تظهر كلمة المرور هنا فقط بعد الإنشاء أو إعادة التعيين.
              أعطها للطالب بطريقة مناسبة ولا تحفظها داخل اسم الطالب.
            </p>

            <button
              onClick={() =>
                setCredentialBox(
                  null
                )
              }
            >
              إخفاء
            </button>
          </section>
        )}

        <div className="platform-grid">
          <section className="platform-card">
            <div className="platform-card-heading">
              <div>
                <span className="platform-eyebrow">
                  Classes
                </span>

                <h3>
                  الصفوف
                </h3>
              </div>

              <button
                onClick={() =>
                  loadClasses()
                }
                disabled={
                  loading
                }
              >
                ↻ تحديث
              </button>
            </div>

            <div className="platform-form-grid">
              <label>
                اسم الصف
                <input
                  value={
                    newClassName
                  }
                  onChange={
                    event =>
                      setNewClassName(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="مثال: العاشر 1"
                />
              </label>

              <label>
                المرحلة / الصف
                <input
                  value={
                    newClassGrade
                  }
                  onChange={
                    event =>
                      setNewClassGrade(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="مثال: العاشر"
                />
              </label>

              <label>
                السنة الدراسية
                <input
                  value={
                    newSchoolYear
                  }
                  onChange={
                    event =>
                      setNewSchoolYear(
                        event
                          .target
                          .value
                      )
                  }
                />
              </label>

              <button
                className="platform-primary"
                onClick={
                  createClass
                }
                disabled={
                  actionBusy ||
                  !newClassName
                    .trim()
                }
              >
                + إنشاء صف
              </button>
            </div>

            {loading &&
              classes.length ===
                0 && (
              <div className="platform-loading">
                ⏳ جارٍ التحميل...
              </div>
            )}

            <div className="class-list">
              {classes.map(
                classroom => (
                  <article
                    key={
                      classroom
                        .classId
                    }
                    className={
                      "class-row " +
                      (
                        classroom
                          .classId ===
                        selectedClassId
                          ? "selected"
                          : ""
                      ) +
                      (
                        classroom.active
                          ? ""
                          : " archived"
                      )
                    }
                  >
                    <button
                      className="class-select"
                      onClick={() =>
                        setSelectedClassId(
                          classroom
                            .classId
                        )
                      }
                    >
                      <strong>
                        {
                          classroom
                            .name
                        }
                      </strong>

                      <span>
                        {
                          classroom
                            .grade ||
                          "—"
                        }
                        {" · "}
                        {
                          classroom
                            .studentCount
                        }
                        {" طالب"}
                      </span>

                      <small>
                        {
                          classroom
                            .schoolYear ||
                          ""
                        }
                      </small>
                    </button>

                    <button
                      className="class-archive"
                      onClick={() =>
                        toggleClassArchive(
                          classroom
                        )
                      }
                      disabled={
                        actionBusy
                      }
                    >
                      {classroom.active
                        ? "أرشفة"
                        : "تفعيل"}
                    </button>
                  </article>
                )
              )}

              {!loading &&
                classes.length ===
                  0 && (
                <div className="platform-empty">
                  لا توجد صفوف بعد.
                </div>
              )}
            </div>
          </section>

          <section className="platform-card">
            <div className="platform-card-heading">
              <div>
                <span className="platform-eyebrow">
                  Students
                </span>

                <h3>
                  الطلاب
                </h3>
              </div>

              <span className="student-count-badge">
                {
                  students.length
                }
              </span>
            </div>

            {!selectedClass ? (
              <div className="platform-empty">
                أنشئ صفًا أو اختر صفًا لإدارة الطلاب.
              </div>
            ) : (
              <>
                <div className="selected-class-strip">
                  <strong>
                    {
                      selectedClass
                        .name
                    }
                  </strong>

                  <span>
                    {
                      selectedClass
                        .grade ||
                      ""
                    }
                  </span>
                </div>

                <div className="student-create-grid">
                  <label>
                    كود الطالب
                    <input
                      value={
                        newStudentCode
                      }
                      onChange={
                        event =>
                          setNewStudentCode(
                            event
                              .target
                              .value
                          )
                      }
                      placeholder="مثال: S1001"
                      autoCapitalize="characters"
                    />
                  </label>

                  <label>
                    اسم الطالب
                    <input
                      value={
                        newStudentName
                      }
                      onChange={
                        event =>
                          setNewStudentName(
                            event
                              .target
                              .value
                          )
                      }
                      placeholder="الاسم الظاهر للطالب"
                    />
                  </label>

                  <label>
                    كلمة مرور اختيارية
                    <input
                      type="password"
                      value={
                        newStudentPassword
                      }
                      onChange={
                        event =>
                          setNewStudentPassword(
                            event
                              .target
                              .value
                          )
                      }
                      placeholder="اتركها فارغة للتوليد التلقائي"
                    />
                  </label>

                  <button
                    className="platform-primary"
                    onClick={
                      createStudent
                    }
                    disabled={
                      actionBusy ||
                      !selectedClass
                        .active ||
                      !newStudentCode
                        .trim() ||
                      !newStudentName
                        .trim()
                    }
                  >
                    + إنشاء حساب طالب
                  </button>
                </div>

                {!selectedClass.active && (
                  <div className="platform-warning">
                    الصف مؤرشف؛ فعّله قبل إضافة طلاب جدد.
                  </div>
                )}

                <div className="students-table-wrap">
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th>
                          الطالب
                        </th>

                        <th>
                          الكود
                        </th>

                        <th>
                          الحالة
                        </th>

                        <th>
                          إجراءات
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map(
                        student => (
                          <tr
                            key={
                              student
                                .userId
                            }
                          >
                            <td>
                              <strong>
                                {
                                  student
                                    .displayName
                                }
                              </strong>
                            </td>

                            <td
                              dir="ltr"
                            >
                              {
                                student
                                  .code
                              }
                            </td>

                            <td>
                              <span
                                className={
                                  student.active
                                    ? "status-active"
                                    : "status-disabled"
                                }
                              >
                                {student.active
                                  ? "فعّال"
                                  : "معطّل"}
                              </span>
                            </td>

                            <td>
                              <div className="student-row-actions">
                                <button
                                  onClick={() =>
                                    resetPassword(
                                      student
                                    )
                                  }
                                  disabled={
                                    actionBusy
                                  }
                                >
                                  كلمة مرور جديدة
                                </button>

                                <button
                                  onClick={() =>
                                    toggleStudent(
                                      student
                                    )
                                  }
                                  disabled={
                                    actionBusy
                                  }
                                >
                                  {student.active
                                    ? "تعطيل"
                                    : "تفعيل"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>

                  {!loading &&
                    students.length ===
                      0 && (
                    <div className="platform-empty">
                      لا يوجد طلاب في هذا الصف بعد.
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <AssignmentsPanel
          token={token}
          classes={classes}
          currentExam={currentExam}
        />
      </div>
    </section>
  );
}

export default TeacherPlatform;
