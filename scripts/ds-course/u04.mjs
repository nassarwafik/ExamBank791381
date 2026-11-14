// Unit 4 — الراصّة Stack<T> (الكتاب: الفصل الرابع، ص 179–194؛ وورقة أسئلة الراصّة للمعلّم).
import {
  P, H, DEF, NOTE, LIST, OL, EX, CS, OUT, API, CLAR, XP, XH, XCS, XEX, XTIP, XLIST, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, LAB, FIG, proved, provedCount, stackOf,
} from "./dsl.mjs";

const USE = `
public static void Main()
{
    Stack<int> S1 = new Stack<int>();
    S1.Push(1);
    S1.Push(2);
    S1.Push(3);
    S1.Push(4);
    Console.WriteLine(S1.ToString());
    S1.Push(S1.Top());
    Console.WriteLine(S1.Pop());
    Console.WriteLine(S1.Pop() + S1.Pop());
    int x1 = S1.Pop();
    int x2 = S1.Pop();
    Console.WriteLine(x1 + x2);
    Console.WriteLine(S1.ToString());
}`;

const TO_STACK = `
public static Stack<int> ToStack(int[] A)
{
    Stack<int> s = new Stack<int>();
    for (int i = 0; i < A.Length; i++) s.Push(A[i]);
    return s;
}`;
const GET_SIZE_EMPTYING = `
public static int GetSize(Stack<int> S)
{
    int Size = 0;
    while (!S.IsEmpty())
    {
        Size++;
        S.Pop();
    }
    return Size;
}`;
const COPY_STACK = `
public static Stack<int> CopyStack(Stack<int> s1)
{
    Stack<int> s2 = new Stack<int>();
    while (!s1.IsEmpty())
        s2.Push(s1.Pop());
    Stack<int> s3 = new Stack<int>();
    while (!s2.IsEmpty())
    {
        s1.Push(s2.Top()); // لاحظ أننا نستعمل هنا Top
        s3.Push(s2.Pop());
    }
    return s3;
}`;
const GET_SIZE = `
public static int GetSize(Stack<int> S)
{
    Stack<int> Temp = CopyStack(S);
    int Size = 0;
    while (!Temp.IsEmpty())
    {
        Size++;
        Temp.Pop();
    }
    return Size;
}`;
const GET_SUM = `
public static int GetSumOfValues(Stack<int> S)
{
    Stack<int> Temp = CopyStack(S);
    int Sum = 0;
    while (!Temp.IsEmpty())
    {
        Sum += Temp.Pop();
    }
    return Sum;
}`;
const EXISTS = `
public static bool Exists(Stack<int> S, int Num)
{
    Stack<int> Temp = CopyStack(S);
    while (!Temp.IsEmpty())
    {
        if (Num == Temp.Pop())
            return true;
    }
    return false;
}`;
const BRACKETS = `
public static bool IsBracketBalanced(string str)
{
    Stack<char> Stk = new Stack<char>();
    for (int i = 0; i < str.Length; i++)// نقوم بعمليّة تمشيط النصّ رمزًا رمزًا
    {
        if (IsOpenBracket(str[i]))// إذا وجدنا قوسًا مفتوحًا نُدخله إلى الراصّة
            Stk.Push(str[i]);
        else if (IsCloseBracket(str[i]))// إذا وجدنا قوسًا مغلقًا
        {
            if (Stk.IsEmpty()) return false;
            if (!IsBalanced(Stk.Pop(), str[i]))
                return false;
        }
    }
    return Stk.IsEmpty();// عند انتهاء عمليّة التمشيط يجب أن تكون الراصّة فارغة
}`;
const BRACKET_HELPERS = `
public static bool IsOpenBracket(char B)
{
    return B == '{' || B == '[' || B == '(';
}
public static bool IsCloseBracket(char B)
{
    return B == '}' || B == ']' || B == ')';
}
public static bool IsBalanced(char Op, char Cl)
{
    if (Op == '{')
        return Cl == '}';
    if (Op == '(')
        return Cl == ')';
    if (Op == '[')
        return Cl == ']';
    return false;
}`;
const EVALUATE = `
public static double Evaluate(string strExpression)
{
    Stack<string> OperationsStack = new Stack<string>();
    Stack<double> ValuesStack = new Stack<double>();
    string[] A = strExpression.Split(' ');
    for (int i = 0; i < A.Length; i++)
    {
        if (A[i] == "(") continue;// القوس المفتوح لا يهمنا
        else if (IsOperation(A[i]))
            OperationsStack.Push(A[i]);
        else if (A[i] == ")")
        {
            string op = OperationsStack.Pop();
            double v = ValuesStack.Pop();
            if (op == "+")
                v = ValuesStack.Pop() + v;
            else if (op == "-")
                v = ValuesStack.Pop() - v;
            else if (op == "*")
                v = ValuesStack.Pop() * v;
            else if (op == "/")
                v = ValuesStack.Pop() / v;
            else if (op == "sqrt")
                v = Math.Sqrt(v);
            ValuesStack.Push(v); // نُدخل النتيجة إلى راصّة القيم
        }
        else
            ValuesStack.Push(double.Parse(A[i])); // هنا نُحول النصّ إلى عدد
    }
    return ValuesStack.Pop(); // في النهاية تكون النتيجة في رأس راصّة القيم
}

public static bool IsOperation(string str)
{
    return str == "+" || str == "-" || str == "*" || str == "/" || str == "sqrt";
}`;
const SIZE_REC_EMPTYING = `
public static int GetSize(Stack<int> Stk)
{
    if (Stk.IsEmpty())
        return 0;
    Stk.Pop();
    return 1 + GetSize(Stk);
}`;
const SIZE_REC = `
public static int GetSize(Stack<int> Stk)
{
    if (Stk.IsEmpty())
        return 0;
    int x = Stk.Pop();
    int c = 1 + GetSize(Stk);
    Stk.Push(x);
    return c;
}`;
const PALINDROME = s0 => `
public static bool IsPalindrome(string str)
{
    Stack<char> stk = new Stack<char>();
    for (int i = 0; i < str.Length; i++)
        stk.Push(str[i]);
    string strRev = ${s0};
    while (!stk.IsEmpty())
        strRev += stk.Pop();
    return str.Equals(strRev);
}`;

