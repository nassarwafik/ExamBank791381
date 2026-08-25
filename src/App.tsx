import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [examPrompt, setExamPrompt] = useState("");

  function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (!userCode.trim() || !password.trim()) {
      return;
    }

    // مؤقت فقط لعرض الواجهة.
    // لاحقًا سيتم التحقق من الحساب في Backend آمن.
    setLoggedIn(true);
  }

  function handleLogout() {
    setLoggedIn(false);
    setUserCode("");
    setPassword("");
    setExamPrompt("");
  }

  function handleGenerateExam() {
    if (!examPrompt.trim()) {
      return;
    }

    alert(
      "سيتم ربط إنشاء الامتحان بالمخزن و OpenAI في مرحلة لاحقة."
    );
  }

  if (!loggedIn) {
    return (
      <main className="login-page" dir="rtl">
        <section className="login-card">
          <div className="brand-mark">EB</div>

          <h1>ExamBank 791381</h1>

          <p className="subtitle">
            نظام ذكي لبناء امتحانات شبكات الاتصال
          </p>

          <form onSubmit={handleLogin}>
            <label>
              كود المستخدم
              <input
                type="text"
                value={userCode}
                onChange={(event) =>
                  setUserCode(event.target.value)
                }
                placeholder="أدخل كود المستخدم"
                autoComplete="username"
              />
            </label>

            <label>
              كلمة المرور
              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
              />
            </label>

            <button
              type="submit"
              className="primary-button"
            >
              دخول
            </button>
          </form>

          <p className="login-note">
            نسخة التطوير المحلية
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="builder-page" dir="rtl">
      <header className="top-bar">
        <div>
          <h1>ExamBank 791381</h1>

          <p>
            بناء امتحان من مخزن الأسئلة المصنف
          </p>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          تسجيل الخروج
        </button>
      </header>

      <section className="builder-content">
        <div className="builder-card">
          <div className="builder-heading">
            <span className="ai-badge">
              AI
            </span>

            <div>
              <h2>
                ماذا تريد في الامتحان؟
              </h2>

              <p>
                اكتب طلبك بالطريقة التي تريدها،
                وسيتولى النظام اختيار الأسئلة
                المناسبة من المخزن.
              </p>
            </div>
          </div>

          <textarea
            value={examPrompt}
            onChange={(event) =>
              setExamPrompt(event.target.value)
            }
            placeholder="مثال: أنشئ امتحانًا من 20 سؤالًا لطلاب ضعفاء إلى متوسطين، 5 أسئلة IPv6، و3 DHCP، وسؤالين OSPF، واجعل معظم الأسئلة سهلة ومتوسطة..."
          />

          <div className="builder-actions">
            <span className="helper-text">
              لاحقًا سيتم تحليل طلبك واختيار
              الأسئلة تلقائيًا.
            </span>

            <button
              className="generate-button"
              onClick={handleGenerateExam}
              disabled={!examPrompt.trim()}
            >
              إنشاء الامتحان
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;