// ── ورقة أسئلة الراصّة (للمعلّم): الأسئلة المختارة ─────────────────────────────────────────────────────────────────────
const Q1 = `
public static void Main(string[] args)
{
    Stack<char> st = new Stack<char>();
    st.Push('a');
    st.Push('b');
    st.Push('c');
    st.Push('d');
    st.Pop();
    st.Push('e');
    Console.WriteLine(st);
}`;
const Q2 = `
static void Main(string[] args)
{
    Stack<int> st = new Stack<int>();
    for (int k = 1; k <= 10; k++)
    {
        if (k % 2 == 0)
            st.Push(k * 10);
        else
            st.Push((int)Math.Pow(k, 2));
    }
    Console.WriteLine(st);
}`;
const PINEAPPLE = `
public static int Pineapple(Stack<int> st)
{
    int x, sod = 0;
    Stack<int> temp = new Stack<int>();
    while (!st.IsEmpty())
    {
        x = st.Pop();
        temp.Push(x);
        sod = sod + x;
    }
    while (!temp.IsEmpty())
        st.Push(temp.Pop());
    return sod;
}`;
const PEACH = `
public static void Peach(Stack<int> st1)
{
    Stack<int> st2 = new Stack<int>();
    int x, y;
    while (!st1.IsEmpty())
    {
        x = st1.Pop();
        if (!st1.IsEmpty())
        {
            y = st1.Pop();
            st2.Push(y);
        }
        else
            st2.Push(x);
        st2.Push(x);
    }
    Console.WriteLine("st2=" + st2);
}`;
const CHERRY = `
public static int Cherry(Stack<int> st, int num)
{
    int count = 0;
    Stack<int> temp = new Stack<int>();
    while (!st.IsEmpty())
    {
        int x = st.Pop();
        if (x != num)
            temp.Push(x);
        else
            count++;
    }
    while (!temp.IsEmpty())
        st.Push(temp.Pop());
    return count;
}`;
const BANANA = `
public static void Banana(Stack<int> st)
{
    Stack<int> temp = new Stack<int>();
    int max = st.Top();
    while (!st.IsEmpty())
    {
        int x = st.Pop();
        if (x > max)
            max = x;
        temp.Push(x);
    }
    while (!temp.IsEmpty())
    {
        int x = temp.Pop();
        if (x != max)
            st.Push(x);
    }
    st.Push(max);
}`;
const WATERMELON = `
public static Stack<int> Watermelon(Stack<int> st)
{
    Stack<int> res = new Stack<int>();
    while (!st.IsEmpty())
    {
        int x = st.Pop();
        while (!res.IsEmpty() && res.Top() > x)
            st.Push(res.Pop());
        res.Push(x);
    }
    return res;
}`;
const SUM_ODD = `
public static int SumOdd(Stack<int> st)
{
    int sum = 0;
    while (!st.IsEmpty())
    {
        int x = st.Pop();
        if (x % 2 != 0)
            sum = sum + x;
    }
    return sum;
}`;
const IS_SORTED = `
public static bool IsSorted(Stack<int> st)
{
    Stack<int> temp = new Stack<int>();
    bool sorted = true;
    while (!st.IsEmpty())
    {
        int x = st.Pop();
        if (!st.IsEmpty() && x > st.Top())
            sorted = false;
        temp.Push(x);
    }
    while (!temp.IsEmpty())
        st.Push(temp.Pop());
    return sorted;
}`;
const STUDENT = `
public class Student
{
    private string name;
    private int grade;
    public Student(string name, int grade)
    {
        this.name = name;
        this.grade = grade;
    }
    public string GetName() { return name; }
    public int GetGrade() { return grade; }
}`;
const PASSED = `
public static Stack<Student> Passed(Stack<Student> st)
{
    Stack<Student> temp = new Stack<Student>();
    Stack<Student> res = new Stack<Student>();
    while (!st.IsEmpty())
        temp.Push(st.Pop());
    while (!temp.IsEmpty())
    {
        Student s = temp.Pop();
        st.Push(s);
        if (s.GetGrade() >= 55)
            res.Push(s);
    }
    return res;
}`;
const PASSED_RUN = `
Stack<Student> st = new Stack<Student>();
st.Push(new Student("Omar", 30));
st.Push(new Student("Lina", 55));
st.Push(new Student("Adam", 91));
st.Push(new Student("Sana", 40));
st.Push(new Student("Rami", 72));
Stack<Student> res = Passed(st);
while (!res.IsEmpty())
    Console.WriteLine(res.Pop().GetName());`;

export default {
  n: 4,
  title: "الراصّة (Stack)",
  short: "الراصّة",
  description: "مبدأ «آخر من يدخل أول من يخرج»، واجهة الفئة Stack، تمشيط الراصّة مع الحفاظ عليها، بناء الفئة بسلسلة خلايا، فحص اتزان الأقواس وحساب تعبير حسابي، الراصّة والتراجعية، وأسئلة تتبّع وكتابة.",
  src: "179",
  lessons: [
    {
      title: "ما الراصّة؟",
      pages: [
        {
          title: "الراصّة ومبدأ LIFO",
          src: "180",
          keywords: ["راصّة", "Stack", "LIFO", "رأس الراصّة", "Push", "Pop"],
          objective: "أن تعرف ما الراصّة، وأين يتم الإدخال والإخراج فيها.",
          blocks: [
            H("الراصّة", 2),
            DEF("الراصّة", "**الراصّة** مبنى معلومات يحفظ مجموعة من المعلومات المتجانسة، بحيث يكون **الإدخال والإخراج من نفس المكان**، ويسمّى __رأس الراصّة__. أي أنّ آخر معلومة أُدخلت (`Last In`) تكون الأولى التي تُخرج (`First Out`)."),
            FIG("راصّة فيها 4 قيم", [{ kind: "stack", items: [4, 3, 2, 1], label: "أُدخلت 1 ثم 2 ثم 3 ثم 4: الرأس 4 والقاع 1" }]),
            XP("فكّر في كومة صحون: تضع الصحن الجديد **فوق** الكومة، وتأخذ الصحن من **فوقها** أيضًا. الصحن الذي وضعته آخرًا هو أول صحن تأخذه. هذا المبدأ يُختصر بالحروف `LIFO`: `Last In First Out`."),
            LIST([
              "التراجع عن الكتابة في محرّر النصوص: الضغط على الزرّ `Undo` يعمل وفق مبدأ `LIFO`، فالتراجع يكون عن آخر شيء أُدخل.",
              "فحص مبنى التعابير التي تستعمل الأقواس، مثل التعابير الحسابية أو مقاطع بلغة `C#` مثل `if(x==2){x++;}`.",
              "العمليات التراجعية تستعمل الراصّة.",
            ], { title: "استعمالات وتطبيقات لهذا المبنى" }),
            LAB("stack", { values: [1, 2, 3], name: "s", description: "أدخِل قيمًا وأخرِجها، وراقب: أي قيمة تخرج أولًا؟" }),
            MC("أدخلنا إلى راصّة فارغة القيم 5 ثم 8 ثم 2 بهذا الترتيب. أي قيمة تخرج عند أول إخراج؟", ["5", "8", "*2", "لا يمكن أن نعرف"], "آخر قيمة دخلت هي 2، فهي في رأس الراصّة وتخرج أولًا."),
          ],
        },
        {
          title: "واجهة الفئة `Stack<T>`",
          src: "180–182",
          keywords: ["Stack<T>", "Push", "Pop", "Top", "IsEmpty", "ToString"],
          objective: "أن تعرف عمليات الراصّة الست وما تعيده كل واحدة.",
          blocks: [
            P("يوفّر هذا المبنى مجموعة من العمليات وهي:"),
            API("Stack<T>", [
              ["public Stack()", "عملية بنائية تبني راصّة فارغة.", "O(1)"],
              ["public void Push(T x)", "عملية تُدخل `x` إلى رأس الراصّة.", "O(1)"],
              ["public T Pop()", "عملية تُخرج القيمة التي في رأس الراصّة (تشترط ألا تكون الراصّة فارغة).", "O(1)"],
              ["public T Top()", "تعيد القيمة الموجودة في الرأس بدون إخراجها (تشترط ألا تكون الراصّة فارغة).", "O(1)"],
              ["public bool IsEmpty()", "تُعيد `true` إذا كانت الراصّة فارغة. خلاف ذلك تعيد `false`.", "O(1)"],
              ["public override string ToString()", "تُعيد قيم الراصّة بالشكل `[x1,x2,...,xn]` بحيث أنّ `x1` هي القيمة التي في رأس الراصّة.", "O(n)"],
            ]),
            CLAR("النجاعة", "عمود «النجاعة» مأخوذ من ملاحظة الكتاب عند كتابة الفئة (ص 186): نجاعة جميع العمليات `O(1)` ما عدا `ToString` فنجاعتها `O(n)`."),
            NOTE("انتبه", "`Pop` و `Top` تشترطان ألا تكون الراصّة فارغة. قبل استدعائهما نفحص: `if (!s.IsEmpty())`."),
            P("دعونا الآن نتعرّف على كيفية استعمال هذه الفئة. تتبّع الأوامر التالية وراقب الراصّة بعد كل أمر:"),
            TRACE({ title: "استعمال الفئة `Stack<int>` أمرًا أمرًا", code: USE, description: "أوامر جدول الكتاب (ص 181–182) داخل `Main`. اضغط «الخطوة التالية» وراقب الراصّة والناتج." }),
            CLAR("في الكتاب", "في جدول الكتاب كُتب `stack<int>` و `console.WriteLine` بحرف صغير. لغة `C#` تميّز بين الحرف الكبير والصغير، فالكتابة الصحيحة `Stack<int>` و `Console.WriteLine` كما في بقية الكتاب."),
            proved(MC("ماذا يطبع الأمر `Console.WriteLine(S1.Pop() + S1.Pop());` حين تكون الراصّة `[4,3,2,1]`؟", ["4", "*7", "3", "43"], "`Pop` الأولى تُخرج 4 والثانية تُخرج 3، ومجموعهما 7. بعد الأمر تبقى الراصّة `[2,1]`."),
              { code: "public static void Main()\n{\n" + stackOf("S1", "int", [4, 3, 2, 1]).replace(/^/gm, "    ") + "\n    Console.WriteLine(S1.Pop() + S1.Pop());\n}", out: "7\n" }),
            TF("العملية `Top` تُخرج القيمة التي في رأس الراصّة.", false, "`Top` تعيد القيمة التي في الرأس **بدون إخراجها**. التي تُخرج هي `Pop`."),
          ],
        },
      ],
    },
    {
      title: "عمليات على الراصّة",
      pages: [
        {
          title: "بناء راصّة وحساب طولها",
          src: "182–183",
          keywords: ["ToStack", "GetSize", "طول الراصّة"],
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مصفوفة أحادية `A` من نمط صحيح. العملية تنشئ راصّة جديدة وتُدخل إليها قيم المصفوفة بحيث تكون القيمة `A[0]` في قاع الراصّة وهكذا. على العملية أن تُعيد هذه الراصّة.", steps: ["ننشئ راصّة فارغة.", "نمرّ على المصفوفة من `A[0]` وندخل كل قيمة: أول قيمة تدخل تصير في القاع.", "نعيد الراصّة."] }),
            CS(TO_STACK),
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى راصّة من نمط صحيح. العملية تُعيد طول هذه الراصّة، أي عدد القيم المُخزّنة في خلاياها.", steps: ["الفكرة: طالما أنّ الراصّة ليست فارغة نرفع العدّاد بواحد ونحذف القيمة التي في رأس الراصّة."], explanation: "المشكلة في هذا الحل أنّ الراصّة تُصبح فارغة بعد تنفيذ العملية، كما هو واضح في كود فحص العملية." }),
            CS(GET_SIZE_EMPTYING),
            P("**كود لفحص العملية:**"),
            CS(`
              int[] A = { 2, 4, 6, 8, 10 };
              Stack<int> S1 = ToStack(A);
              Console.WriteLine(S1.ToString());
              Console.WriteLine(GetSize(S1));
              Console.WriteLine(S1.ToString());`),
            P("**الطباعة تكون على النحو التالي:**"),
            OUT("[10,8,6,4,2]\n5\n[]"),
            TRACE({
              title: "`GetSize` تُفرغ الراصّة", code: GET_SIZE_EMPTYING,
              run: "int[] A = { 2, 4, 6 };\nStack<int> S1 = ToStack(A);\nConsole.WriteLine(GetSize(S1));\nConsole.WriteLine(S1.ToString());", lib: TO_STACK,
              given: "الراصّة `S1 = [6,4,2]` (بُنيت من المصفوفة `{2, 4, 6}`)، والاستدعاء `GetSize(S1)`.",
              description: "راقب الراصّة: ماذا يبقى فيها حين تنتهي العملية؟",
            }),
            P("**ما هو الحل إذن؟** إحدى الحلول تكمن في توفير عملية خارجية مساعدة تتلقّى راصّة وتُعيد نسخة عنها."),
          ],
        },
        {
          title: "الحفاظ على الراصّة: `CopyStack`",
          src: "184–185",
          keywords: ["CopyStack", "نسخ راصّة", "قالب التمشيط"],
          objective: "أن تمشّط راصّة دون أن تضيع قيمها.",
          blocks: [
            CS(COPY_STACK),
            P("لاحظ أنّنا نحتاج إلى الراصّة المساعدة `s2`. ننقل إليها محتوى الراصّة الأصلية `s1`، فتُصبح `s1` فارغة. بعدها ننقل محتوى `s2` إلى `s1` الأصلية وأيضًا إلى `s3` التي نُعيدها كنسخة عن `s1`."),
            TRACE({
              title: "`CopyStack` خطوة بخطوة", code: COPY_STACK,
              run: stackOf("S", "int", [6, 4, 2]) + "\nStack<int> Copy = CopyStack(S);\nConsole.WriteLine(S.ToString());\nConsole.WriteLine(Copy.ToString());",
              given: "الراصّة `S = [6,4,2]`، والاستدعاء `Stack<int> Copy = CopyStack(S);`.",
              description: "النقل مرّة يقلب الترتيب؛ النقل مرّتين يعيده كما كان.",
            }),
            XTIP("قاعدة ذهبية", "نقل راصّة إلى راصّة أخرى **يقلب** ترتيبها. نقلها **مرّتين** يعيد الترتيب الأصلي. لهذا نحتاج راصّة مساعدة كلما أردنا الحفاظ على الراصّة."),
            P("والآن نُعيد كتابة العملية `GetSize` بحيث ننشئ نسخة عن الراصّة الأصلية بمساعدة العملية `CopyStack` ونعمل مع هذه النسخة وليس مع الراصّة الأصلية لنحافظ على قيمها."),
            CS(GET_SIZE),
            P("تنفيذ كود الفحص نفسه لا يغيّر الآن أي شيء في الراصّة الأصلية. الطباعة تكون:"),
            OUT("[10,8,6,4,2]\n5\n[10,8,6,4,2]"),
            H("قالب لتمشيط الراصّة", 3),
            P("نأخذ من الأمثلة السابقة القالب التالي لتمشيط الراصّة:"),
            CS(`
              public static … MyFunction(Stack<int> S)
              {
                  Stack<int> Temp = CopyStack(S);
                  …
                  while (!Temp.IsEmpty())
                  {
                      …
                      Temp.Pop(); // حتّى نتقدّم في عمليّة التمشيط، يجب اخراج العنصر الذي في الرأس
                  }
                  …
              }`),
            ORDER("رتّب خطوات `CopyStack` بالترتيب الصحيح:", ["ننشئ راصّة مساعدة `s2`", "ننقل كل قيم `s1` إلى `s2` (تصير `s1` فارغة)", "ننشئ الراصّة `s3`", "ننقل كل قيمة من `s2` إلى `s1` وإلى `s3` معًا", "نعيد `s3`"], "النقل الأول يقلب الترتيب في `s2`، والنقل الثاني يعيده في `s1` وفي النسخة `s3`."),
          ],
        },
        {
          title: "مجموع القيم والبحث عن قيمة",
          src: "185–186",
          keywords: ["GetSumOfValues", "Exists"],
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى راصّة من نمط صحيح. العملية تُعيد مجموع قيم هذه الراصّة، أي مجموع القيم المُخزّنة في خلاياها.", steps: ["نستعمل قالب التمشيط: ننسخ الراصّة ونعمل على النسخة.", "في كل دورة نُخرج الرأس ونضيفه إلى المجموع."] }),
            CS(GET_SUM),
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى راصّة من نمط صحيح وعددًا صحيحًا `Num`. العملية تُعيد `true` إذا وجدت `Num` في الراصّة. خلاف ذلك تُعيد العملية `false`.", steps: ["نستعمل قالب التمشيط.", "إذا ساوت القيمة المُخرَجة العدد `Num` نعيد `true` فورًا: النسخة هي التي تغيّرت، والأصل سليم.", "إذا انتهت الحلقة ولم نجد، نعيد `false`."] }),
            CS(EXISTS),
            CLAR("في الكتاب", "نصّ المثال في الكتاب يقول «إذا وجدت `Num` في المصفوفة»، والمقصود الراصّة."),
            TRACE({
              title: "`Exists` تبحث عن 4", code: EXISTS, quiet: ["CopyStack"],
              run: stackOf("S", "int", [9, 4, 7]) + "\nConsole.WriteLine(Exists(S, 4));\nConsole.WriteLine(S.ToString());", lib: COPY_STACK,
              given: "الراصّة `S = [9,4,7]`، والاستدعاء `Exists(S, 4)`.",
              description: "العملية تعمل على النسخة `Temp`؛ راقب `S`: هل تتغيّر؟",
            }),
            proved(SHORT("ما القيمة التي تعيدها `GetSumOfValues(S)` للراصّة `S = [10,8,6,4,2]`؟", "30", "`10 + 8 + 6 + 4 + 2 = 30`."),
              { code: GET_SUM, run: stackOf("S", "int", [10, 8, 6, 4, 2]) + "\nConsole.Write(GetSumOfValues(S));", lib: COPY_STACK, out: "30" }),
            MC("لماذا يجوز في `Exists` أن نكتب `return true;` داخل الحلقة دون أن نعيد القيم إلى الراصّة؟", ["لأن الراصّة تعيد قيمها تلقائيًا", "*لأن الحلقة تعمل على النسخة `Temp` وليس على الراصّة الأصلية", "لأن `Pop` لا تُخرج القيمة", "لا يجوز ذلك"], "العملية نسخت الراصّة أولًا بـ `CopyStack`، فكل ما يُخرج يُخرج من النسخة. الراصّة الأصلية `S` لا تتغيّر."),
          ],
        },
      ],
    },
    {
      title: "كيف تُكتب الفئة `Stack<T>`؟",
      pages: [
        {
          title: "الراصّة بسلسلة خلايا مترابطة",
          src: "186–188",
          keywords: ["Stack<T>", "Node<T>", "Head", "تنفيذ الراصّة"],
          objective: "أن تفهم كيف تُبنى الراصّة من سلسلة خلايا لها رأس واحد.",
          blocks: [
            P("والآن نأتي إلى كتابة الفئة `Stack<T>` بلغة `C#`. هنالك إمكانيتان لكتابة هذه الفئة:"),
            OL([
              ["بمساعدة مصفوفة أحادية", "من سيئات هذا الحل أنّ المصفوفة محدودة الحجم. وبالتالي على الفئة أن توفّر عملية تخبر مُستخدم الفئة ما إذا كانت الراصّة ممتلئة أم لا — `public bool IsFull()`، ولا يجوز له استعمال `Push` إلا إذا كانت الراصّة غير ممتلئة."],
              ["بمساعدة سلسلة خلايا مترابطة", "يُعتبر هذا الحل هو الأمثل لأنّ حجم الراصّة يكون شبه غير محدود. نستعمل مؤشّرًا واحدًا يؤشّر إلى رأس السلسلة. الإدخال يكون قبل الرأس — أي أنّ الخلية الجديدة تُصبح هي الرأس. الإخراج يكون بإخراج الرأس من السلسلة وإعادة القيمة المُخزّنة فيه، وبعدها تُصبح الخلية التالية هي الرأس الجديد."],
            ]),
            CS(`
              public class Stack<T>
              {
                  private Node<T> Head;
                  public Stack()
                  {
                      this.Head = null;
                  }
                  public bool IsEmpty()
                  {
                      return this.Head == null;
                  }
                  public void Push(T x)
                  {
                      Node<T> Temp = new Node<T>(x);
                      Temp.SetNext(Head);
                      Head = Temp;
                  }
                  public T Top()
                  {
                      return Head.GetValue();
                  }
                  public T Pop()
                  {
                      T x = Head.GetValue();
                      Head = Head.GetNext();
                      return x;
                  }
                  public override string ToString()
                  {
                      string str = "[";
                      Node<T> Pos = Head;
                      while (Pos != null)
                      {
                          if (Pos.HasNext())
                              str += Pos.GetValue() + ",";
                          else
                              str += Pos.GetValue();
                          Pos = Pos.GetNext();
                      }
                      return str + "]";
                  }
              }`),
            NOTE("لاحظ", "نجاعة جميع العمليات هي `O(1)` ما عدا العملية `ToString` فنجاعتها `O(n)`. ولاحظ أيضًا بأنّ جميع العمليات تعمل مع **الرأس فقط**."),
            P("الصورة التالية تُبيّن وضع الراصّة بعد تنفيذ الأوامر `Stk.Push(17); Stk.Push(15); Stk.Push(13);` ثم بعد `Stk.Pop()` ثم بعد `Stk.Push(23)`:"),
            FIG("الراصّة من الداخل: سلسلة خلايا", [
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0]], label: "بعد `Push(17)` ثم `Push(15)` ثم `Push(13)`" },
              { kind: "chain", items: [15, 17], pointers: [["Head", 0]], label: "بعد `Pop()`: خرجت 13" },
              { kind: "chain", items: [23, 15, 17], pointers: [["Head", 0]], hi: [0], label: "بعد `Push(23)`" },
            ]),
            XP("جرّب بنفسك في مختبر السلسلة: «أضف في البداية» هي ما تفعله `Push`، و«احذف الأولى» هي ما تفعله `Pop`."),
            LAB("chain", { values: [13, 15, 17], name: "Head", title: "جرّب: `Push` و `Pop` على السلسلة" }),
            MATCH("صِل كل عملية بما تفعله داخل الفئة:", [["`Push(x)`", "خلية جديدة تشير إلى الرأس القديم وتصير هي الرأس"], ["`Pop()`", "الرأس ينتقل إلى الخلية التالية وتُعاد القيمة القديمة"], ["`Top()`", "تُعاد قيمة خلية الرأس دون تغيير"], ["`IsEmpty()`", "فحص: هل الرأس يساوي `null`؟"]], "كل العمليات تعمل مع الرأس فقط، ولهذا نجاعتها `O(1)`."),
          ],
        },
      ],
    },
    {
      title: "تطبيقات الراصّة",
      pages: [
        {
          title: "فحص اتّزان الأقواس",
          src: "189–190",
          keywords: ["أقواس", "IsBracketBalanced", "Stack<char>"],
          objective: "أن تستعمل الراصّة لفحص أنّ كل قوس يُغلق في مكانه الصحيح.",
          blocks: [
            H("فحص مبنى التعابير التي تستعمل الأقواس", 2),
            P("اكتب عملية خارجية تتلقّى نصًّا يحتوي على تعبير حسابي فيه أقواس. على العملية أن تفحص التعبير وتُعيد `true` إذا كانت الأقواس **مُتّزنة**، أي أنّ كل قوس يُغلق في المكان الصحيح. خلاف ذلك تُعيد `false`."),
            LIST(["`{([12+3]/6)*8}`", "`(3-2)`", "`({([1+5]/6)*8}/12)`"], { title: "تعابير مُتّزنة" }),
            LIST(["`(2+3}`", "`{([12+3)/6)*8})`", "`((2+3)`"], { title: "تعابير غير مُتّزنة" }),
            OL([
              "نقوم بعملية تمشيط النصّ رمزًا رمزًا.",
              "إذا وجدنا قوسًا مفتوحًا نُدخله إلى الراصّة.",
              "إذا وجدنا قوسًا مغلقًا يجب أن يكون في رأس الراصّة القوس الملائم له.",
              "عند انتهاء عملية التمشيط يجب أن تكون الراصّة فارغة.",
            ], { title: "فكرة الحل: راصّة من نوع `Stack<char>`" }),
            CLAR("في الكتاب", "البند الثالث مكتوب في الكتاب «القوس المغلق الملائم». المقصود أن يكون في رأس الراصّة القوس **المفتوح** الملائم للقوس المغلق الذي وجدناه."),
            CS(BRACKETS),
            CS(BRACKET_HELPERS),
            TRACE({
              title: "تتبّع: هل `\"{[2]}\"` مُتّزن؟", code: BRACKETS, quiet: ["IsOpenBracket", "IsCloseBracket", "IsBalanced"],
              run: "Console.WriteLine(IsBracketBalanced(\"{[2]}\"));", lib: BRACKET_HELPERS,
              given: "الاستدعاء `IsBracketBalanced(\"{[2]}\")`.", description: "كل قوس مفتوح يدخل الراصّة، وكل قوس مغلق يُخرج الرأس ويقارن به.",
            }),
            TRACE({
              title: "تتبّع: هل `\"(2]\"` مُتّزن؟", code: BRACKETS, quiet: ["IsOpenBracket", "IsCloseBracket", "IsBalanced"],
              run: "Console.WriteLine(IsBracketBalanced(\"(2]\"));", lib: BRACKET_HELPERS,
              given: "الاستدعاء `IsBracketBalanced(\"(2]\")`.",
            }),
            CLASSIFY("صنّف التعابير:", ["مُتّزن", "غير مُتّزن"], [["`(3-2)`", 0], ["`((2+3)`", 1], ["`{[1+2]*3}`", 0], ["`(2+3}`", 1], ["`[(])`", 1], ["`()[]{}`", 0]], "في `((2+3)` يبقى قوس مفتوح في الراصّة. في `(2+3}` و `[(])` القوس المغلق لا يلائم الرأس."),
            MC("لماذا لا يكفي أن نعدّ الأقواس المفتوحة والمغلقة ونقارن العددين؟", ["لأن العدّ بطيء", "*لأن الترتيب مهم: `[(])` فيه عددان متساويان لكنه غير مُتّزن", "لأن الراصّة لا تعدّ", "يكفي العدّ فعلًا"], "الراصّة تحفظ **آخر** قوس مفتوح، وكل قوس مغلق يجب أن يلائم الأقرب إليه. العدّ وحده لا يكشف التداخل الخاطئ."),
          ],
        },
        {
          title: "حساب قيمة تعبير حسابي براصّتين",
          src: "190–192",
          keywords: ["Dijkstra", "Evaluate", "راصّتان", "تعبير حسابي"],
          blocks: [
            H("حساب القيمة النهائية لتعبير حسابي — `Dijkstra's two-stack algorithm`", 3),
            P("في هذا المثال نبرمج ألغوريثم ديكسترا (`Dijkstra`) لحساب القيمة النهائية لتعبير حسابي. الألغوريثم يفترض أنّ التعبير يستعمل الأقواس **بشكل كامل** لتحديد أولويات تنفيذ العمليات الحسابية (`Fully Parenthesized`). نستعين أيضًا برمز الفراغ لنفصل بين الأقواس والأعداد والعمليات الحسابية، فيكون التعبير على الشكل التالي:"),
            OUT("( 3 + ( ( 5 + 3 ) * ( 6 * 5 ) ) )"),
            P("يستعمل الألغوريثم **راصّتين**: واحدة للعمليات الحسابية — `OperationsStack` — وأخرى للقيم — `ValuesStack`. في البداية نفصل بين أجزاء التعبير بواسطة العملية `Split` التابعة للفئة `string`، وهي تعيد مصفوفة نصوص تحتوي على هذه الأجزاء."),
            LIST([
              "نمرّ على خلايا مصفوفة الأجزاء.",
              "القوس المفتوح لا يهمّنا: نهمله وننتقل إلى الخلية التالية.",
              "ندخل العمليات إلى راصّة العمليات، والأعداد إلى راصّة القيم.",
              "إذا وجدنا قوسًا مُغلقًا — وهو يدلّ على البدء بالحساب — نُخرج العملية من راصّة العمليات والعددين من راصّة القيم، وننفّذ العملية على العددين (نُخرج عددًا واحدًا إذا كانت العملية `sqrt`).",
              "ثم نُدخل النتيجة إلى راصّة القيم.",
              "في النهاية تكون النتيجة في رأس راصّة القيم.",
            ]),
            CS(EVALUATE),
            TRACE({
              title: "تتبّع: `( 2 * ( 3 + 4 ) )`", code: EVALUATE, quiet: ["IsOperation"], max: 120,
              run: "Console.WriteLine(Evaluate(\"( 2 * ( 3 + 4 ) )\"));",
              given: "الاستدعاء `Evaluate(\"( 2 * ( 3 + 4 ) )\")`.", description: "راقب الراصّتين: متى يبدأ الحساب؟",
            }),
            GUIDED({
              title: "نحلّ معًا: `( 3 + ( ( 5 + 3 ) * ( 6 * 5 ) ) )`",
              prompt: "احسب قيمة التعبير كما يفعل الألغوريثم. ما الذي يحدث عند كل قوس مغلق؟",
              steps: [
                "نقرأ `3` ثم `+` ثم `5` ثم `+` ثم `3`: راصّة القيم `[3,5,3]` (الرأس 3) وراصّة العمليات `[+,+]`.",
                "أول قوس مغلق: نُخرج `+` ونحسب `5 + 3 = 8`. راصّة القيم `[8,3]`.",
                "نقرأ `*` ثم `6` ثم `*` ثم `5`: راصّة القيم `[5,6,8,3]` وراصّة العمليات `[*,*,+]`.",
                "قوس مغلق: نُخرج `*` ونحسب `6 * 5 = 30`. راصّة القيم `[30,8,3]`.",
                "قوس مغلق: نُخرج `*` ونحسب `8 * 30 = 240`. راصّة القيم `[240,3]`.",
                "آخر قوس مغلق: نُخرج `+` ونحسب `3 + 240 = 243`.",
              ],
              result: "قيمة التعبير `243`.",
            }),
            proved(SHORT("ما القيمة التي تعيدها `Evaluate(\"( ( 8 - 2 ) / ( 1 + 2 ) )\")`؟", "2", "`8 - 2 = 6` و `1 + 2 = 3`، ثم `6 / 3 = 2`. لاحظ الترتيب: القيمة التي خرجت أولًا هي الطرف **الأيمن** من العملية."),
              { code: EVALUATE, run: "Console.Write(Evaluate(\"( ( 8 - 2 ) / ( 1 + 2 ) )\"));", out: "2" }),
          ],
        },
        {
          title: "الراصّة والتراجعية",
          src: "193–194",
          keywords: ["تراجعية", "GetSize", "IsPalindrome", "بالندروم"],
          blocks: [
            H("مبنى الراصّة تراجعيّ", 2),
            P("كل جزء من الراصّة هو أيضًا راصّة. لذلك يكون من السهل أحيانًا كتابة عمليات تراجعية تعمل على الراصّات. ولنأخذ على سبيل المثال العملية التي تتلقّى راصّة من نوع `Stack<int>` وتُعيد طول الراصّة."),
            DEF("شرط التوقّف", "إذا كانت (أو أصبحت) الراصّة فارغة، نُعيد 0. خلاف ذلك لدينا قيمة + طول الراصّة المُتبقّية بعد إخراج القيمة التي في رأس الراصّة."),
            CS(SIZE_REC_EMPTYING),
            P("لاحظوا بأنّ الراصّة أصبحت فارغة بعد انتهاء العملية من التنفيذ. لكن بإمكاننا وبسهولة المحافظة على محتوى الراصّة وعدم إضاعة القيم:"),
            CS(SIZE_REC),
            TRACE({
              title: "`GetSize` التراجعية تحافظ على الراصّة", code: SIZE_REC,
              run: stackOf("S", "int", [7, 5, 3]) + "\nConsole.WriteLine(GetSize(S));\nConsole.WriteLine(S.ToString());",
              given: "الراصّة `S = [7,5,3]`، والاستدعاء `GetSize(S)`.",
              description: "كل استدعاء يحتفظ بقيمته `x` في إطاره، ويعيدها إلى الراصّة حين يعود.",
            }),
            XTIP("لماذا تعود القيم بترتيبها؟", "آخر استدعاء أخرج قاع الراصّة، وهو أول من يعيد قيمته. فتعود القيم من القاع إلى الرأس: الترتيب الأصلي تمامًا."),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى نصًّا وتُعيد `true` إذا كان النصّ بالندروم. خلاف ذلك تُعيد العملية `false`.", steps: ["ندخل رموز النص إلى راصّة رمزًا رمزًا.", "نخرجها كلها ونبني منها نصًّا: يخرج النص مقلوبًا.", "النص بالندروم إذا ساوى مقلوبه."] }),
            CS(PALINDROME("\" \"")),
            CLAR("خطأ مطبعي في الكتاب", "في الكتاب القيمة الابتدائية `string strRev = \" \";` وفيها **فراغ** بين علامتي الاقتباس. بهذا يبدأ النص المقلوب بفراغ ولا يساوي النص الأصلي أبدًا، فتُعيد العملية `false` دائمًا. الصحيح نص فارغ: `string strRev = \"\";`. التتبّع التالي يستعمل الصيغة الصحيحة."),
            TRACE({ title: "`IsPalindrome(\"aba\")` بعد التصحيح", code: PALINDROME("\"\""), run: "Console.WriteLine(IsPalindrome(\"aba\"));", given: "الاستدعاء `IsPalindrome(\"aba\")`." }),
            proved(TF("بالصيغة المطبوعة في الكتاب (`strRev = \" \"`)، الاستدعاء `IsPalindrome(\"aba\")` يعيد `true`.", false, "النص المقلوب يصير `\" aba\"` (بفراغ في أوله) وهو لا يساوي `\"aba\"`، فتُعاد `false`."),
              { code: PALINDROME("\" \""), run: "Console.Write(IsPalindrome(\"aba\"));", out: "False" }),
          ],
        },
      ],
    },
    {
      title: "أسئلة تتبّع وكتابة",
      pages: [
        {
          title: "أسئلة تتبّع (1)",
          keywords: ["تتبّع", "راصّة"],
          blocks: [
            XP("تمعّن في مقطع البرنامج، وتتبّعه **بدون** الاستعانة بالحاسوب. أجب أولًا، ثم افتح التتبّع لتتأكد. في كل الإجابات: القيمة الأولى من اليسار هي رأس الراصّة."),
            XH("سؤال 1", 3),
            XCS(Q1),
            proved(MC("كيف ستبدو الراصّة `st` في نهاية مقطع البرنامج؟", ["[a,b,c,d,e]", "[e,d,c,b,a]", "*[e,c,b,a]", "[e]"], "دُفعت الحروف a ثم b ثم c ثم d. عملية الإخراج حذفت الرأس d، ثم دُفع e فأصبح هو الرأس فوق c."), { code: Q1, out: "[e,c,b,a]\n" }),
            TRACE({ title: "تتبّع سؤال 1", code: Q1 }),
            XH("سؤال 2", 3),
            XCS(Q2),
            proved(MC("كيف ستبدو الراصّة `st` في نهاية مقطع البرنامج؟", ["[1,20,9,40,25,60,49,80,81,100]", "*[100,81,80,49,60,25,40,9,20,1]", "[100,90,64,70,36,50,16,30,4,10]", "[10,4,30,16,50,36,70,64,90,100]"], "القيم الفردية تُدفع مربّعاتها والقيم الزوجية تُدفع مضروبة في 10، فترتيب الدفع: 1، 20، 9، 40، 25، 60، 49، 80، 81، 100. في الراصّة آخر ما دُفع يكون الرأس، لذلك نقرأ الترتيب معكوسًا."), { code: Q2, out: "[100,81,80,49,60,25,40,9,20,1]\n" }),
            TRACE({ title: "تتبّع سؤال 2", code: Q2 }),
            XH("سؤال 3 — العملية `Pineapple`", 3),
            XCS(PINEAPPLE),
            FIG("الراصّة المعطاة st", [{ kind: "stack", items: [11, 3, 5, 7, 2] }]),
            proved(SHORT("ما القيمة التي تُعاد بعد استدعاء العملية `Pineapple` مع الراصّة `st`؟", "28", "`11 + 3 + 5 + 7 + 2 = 28`. كل حدّ أُخرج من `st` أُضيف إلى `sod`."),
              { code: PINEAPPLE, run: stackOf("st", "int", [11, 3, 5, 7, 2]) + "\nConsole.Write(Pineapple(st));", out: "28" }),
            MC("ماذا تنفّذ العملية `Pineapple`؟", ["تعكس ترتيب حدود الراصّة", "تعيد عدد حدود الراصّة", "*تعيد مجموع حدود الراصّة", "تعيد عدد الحدود المساوية للحدّ الذي في رأس الراصّة"], "الحلقة الأولى تجمع الحدود وتنقلها إلى `temp`، والحلقة الثانية تعيدها إلى `st` بترتيبها الأصلي. إذن العملية تعيد مجموع الحدود ولا تغيّر الراصّة."),
            TRACE({ title: "تتبّع `Pineapple`", code: PINEAPPLE, run: stackOf("st", "int", [11, 3, 5, 7, 2]) + "\nConsole.WriteLine(Pineapple(st));\nConsole.WriteLine(st);", given: "الراصّة `st = [11,3,5,7,2]`، والاستدعاء `Pineapple(st)`." }),
          ],
        },
        {
          title: "أسئلة تتبّع (2)",
          keywords: ["تتبّع", "راصّة مساعدة", "ترتيب"],
          blocks: [
            XP("أسئلة أصعب قليلًا: في كل سؤال عملية وراصّة معطاة. القيمة الأولى من اليسار هي رأس الراصّة."),
            XH("سؤال 4 — العملية `Peach`", 3),
            XCS(PEACH),
            proved(MC("معطاة الراصّة `st1 = [8,2,1,7,3,5]`. كيف ستبدو الراصّة `st2` في نهاية استدعاء `Peach(st1)`؟", ["*[3,5,1,7,8,2]", "[2,8,7,1,5,3]", "[1,2,3,5,7,8]", "[5,3,7,1,2,8]"], "في كل دورة يُخرج حدّان: الأول x والثاني y، فيُدفع y ثم x. الأزواج (8، 2) ثم (1، 7) ثم (3، 5) تُدفع بالترتيب: 2، 8، 7، 1، 5، 3، فيكون الرأس 3."),
              { code: PEACH, run: stackOf("st1", "int", [8, 2, 1, 7, 3, 5]) + "\nPeach(st1);", out: "st2=[3,5,1,7,8,2]\n" }),
            TRACE({ title: "تتبّع `Peach`", code: PEACH, run: stackOf("st1", "int", [8, 2, 1, 7, 3, 5]) + "\nPeach(st1);", given: "الراصّة `st1 = [8,2,1,7,3,5]`، والاستدعاء `Peach(st1)`." }),
            XH("سؤال 5 — العملية `Cherry`", 3),
            XCS(CHERRY),
            XP("معطاة الراصّة `st = [4,7,4,2,4,9]`، ونُفّذ الاستدعاء `int r = Cherry(st, 4);`."),
            proved(SHORT("ما القيمة التي ستُخزَّن في المتغيّر `r`؟", "3", "العدد 4 يظهر في الراصّة ثلاث مرات، وفي كل مرة يزيد `count` بواحد."),
              { code: CHERRY, run: stackOf("st", "int", [4, 7, 4, 2, 4, 9]) + "\nint r = Cherry(st, 4);\nConsole.Write(r);", out: "3" }),
            proved(MC("كيف ستبدو الراصّة `st` بعد انتهاء الاستدعاء؟", ["[9,2,7]", "[4,4,4]", "*[7,2,9]", "[4,7,4,2,4,9]"], "الحدود المساوية لـ 4 لم تُدفع إلى `temp` فحُذفت. نقل الحدود مرّتين (من `st` إلى `temp` ثم العودة) يحافظ على ترتيبها الأصلي، فتبقى 7 في الرأس."),
              { code: CHERRY, run: stackOf("st", "int", [4, 7, 4, 2, 4, 9]) + "\nint r = Cherry(st, 4);\nConsole.Write(st);", out: "[7,2,9]" }),
            TRACE({ title: "تتبّع `Cherry`", code: CHERRY, run: stackOf("st", "int", [4, 7, 4, 2, 4, 9]) + "\nint r = Cherry(st, 4);\nConsole.WriteLine(r);", given: "الراصّة `st = [4,7,4,2,4,9]`، والاستدعاء `Cherry(st, 4)`." }),
            XH("سؤال 6 — العملية `Banana`", 3),
            XCS(BANANA),
            proved(MC("معطاة الراصّة `st = [6,9,3,9,1]`. كيف ستبدو بعد انتهاء استدعاء `Banana(st)`؟", ["[9,6,9,3,1]", "*[9,6,3,1]", "[9,9,6,3,1]", "[1,3,6,9]"], "أكبر قيمة هي 9. في الحلقة الثانية كل حدّ يساوي 9 لا يعود إلى الراصّة، ثم يُدفع 9 مرة واحدة فقط. لذلك تختفي النسخة الثانية من 9."),
              { code: BANANA, run: stackOf("st", "int", [6, 9, 3, 9, 1]) + "\nBanana(st);\nConsole.Write(st);", out: "[9,6,3,1]" }),
            MC("ماذا تنفّذ العملية `Banana`؟", ["ترتّب حدود الراصّة تصاعديًا بحيث يكون الأصغر في الرأس", "تنقل أكبر قيمة إلى رأس الراصّة دون تغيير عدد الحدود", "تعكس ترتيب حدود الراصّة ثم تضيف أكبر قيمة إلى الرأس", "*تنقل أكبر قيمة إلى رأس الراصّة وتحذف تكراراتها الأخرى"], "ترتيب باقي الحدود لا يتغيّر لأنها نُقلت مرّتين. التغيير الوحيد: كل نسخ أكبر قيمة أُزيلت، وأُضيفت نسخة واحدة في الرأس."),
            TRACE({ title: "تتبّع `Banana`", code: BANANA, run: stackOf("st", "int", [6, 9, 3, 9, 1]) + "\nBanana(st);\nConsole.WriteLine(st);", given: "الراصّة `st = [6,9,3,9,1]`، والاستدعاء `Banana(st)`." }),
            XH("سؤال 7 — العملية `Watermelon`", 3),
            XCS(WATERMELON),
            proved(MC("معطاة الراصّة `st = [3,1,4,2]`. كيف ستبدو الراصّة التي تعيدها `Watermelon(st)`؟", ["[1,2,3,4]", "*[4,3,2,1]", "[2,4,1,3]", "[3,1,4,2]"], "قبل دفع أي حدّ إلى `res` تُعاد إلى `st` كل الحدود الأكبر منه. هكذا تبقى `res` مرتّبة دائمًا والأكبر في الرأس."),
              { code: WATERMELON, run: stackOf("st", "int", [3, 1, 4, 2]) + "\nConsole.Write(Watermelon(st));", out: "[4,3,2,1]" }),
            provedCount(SHORT("كم مرة يُنفَّذ الأمر `res.Push(x);` خلال هذا الاستدعاء؟", "7", "الحدّان 3 و4 يعودان إلى `st` ويُخرجان منها مرة أخرى. الإخراجات من `st` هي: 3، 1، 3، 4، 2، 3، 4، أي 7 مرات، وبعد كل إخراج يُنفَّذ `res.Push(x);` مرة واحدة."),
              { code: WATERMELON, run: stackOf("st", "int", [3, 1, 4, 2]) + "\nConsole.Write(Watermelon(st));" }, "res.Push(x);", 7),
            TRACE({ title: "تتبّع `Watermelon`", code: WATERMELON, run: stackOf("st", "int", [3, 1, 4, 2]) + "\nConsole.WriteLine(Watermelon(st));", given: "الراصّة `st = [3,1,4,2]`، والاستدعاء `Watermelon(st)`.", description: "ترتيب راصّة براصّة مساعدة واحدة." }),
          ],
        },
        {
          title: "أسئلة كتابة: اكتب العملية",
          keywords: ["كتابة عملية", "SumOdd", "IsSorted", "Passed"],
          blocks: [
            XP("اكتب كل عملية في دفترك أو في محرّر الكود **قبل** أن تنتقل إلى الصفحة التالية، ففيها الحلول مع تتبّعها. في الأمثلة: القيمة الأولى من اليسار هي رأس الراصّة."),
            XEX({ mode: "practice", title: "سؤال 1 — `SumOdd` (بدون الحفاظ على الراصّة)", prompt: "اكتب العملية `SumOdd` التي تستقبل راصّة أعداد صحيحة `st`، وتُرجع مجموع الأعداد الفردية الموجودة فيها. لا حاجة للحفاظ على الراصّة: مسموح أن تبقى فارغة بعد الاستدعاء. مثال: للراصّة `[7,4,9,2,5,8]` تُرجع العملية 21، لأن `7 + 9 + 5 = 21`.", steps: [] }),
            XCS("public static int SumOdd(Stack<int> st)\n{\n    // اكتب هنا\n}"),
            XEX({ mode: "practice", title: "سؤال 2 — `IsSorted` (يجب الحفاظ على الراصّة)", prompt: "اكتب العملية `IsSorted` التي تستقبل راصّة أعداد صحيحة `st`، وتُرجع `true` إذا كانت حدودها مرتّبة تصاعديًا من الرأس إلى القاع (كل حدّ أصغر من الحدّ الذي تحته أو يساويه)، وإلا تُرجع `false`. يجب الحفاظ على الراصّة: في نهاية العملية تعود `st` كما كانت تمامًا. أمثلة: للراصّة `[2,5,5,8,11]` تُرجع `true`، وللراصّة `[2,5,3,8]` تُرجع `false`.", steps: [] }),
            XCS("public static bool IsSorted(Stack<int> st)\n{\n    // اكتب هنا\n}"),
            XEX({ mode: "practice", title: "سؤال 3 — `Passed` (راصّة كائنات)", prompt: "معطاة الفئة `Student`. اكتب العملية `Passed` التي تستقبل راصّة طلاب `st` من نوع `Stack<Student>`، وتُرجع راصّة جديدة فيها الطلاب الذين علامتهم 55 أو أكثر، بنفس ترتيبهم في الراصّة الأصلية. يجب الحفاظ على الراصّة الأصلية `st` بدون تغيير.", steps: [] }),
            XCS(STUDENT),
            XCS("public static Stack<Student> Passed(Stack<Student> st)\n{\n    // اكتب هنا\n}"),
            XLIST([
              "هل توقيع العملية صحيح (ما تستقبله وما تعيده)؟",
              "هل تفحص `IsEmpty` قبل كل `Pop` أو `Top`؟",
              "إذا طُلب الحفاظ على الراصّة: هل تعيد **كل** القيم قبل أي `return`؟",
              "هل تصل إلى صفات الكائن بعمليات `Get` لا مباشرة؟",
            ], { title: "افحص حلّك قبل أن ترى الحل", variant: "checklist" }),
          ],
        },
        {
          title: "حلول أسئلة الكتابة",
          keywords: ["حلول", "SumOdd", "IsSorted", "Passed"],
          blocks: [
            XH("حل سؤال 1 — `SumOdd`", 3),
            XCS(SUM_ODD),
            XLIST([
              "متغيّر المجموع يبدأ من صفر قبل الحلقة.",
              "الحلقة `while (!st.IsEmpty())` تُخرج حدًّا واحدًا في كل دورة بواسطة `Pop()`.",
              "فحص العدد الفردي بالشرط `x % 2 != 0`، وليس `x % 2 == 1` الذي يخطئ مع الأعداد السالبة.",
              "إرجاع المجموع بعد انتهاء الحلقة وليس داخلها.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            TRACE({ title: "تتبّع `SumOdd`", code: SUM_ODD, run: stackOf("st", "int", [7, 4, 9, 2, 5, 8]) + "\nConsole.WriteLine(SumOdd(st));\nConsole.WriteLine(st);", given: "الراصّة `st = [7,4,9,2,5,8]`، والاستدعاء `SumOdd(st)`." }),
            proved(MC("كيف ستبدو الراصّة `st = [7,4,9,2,5,8]` بعد انتهاء استدعاء `SumOdd(st)`؟", ["[7,4,9,2,5,8]", "[4,2,8]", "[8,5,2,9,4,7]", "*الراصّة فارغة: `[]`"], "كل حدّ أُخرج بواسطة `Pop()` ولم يُدفع إلى أي مكان، فتصبح الراصّة فارغة، سواء كان الحدّ فرديًا أم زوجيًا. لو طُلب الحفاظ على الراصّة لاحتجنا إلى راصّة مساعدة."),
              { code: SUM_ODD, run: stackOf("st", "int", [7, 4, 9, 2, 5, 8]) + "\nSumOdd(st);\nConsole.Write(st);", out: "[]" }),
            XH("حل سؤال 2 — `IsSorted`", 3),
            XCS(IS_SORTED),
            XP("النقل مرّتين (من `st` إلى `temp` ثم العودة) يحافظ على الترتيب الأصلي. نتيجة الفحص تُحفظ في متغيّر منطقي، وتُرجع فقط **بعد** إعادة الحدود."),
            TRACE({ title: "تتبّع `IsSorted` على راصّة غير مرتّبة", code: IS_SORTED, run: stackOf("st", "int", [2, 5, 3, 8]) + "\nConsole.WriteLine(IsSorted(st));\nConsole.WriteLine(st);", given: "الراصّة `st = [2,5,3,8]`، والاستدعاء `IsSorted(st)`." }),
            XP("طالب كتب الحلقة الأولى بالشكل التالي، فخرج من العملية فورًا عند اكتشاف أول خلل في الترتيب:"),
            XCS("while (!st.IsEmpty())\n{\n    int x = st.Pop();\n    if (!st.IsEmpty() && x > st.Top())\n        return false;\n    temp.Push(x);\n}"),
            MC("ما المشكلة في حلّه؟", ["لا توجد مشكلة، الحل صحيح وأقصر", "*عند اكتشاف خلل تنتهي العملية قبل إعادة الحدود من الراصّة المساعدة، فتفقد الراصّة الأصلية جزءًا من حدودها", "العملية ستُرجع دائمًا القيمة false حتى لو كانت الراصّة مرتّبة", "سيحدث خطأ تشغيل عند الوصول إلى الحدّ الأخير لأن الراصّة فارغة"], "مثلًا للراصّة `[2,5,3,8]`: يُخرج 2 ويُدفع إلى `temp`، ثم يُخرج 5 وعند المقارنة `5 > 3` تنتهي العملية. الحدّ 2 بقي في `temp` والحدّ 5 لم يُدفع أصلًا، فتبقى في `st` الحدود 3 و8 فقط. الإرجاع مسموح فقط بعد إعادة كل الحدود."),
            XH("حل سؤال 3 — `Passed`", 3),
            XCS(PASSED),
            XP("لو دفعنا إلى `res` أثناء الحلقة الأولى لخرج ترتيبها معكوسًا. الدفع أثناء الإعادة من `temp` يعيد الترتيب الأصلي في `st` وفي `res` معًا. والشرط `>= 55` يشمل الطالب الذي علامته 55 بالضبط."),
            TRACE({ title: "تتبّع `Passed`", code: STUDENT.trim() + "\n" + PASSED.trim(), run: PASSED_RUN, max: 200, given: "الراصّة `st` من الرأس: `(Rami, 72)`، `(Sana, 40)`، `(Adam, 91)`، `(Lina, 55)`، `(Omar, 30)`، والاستدعاء `Passed(st)`." }),
            proved(MC("للراصّة في المثال، أي طلاب في الراصّة التي تعيدها `Passed`، من الرأس إلى القاع؟", ["*Rami ثم Adam ثم Lina", "Lina ثم Adam ثم Rami", "Rami ثم Adam فقط", "Adam ثم Rami ثم Lina"], "الطلاب الذين علامتهم 55 أو أكثر ثلاثة، والشرط `>=` يشمل Lina. الدفع إلى `res` يتم من القاع نحو الرأس، فيصل Lina أولًا و Rami أخيرًا، فيكون Rami في الرأس كما في الراصّة الأصلية."),
              { code: STUDENT.trim() + "\n" + PASSED.trim(), run: PASSED_RUN, out: "Rami\nAdam\nLina\n", loose: true }),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "راصّة"],
          blocks: [
            MC("ما معنى `LIFO`؟", ["أول من يدخل أول من يخرج", "*آخر من يدخل أول من يخرج", "الأكبر يخرج أولًا", "الأصغر يخرج أولًا"], "`Last In First Out`: آخر قيمة أُدخلت هي الأولى التي تُخرج."),
            WORDS("أكمل الجمل عن عمليات الراصّة:", "العملية [[Push]] تُدخل قيمة إلى رأس الراصّة، والعملية [[Pop]] تُخرج القيمة التي في الرأس، والعملية [[Top]] تعيدها بدون إخراجها، والعملية [[IsEmpty]] تفحص إن كانت الراصّة فارغة.", ["Insert", "Remove", "Head"], "`Insert` و `Remove` و `Head` عمليات الدور لا الراصّة."),
            XCS("Stack<int> s = new Stack<int>();\ns.Push(3); s.Push(6); s.Push(9);\ns.Pop();\ns.Push(s.Top() * 2);\nConsole.Write(s);"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟ اكتب الناتج كما يُطبع.", "[12,6,3]", "بعد الإدخالات `[9,6,3]`. `Pop` تُخرج 9. الرأس 6، فندخل 12: `[12,6,3]`."),
              { code: "public static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    s.Push(3); s.Push(6); s.Push(9);\n    s.Pop();\n    s.Push(s.Top() * 2);\n    Console.Write(s);\n}", out: "[12,6,3]" }),
            TF("بعد نقل كل قيم الراصّة `a` إلى راصّة فارغة `b` بالحلقة `while (!a.IsEmpty()) b.Push(a.Pop());` يكون ترتيب القيم في `b` مثل ترتيبها الأصلي في `a`.", false, "النقل مرّة واحدة **يقلب** الترتيب: رأس `a` يصير قاع `b`."),
            MC("أي عملية نجاعتها ليست `O(1)` في الفئة `Stack<T>`؟", ["Push", "Pop", "IsEmpty", "*ToString"], "`ToString` تمرّ على كل الخلايا، فنجاعتها `O(n)`. بقية العمليات تعمل مع الرأس فقط."),
            MC("ماذا يحدث عند استدعاء `Pop` على راصّة فارغة؟", ["تُعاد القيمة 0", "تُعاد null دائمًا", "*خطأ في التشغيل: العملية تشترط ألا تكون الراصّة فارغة", "لا يحدث شيء"], "في التنفيذ بسلسلة خلايا يكون `Head` مساويًا `null`، واستدعاء `Head.GetValue()` خطأ في التشغيل. لذلك نفحص `IsEmpty` أولًا."),
            proved(SHORT("معطاة `S = [5,1,4]`. ما القيمة التي تعيدها `Exists(S, 4)`؟ اكتب `true` أو `false`.", "true", "القيمة 4 موجودة في قاع الراصّة، والعملية تجدها بعد إخراج 5 و1 من النسخة."),
              { code: EXISTS, run: stackOf("S", "int", [5, 1, 4]) + "\nConsole.Write(Exists(S, 4) ? \"true\" : \"false\");", lib: COPY_STACK, out: "true" }),
            ORDER("نريد حذف القيمة التي في **قاع** الراصّة `s` مع الحفاظ على ترتيب الباقي. رتّب الخطوات:", ["ننشئ راصّة مساعدة `t`", "ننقل كل القيم من `s` إلى `t`", "نُخرج رأس `t` (وهو قاع `s` الأصلي) دون أن نعيده", "ننقل ما بقي في `t` إلى `s`"], "بعد النقل الأول يصير قاع `s` في رأس `t`، فنحذفه ثم نعيد الباقي: النقل مرّتين يحفظ الترتيب."),
            CLASSIFY("صنّف كل عملية: هل تغيّر محتوى الراصّة؟", ["تغيّر الراصّة", "لا تغيّر الراصّة"], [["Push", 0], ["Pop", 0], ["Top", 1], ["IsEmpty", 1], ["ToString", 1]], "`Push` تضيف و `Pop` تحذف. الثلاث الباقية تقرأ فقط."),
            MC("في ألغوريثم ديكسترا لحساب تعبير حسابي، متى يبدأ الحساب؟", ["عند قراءة قوس مفتوح", "*عند قراءة قوس مغلق", "عند قراءة عدد", "عند قراءة عملية حسابية"], "القوس المغلق يدلّ على انتهاء تعبير جزئي: نُخرج عملية وعددين (أو عددًا واحدًا لـ `sqrt`) ونُدخل النتيجة."),
          ],
        },
      ],
    },
  ],
};
