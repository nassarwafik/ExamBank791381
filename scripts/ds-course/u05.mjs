// Unit 5 — الدور Queue<T> (الكتاب: الفصل الخامس، ص 195–242؛ وورقة أسئلة الدور للمعلّم).
import {
  P, H, DEF, LIST, OL, TABLE, EX, CS, API, CLAR, XP, XH, XCS, XEX, XTIP, XNOTE, XLIST, XOL, XTABLE, XOUT, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, LAB, FIG, QH, SOLUTION, proved, provedCount, queueOf,
} from "./dsl.mjs";

/** The statements of a hidden driver, wrapped in a Main (for a proof whose whole program is the snippet). */
const inMain = body => "public static void Main()\n{\n" + body.replace(/^/gm, "    ") + "\n}";

// ── الكتاب: استعمال الفئة والأمثلة ────────────────────────────────────────────────────────────────────────────────────
const USE = `
public static void Main()
{
    Queue<int> Q = new Queue<int>();
    Q.Insert(1);
    Q.Insert(3);
    Q.Insert(4);
    Q.Insert(Q.Head()+5);
    Console.WriteLine(Q.Remove());
    Console.WriteLine(Q.ToString());
}`;
const TO_QUEUE = `
public static Queue<int> ToQueue(int[] A)
{
    Queue<int> Q = new Queue<int>();
    for (int i = 0; i < A.Length; i++)
        Q.Insert(A[i]);
    return Q;
}`;
const GET_SUM = `
public static int GetSumOfValues(Queue<int> Q)
{
    Queue<int> Temp = CopyQueue(Q);
    int Sum = 0;
    while (!Temp.IsEmpty())
    {
        Sum += Temp.Remove();
    }
    return Sum;
}`;
const EXISTS = `
public static bool Exists(Queue<int> Q, int Num)
{
    Queue<int> Temp = CopyQueue(Q);
    while (!Temp.IsEmpty())
    {
        if (Num == Temp.Remove())
            return true;
    }
    return false;
}`;
const REVERSE = `
public static void ReverseQueue(Queue<int> Q)
{
    Stack<int> S = new Stack<int>();
    while (!Q.IsEmpty())
        S.Push(Q.Remove());
    while (!S.IsEmpty())
        Q.Insert(S.Pop());
}`;
/** The book's RemoveMin; `cmp` is the test that keeps a document, `note` the comment printed after it. */
const REMOVE_MIN = (cmp, note = "") => `
public static Document RemoveMin(Queue<Document> Q)
{
    if (Q.IsEmpty()) return null;
    Queue<Document> QTemp = CopyQueue(Q);
    // **** Find the first document with minimal number of pages ****
    Document MinDoc = QTemp.Remove(), Doc;
    while (!QTemp.IsEmpty())
    {
        Doc = QTemp.Remove();
        if (MinDoc.GetNumPages() > Doc.GetNumPages())
            MinDoc = Doc;
    }
    // **** Remove MinDoc from the queue ****
    while (!Q.IsEmpty())
    {
        Doc = Q.Remove();
        if (${cmp})${note}
            QTemp.Insert(Doc);
    }
    // ****  copy QTemp documents back into the original Q ****
    while (!QTemp.IsEmpty())
        Q.Insert(QTemp.Remove());
    // **** Return the found document with minimal number of pages ****
    return MinDoc;
}`;
const BY_POINTER = " // **** لاحظ أنّنا هنا نُقارن مؤشّرات ****";
const COPY_QUEUE_DOC = `
public static Queue<Document> CopyQueue(Queue<Document> Q1)
{
    Queue<Document> Q2 = new Queue<Document>();
    while (!Q1.IsEmpty())
        Q2.Insert(Q1.Remove());
    Queue<Document> Q3 = new Queue<Document>();
    while (!Q2.IsEmpty())
    {
        Q1.Insert(Q2.Head());
        Q3.Insert(Q2.Remove());
    }
    return Q3;
}`;
// تمارين الكتاب: سؤال 6 وسؤال 8
const WHAT6 = `
public static Queue<char> What(Queue<char> Q)
{
    Queue<char> Q1 = new Queue<char>();
    Stack<char> S1 = new Stack<char>();
    Queue<char> Q2 = new Queue<char>();
    Queue<char> retQ = new Queue<char>();
    char x;
    while (!Q.IsEmpty())
    {
        x = Q.Remove();
        Q1.Insert(x);
        Q2.Insert(x);
        S1.Push(x);
    }
    while (!Q2.IsEmpty())
        Q.Insert(Q2.Remove());
    while (!Q1.IsEmpty())
    {
        retQ.Insert(Q1.Remove());
        retQ.Insert(S1.Pop());
    }
    return retQ;
}`;
const CHECK8_MAIN = `
static void Main(string[] args)
{
    Queue<int> Q = new Queue<int>();
    Q.Insert(1); Q.Insert(3); Q.Insert(5);
    Q.Insert(7); Q.Insert(7); Q.Insert(5);
    Q.Insert(3); Q.Insert(1);
    Console.WriteLine(Check(Q));
}
`;
const CHECK8 = `
public static bool Check(Queue<int> Q)
{
    if (Q.IsEmpty()) return false;
    int L = Size(Q);// تعيد حجم Q
    if (L % 2 != 0) return false;
    Stack<int> S = new Stack<int>();
    for(int i=1; i<=L/2; i++)
        S.Push(Q.Remove());
    while (!S.IsEmpty() && !Q.IsEmpty())
        if (S.Pop() != Q.Remove())
            return false;
    if (S.IsEmpty() && Q.IsEmpty())
        return true;
    else
        return false;
}`;

// ── ما كتبناه نحن (ص 198–199 ناقصتان من نسختنا): طول الدور ونسخه ───────────────────────────────────────────────────────
const GET_SIZE_EMPTYING = `
public static int GetSize(Queue<int> Q)
{
    int Size = 0;
    while (!Q.IsEmpty())
    {
        Size++;
        Q.Remove();
    }
    return Size;
}`;
const COPY_QUEUE = `
public static Queue<int> CopyQueue(Queue<int> Q1)
{
    Queue<int> Q2 = new Queue<int>();
    while (!Q1.IsEmpty())
        Q2.Insert(Q1.Remove());
    Queue<int> Q3 = new Queue<int>();
    while (!Q2.IsEmpty())
    {
        Q1.Insert(Q2.Head());
        Q3.Insert(Q2.Remove());
    }
    return Q3;
}`;
const GET_SIZE = `
public static int GetSize(Queue<int> Q)
{
    Queue<int> Temp = CopyQueue(Q);
    int Size = 0;
    while (!Temp.IsEmpty())
    {
        Size++;
        Temp.Remove();
    }
    return Size;
}`;
/** `Size` of the book's exercise 8 (its definition is on the missing pages): our GetSize under that name. */
const SIZE = GET_SIZE.replace("GetSize", "Size");
const MOVE = `
public static void Move(Queue<int> Q)
{
    Queue<int> T = new Queue<int>();
    while (!Q.IsEmpty())
        T.Insert(Q.Remove());
    while (!T.IsEmpty())
        Q.Insert(T.Remove());
}`;
// the book's class under another name, so that its inside can be traced (Queue<T> itself is the ready library class)
const MY_QUEUE = `
public class MyQueue<T>
{
    private Node<T> First, Last;
    public MyQueue()
    {
        this.First = null;
        this.Last = null;
    }
    public void Insert(T x)
    {
        Node<T> Temp = new Node<T>(x);
        if (First == null)
        {
            First = Temp;
            Last = First;
        }
        else
        {
            Last.SetNext(Temp);
            Last = Last.GetNext();
        }
    }
    public T Remove()
    {
        T x = this.First.GetValue();
        this.First = this.First.GetNext();
        return x;
    }
}`;
const DOCUMENT = `
public class Document
{
    private string FileName;
    private int NumPages;
    public Document(string FileName, int NumPages)
    {
        this.FileName = FileName;
        this.NumPages = NumPages;
    }
    public string GetFileName() { return FileName; }
    public int GetNumPages() { return NumPages; }
    public override string ToString()
    {
        return "FileName = " + FileName + "\\nNumPages = " + NumPages;
    }
}`;
/** The same class without ToString, for the trace: a document is then drawn as (name, pages). */
const DOCUMENT_PLAIN = DOCUMENT.replace(/\n {4}public override string ToString\(\)\n {4}\{\n.*\n {4}\}/, "");
const NAMES = `
public static string Names(Queue<Document> Q)
{
    Queue<Document> T = CopyQueue(Q);
    string s = "[";
    while (!T.IsEmpty())
    {
        s += T.Remove().GetFileName();
        if (!T.IsEmpty()) s += ",";
    }
    return s + "]";
}`;
const DOCS_RUN = `
Queue<Document> Q = new Queue<Document>();
Q.Insert(new Document("A", 7));
Q.Insert(new Document("B", 3));
Q.Insert(new Document("C", 9));
Q.Insert(new Document("D", 3));`;
const DOC_LIB = [DOCUMENT_PLAIN, COPY_QUEUE_DOC, NAMES];

// ── ورقة أسئلة الدور (للمعلّم): الأسئلة المختارة ──────────────────────────────────────────────────────────────────────
const Q1 = `
public static void Main(string[] args)
{
    Queue<char> q = new Queue<char>();
    q.Insert('a');
    q.Insert('b');
    q.Insert('c');
    q.Insert('d');
    q.Remove();
    q.Insert('e');
    Console.WriteLine(q);
}`;
const Q2 = `
static void Main(string[] args)
{
    Queue<int> q = new Queue<int>();
    for (int k = 1; k <= 10; k++)
    {
        if (k % 2 == 0)
            q.Insert(k * 10);
        else
            q.Insert((int)Math.Pow(k, 2));
    }
    Console.WriteLine(q);
}`;
const PINEAPPLE = `
public static int Pineapple(Queue<int> q)
{
    int x, sod = 0;
    Queue<int> temp = new Queue<int>();
    while (!q.IsEmpty())
    {
        x = q.Remove();
        temp.Insert(x);
        sod = sod + x;
    }
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
    return sod;
}`;
const GRAPES = `
public static void Grapes(Queue<string> q)
{
    int x;
    Queue<string> a = new Queue<string>();
    Queue<string> b = new Queue<string>();
    while (!q.IsEmpty())
    {
        x = q.Head().Length;
        if (x > 5)
            a.Insert(q.Remove());
        else
            b.Insert(q.Remove());
    }
    Console.WriteLine(b);
}`;
const PEACH = `
public static void Peach(Queue<int> q1)
{
    Queue<int> q2 = new Queue<int>();
    int x, y;
    while (!q1.IsEmpty())
    {
        x = q1.Remove();
        if (!q1.IsEmpty())
        {
            y = q1.Remove();
            q2.Insert(y);
        }
        else
            q2.Insert(x);
        q2.Insert(x);
    }
    Console.WriteLine("q2=" + q2);
}`;
const CHERRY = `
public static int Cherry(Queue<int> q, int num)
{
    int count = 0;
    Queue<int> temp = new Queue<int>();
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        if (x != num)
            temp.Insert(x);
        else
            count++;
    }
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
    return count;
}`;
const BANANA = `
public static void Banana(Queue<int> q)
{
    Queue<int> temp = new Queue<int>();
    int max = q.Head();
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        if (x > max)
            max = x;
        temp.Insert(x);
    }
    while (!temp.IsEmpty())
    {
        int x = temp.Remove();
        if (x != max)
            q.Insert(x);
    }
    q.Insert(max);
}`;
const WATERMELON = `
public static Queue<int> Watermelon(Queue<int> q1, Queue<int> q2)
{
    Queue<int> res = new Queue<int>();
    while (!q1.IsEmpty() && !q2.IsEmpty())
    {
        if (q1.Head() < q2.Head())
            res.Insert(q1.Remove());
        else
            res.Insert(q2.Remove());
    }
    while (!q1.IsEmpty())
        res.Insert(q1.Remove());
    while (!q2.IsEmpty())
        res.Insert(q2.Remove());
    return res;
}`;
const STRAWBERRY = `
public static int Strawberry(Queue<int> q, int k)
{
    int last = 0;
    while (!q.IsEmpty())
    {
        for (int i = 1; i < k; i++)
            q.Insert(q.Remove());
        last = q.Remove();
        Console.Write(last + " ");
    }
    return last;
}`;
const SUM_ODD = `
public static int SumOdd(Queue<int> q)
{
    int sum = 0;
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        if (x % 2 != 0)
            sum = sum + x;
    }
    return sum;
}`;
const IS_SORTED = `
public static bool IsSorted(Queue<int> q)
{
    Queue<int> temp = new Queue<int>();
    bool sorted = true;
    int prev = q.Head();
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        if (x < prev)
            sorted = false;
        prev = x;
        temp.Insert(x);
    }
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
    return sorted;
}`;
const IS_SORTED_EARLY = `
public static bool IsSorted(Queue<int> q)
{
    Queue<int> temp = new Queue<int>();
    int prev = q.Head();
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        if (x < prev)
            return false;
        prev = x;
        temp.Insert(x);
    }
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
    return true;
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
public static Queue<Student> Passed(Queue<Student> q)
{
    Queue<Student> temp = new Queue<Student>();
    Queue<Student> res = new Queue<Student>();
    while (!q.IsEmpty())
    {
        Student s = q.Remove();
        temp.Insert(s);
        if (s.GetGrade() >= 55)
            res.Insert(s);
    }
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
    return res;
}`;
const PASSED_RUN = `
Queue<Student> q = new Queue<Student>();
q.Insert(new Student("Rami", 72));
q.Insert(new Student("Sana", 40));
q.Insert(new Student("Adam", 91));
q.Insert(new Student("Lina", 55));
q.Insert(new Student("Omar", 30));
Queue<Student> res = Passed(q);
while (!res.IsEmpty())
    Console.WriteLine(res.Remove().GetName());`;

// ── حلولنا لتمارين الكتاب 13 (القسم 2)، 15، 19 ───────────────────────────────────────────────────────────────────────
const IS_SYMMETRIC = `
public static bool IsSymmetric(Queue<int> q)
{
    Queue<int> temp = new Queue<int>();
    Stack<int> s = new Stack<int>();
    while (!q.IsEmpty())
    {
        int x = q.Remove();
        temp.Insert(x);
        s.Push(x);
    }
    bool sym = true;
    while (!temp.IsEmpty())
    {
        int x = temp.Remove();
        if (x != s.Pop())
            sym = false;
        q.Insert(x);
    }
    return sym;
}`;
const CHECK_K = `
public static bool Check(Queue<int> Q, int k)
{
    Queue<int> Temp = CopyQueue(Q);
    while (!Temp.IsEmpty())
    {
        int First = Temp.Remove();
        int Sum = 0;
        for (int i = 1; i < k; i++)
            Sum += Temp.Remove();
        if (First != Sum)
            return false;
    }
    return true;
}`;
const IS_CIRCULAR = `
public static bool IsCircular(Queue<char> Q1, Queue<char> Q2)
{
    int n = Size(Q1);
    if (n != Size(Q2))
        return false;
    bool found = false;
    for (int i = 0; i < n; i++)
    {
        if (SameOrder(Q1, Q2, n))
            found = true;
        Q1.Insert(Q1.Remove());
    }
    return found;
}`;
const CIRCULAR_HELPERS = `
public static int Size(Queue<char> Q)
{
    Queue<char> Temp = new Queue<char>();
    int n = 0;
    while (!Q.IsEmpty())
    {
        Temp.Insert(Q.Remove());
        n++;
    }
    while (!Temp.IsEmpty())
        Q.Insert(Temp.Remove());
    return n;
}
public static bool SameOrder(Queue<char> Q1, Queue<char> Q2, int n)
{
    bool same = true;
    for (int i = 0; i < n; i++)
    {
        if (Q1.Head() != Q2.Head())
            same = false;
        Q1.Insert(Q1.Remove());
        Q2.Insert(Q2.Remove());
    }
    return same;
}`;

// ── أسئلة أضفناها لصفحات الأسئلة ─────────────────────────────────────────────────────────────────────────────────────
const HEAD_REMOVE = `
public static void Main(string[] args)
{
    Queue<int> q = new Queue<int>();
    q.Insert(4);
    q.Insert(9);
    q.Insert(q.Head() + q.Remove());
    q.Insert(q.Head() * 2);
    q.Remove();
    Console.WriteLine(q);
}`;
// سؤال 16 (القسم 1) وسؤال 25 من الكتاب: حلولنا
const GET_MAX = `
public static int GetMax(Queue<int> Q)
{
    Queue<int> Temp = CopyQueue(Q);
    int Max = Temp.Remove();
    while (!Temp.IsEmpty())
    {
        int x = Temp.Remove();
        if (x > Max)
            Max = x;
    }
    return Max;
}`;
const CHECK_FIRST = `
public static bool Check(Queue<int> Q)
{
    if (Q.IsEmpty())
        return false;
    Queue<int> Temp = CopyQueue(Q);
    int First = Temp.Remove();
    int Sum = 0;
    while (!Temp.IsEmpty())
        Sum += Temp.Remove();
    return First == Sum;
}`;
const INSERT_SORTED = `
public static void InsertSorted(Queue<int> q, int x)
{
    Queue<int> temp = new Queue<int>();
    while (!q.IsEmpty() && q.Head() < x)
        temp.Insert(q.Remove());
    temp.Insert(x);
    while (!q.IsEmpty())
        temp.Insert(q.Remove());
    while (!temp.IsEmpty())
        q.Insert(temp.Remove());
}`;

const yesNo = call => "Console.Write(" + call + " ? \"true\" : \"false\");";

export default {
  n: 5,
  title: "الدور (Queue)",
  short: "الدور",
  description: "مبدأ «أول من يدخل أول من يخرج»، واجهة فئة الدور واستعمالها، تمشيط الدور مع الحفاظ عليه، بناء الفئة بسلسلة خلايا لها مؤشّران، قلب الدور بمساعدة راصّة، دور من الكائنات، وأسئلة تتبّع وكتابة.",
  src: "195",
  lessons: [
    {
      title: "ما الدور؟",
      pages: [
        {
          title: "الدور ومبدأ FIFO",
          src: "196",
          keywords: ["دور", "قائمة انتظار", "Queue", "FIFO", "رأس الدور", "Insert", "Remove"],
          objective: "أن تعرف ما الدور، ومن أين يتم الإدخال ومن أين يتم الإخراج.",
          blocks: [
            H("قائمة الانتظار – الدور", 2),
            DEF("الدور", "**قائمة الانتظار** أو **الدور** مبنى معلومات يحفظ مجموعة من المعلومات المتجانسة، بحيث يكون **الإدخال إلى نهاية القائمة والإخراج من بدايتها**، وتسمّى بدايتها __رأس القائمة__. أي أنّ أول معلومة أُدخلت (`First In`) تكون الأولى التي تُخرج (`First Out`)."),
            P("هذا هو البروتوكول (أي مجموعة القواعد) المتعارف عليه بين الناس عندما يصطفّون في قائمة انتظار لتلقّي خدمة في البنك أو البريد: أول من يصل ويصطفّ في الدور يكون الأول الذي يتلقّى الخدمة، ومن يريد أن ينتظر يسأل عن الأخير ويصطفّ وراءه."),
            FIG("دور فيه 5 قيم", [{ kind: "queue", items: [2, 4, 6, 8, 10], label: "أُدخلت 2 ثم 4 ثم 6 ثم 8 ثم 10: الرأس 2 والنهاية 10" }]),
            LIST([
              "القيمة 2 هي الأولى التي أُدخلت، وبالتالي ستكون الأولى التي تُخرج بواسطة العملية `Remove`. تسمّى هذه الخلية خلية الرأس `Head` أو الخلية الأولى `First`.",
              "استدعاء العملية `Insert` يُدخل القيمة الجديدة بعد القيمة 10. الخلية الأخيرة تسمّى خلية الذيل `Tail` أو الخلية الأخيرة `Last`.",
            ], { title: "في رسم الكتاب" }),
            CLAR("اتجاه الرسم", "في رسومات الكتاب رأس الدور في **اليمين** والإدخال من اليسار. في هذه الوحدة نرسم الدور ونكتبه كما تطبعه العملية `ToString`: الرأس في **اليسار**، بالشكل `[head,…,tail]`. فالدور الذي في الرسم يُكتب `[2,4,6,8,10]`. المعنى لا يتغيّر: الإخراج من الرأس والإدخال إلى النهاية."),
            XP("يُختصر هذا المبدأ بالحروف `FIFO`: `First In First Out`. قارنه بالراصّة التي تعمل بمبدأ `LIFO`: هناك يدخل ويخرج كل شيء من الرأس، وهنا للدور **طرفان**: طرف للدخول وطرف للخروج."),
            XLIST([
              ["دور الطباعة", "المستندات تُطبع بالترتيب الذي أُرسلت به إلى الطابعة."],
              ["خدمة الزبائن", "الطلبات والمكالمات تُعالَج بحسب ترتيب وصولها."],
              ["الخادم والمهام", "الطلبات الواردة إلى الخادم تنتظر في دور حتى يأتي موعدها."],
              ["الألعاب", "تنظيم دور اللاعبين واحدًا بعد الآخر."],
            ], { title: "أين نحتاج الدور؟ كلما كان ترتيب الوصول هو ترتيب المعالجة" }),
            LAB("queue", { values: [2, 4, 6], name: "q", description: "أدخِل قيمًا وأخرِجها، وراقب: من أين تدخل القيمة، وأي قيمة تخرج أولًا؟" }),
            MC("أدخلنا إلى دور فارغ القيم 5 ثم 8 ثم 2 بهذا الترتيب. أي قيمة تخرج عند أول إخراج؟", ["*5", "8", "2", "لا يمكن أن نعرف"], "أول قيمة دخلت هي 5، فهي في رأس الدور وتخرج أولًا. في الراصّة كانت تخرج 2."),
            TF("في الدور يتمّ الإدخال والإخراج من الطرف نفسه.", false, "الإدخال إلى **نهاية** الدور والإخراج من **رأسه**. الطرف الواحد هو صفة الراصّة."),
          ],
        },
        {
          title: "واجهة الفئة `Queue<T>`",
          src: "196–197",
          keywords: ["Queue<T>", "Insert", "Remove", "Head", "IsEmpty", "ToString"],
          objective: "أن تعرف عمليات الدور الست وما تعيده كل واحدة.",
          blocks: [
            P("يوفّر هذا المبنى مجموعة من العمليات وهي:"),
            API("`Queue<T>`", [
              ["public Queue()", "عملية بنائية تبني قائمة انتظار فارغة."],
              ["public void Insert(T x)", "عملية تُدخل `x` إلى نهاية قائمة الانتظار."],
              ["public T Remove()", "عملية تُخرج القيمة التي في رأس قائمة الانتظار (تشترط ألا تكون القائمة فارغة)."],
              ["public T Head()", "تعيد القيمة الموجودة في الرأس بدون إخراجها (تشترط ألا تكون القائمة فارغة)."],
              ["public bool IsEmpty()", "تُعيد `true` إذا كانت القائمة فارغة. خلاف ذلك تعيد `false`."],
              ["public override string ToString()", "تُعيد قيم القائمة بالشكل `[x1,x2,...,xn]` بحيث أنّ `x1` هي القيمة التي في رأس القائمة."],
            ]),
            XNOTE("انتبه", "`Remove` و `Head` تشترطان ألا يكون الدور فارغًا. قبل استدعائهما نفحص: `if (!Q.IsEmpty())`."),
            CLAR("النجاعة", "الكتاب لا يكتب النجاعة في هذا الجدول. كما في الراصّة: نجاعة كل العمليات `O(1)` ما عدا `ToString` فنجاعتها `O(n)` لأنها تمرّ على كل القيم. سترى السبب حين نكتب الفئة."),
            P("دعونا الآن نتعرّف على كيفية استعمال هذه الفئة."),
            TABLE(["الأمر", "الدور بعد الأمر"], [
              ["Queue<int> Q = new Queue<int>();", "`[]`"],
              ["Q.Insert(1);", "`[1]`"],
              ["Q.Insert(3);", "`[1,3]`"],
              ["Q.Insert(4);", "`[1,3,4]`"],
              ["Q.Insert(Q.Head()+5);", "`[1,3,4,6]`"],
              ["Console.WriteLine(Q.Remove());", "`[3,4,6]` — الطباعة: 1"],
            ], { ltr: [0] }),
            TRACE({ title: "استعمال الفئة `Queue<int>` أمرًا أمرًا", code: USE, description: "أوامر جدول الكتاب (ص 197) داخل `Main`، وأضفنا في النهاية طباعة الدور. اضغط «الخطوة التالية» وراقب الدور والناتج." }),
            proved(MC("كيف يصير الدور `[1,3,4]` بعد الأمر `Q.Insert(Q.Head()+5);`؟", ["*`[1,3,4,6]`", "`[6,1,3,4]`", "`[1,3,4,9]`", "`[3,4,6]`"], "`Head` تعيد 1 دون أن تُخرجها، فالقيمة الجديدة `1+5 = 6`. و `Insert` تُدخل دائمًا إلى **نهاية** الدور."),
              { code: inMain(queueOf("Q", "int", [1, 3, 4]) + "\nQ.Insert(Q.Head()+5);\nConsole.Write(Q);"), out: "[1,3,4,6]" }),
            TF("العملية `Head` تُخرج القيمة التي في رأس الدور.", false, "`Head` تعيد القيمة التي في الرأس **بدون إخراجها**. التي تُخرج هي `Remove`."),
            MATCH("صِل كل عملية من عمليات الدور بالعملية التي تقابلها في الراصّة:", [["`Insert`", "`Push`: تُدخل قيمة"], ["`Remove`", "`Pop`: تُخرج قيمة وتعيدها"], ["`Head`", "`Top`: تعيد قيمة دون إخراجها"]], "العمليات متقابلة، والفرق في المكان: `Push` و `Pop` و `Top` كلها في رأس الراصّة، أمّا في الدور فالإدخال `Insert` إلى النهاية والإخراج `Remove` من الرأس."),
          ],
        },
      ],
    },
    {
      title: "عمليات على الدور",
      pages: [
        {
          title: "بناء دور، طوله ونسخه",
          src: "197",
          keywords: ["ToQueue", "GetSize", "CopyQueue", "طول الدور", "قالب التمشيط"],
          objective: "أن تبني دورًا من مصفوفة، وأن تمشّط دورًا دون أن تضيع قيمه.",
          blocks: [
            EX({ title: "مثال (1)", prompt: "اكتب عملية خارجية تتلقّى مصفوفة أحادية `A` من نمط صحيح. العملية تنشئ قائمة جديدة وتُدخل إليها قيم المصفوفة بحيث تكون القيمة `A[0]` في رأس القائمة وهكذا. على العملية أن تُعيد هذه القائمة.", steps: ["ننشئ دورًا فارغًا.", "نمرّ على المصفوفة من `A[0]` وندخل كل قيمة: أول قيمة تدخل تبقى في الرأس.", "نعيد الدور."] }),
            CS(TO_QUEUE),
            XP("قارن مع `ToStack` في وحدة الراصّة: الكود نفسه تقريبًا، لكن هناك صارت `A[0]` في **القاع**، وهنا تبقى `A[0]` في **الرأس**. الدور يحافظ على ترتيب الإدخال."),
            EX({ title: "مثال (2)", mode: "practice", prompt: "اكتب عملية خارجية تتلقّى قائمة انتظار من نمط صحيح. العملية تُعيد طول هذه القائمة، أي عدد القيم المُخزّنة في خلاياها." }),
            CLAR("ناقص في نسختنا", "حل هذا المثال مطبوع في الصفحتين 198–199 من الكتاب، وهما غير موجودتين في النسخة التي بين أيدينا. ما يلي حتى نهاية هذه الصفحة كتبناه نحن، على نمط حل السؤال نفسه للراصّة في الفصل الرابع، وعلى نمط العملية `CopyQueue` المطبوعة في ص 205 لدور من المستندات."),
            XP("**فكرة أولى:** طالما أنّ الدور ليس فارغًا نرفع العدّاد بواحد ونُخرج القيمة التي في الرأس."),
            XCS(GET_SIZE_EMPTYING),
            TRACE({
              title: "`GetSize` تُفرغ الدور", code: GET_SIZE_EMPTYING,
              run: "int[] A = { 2, 4, 6 };\nQueue<int> Q1 = ToQueue(A);\nConsole.WriteLine(GetSize(Q1));\nConsole.WriteLine(Q1.ToString());", lib: TO_QUEUE,
              given: "الدور `Q1 = [2,4,6]` (بُني من المصفوفة `{2, 4, 6}`)، والاستدعاء `GetSize(Q1)`.",
              description: "راقب الدور: ماذا يبقى فيه حين تنتهي العملية؟",
            }),
            XP("**المشكلة:** الطول صحيح، لكن الدور صار فارغًا. **الحل:** عملية مساعدة تتلقّى دورًا وتعيد نسخة عنه، فنعمل على النسخة ونترك الأصل."),
            XCS(COPY_QUEUE),
            TRACE({
              title: "`CopyQueue` خطوة بخطوة", code: COPY_QUEUE,
              run: queueOf("Q", "int", [2, 4, 6]) + "\nQueue<int> Copy = CopyQueue(Q);\nConsole.WriteLine(Q.ToString());\nConsole.WriteLine(Copy.ToString());",
              given: "الدور `Q = [2,4,6]`، والاستدعاء `Queue<int> Copy = CopyQueue(Q);`.",
              description: "راقب الأدوار الثلاثة: هل يتغيّر ترتيب القيم عند النقل؟",
            }),
            XTIP("الدور لا يقلب الترتيب", "نقل راصّة إلى راصّة يقلب ترتيبها. نقل دور إلى دور **يحافظ** على الترتيب: أول ما يخرج من `Q1` هو أول ما يدخل إلى `Q2`. فلماذا حلقتان؟ لأن الحلقة الأولى أفرغت `Q1`. الحلقة الثانية تعيد القيم إلى `Q1` وتبني النسخة `Q3` في الوقت نفسه."),
            XP("والآن نكتب `GetSize` من جديد: ننشئ نسخة عن الدور بمساعدة `CopyQueue` ونعمل مع النسخة."),
            XCS(GET_SIZE),
            XP("لو نفّذنا الآن الأوامر `Queue<int> Q1 = ToQueue(A);` ثم طبعنا `Q1` و `GetSize(Q1)` و `Q1` مرة أخرى للمصفوفة `{2, 4, 6, 8, 10}`، لكانت الطباعة:"),
            XOUT("[2,4,6,8,10]\n5\n[2,4,6,8,10]"),
            XH("قالب لتمشيط الدور", 3),
            XCS(`
              public static … MyFunction(Queue<int> Q)
              {
                  Queue<int> Temp = CopyQueue(Q);
                  …
                  while (!Temp.IsEmpty())
                  {
                      …
                      Temp.Remove(); // حتى نتقدّم في التمشيط يجب إخراج القيمة التي في الرأس
                  }
                  …
              }`),
            proved(MC("بالحل الأول (بدون نسخة): كيف يبدو الدور `Q1 = [2,4,6]` بعد استدعاء `GetSize(Q1)`؟", ["`[2,4,6]`", "`[6,4,2]`", "*الدور فارغ: `[]`", "`[3]`"], "كل قيمة أُخرجت بـ `Remove` ولم تُدخل إلى أي مكان. لذلك نحتاج إلى النسخة."),
              { code: GET_SIZE_EMPTYING, run: queueOf("Q1", "int", [2, 4, 6]) + "\nGetSize(Q1);\nConsole.Write(Q1);", out: "[]" }),
            ORDER("رتّب خطوات `CopyQueue` بالترتيب الصحيح:", ["ننشئ دورًا مساعدًا `Q2`", "ننقل كل قيم `Q1` إلى `Q2` (يصير `Q1` فارغًا)", "ننشئ الدور `Q3`", "ننقل كل قيمة من `Q2` إلى `Q1` وإلى `Q3` معًا", "نعيد `Q3`"], "النقل الأول يُفرغ `Q1`، والنقل الثاني يعيد إليه قيمه ويبني النسخة `Q3`. الترتيب محفوظ في الأدوار الثلاثة."),
          ],
        },
        {
          title: "مجموع القيم والبحث عن قيمة",
          src: "200",
          keywords: ["GetSumOfValues", "Exists", "CopyQueue"],
          blocks: [
            EX({ title: "مثال (3)", prompt: "اكتب عملية خارجية تتلقّى قائمة انتظار من نمط صحيح. العملية تُعيد مجموع قيم هذه القائمة، أي مجموع القيم المُخزّنة في خلاياها.", steps: ["ننسخ الدور بـ `CopyQueue` ونعمل على النسخة `Temp`.", "في كل دورة نُخرج الرأس ونضيفه إلى المجموع."] }),
            CS(GET_SUM),
            EX({ title: "مثال (4)", prompt: "اكتب عملية خارجية تتلقّى قائمة انتظار من نمط صحيح وعددًا صحيحًا `Num`. العملية تُعيد `true` إذا وجدت `Num` في القائمة. خلاف ذلك تُعيد العملية `false`.", steps: ["ننسخ الدور ونعمل على النسخة `Temp`.", "إذا ساوت القيمة المُخرَجة العدد `Num` نعيد `true` فورًا: النسخة هي التي تغيّرت، والأصل سليم.", "إذا انتهت الحلقة ولم نجد، نعيد `false`."] }),
            CS(EXISTS),
            CLAR("`CopyQueue`", "العمليتان تستدعيان `CopyQueue` لدور من نمط `int`. نسخة الكتاب منها في الصفحتين الناقصتين من نسختنا؛ نستعمل هنا التي كتبناها في الصفحة السابقة."),
            TRACE({
              title: "`Exists` تبحث عن 4", code: EXISTS, quiet: ["CopyQueue"],
              run: queueOf("Q", "int", [9, 4, 7]) + "\nConsole.WriteLine(Exists(Q, 4));\nConsole.WriteLine(Q.ToString());", lib: COPY_QUEUE,
              given: "الدور `Q = [9,4,7]`، والاستدعاء `Exists(Q, 4)`.",
              description: "العملية تعمل على النسخة `Temp`؛ راقب `Q`: هل يتغيّر؟",
            }),
            proved(SHORT("ما القيمة التي تعيدها `GetSumOfValues(Q)` للدور `Q = [2,4,6,8,10]`؟", "30", "`2 + 4 + 6 + 8 + 10 = 30`."),
              { code: GET_SUM, run: queueOf("Q", "int", [2, 4, 6, 8, 10]) + "\nConsole.Write(GetSumOfValues(Q));", lib: COPY_QUEUE, out: "30" }),
            provedCount(SHORT("في الاستدعاء `Exists(Q, 4)` للدور `Q = [9,4,7]`: كم مرة يُنفَّذ السطر `if (Num == Temp.Remove())`؟", "2", "في المرة الأولى تخرج 9 وهي لا تساوي 4. في المرة الثانية تخرج 4 فتُعاد `true` وتنتهي العملية؛ القيمة 7 لا تُفحص."),
              { code: EXISTS, run: queueOf("Q", "int", [9, 4, 7]) + "\nConsole.Write(Exists(Q, 4));", lib: COPY_QUEUE, quiet: ["CopyQueue"] }, "if (Num == Temp.Remove())", 2),
            MC("لماذا يجوز في `Exists` أن نكتب `return true;` داخل الحلقة دون أن نعيد القيم إلى الدور؟", ["لأن الدور يعيد قيمه تلقائيًا", "*لأن الحلقة تعمل على النسخة `Temp` وليس على الدور الأصلي", "لأن `Remove` لا تُخرج القيمة", "لا يجوز ذلك"], "العملية نسخت الدور أولًا بـ `CopyQueue`، فكل ما يُخرج يُخرج من النسخة. الدور الأصلي `Q` لا يتغيّر."),
          ],
        },
      ],
    },
    {
      title: "كيف تُكتب الفئة `Queue<T>`؟",
      pages: [
        {
          title: "الدور بسلسلة خلايا: `First` و `Last`",
          src: "200–202",
          keywords: ["Queue<T>", "Node<T>", "First", "Last", "تنفيذ الدور"],
          objective: "أن تفهم كيف يُبنى الدور من سلسلة خلايا لها مؤشّران: واحد للرأس وواحد للنهاية.",
          blocks: [
            P("والآن نأتي إلى كتابة الفئة `Queue<T>` بلغة `C#`. هنالك، كما هو الحال مع الراصّة، إمكانيتان لكتابة هذه الفئة:"),
            OL([
              ["بمساعدة مصفوفة أحادية", "من سيئات هذا الحل أنّ المصفوفة محدودة الحجم. وبالتالي على الفئة أن توفّر عملية تخبر مُستخدم الفئة ما إذا كانت القائمة ممتلئة أم لا — `public bool IsFull()`، ولا يجوز له استعمال العملية `Insert` إلا إذا كانت القائمة غير ممتلئة."],
              ["بمساعدة سلسلة خلايا مترابطة", "يُعتبر هذا الحل هو الأمثل لأنّ حجم القائمة يكون شبه غير محدود. نستعمل **مؤشّرين**: الأول `First` يؤشّر إلى رأس القائمة، والثاني `Last` يؤشّر إلى الخلية الأخيرة. الإدخال يكون بعد الخلية التي يؤشّر إليها `Last` — أي أنّ الخلية الجديدة تُصبح هي `Last`. الإخراج يكون بإخراج الرأس من السلسلة وإعادة القيمة المُخزّنة في خلية الرأس، وبعدها تُصبح الخلية التالية للرأس هي الرأس الجديد للقائمة."],
            ]),
            CS(`
              public class Queue<T>
              {
                  private Node<T> First, Last;

                  public Queue()
                  {
                      this.First = null;
                      this.Last = null;
                  }

                  public bool IsEmpty()
                  {
                      return this.First == null;
                  }

                  public T Head()
                  {
                      return this.First.GetValue();
                  }

                  public void Insert(T x)
                  {
                      Node<T> Temp = new Node<T>(x);
                      if (First == null)
                      {
                          First = Temp;
                          Last = First;
                      }
                      else
                      {
                          Last.SetNext(Temp);
                          Last = Last.GetNext();
                      }
                  }

                  public T Remove()
                  {
                      T x = this.First.GetValue();
                      this.First = this.First.GetNext();
                      return x;
                  }

                  public override string ToString()
                  {
                      string str = "[";
                      Node<T> Pos = First;
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
            LIST([
              ["`IsEmpty`", "الدور يكون فارغًا إذا كان المؤشّر إلى الخلية الأولى `null`."],
              ["`Insert`", "إذا كان الدور فارغًا، يُصبح العنصر الجديد الخلية الأولى. خلاف ذلك، نضيف العنصر الجديد وراء الخلية الأخيرة مباشرة."],
              ["`Remove`", "الإخراج يكون للخلية الأولى."],
            ], { title: "ملاحظات الكتاب بجانب الكود" }),
            FIG("الدور من الداخل: سلسلة خلايا ومؤشّران", [
              { kind: "chain", items: [1], pointers: [["First", 0], ["Last", 0]], label: "بعد `Insert(1)`: الخلية الأولى هي الأخيرة أيضًا" },
              { kind: "chain", items: [1, 3, 4], pointers: [["First", 0], ["Last", 2]], label: "بعد `Insert(3)` ثم `Insert(4)`" },
              { kind: "chain", items: [3, 4], pointers: [["First", 0], ["Last", 1]], label: "بعد `Remove()`: خرجت 1 وتقدّم `First`" },
              { kind: "chain", items: [3, 4, 6], pointers: [["First", 0], ["Last", 2]], hi: [2], label: "بعد `Insert(6)`: الخلية الجديدة صارت `Last`" },
            ]),
            XNOTE("لماذا مؤشّران؟", "في الراصّة كل شيء يحدث في الرأس، فكفى مؤشّر واحد. في الدور الإدخال في طرف والإخراج في الطرف الآخر. بفضل `Last` نصل إلى آخر خلية مباشرة، فتبقى نجاعة `Insert` هي `O(1)`. بدون `Last` كان علينا أن نمشّط السلسلة كلها في كل إدخال، أي `O(n)`."),
            XP("لنرَ المؤشّرين يتحرّكان. الفئة `Queue<T>` جاهزة ولا نرى ما بداخلها، لذلك نسخنا العمليتين `Insert` و `Remove` كما هما إلى فئة باسم `MyQueue<T>` وتتبّعناها:"),
            TRACE({
              title: "`Insert` و `Remove` من الداخل", code: MY_QUEUE,
              run: "MyQueue<int> Q = new MyQueue<int>();\nQ.Insert(1);\nQ.Insert(3);\nQ.Insert(4);\nConsole.WriteLine(Q.Remove());",
              given: "الأوامر: `Q.Insert(1);` ثم `Q.Insert(3);` ثم `Q.Insert(4);` ثم `Q.Remove();` على دور فارغ `Q`.",
              description: "راقب في قسم «الكائنات» إلى أي خلية يشير `First` وإلى أي خلية يشير `Last` بعد كل أمر.",
            }),
            XNOTE("لاحظ", "`Remove` لا تغيّر `Last`. إذا خرجت آخر قيمة يصير `First` مساويًا `null` ويبقى `Last` يشير إلى الخلية القديمة. هذا لا يضرّ: `IsEmpty` تفحص `First` فقط، و `Insert` إلى دور فارغ تضبط `First` و `Last` من جديد."),
            XP("جرّب بنفسك في مختبر السلسلة: اضغط على الخلية الأخيرة ليشير إليها `p` (هو يقوم هنا بدور `Last`) ثم «أدخِل بعد p»: هذا ما تفعله `Insert`. و«احذف الأولى» هو ما تفعله `Remove`."),
            LAB("chain", { values: [1, 3, 4], name: "First", title: "جرّب: `Insert` و `Remove` على السلسلة" }),
            MATCH("صِل كل عملية بما تفعله داخل الفئة:", [["`Insert(x)` إلى دور غير فارغ", "الخلية التي يشير إليها `Last` تشير إلى خلية جديدة، ثم يتقدّم `Last` إليها"], ["`Insert(x)` إلى دور فارغ", "`First` و `Last` يشيران كلاهما إلى الخلية الجديدة"], ["`Remove()`", "`First` ينتقل إلى الخلية التالية وتُعاد القيمة القديمة"], ["`IsEmpty()`", "فحص: هل `First` يساوي `null`؟"]], "الإخراج والفحص يعملان مع `First`، والإدخال يعمل مع `Last`. لا حلقة في أي منها، ولهذا نجاعتها `O(1)`."),
            MC("في دور فيه القيم `[3,4,6]`: إلى أي خليتين يشير `First` و `Last`؟", ["`First` إلى 6 و `Last` إلى 3", "*`First` إلى 3 و `Last` إلى 6", "كلاهما إلى 3", "كلاهما إلى 6"], "`First` يشير إلى الرأس (أول من دخل، 3) و `Last` إلى آخر خلية (آخر من دخل، 6)."),
          ],
        },
      ],
    },
    {
      title: "الدور والراصّة معًا",
      pages: [
        {
          title: "قلب الدور براصّة: `ReverseQueue`",
          src: "202",
          keywords: ["ReverseQueue", "قلب الدور", "راصّة مساعدة", "FIFO", "LIFO"],
          objective: "أن تستعمل راصّة مساعدة لقلب ترتيب قيم الدور، وأن تعرف لماذا لا يكفي دور مساعد.",
          blocks: [
            EX({ title: "مثال (5)", prompt: "اكتب عملية خارجية تتلقّى دورًا من نمط صحيح ثم تقوم بقلب قيمه. مثال: الدور `[1,2,3,4,5]` يُصبح بعد قلبه `[5,4,3,2,1]`.", steps: ["نستعين براصّة من أجل قلب ترتيب القيم.", "ننقل كل قيم الدور إلى الراصّة: رأس الدور يصير في قاع الراصّة.", "ننقل كل قيم الراصّة إلى الدور: رأس الراصّة (آخر قيمة في الدور الأصلي) يدخل أولًا."] }),
            FIG("قلب الدور", [
              { kind: "queue", items: [1, 2, 3, 4, 5], label: "قبل القلب: الرأس 1" },
              { kind: "queue", items: [5, 4, 3, 2, 1], label: "بعد القلب: الرأس 5" },
            ]),
            CS(REVERSE),
            TRACE({
              title: "`ReverseQueue` خطوة بخطوة", code: REVERSE,
              run: queueOf("Q", "int", [1, 2, 3]) + "\nReverseQueue(Q);\nConsole.WriteLine(Q.ToString());",
              given: "الدور `Q = [1,2,3]`، والاستدعاء `ReverseQueue(Q)`.",
              description: "التتبّع يرسم الدور والراصّة معًا: راقب أين تقف القيمة 1 في كل منهما.",
            }),
            XTABLE(["وجه المقارنة", "الراصّة", "الدور"], [
              ["المبدأ", "`LIFO`: آخر من يدخل أول من يخرج", "`FIFO`: أول من يدخل أول من يخرج"],
              ["الإدخال", "`Push` إلى الرأس", "`Insert` إلى النهاية"],
              ["الإخراج", "`Pop` من الرأس", "`Remove` من الرأس"],
              ["النظر دون إخراج", "`Top`", "`Head`"],
              ["نقل كل القيم إلى مبنى من النوع نفسه", "يقلب الترتيب", "يحافظ على الترتيب"],
              ["المؤشّرات داخل الفئة", "`Head` فقط", "`First` و `Last`"],
            ], { caption: "الراصّة والدور جنبًا إلى جنب" }),
            XTIP("متى أستعين بأي مبنى؟", "أريد أن **أقلب** ترتيب القيم: أستعين براصّة. أريد أن **أحافظ** على الترتيب (مثلًا لأعيد القيم إلى دور أفرغته): أستعين بدور."),
            proved(MC("كيف يصير الدور `[7,9,4]` بعد استدعاء `ReverseQueue`؟", ["`[7,9,4]`", "*`[4,9,7]`", "`[9,4,7]`", "الدور فارغ: `[]`"], "القيم تدخل الراصّة بالترتيب 7 ثم 9 ثم 4، فيكون رأس الراصّة 4. تخرج 4 أولًا وتدخل الدور أولًا، فتصير هي الرأس."),
              { code: REVERSE, run: queueOf("Q", "int", [7, 9, 4]) + "\nReverseQueue(Q);\nConsole.Write(Q);", out: "[4,9,7]" }),
            XP("طالب أراد قلب الدور فاستعمل **دورًا** مساعدًا بدل الراصّة:"),
            XCS(MOVE),
            proved(MC("كيف يصير الدور `[7,9,4]` بعد استدعاء `Move` التي كتبها الطالب؟", ["*`[7,9,4]`: لم يتغيّر شيء", "`[4,9,7]`", "`[9,4,7]`", "الدور فارغ: `[]`"], "الدور المساعد يحافظ على الترتيب: 7 تخرج أولًا من `Q` وتدخل أولًا إلى `T`، ثم تخرج أولًا من `T` وتعود أولًا إلى `Q`. القلب يحتاج إلى راصّة."),
              { code: MOVE, run: queueOf("Q", "int", [7, 9, 4]) + "\nMove(Q);\nConsole.Write(Q);", out: "[7,9,4]" }),
          ],
        },
        {
          title: "تتبّع من تمارين الكتاب: دور وراصّة",
          src: "212–214",
          keywords: ["تتبّع", "What", "Check", "تمارين الكتاب"],
          blocks: [
            EX({ mode: "practice", title: "سؤال 6 من الكتاب", prompt: "العملية التالية تأخذ كبارامتر دورًا وترجع دورًا. تتبّع بواسطة جدول متابعة عمل العملية `What` بالنسبة للدور `[e,d,c,b,a]` وحدّد محتوى الدور المُرجع من قبلها." }),
            CS(WHAT6),
            CLAR("في الكتاب", "الدور مرسوم في الكتاب بالشكل `a | b | c | d | e` ورأسه في اليمين، أي أنّ رأسه `e`؛ لذلك نكتبه `[e,d,c,b,a]`. ومطبوع في نصّ السؤال «كبارا متر» بفراغ في الوسط، والمقصود «كبارامتر»."),
            proved(MC("ما محتوى الدور الذي تُرجعه `What` للدور `[e,d,c,b,a]`؟", ["`[e,d,c,b,a,a,b,c,d,e]`", "*`[e,a,d,b,c,c,b,d,a,e]`", "`[e,e,d,d,c,c,b,b,a,a]`", "`[a,e,b,d,c,c,d,b,e,a]`"], "`Q1` يحفظ القيم بترتيبها (الرأس `e`)، والراصّة `S1` تحفظها مقلوبة (الرأس `a`). الحلقة الأخيرة تأخذ قيمة من `Q1` ثم قيمة من `S1` بالتناوب: `e` ثم `a`، `d` ثم `b`، وهكذا."),
              { code: WHAT6, run: queueOf("Q", "char", ["e", "d", "c", "b", "a"]) + "\nConsole.Write(What(Q));", out: "[e,a,d,b,c,c,b,d,a,e]" }),
            proved(MC("وكيف يبدو الدور `Q` نفسه بعد انتهاء العملية؟", ["الدور فارغ: `[]`", "`[a,b,c,d,e]`", "*`[e,d,c,b,a]`: كما كان", "`[e,a,d,b,c]`"], "الدور `Q2` أخذ نسخة من كل قيمة، والحلقة الثانية أعادت القيم منه إلى `Q`. والدور لا يقلب الترتيب، فعاد `Q` كما كان."),
              { code: WHAT6, run: queueOf("Q", "char", ["e", "d", "c", "b", "a"]) + "\nWhat(Q);\nConsole.Write(Q);", out: "[e,d,c,b,a]" }),
            TRACE({ title: "تتبّع سؤال 6", code: WHAT6, run: queueOf("Q", "char", ["e", "d", "c", "b", "a"]) + "\nQueue<char> R = What(Q);\nConsole.WriteLine(R);", given: "الدور `Q = [e,d,c,b,a]`، والاستدعاء `What(Q)`.", description: "ثلاثة أدوار وراصّة واحدة: أيها يحفظ الترتيب وأيها يقلبه؟" }),
            EX({ mode: "practice", title: "سؤال 8 من الكتاب", prompt: "1. تتبّع عمل المقطع التالي وحدّد المخرج ووضع القائمة `Q` في كل مرحلة. 2. ما هي مهمّة العملية `Check`؟" }),
            CS(CHECK8_MAIN + CHECK8),
            CLAR("في الكتاب", "بعد نهاية العملية `Check` مطبوع في الكتاب قوس إغلاق إضافي `}` (قوس الفئة التي تحوي العمليتين، وسطر فتحها غير مطبوع)؛ لم نكتبه هنا. والعملية `Size` «تعيد حجم `Q`» وتعريفها ليس في نسختنا: في التتبّع نستعمل مكانها `GetSize` التي كتبناها (بنسخة، فلا تغيّر الدور)."),
            proved(MC("ما الذي يطبعه المقطع؟", ["*`True`", "`False`", "`8`", "`[1,3,5,7]`"], "الطول 8 وهو زوجي. نصف القيم الأول يدخل الراصّة فيخرج منها مقلوبًا: 7 ثم 5 ثم 3 ثم 1، وهذا بالضبط ترتيب النصف الثاني في الدور. كل المقارنات تنجح ويفرغ المبنيان معًا."),
              { code: CHECK8_MAIN + CHECK8, lib: [SIZE, COPY_QUEUE], quiet: ["Size", "CopyQueue"], out: "True\n" }),
            GUIDED({
              title: "نحلّ معًا: وضع `Q` في كل مرحلة",
              prompt: "الدور `Q = [1,3,5,7,7,5,3,1]`. ماذا يحدث فيه وفي الراصّة `S` خلال `Check(Q)`؟",
              steps: [
                "الدور ليس فارغًا، وطوله `L = 8`، وهو زوجي: نكمل.",
                "حلقة `for` تدور `L/2 = 4` مرات وتنقل نصف الدور إلى الراصّة. بعدها `S = [7,5,3,1]` (الرأس 7) و `Q = [7,5,3,1]`.",
                "حلقة `while`: نُخرج 7 من الراصّة و7 من الدور: متساويتان. ثم 5 و5، ثم 3 و3، ثم 1 و1.",
                "الراصّة فارغة والدور فارغ معًا: تُعاد `true`.",
              ],
              result: "يُطبع `True`، والدور `Q` يبقى **فارغًا** بعد العملية.",
            }),
            MC("ما مهمّة العملية `Check`؟", ["تفحص إن كانت قيم الدور مرتّبة تصاعديًا", "*تفحص إن كان طول الدور زوجيًا ونصفه الثاني هو مقلوب نصفه الأول (دور تماثلي)", "تفحص إن كان مجموع النصف الأول يساوي مجموع النصف الثاني", "تفحص إن كانت كل قيمة تظهر مرّتين متتاليتين"], "الراصّة تقلب النصف الأول، ثم يُقارَن قيمةً قيمةً بالنصف الثاني. تذكّر: العملية لا تحافظ على الدور."),
            proved(TF("الاستدعاء `Check(Q)` للدور `Q = [1,2,1]` يعيد `true`.", false, "طول الدور 3 وهو فردي، والشرط `L % 2 != 0` يعيد `false` فورًا، مع أنّ الدور يُقرأ من الطرفين بالشكل نفسه."),
              { code: CHECK8, run: queueOf("Q", "int", [1, 2, 1]) + "\nConsole.Write(Check(Q));", lib: [SIZE, COPY_QUEUE], quiet: ["Size", "CopyQueue"], out: "False" }),
            TRACE({ title: "تتبّع سؤال 8", code: CHECK8_MAIN + CHECK8, lib: [SIZE, COPY_QUEUE], quiet: ["Size", "CopyQueue"], description: "راقب الدور والراصّة معًا في حلقة `for` ثم في حلقة `while`." }),
          ],
        },
      ],
    },
    {
      title: "دور من الكائنات",
      pages: [
        {
          title: "دور مستندات للطباعة: `RemoveMin`",
          src: "203–205",
          keywords: ["Document", "RemoveMin", "Queue<Document>", "CopyQueue", "مقارنة مؤشّرات"],
          objective: "أن تعمل مع دور قيمه كائنات، وأن تُخرج منه كائنًا من الوسط مع الحفاظ على ترتيب الباقي.",
          blocks: [
            EX({ title: "مثال (6)", mode: "practice", prompt: "عندما نستعمل طابعة موجودة في شبكة حواسيب محلّية، فإنّ المستندات التي نُرسلها لهذه الطابعة تُحفظ في قائمة انتظار — أي دور — من نوع مستندات للطباعة، بحيث تتمّ طباعتها وفق بروتوكول `FIFO`. أحيانًا يكون من المُفضّل طباعة الملفات الصغيرة قبل الملفات الكبيرة، لأنّ طباعتها لا تستغرق وقتًا طويلًا. حجم المستندات يُقاس بعدد صفحاتها. أمامك وصف جزئي لواجهة الفئة `Document` التي تُمثّل النوع مستندات للطباعة. اكتب عملية خارجية تتلقّى دورًا من نمط `Document` ثم تقوم بإخراج الملف الأول صاحب أصغر عدد من الصفحات." }),
            API("`Document`", [
              ["private string FileName;", "اسم الملف"],
              ["private int NumPages;", "عدد صفحات الملف"],
              ["public Document(string FileName, int NumPages)", "عملية بنائية تُنشئ مستندًا جديدًا باسم `FileName` وعدد صفحاته `NumPages`."],
              ["Get / Set", "—"],
              ["public override string ToString()", "تُعيد تفاصيل المُستند بالنسق: `FileName = ...` ثم في سطر جديد `NumPages = ...`"],
            ]),
            XOL([
              "ننسخ الدور، ونبحث في **النسخة** عن أول مستند له أصغر عدد من الصفحات: `MinDoc`.",
              "نُخرج كل المستندات من الدور الأصلي، وندخل إلى الدور المساعد كل مستند **ما عدا** `MinDoc`.",
              "نعيد المستندات من الدور المساعد إلى الدور الأصلي: الدور يحافظ على الترتيب.",
              "نعيد `MinDoc`.",
            ], { title: "خطة الحل (تعليقات الكتاب داخل الكود بالإنجليزية)" }),
            CS(REMOVE_MIN("MinDoc != Doc", BY_POINTER)),
            P("لاحظ أنّنا أعدنا كتابة العملية `CopyQueue`:"),
            CS(COPY_QUEUE_DOC),
            P("**كود لفحص العملية**"),
            CS(`
              public static void TestRemoveMin()
              {
                  Random R = new Random();
                  Queue<Document> Q = new Queue<Document>();
                  Document Doc;
                  for (int i = 1; i <= 5; i++)
                  {
                      Doc = new Document("File Nr" + i.ToString(), R.Next(1, 101));
                      Q.Insert(Doc);
                      System.Threading.Thread.Sleep(100);
                  }
                  Console.WriteLine(Q.ToString());
                  Console.WriteLine("Remove File with Minimal number of pages");
                  Doc = RemoveMin(Q);
                  Console.WriteLine(Doc);
                  Console.WriteLine(Q.ToString());
              }`),
            CLAR("للتتبّع", "كود الفحص في الكتاب يختار عدد الصفحات عشوائيًا (`Random`)، فلا يمكن تتبّعه مسبقًا. والكتاب يعطي واجهة الفئة `Document` فقط. لذلك كتبنا الفئة بأنفسنا، ونتتبّع `RemoveMin` على أربعة مستندات ثابتة."),
            XCS(DOCUMENT),
            TRACE({
              title: "تتبّع `RemoveMin`", code: REMOVE_MIN("MinDoc != Doc", BY_POINTER), lib: DOC_LIB, quiet: ["CopyQueue", "Names"], max: 120,
              run: DOCS_RUN + "\nDocument Doc = RemoveMin(Q);\nConsole.WriteLine(Doc.GetFileName());\nConsole.WriteLine(Names(Q));",
              given: "دور المستندات `Q` من الرأس: `(A, 7)` ثم `(B, 3)` ثم `(C, 9)` ثم `(D, 3)` (الاسم، عدد الصفحات)، والاستدعاء `RemoveMin(Q)`.",
              description: "للمستندين `B` و `D` العدد نفسه من الصفحات. أيهما يخرج؟ وهل يتغيّر ترتيب الباقي؟",
            }),
            proved(MC("أي مستند تعيده `RemoveMin` للدور `(A, 7)` ثم `(B, 3)` ثم `(C, 9)` ثم `(D, 3)`؟", ["`A`", "*`B`", "`C`", "`D`"], "أصغر عدد صفحات هو 3. الشرط `MinDoc.GetNumPages() > Doc.GetNumPages()` يبدّل `MinDoc` فقط إذا وجد عددًا **أصغر** تمامًا، فيبقى أول مستند له 3 صفحات: `B`."),
              { code: REMOVE_MIN("MinDoc != Doc"), lib: DOC_LIB, quiet: ["CopyQueue", "Names"], run: DOCS_RUN + "\nConsole.Write(RemoveMin(Q).GetFileName());", out: "B" }),
            proved(MC("أي مستندات تبقى في الدور بعد الاستدعاء، من الرأس إلى النهاية؟", ["`[A,C]`", "*`[A,C,D]`", "`[D,C,A]`", "`[C,D,A]`"], "خرج `B` فقط. المستند `D` له العدد نفسه من الصفحات لكنه **كائن آخر**، والمقارنة `MinDoc != Doc` تقارن المؤشّرات لا عدد الصفحات. والباقي عاد بترتيبه لأن الدور المساعد يحافظ على الترتيب."),
              { code: REMOVE_MIN("MinDoc != Doc"), lib: DOC_LIB, quiet: ["CopyQueue", "Names"], run: DOCS_RUN + "\nRemoveMin(Q);\nConsole.Write(Names(Q));", out: "[A,C,D]" }),
            proved(MC("طالب كتب الشرط `if (MinDoc.GetNumPages() != Doc.GetNumPages())` بدل `if (MinDoc != Doc)`. أي مستندات تبقى في الدور نفسه بعد الاستدعاء؟", ["`[A,C,D]`: لا فرق", "*`[A,C]`: خرج `B` و `D` معًا", "`[A,B,C]`", "الدور فارغ: `[]`"], "بمقارنة عدد الصفحات يُعتبر كل مستند له 3 صفحات «هو» `MinDoc`، فلا يعود `B` ولا `D` إلى الدور، مع أنّ العملية تعيد مستندًا واحدًا فقط. لهذا يقارن الكتاب المؤشّرات."),
              { code: REMOVE_MIN("MinDoc.GetNumPages() != Doc.GetNumPages()"), lib: DOC_LIB, quiet: ["CopyQueue", "Names"], run: DOCS_RUN + "\nRemoveMin(Q);\nConsole.Write(Names(Q));", out: "[A,C]" }),
          ],
        },
      ],
    },
    {
      title: "أسئلة وتمارين",
      pages: [
        {
          title: "أسئلة تتبّع محلولة",
          keywords: ["تتبّع", "دور", "أسئلة محلولة", "دمج"],
          blocks: [
            XP("خمسة أسئلة تتبّع مع حلولها، مرتّبة من الأسهل إلى الأصعب. اقرأ الكود وحاول أن تجيب **قبل** أن تقرأ الحل، ثم افتح التتبّع لترى الدور يتغيّر خطوة بخطوة. في كل الإجابات: القيمة الأولى من اليسار هي رأس الدور. الأسئلة من ورقة المعلّم، وهي توأم لأسئلة التتبّع في وحدة الراصّة: الكود نفسه تقريبًا، لكن النتيجة تختلف. قارن."),
            QH(1, "سهل", "إدخال وإخراج"),
            XCS(Q1),
            XP("**السؤال:** كيف سيبدو الدور `q` في نهاية مقطع البرنامج؟"),
            XEX({ title: "الحل", steps: [
              "أربعة إدخالات: `a` ثم `b` ثم `c` ثم `d`. الدور `[a,b,c,d]` ورأسه `a`.",
              "الأمر `q.Remove();` يُخرج الرأس `a` لأنه أول من دخل. يبقى `[b,c,d]`.",
              "الأمر `q.Insert('e');` يُدخل `e` إلى نهاية الدور، بعد `d`.",
            ], result: "يُطبع `[b,c,d,e]`. الكود نفسه مع راصّة أعطى `[e,c,b,a]`: هناك خرج آخر من دخل، وهنا خرج أول من دخل." }),
            TRACE({ title: "تتبّع حل سؤال 1", code: Q1 }),
            QH(2, "سهل", "حلقة تملأ دورًا"),
            XCS(Q2),
            XP("**السؤال:** كيف سيبدو الدور `q` في نهاية مقطع البرنامج؟"),
            XEX({ title: "الحل", steps: [
              "الحلقة تدور والمتغيّر `k` يأخذ القيم من 1 إلى 10.",
              "إذا كان `k` زوجيًا تُدخل القيمة `k * 10`، وإذا كان فرديًا يُدخل مربّعه.",
              "ترتيب الإدخال: 1، 20، 9، 40، 25، 60، 49، 80، 81، 100.",
              "في الدور أول ما أُدخل هو الرأس، فيبقى الترتيب كما هو بدون عكس.",
            ], result: "يُطبع `[1,20,9,40,25,60,49,80,81,100]`. في الراصّة كان الترتيب معكوسًا." }),
            TRACE({ title: "تتبّع حل سؤال 2", code: Q2 }),
            QH(3, "متوسط", "`Pineapple`: ماذا تعيد وماذا تنفّذ؟"),
            XCS(PINEAPPLE),
            FIG("الدور المعطى `q`", [{ kind: "queue", items: [11, 3, 5, 7, 2] }]),
            XP("**السؤال:** أ. ما القيمة التي تُعاد بعد استدعاء `Pineapple` مع الدور `q`؟ ب. ماذا تنفّذ العملية، وكيف يبدو الدور بعدها؟"),
            XEX({ title: "الحل", steps: [
              "الحلقة الأولى تُخرج القيم واحدة واحدة من `q`. كل قيمة تُدخل إلى `temp` وتُضاف إلى `sod`.",
              "حين يفرغ `q` يكون `sod` مجموع كل القيم: `11 + 3 + 5 + 7 + 2 = 28`.",
              "الحلقة الثانية تعيد القيم من `temp` إلى `q`. الدور يحافظ على ترتيب الإدخال، فيعود `q` كما كان: `[11,3,5,7,2]`.",
            ], result: "أ. تُعاد القيمة 28. ب. العملية تعيد مجموع قيم الدور ولا تغيّره. يكفي هنا دور مساعد واحد ونقل مرّتين، لأن الدور لا يقلب الترتيب." }),
            TRACE({ title: "تتبّع حل سؤال 3", code: PINEAPPLE, run: queueOf("q", "int", [11, 3, 5, 7, 2]) + "\nConsole.WriteLine(Pineapple(q));\nConsole.WriteLine(q);", given: "الدور `q = [11,3,5,7,2]`، والاستدعاء `Pineapple(q)`." }),
            QH(4, "متوسط", "`Cherry`: عدّ وحذف"),
            XCS(CHERRY),
            XP("**السؤال:** معطى الدور `q = [4,7,4,2,4,9]`، ونُفّذ الاستدعاء `int r = Cherry(q, 4);`. أ. ما القيمة التي ستُخزَّن في المتغيّر `r`؟ ب. كيف سيبدو الدور `q` بعد انتهاء الاستدعاء؟"),
            XEX({ title: "الحل", steps: [
              "كل قيمة تُخرج من `q` تُقارَن بالعدد `num`، وهو 4.",
              "القيمة التي لا تساوي 4 تُدخل إلى `temp`. القيمة التي تساوي 4 لا تُدخل إلى أي مكان، ويزيد `count` بواحد.",
              "العدد 4 يظهر ثلاث مرات، فيصير `count` مساويًا 3، ويصير `temp` مساويًا `[7,2,9]`.",
              "الحلقة الثانية تعيد القيم من `temp` إلى `q` بالترتيب نفسه.",
            ], result: "أ. `r = 3`. ب. الدور يصير `[7,2,9]`: حُذف كل ظهور للعدد 4، وترتيب الباقي لم يتغيّر." }),
            TRACE({ title: "تتبّع حل سؤال 4", code: CHERRY, run: queueOf("q", "int", [4, 7, 4, 2, 4, 9]) + "\nint r = Cherry(q, 4);\nConsole.WriteLine(r);\nConsole.WriteLine(q);", given: "الدور `q = [4,7,4,2,4,9]`، والاستدعاء `Cherry(q, 4)`." }),
            QH(5, "متقدّم", "`Watermelon`: دوران مرتّبان"),
            XCS(WATERMELON),
            FIG("الدوران المعطيان", [{ kind: "queue", items: [1, 4, 6], label: "`q1`" }, { kind: "queue", items: [2, 3, 7, 9], label: "`q2`" }]),
            XP("**السؤال:** الدوران `q1` و `q2` مرتّبان تصاعديًا من الرأس إلى النهاية. نُفّذ الاستدعاء `Queue<int> res = Watermelon(q1, q2);`. أ. كيف سيبدو الدور `res`؟ ب. كم مرة يُنفَّذ الأمر `res.Insert(q1.Remove());` خلال الاستدعاء؟"),
            XEX({ title: "الحل", steps: [
              "الحلقة الأولى تعمل ما دام الدوران كلاهما غير فارغين. في كل دورة نقارن الرأسين وننقل الأصغر إلى `res`.",
              "`1 < 2`: ننقل 1 من `q1`. بعدها رأس `q1` هو 4، وهو ليس أصغر من 2 ولا من 3: ننقل 2 ثم 3 من `q2`.",
              "`4 < 7`: ننقل 4 من `q1`. ثم `6 < 7`: ننقل 6 من `q1`. الآن `q1` فارغ، و `res` يساوي `[1,2,3,4,6]`.",
              "الحلقة الثانية لا تدور لأن `q1` فارغ. الحلقة الثالثة تنقل ما بقي في `q2` كما هو: 7 ثم 9.",
            ], result: "أ. `res = [1,2,3,4,6,7,9]`: دور واحد مرتّب فيه كل القيم، أي أنّ العملية تدمج دورين مرتّبين. ب. الأمر يُنفَّذ 3 مرات، كلها في الحلقة الأولى: عند نقل 1 ثم 4 ثم 6." }),
            TRACE({ title: "تتبّع حل سؤال 5", code: WATERMELON, run: queueOf("q1", "int", [1, 4, 6]) + "\n" + queueOf("q2", "int", [2, 3, 7, 9]) + "\nConsole.WriteLine(Watermelon(q1, q2));", given: "الدوران `q1 = [1,4,6]` و `q2 = [2,3,7,9]`، والاستدعاء `Watermelon(q1, q2)`.", description: "راقب الرأسين في كل مقارنة: أيهما ينتقل إلى `res`؟" }),
          ],
        },
        {
          title: "وظيفة: أسئلة تتبّع",
          keywords: ["وظيفة", "تتبّع", "دور", "حذف دائري"],
          blocks: [
            XP("خمسة أسئلة للبيت، مرتّبة من الأسهل إلى الأصعب. تتبّع الكود **بدون** حاسوب وأجب، ثم اضغط «الحل»: تفتح نافذة فيها الشرح وتتبّع البرنامج خطوة بخطوة. القيمة الأولى من اليسار هي رأس الدور."),
            QH(1, "سهل", "`Head` و `Remove` في أمر واحد"),
            XCS(HEAD_REMOVE),
            proved(MC("ماذا يطبع مقطع البرنامج؟", ["`[13,18]`", "*`[8,18]`", "`[9,8,18]`", "`[4,9,8,16]`"], "`Head` تعيد 4 دون إخراجها، ثم `Remove` تُخرج 4 نفسها، فيدخل `4 + 4 = 8`. بعدها الرأس 9 فيدخل 18، ثم تخرج 9."), { code: HEAD_REMOVE, out: "[8,18]\n" }),
            SOLUTION({ title: "حل سؤال 1 — `Head` و `Remove`", answer: "يُطبع `[8,18]`.", steps: [
              "بعد الإدخالين: `[4,9]`.",
              "في الأمر `q.Insert(q.Head() + q.Remove());` تُحسب `q.Head()` أولًا: تعيد 4 والدور لا يتغيّر. ثم `q.Remove()` تُخرج 4 نفسها. المجموع 8 يدخل إلى النهاية: `[9,8]`.",
              "الرأس الآن 9، فالأمر `q.Insert(q.Head() * 2);` يُدخل 18: `[9,8,18]`.",
              "الأمر `q.Remove();` يُخرج الرأس 9. يبقى `[8,18]`.",
            ], trace: { code: HEAD_REMOVE } }),
            QH(2, "متوسط", "`Grapes`: كلمات في دورين"),
            XCS(GRAPES),
            proved(MC("معطى الدور `q = [I,important,love,to,encyclopedia,sing]`. ماذا تطبع `Grapes(q)`؟", ["`[important,encyclopedia]`", "*`[I,love,to,sing]`", "`[sing,to,love,I]`", "`[I,important,love,to,encyclopedia,sing]`"], "`q.Head().Length` هو طول الكلمة التي في الرأس. الكلمات الأطول من 5 حروف تذهب إلى `a`، والباقي إلى `b` بترتيب وصولها. المطبوع هو `b`."),
              { code: GRAPES, run: queueOf("q", "string", ["I", "important", "love", "to", "encyclopedia", "sing"]) + "\nGrapes(q);", out: "[I,love,to,sing]\n" }),
            CLASSIFY("لدور `q` آخر لا نعرفه: بعد استدعاء `Grapes`، أي من الأدوار التالية يمكن أن يكون الدور `b`؟", ["يمكن أن يكون `b`", "لا يمكن أن يكون `b`"], [["`[important,read,an,encyclopedia]`", 1], ["`[I,love,to,sing]`", 0], ["`[play,the,accordion]`", 1], ["`[Those,who,study,hard,excel]`", 0]], "الدور `b` يستقبل فقط الكلمات التي طولها 5 أو أقل، لأن الشرط `x > 5` يرسل الطول 5 إلى `b`. في الدور الأول `important` و `encyclopedia`، وفي الثالث `accordion`، فلا يمكن أن يكون أيٌّ منهما. الكلمات `Those` و `study` و `excel` طولها 5 بالضبط، فهي مقبولة."),
            SOLUTION({ title: "حل سؤال 2 — `Grapes`", answer: "للدور المعطى يُطبع `[I,love,to,sing]`. والدور `b` لا يحوي أبدًا كلمة أطول من 5 حروف.", steps: [
              "`q.Head().Length` هو طول الكلمة التي في رأس الدور. `Head` لا تُخرج الكلمة؛ التي تُخرجها هي `Remove` في السطر التالي.",
              "إذا كان الطول أكبر من 5 تنتقل الكلمة إلى `a`، وإلا تنتقل إلى `b`. الطول 5 بالضبط يذهب إلى `b`.",
              "`important` و `encyclopedia` أطول من 5 حروف فتذهبان إلى `a`. الباقي يدخل `b` بترتيب وصوله: `I` ثم `love` ثم `to` ثم `sing`.",
              "المطبوع هو `b`. والدور `q` نفسه يبقى فارغًا بعد الاستدعاء.",
            ], trace: { code: GRAPES, run: queueOf("q", "string", ["I", "important", "love", "to", "encyclopedia", "sing"]) + "\nGrapes(q);", given: "الدور `q = [I,important,love,to,encyclopedia,sing]`، والاستدعاء `Grapes(q)`." } }),
            QH(3, "متوسط", "`Peach`: أزواج"),
            XCS(PEACH),
            proved(MC("معطى الدور `q1 = [8,2,1,7,3,5]`. كيف سيبدو الدور `q2` في نهاية استدعاء `Peach(q1)`؟", ["`[3,5,1,7,8,2]`", "*`[2,8,7,1,5,3]`", "`[1,2,3,5,7,8]`", "`[5,3,7,1,2,8]`"], "في كل دورة تُخرج قيمتان: الأولى `x` والثانية `y`، فيُدخل `y` ثم `x`. الأزواج (8، 2) ثم (1، 7) ثم (3، 5) تُدخل بالترتيب: 2، 8، 7، 1، 5، 3. أول ما أُدخل هو الرأس، فيكون الرأس 2."),
              { code: PEACH, run: queueOf("q1", "int", [8, 2, 1, 7, 3, 5]) + "\nPeach(q1);", out: "q2=[2,8,7,1,5,3]\n" }),
            SOLUTION({ title: "حل سؤال 3 — `Peach`", answer: "يُطبع `q2=[2,8,7,1,5,3]`.", steps: [
              "في كل دورة تُخرج قيمتان من `q1`: الأولى `x` والثانية `y`.",
              "تُدخل `y` أولًا ثم `x`: كل زوج يدخل `q2` بترتيب مقلوب.",
              "الأزواج هي (8، 2) ثم (1، 7) ثم (3، 5)، فترتيب الإدخال: 2، 8، 7، 1، 5، 3.",
              "الفرع `else` يعمل فقط إذا كان عدد القيم فرديًا: عندها تدخل القيمة الأخيرة مرّتين. هنا العدد زوجي فلا يعمل.",
            ], trace: { code: PEACH, run: queueOf("q1", "int", [8, 2, 1, 7, 3, 5]) + "\nPeach(q1);", given: "الدور `q1 = [8,2,1,7,3,5]`، والاستدعاء `Peach(q1)`." } }),
            QH(4, "متوسط", "`Banana`: أكبر قيمة"),
            XCS(BANANA),
            proved(MC("معطى الدور `q = [6,9,3,9,1]`. كيف سيبدو بعد انتهاء استدعاء `Banana(q)`؟", ["`[9,6,9,3,1]`", "*`[6,3,1,9]`", "`[9,6,3,1]`", "`[1,3,6,9]`"], "أكبر قيمة هي 9. في الحلقة الثانية كل قيمة تساوي 9 لا تعود إلى الدور، ثم تُدخل 9 مرة واحدة فقط. الإدخال في الدور يكون دائمًا إلى النهاية، لذلك تصبح 9 آخر قيمة وليست الرأس."),
              { code: BANANA, run: queueOf("q", "int", [6, 9, 3, 9, 1]) + "\nBanana(q);\nConsole.Write(q);", out: "[6,3,1,9]" }),
            MC("ماذا تنفّذ العملية `Banana`؟", ["ترتّب قيم الدور تصاعديًا بحيث يكون الأصغر في الرأس", "تنقل أكبر قيمة إلى رأس الدور وتحذف تكراراتها الأخرى", "تنقل أكبر قيمة إلى نهاية الدور دون تغيير عدد القيم", "*تنقل أكبر قيمة إلى نهاية الدور وتحذف تكراراتها الأخرى"], "ترتيب باقي القيم لا يتغيّر لأنها نُقلت إلى `temp` وعادت. التغيير الوحيد: كل نسخ أكبر قيمة أُزيلت، وأُضيفت نسخة واحدة في نهاية الدور. إن ظهرت أكبر قيمة أكثر من مرة يقلّ عدد القيم."),
            SOLUTION({ title: "حل سؤال 4 — `Banana`", answer: "الدور يصير `[6,3,1,9]`: أكبر قيمة انتقلت إلى نهاية الدور وحُذفت تكراراتها.", steps: [
              "`max` يبدأ برأس الدور، وهو 6. الحلقة الأولى تنقل كل القيم إلى `temp` وتحدّث `max` كلما وجدت قيمة أكبر: يصير 9.",
              "الحلقة الثانية تعيد القيم إلى `q` **ما عدا** كل قيمة تساوي `max`: تعود 6 ثم 3 ثم 1.",
              "في النهاية الأمر `q.Insert(max);` يُدخل 9 مرة واحدة، إلى نهاية الدور.",
              "كانت 9 تظهر مرّتين، فنقص عدد القيم من 5 إلى 4.",
            ], trace: { code: BANANA, run: queueOf("q", "int", [6, 9, 3, 9, 1]) + "\nBanana(q);\nConsole.WriteLine(q);", given: "الدور `q = [6,9,3,9,1]`، والاستدعاء `Banana(q)`." } }),
            QH(5, "متقدّم", "`Strawberry`: دور يدور"),
            XCS(STRAWBERRY),
            XP("معطى الدور `q = [1,2,3,4,5,6]`، ونُفّذ الاستدعاء `int r = Strawberry(q, 3);`."),
            proved(MC("ماذا سيُطبع على الشاشة بعد تنفيذ الاستدعاء؟", ["*`3 6 4 2 5 1`", "`3 6 2 5 1 4`", "`1 2 3 4 5 6`", "`3 6 1 4 2 5`"], "قبل كل إخراج تنتقل قيمتان من الرأس إلى النهاية، ثم تخرج القيمة الثالثة. الدور يدور كأنه دائرة: بعد خروج 3 يصبح الدور `[4,5,6,1,2]` فتخرج 6، ثم `[1,2,4,5]` فتخرج 4، وهكذا."),
              { code: STRAWBERRY, run: queueOf("q", "int", [1, 2, 3, 4, 5, 6]) + "\nint r = Strawberry(q, 3);", out: "3 6 4 2 5 1 " }),
            proved(MC("ما القيمة التي ستُخزَّن في المتغيّر `r`؟", ["*1", "5", "6", "3"], "العملية تُرجع `last`، وهي آخر قيمة خرجت من الدور. ترتيب الخروج `3 6 4 2 5 1`، فآخر قيمة هي 1."),
              { code: STRAWBERRY, run: queueOf("q", "int", [1, 2, 3, 4, 5, 6]) + "\nint r = Strawberry(q, 3);\nConsole.Write(\"r=\" + r);", out: "3 6 4 2 5 1 r=1", loose: true }),
            MC("ماذا تنفّذ العملية `Strawberry`؟", ["تطبع قيم الدور بترتيب معكوس", "*تُخرج من الدور كل قيمة رقمها `k` بشكل دائري، وتُرجع آخر قيمة تبقى", "تُخرج من الدور كل `k` قيم متتالية دفعة واحدة", "تُرجع القيمة الموجودة في الموقع `k` من الدور"], "الحلقة الداخلية تنقل `k - 1` قيم من الرأس إلى النهاية، فيصبح الرأس هو القيمة رقم `k` في العدّ الدائري، وهي التي تخرج. هذه هي المسألة المعروفة بالحذف الدائري (مسألة يوسيفوس)."),
            SOLUTION({ title: "حل سؤال 5 — `Strawberry`", answer: "يُطبع `3 6 4 2 5 1`، و `r = 1`.", steps: [
              "الأمر `q.Insert(q.Remove());` ينقل الرأس إلى النهاية: الدور «يدور» خطوة واحدة ولا تضيع أي قيمة.",
              "الحلقة الداخلية تنفّذه `k - 1` مرات، أي مرّتين. بعدها `last = q.Remove();` يُخرج القيمة الثالثة ويطبعها.",
              "الدورة الأولى: `[1,2,3,4,5,6]` يدور خطوتين فيصير `[3,4,5,6,1,2]`، وتخرج 3. يبقى `[4,5,6,1,2]`.",
              "الدورة الثانية: يدور فيصير `[6,1,2,4,5]`، وتخرج 6. الثالثة: `[4,5,1,2]` وتخرج 4. الرابعة: `[2,5,1]` وتخرج 2.",
              "بقي `[5,1]`: خطوتان تعيدانه كما هو، فتخرج 5. ثم تخرج 1 وهي آخر قيمة، فتُعاد.",
            ], note: "هذه هي المسألة المعروفة بالحذف الدائري (مسألة يوسيفوس): أشخاص في دائرة، وفي كل مرة يخرج الشخص رقم k.",
            trace: { code: STRAWBERRY, run: queueOf("q", "int", [1, 2, 3, 4, 5, 6]) + "\nint r = Strawberry(q, 3);\nConsole.Write(\"r=\" + r);", given: "الدور `q = [1,2,3,4,5,6]`، والاستدعاء `Strawberry(q, 3)`." } }),
            XTIP("تدوير الدور", "الأمر `q.Insert(q.Remove());` ينقل الرأس إلى النهاية. إذا نفّذته عددًا من المرات يساوي طول الدور عاد الدور كما كان. هذه حيلة خاصة بالدور، ولا مثيل لها في الراصّة."),
          ],
        },
        {
          title: "أسئلة كتابة محلولة",
          keywords: ["كتابة عملية", "أسئلة محلولة", "SumOdd", "GetMax", "IsSorted", "Passed", "IsSymmetric"],
          blocks: [
            XP("خمسة أسئلة كتابة مع حلولها، مرتّبة من الأسهل إلى الأصعب. اقرأ «المطلوب» واكتب العملية في دفترك أو في محرّر الكود **قبل** أن تقرأ الحل. بعد كل حل: ما يُفحص فيه، وفكرته، وتتبّعه. في الأمثلة: القيمة الأولى من اليسار هي رأس الدور."),
            QH(1, "سهل", "`SumOdd`: مجموع الأعداد الفردية"),
            XEX({ mode: "practice", title: "المطلوب (من ورقة المعلّم)", prompt: "اكتب العملية `SumOdd` التي تستقبل دورًا من الأعداد الصحيحة `q`، وتُرجع مجموع الأعداد الفردية الموجودة فيه. لا حاجة للحفاظ على الدور: مسموح أن يبقى الدور فارغًا بعد الاستدعاء. مثال: للدور `[7,4,9,2,5,8]` تُرجع العملية 21، لأن `7 + 9 + 5 = 21`.", steps: [] }),
            XCS(SUM_ODD),
            XLIST([
              "توقيع العملية صحيح: تستقبل `Queue<int>` وتُرجع `int`.",
              "متغيّر المجموع يبدأ من صفر قبل الحلقة.",
              "الحلقة `while (!q.IsEmpty())` تُخرج قيمة واحدة في كل دورة بواسطة `Remove()`.",
              "فحص العدد الفردي بالشرط `x % 2 != 0`، وليس `x % 2 == 1` الذي يخطئ مع الأعداد السالبة.",
              "إرجاع المجموع بعد انتهاء الحلقة وليس داخلها.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("بما أنّ الحفاظ على الدور غير مطلوب، يكفي أن نُخرج القيم واحدة تلو الأخرى ونجمع الفردية منها، بدون دور مساعد. انتبه: بعد الاستدعاء يصير الدور **فارغًا**، لأن كل قيمة أُخرجت ولم تُدخل إلى أي مكان. لو طُلب الحفاظ على الدور لاحتجنا إلى دور مساعد."),
            TRACE({ title: "تتبّع `SumOdd`", code: SUM_ODD, run: queueOf("q", "int", [7, 4, 9, 2, 5, 8]) + "\nConsole.WriteLine(SumOdd(q));\nConsole.WriteLine(q);", given: "الدور `q = [7,4,9,2,5,8]`، والاستدعاء `SumOdd(q)`." }),
            QH(2, "سهل", "`GetMax`: أكبر عدد في الدور"),
            XEX({ mode: "practice", title: "سؤال 16 (القسم 1) من الكتاب (ص 223)", prompt: "اكتب عملية تتلقّى دورًا (`Queue<int>`) فيه أعداد صحيحة. تعيد العملية العدد الأكبر داخل الدور.", steps: [] }),
            XP("الكتاب لا يعطي اسمًا للعملية؛ سمّيناها `GetMax`. نفترض أنّ الدور غير فارغ، ونحافظ عليه."),
            XCS(GET_MAX),
            XLIST([
              "العمل على نسخة من الدور بواسطة `CopyQueue`، فلا يتغيّر الدور الأصلي.",
              "`Max` يبدأ بأول قيمة في الدور، وليس بالعدد صفر: قد تكون كل القيم سالبة.",
              "كل قيمة تُخرج من النسخة تُقارَن بـ `Max`.",
              "إرجاع `Max` بعد انتهاء الحلقة.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("هذا هو قالب تمشيط الدور: ننسخ، ثم نُخرج من النسخة قيمة قيمة. الدور لا يسمح بالنظر إلى ما في وسطه، فالطريقة الوحيدة لرؤية كل القيم هي إخراجها."),
            TRACE({ title: "تتبّع `GetMax`", code: GET_MAX, lib: COPY_QUEUE, quiet: ["CopyQueue"], run: queueOf("Q", "int", [12, 6, 37, 2, 23]) + "\nConsole.WriteLine(GetMax(Q));\nConsole.WriteLine(Q);", given: "الدور `Q = [12,6,37,2,23]`، والاستدعاء `GetMax(Q)`." }),
            QH(3, "متوسط", "`IsSorted`: هل الدور مرتّب؟"),
            XEX({ mode: "practice", title: "المطلوب (من ورقة المعلّم)", prompt: "اكتب العملية `IsSorted` التي تستقبل دورًا غير فارغ من الأعداد الصحيحة `q`، وتُرجع `true` إذا كانت قيمه مرتّبة تصاعديًا من الرأس إلى النهاية (كل قيمة أصغر من القيمة التي بعدها أو تساويها)، وإلا تُرجع `false`. يجب الحفاظ على الدور: في نهاية العملية يعود `q` كما كان تمامًا، بنفس القيم ونفس الترتيب. أمثلة: `[2,5,5,8,11]` ← `true`، و `[2,5,3,8]` ← `false`.", steps: [] }),
            XCS(IS_SORTED),
            XLIST([
              "دور مساعد `temp` يُنشأ داخل العملية.",
              "المتغيّر `prev` يبدأ بالقيمة التي في رأس الدور بواسطة `Head()` قبل الحلقة.",
              "كل قيمة تُخرج من `q` تُدخل إلى `temp`، فلا تضيع أي قيمة.",
              "المقارنة بين `x` والقيمة السابقة `prev`، ثم تحديث `prev` في كل دورة.",
              "لا يوجد `return` قبل إعادة كل القيم إلى `q`.",
              "حلقة ثانية تعيد القيم من `temp` إلى `q`.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("في الدور لا نستطيع رؤية القيمة التالية بعد الإخراج، لذلك نحفظ القيمة السابقة في `prev`. نتيجة الفحص تُحفظ في متغيّر منطقي، وتُرجع فقط **بعد** إعادة القيم إلى `q`."),
            TRACE({ title: "تتبّع `IsSorted` على دور غير مرتّب", code: IS_SORTED, run: queueOf("q", "int", [2, 5, 3, 8]) + "\nConsole.WriteLine(IsSorted(q));\nConsole.WriteLine(q);", given: "الدور `q = [2,5,3,8]`، والاستدعاء `IsSorted(q)`." }),
            XP("**خطأ شائع:** طالب كتب الحلقة الأولى بالشكل التالي، فخرج من العملية فورًا عند اكتشاف أول خلل في الترتيب:"),
            XCS("while (!q.IsEmpty())\n{\n    int x = q.Remove();\n    if (x < prev)\n        return false;\n    prev = x;\n    temp.Insert(x);\n}"),
            XP("الجواب `false` صحيح، لكن الدور ضاع. للدور `[2,5,3,8]`: تُخرج 2 ثم 5 وتُدخلان إلى `temp`، ثم تُخرج 3 وعند المقارنة `3 < 5` تنتهي العملية. القيمتان 2 و5 بقيتا في `temp` والقيمة 3 لم تُدخل أصلًا، فيبقى في `q` القيمة 8 فقط. الإرجاع مسموح فقط بعد إعادة كل القيم."),
            QH(4, "متوسط", "`Passed`: دور كائنات"),
            XEX({ mode: "practice", title: "المطلوب (من ورقة المعلّم)", prompt: "معطاة الفئة `Student`. اكتب العملية `Passed` التي تستقبل دور طلاب `q` من نوع `Queue<Student>`، وتُرجع دورًا جديدًا فيه الطلاب الذين علامتهم 55 أو أكثر، بنفس ترتيبهم في الدور الأصلي. يجب الحفاظ على الدور الأصلي `q` بدون تغيير.", steps: [] }),
            XCS(STUDENT),
            XCS(PASSED),
            XLIST([
              "توقيع العملية صحيح: تستقبل `Queue<Student>` وتُرجع `Queue<Student>`.",
              "الوصول إلى العلامة بواسطة `GetGrade()`، وليس مباشرة إلى الصفة الخاصة `grade`.",
              "كل طالب يُخرج من `q` يُدخل إلى `temp`، ثم يعود إلى `q` في حلقة ثانية.",
              "الشرط `>= 55` يشمل الطالب الذي علامته 55 بالضبط.",
              "إرجاع الدور `res` في نهاية العملية.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("الدور يحافظ على ترتيب الإدخال، لذلك الإدخال إلى `res` في المرور الأول يعطي نفس الترتيب الأصلي، بعكس الراصّة التي كانت تعكس الترتيب. الدور المساعد `temp` مطلوب فقط لإعادة `q` كما كان. في المثال الذي في التتبّع يعود ثلاثة طلاب: `Rami` ثم `Adam` ثم `Lina`، و `Lina` بينهم لأن علامتها 55 بالضبط."),
            TRACE({ title: "تتبّع `Passed`", code: PASSED, lib: STUDENT, run: PASSED_RUN, max: 120, given: "الدور `q` من الرأس: `(Rami, 72)` ثم `(Sana, 40)` ثم `(Adam, 91)` ثم `(Lina, 55)` ثم `(Omar, 30)`، والاستدعاء `Passed(q)`." }),
            QH(5, "متقدّم", "`IsSymmetric`: دور تماثلي"),
            XEX({ mode: "practice", title: "سؤال 13 (القسم 2) من الكتاب (ص 220)", prompt: "اكتبوا عملية تتلقّى كبارامتر دورًا من نمط صحيح وتعيد `true` إذا كان تماثليًا (`Symmetric`) وإلا فتعيد `false`. مثال: الدور `[5,6,4,1,4,6,5]` تماثلي. رأس العملية المطلوبة: `public static bool IsSymmetric(Queue<int> q)`.", steps: [] }),
            XP("الكتاب لا يعطي حلولًا لتمارينه؛ هذا الحل كتبناه نحن، وهو يحافظ على الدور."),
            XCS(IS_SYMMETRIC),
            XLIST([
              "دور مساعد وراصّة، وكل قيمة تدخل إلى الاثنين.",
              "المقارنة بين ما يخرج من الدور المساعد وما يخرج من الراصّة.",
              "النتيجة في متغيّر منطقي، ولا `return` قبل أن تعود كل القيم إلى `q`.",
              "العملية تعمل لطول فردي ولطول زوجي.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("ننقل القيم إلى دور مساعد (يحفظ الترتيب) وإلى راصّة (تقلبه) في الوقت نفسه. ثم نقارن: ما يخرج من الدور هو القيم من البداية، وما يخرج من الراصّة هو القيم من النهاية. الدور تماثلي إذا تطابقا في كل مرة. قارن مع `Check` في سؤال 8 من الكتاب: هناك ضاع الدور، وهنا يعود كما كان."),
            TRACE({ title: "تتبّع `IsSymmetric`", code: IS_SYMMETRIC, run: queueOf("q", "int", [5, 6, 4, 6, 5]) + "\nConsole.WriteLine(IsSymmetric(q));\nConsole.WriteLine(q);", given: "الدور `q = [5,6,4,6,5]`، والاستدعاء `IsSymmetric(q)`." }),
          ],
        },
        {
          title: "وظيفة: أسئلة كتابة",
          keywords: ["وظيفة", "كتابة عملية", "Check", "InsertSorted", "IsCircular", "نجاعة"],
          blocks: [
            XP("أربعة أسئلة كتابة للبيت، مرتّبة من الأسهل إلى الأصعب. اكتب كل عملية في دفترك أو في محرّر الكود، ثم اضغط «الحل» وقارن: في النافذة كود الحل وما يُفحص فيه وتتبّعه. قد يكون حلّك مختلفًا وصحيحًا. في الأمثلة: القيمة الأولى من اليسار هي رأس الدور."),
            XLIST([
              "هل توقيع العملية صحيح (ما تستقبله وما تعيده)؟",
              "هل تفحص `IsEmpty` قبل كل `Remove` أو `Head`؟",
              "إذا طُلب الحفاظ على الدور: هل تعيد **كل** القيم قبل أي `return`؟",
            ], { title: "افحص حلّك قبل أن تفتح الحل", variant: "checklist" }),
            QH(1, "سهل", "قائمة انتظار «متميّزة»"),
            XEX({ mode: "practice", title: "سؤال 25 من الكتاب (ص 231)", prompt: "قائمة انتظار «متميّزة» هي قائمة انتظار تحتوي على أعداد صحيحة وتحقّق الشرط التالي: القيمة الأولى في القائمة تساوي حاصل جمع باقي القيم. مثال: القائمة `[23,6,7,-1,0,5,2,3,0,1]` «متميّزة»، لأن `1 + 0 + 3 + 2 + 5 + 0 - 1 + 7 + 6 = 23`. اكتب عملية باسم `Check` تتلقّى قائمة `Queue<int>` ثم تقوم بفحصها وإعادة `true` إذا كانت «متميّزة». خلاف ذلك تعيد العملية `false`.", steps: [] }),
            CLAR("في الكتاب", "القائمة مرسومة في الكتاب ورأسها في اليمين، فالقيمة الأولى هي 23. بكتابتنا (الرأس في اليسار): `[23,6,7,-1,0,5,2,3,0,1]`."),
            XCS("public static bool Check(Queue<int> Q)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 1 — `Check`", code: CHECK_FIRST, steps: [
              "دور فارغ ليس فيه قيمة أولى: نعيد `false`.",
              "ننسخ الدور بالعملية `CopyQueue` التي في الوحدة ونعمل على النسخة `Temp`، فلا يتغيّر الدور الأصلي.",
              "نُخرج القيمة الأولى ونحفظها في `First`، ثم نجمع كل القيم الباقية في `Sum`.",
              "نعيد نتيجة المقارنة `First == Sum`.",
            ], checklist: [
              "العمل على نسخة من الدور (أو إعادة القيم إليه).",
              "القيمة الأولى تُخرج **قبل** الحلقة، ولا تدخل في المجموع.",
              "المجموع يبدأ من صفر.",
              "إرجاع نتيجة المقارنة بعد انتهاء الحلقة.",
            ], trace: { lib: COPY_QUEUE, quiet: ["CopyQueue"], run: queueOf("Q", "int", [10, 3, 5, 2]) + "\nConsole.WriteLine(Check(Q));\nConsole.WriteLine(Q);", given: "الدور `Q = [10,3,5,2]`، والاستدعاء `Check(Q)`." } }),
            proved(SHORT("ما القيمة التي تعيدها `Check` لمثال الكتاب `[23,6,7,-1,0,5,2,3,0,1]`؟ اكتب `true` أو `false`.", "true", "مجموع القيم التي بعد الأولى هو 23، وهو يساوي القيمة الأولى."),
              { code: CHECK_FIRST, lib: COPY_QUEUE, run: queueOf("Q", "int", [23, 6, 7, -1, 0, 5, 2, 3, 0, 1]) + "\n" + yesNo("Check(Q)"), out: "true" }),
            QH(2, "متوسط", "`InsertSorted`: إدخال إلى دور مرتّب"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب العملية `InsertSorted` التي تستقبل دورًا `q` من الأعداد الصحيحة، مرتّبًا تصاعديًا من الرأس إلى النهاية، وعددًا صحيحًا `x`. العملية تُدخل `x` إلى الدور في مكانه الصحيح، بحيث يبقى الدور مرتّبًا. مثال: للدور `[2,5,8,11]` والعدد 7 يصير الدور `[2,5,7,8,11]`.", steps: [] }),
            XCS("public static void InsertSorted(Queue<int> q, int x)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 2 — `InsertSorted`", code: INSERT_SORTED, steps: [
              "`Insert` تُدخل إلى نهاية الدور فقط. لنضع `x` في الوسط نبني الدور من جديد في دور مساعد `temp`.",
              "الحلقة الأولى تنقل إلى `temp` كل القيم الأصغر من `x`. نفحص `q.IsEmpty()` **قبل** `q.Head()`: إذا كان `x` أكبر من كل القيم يفرغ الدور، و `Head` تشترط دورًا غير فارغ.",
              "الآن ندخل `x` إلى `temp`، ثم ننقل إليه ما بقي في `q`.",
              "الحلقة الأخيرة تعيد كل القيم من `temp` إلى `q`: الدور يحافظ على الترتيب.",
            ], checklist: [
              "دور مساعد، وليس راصّة: الراصّة كانت ستقلب الترتيب.",
              "الشرط `!q.IsEmpty() && q.Head() < x` بهذا الترتيب.",
              "إدخال `x` مرة واحدة فقط، بين القيم الأصغر منه والقيم الباقية.",
              "إعادة كل القيم إلى `q` في النهاية.",
            ], trace: { run: queueOf("q", "int", [2, 5, 8, 11]) + "\nInsertSorted(q, 7);\nConsole.WriteLine(q);", given: "الدور `q = [2,5,8,11]`، والاستدعاء `InsertSorted(q, 7)`." } }),
            proved(MC("كيف يصير الدور `[3,6,9]` بعد استدعاء `InsertSorted(q, 10)`؟", ["`[10,3,6,9]`", "*`[3,6,9,10]`", "`[3,6,10,9]`", "خطأ في التشغيل: `Head` على دور فارغ"], "كل القيم أصغر من 10 فتنتقل كلها إلى `temp` ويفرغ `q`. الشرط `!q.IsEmpty()` يوقف الحلقة قبل استدعاء `Head`، ثم يدخل 10 في النهاية."),
              { code: INSERT_SORTED, run: queueOf("q", "int", [3, 6, 9]) + "\nInsertSorted(q, 10);\nConsole.Write(q);", out: "[3,6,9,10]" }),
            QH(3, "متقدّم", "مجموعات من `k` قيم"),
            XEX({ mode: "practice", title: "سؤال 15 من الكتاب (ص 222)", prompt: "1. اكتب عملية تتلقّى كبارامترات قائمة انتظار من نوع صحيح وعددًا صحيحًا موجبًا `k`. العملية تعيد `true` إذا تحقّق الشرط التالي: القيمة الأولى من بين كل `k` قيم متتالية هي مجموع باقي القيم. خلاف ذلك تعيد العملية `false`. مثال: بالنسبة للدور `[15,5,10,12,4,8]` و `k=3` تعيد العملية `true`: القيمة الأولى في الثلاثية الأولى هي 15 وهي مساوية لمجموع باقي القيم في الثلاثية وهي 5 و10، والقيمة الأولى في الثلاثية الثانية هي 12 وهي مساوية لمجموع 4 و8. افترض أنّ قائمة الانتظار ليست فارغة وأنّ عدد قيمها من مضاعفات `k`. 2. ما هي درجة نجاعة العملية؟ علّل الإجابة.", steps: [] }),
            XP("الكتاب لا يعطي رأس العملية في هذا السؤال. نقترح:"),
            XCS("public static bool Check(Queue<int> Q, int k)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 3 — `Check` مع `k`", code: CHECK_K, steps: [
              "قالب التمشيط: ننسخ الدور بالعملية `CopyQueue` ونعمل على النسخة `Temp`.",
              "كل دورة من الحلقة الخارجية تعالج مجموعة واحدة: نُخرج قيمتها الأولى `First`.",
              "الحلقة الداخلية تدور `k - 1` مرات وتجمع باقي قيم المجموعة في `Sum`.",
              "إذا اختلف `First` عن `Sum` نعيد `false` فورًا. هذا مسموح هنا لأننا نعمل على النسخة، والدور الأصلي سليم.",
              "النجاعة `O(n)`: مع أنّ هناك حلقة داخل حلقة، كل قيمة تُخرج من `Temp` مرة واحدة فقط.",
            ], checklist: [
              "العمل على نسخة من الدور (أو إعادة القيم إليه).",
              "حلقة داخلية تدور `k - 1` مرات وتجمع باقي قيم المجموعة.",
              "المجموع `Sum` يبدأ من صفر **لكل مجموعة**، لا مرة واحدة قبل الحلقة.",
              "إرجاع `true` فقط بعد فحص كل المجموعات.",
            ], trace: { lib: COPY_QUEUE, quiet: ["CopyQueue"], run: queueOf("Q", "int", [15, 5, 10, 12, 4, 8]) + "\nConsole.WriteLine(Check(Q, 3));\nConsole.WriteLine(Q);", given: "الدور `Q = [15,5,10,12,4,8]`، والاستدعاء `Check(Q, 3)`." } }),
            proved(SHORT("ما القيمة التي تعيدها `Check(Q, 3)` للدور `Q = [9,4,5,7,2,6]`؟ اكتب `true` أو `false`.", "false", "المجموعة الأولى سليمة: `9 = 4 + 5`. في المجموعة الثانية `2 + 6 = 8` وهذا لا يساوي 7."),
              { code: CHECK_K, lib: COPY_QUEUE, run: queueOf("Q", "int", [9, 4, 5, 7, 2, 6]) + "\n" + yesNo("Check(Q, 3)"), out: "false" }),
            MC("ما درجة نجاعة العملية `Check` لدور فيه `n` قيم؟", ["`O(1)`", "*`O(n)`", "`O(n·k)`", "`O(n²)`"], "`CopyQueue` تمرّ على القيم مرّتين. وبعدها، مع أنّ هناك حلقة داخل حلقة، كل قيمة تُخرج من `Temp` **مرة واحدة فقط**: الحلقتان معًا تنفّذان `n` إخراجًا. المجموع `O(n)`."),
            QH(4, "متقدّم", "`IsCircular`: إزاحة دائرية"),
            XEX({ mode: "practice", title: "سؤال 19 من الكتاب (ص 225)", prompt: "1. اكتب عملية تتلقّى دورين `Q1` و `Q2` من نوع `Queue<char>`. العملية تعيد `true` إذا كان الدور `Q2` عبارة عن نتيجة إزاحة لقيم الدور `Q1` إلى اليمين. خلاف ذلك تعيد العملية `false`. مثال: إذا كان الدور الأول `[G,F,E,D,C,B,A]` والدور الثاني `[D,C,B,A,G,F,E]` فإنّ الدور الثاني تمّ الحصول عليه نتيجة إزاحة الخلايا `E` و `F` و `G` من الدور الأول. 2. حدّد درجة نجاعة العملية `IsCircular` مع شرح وافٍ للإجابة.", steps: [] }),
            FIG("مثال الكتاب لسؤال 19", [
              { kind: "queue", items: ["G", "F", "E", "D", "C", "B", "A"], label: "الدور الأول `Q1`" },
              { kind: "queue", items: ["D", "C", "B", "A", "G", "F", "E"], label: "الدور الثاني `Q2`" },
            ]),
            CLAR("في الكتاب", "الدوران مرسومان في الكتاب ورأسهما في اليمين: `A B C D E F G` ثم `E F G A B C D`. «الإزاحة إلى اليمين» هناك تعني أنّ القيمة تخرج من الرأس وتعود إلى النهاية. بكتابتنا (الرأس في اليسار): خرجت `G` ثم `F` ثم `E` من الرأس وعادت إلى النهاية."),
            XCS("public static bool IsCircular(Queue<char> Q1, Queue<char> Q2)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 4 — `IsCircular`", code: IS_CIRCULAR.trim() + "\n" + CIRCULAR_HELPERS.trim(), steps: [
              "الفكرة: ندوّر `Q1` خطوة بعد خطوة بالأمر `Q1.Insert(Q1.Remove());`، وبعد كل خطوة نفحص: هل صار ترتيبه مثل ترتيب `Q2`؟",
              "العملية المساعدة `Size` تعيد طول الدور وتحافظ عليه. إذا اختلف الطولان فالجواب `false`.",
              "العملية المساعدة `SameOrder` تقارن الرأسين ثم تدوّر الدورين معًا. بعد `n` خطوات يكون قد مرّ كل زوج من القيم، ويعود الدوران كما كانا.",
              "في `IsCircular` نجرّب `n` إزاحات. لا نكتب `return` داخل الحلقة: نكمل التدوير حتى يعود `Q1` كما كان، ونحفظ النتيجة في `found`.",
              "النجاعة `O(n²)`: الحلقة تدور `n` مرات، وفي كل مرة تستدعي `SameOrder` التي تدور `n` مرات.",
            ], checklist: [
              "إذا اختلف الطولان فالجواب `false` فورًا.",
              "تجربة كل الإزاحات الممكنة: `n` إزاحات.",
              "الدوران يعودان كما كانا: كل منهما دُوِّر عددًا من المرات يساوي مضاعفًا لطوله.",
              "لا `return` داخل الحلقة قبل أن يكتمل تدوير `Q1`.",
              "نفترض أنّ الدورين غير فارغين.",
            ], trace: { code: IS_CIRCULAR, lib: CIRCULAR_HELPERS, quiet: ["Size", "SameOrder"], run: queueOf("Q1", "char", ["A", "B", "C", "D"]) + "\n" + queueOf("Q2", "char", ["C", "D", "A", "B"]) + "\nConsole.WriteLine(IsCircular(Q1, Q2));\nConsole.WriteLine(Q1);", given: "الدوران `Q1 = [A,B,C,D]` و `Q2 = [C,D,A,B]`، والاستدعاء `IsCircular(Q1, Q2)`. العمليتان المساعدتان تعملان دون خطوات خاصة بهما." } }),
            proved(SHORT("ما القيمة التي تعيدها `IsCircular` لمثال الكتاب: `Q1 = [G,F,E,D,C,B,A]` و `Q2 = [D,C,B,A,G,F,E]`؟ اكتب `true` أو `false`.", "true", "بعد تدوير `Q1` ثلاث خطوات (تخرج `G` ثم `F` ثم `E` وتعود إلى النهاية) يصير `[D,C,B,A,G,F,E]`، وهو `Q2` بالضبط."),
              { code: IS_CIRCULAR, lib: CIRCULAR_HELPERS, run: queueOf("Q1", "char", ["G", "F", "E", "D", "C", "B", "A"]) + "\n" + queueOf("Q2", "char", ["D", "C", "B", "A", "G", "F", "E"]) + "\n" + yesNo("IsCircular(Q1, Q2)"), out: "true" }),
            proved(SHORT("وما القيمة التي تعيدها للدورين `Q1 = [A,B,C]` و `Q2 = [A,C,B]`؟ اكتب `true` أو `false`.", "false", "إزاحات `Q1` هي `[A,B,C]` و `[B,C,A]` و `[C,A,B]` فقط، وليس بينها `[A,C,B]`: القيم نفسها لكن ترتيبها الدائري مختلف."),
              { code: IS_CIRCULAR, lib: CIRCULAR_HELPERS, run: queueOf("Q1", "char", ["A", "B", "C"]) + "\n" + queueOf("Q2", "char", ["A", "C", "B"]) + "\n" + yesNo("IsCircular(Q1, Q2)"), out: "false" }),
            MC("ما درجة نجاعة هذا الحل لدورين في كل منهما `n` قيم؟", ["`O(1)`", "`O(n)`", "*`O(n²)`", "`O(n³)`"], "الحلقة في `IsCircular` تدور `n` مرات، وفي كل مرة تستدعي `SameOrder` التي تدور `n` مرات. المجموع `n · n`، أي `O(n²)`. استدعاءا `Size` يضيفان `O(n)` فقط."),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "دور"],
          blocks: [
            MC("ما معنى `FIFO`؟", ["*أول من يدخل أول من يخرج", "آخر من يدخل أول من يخرج", "الأكبر يخرج أولًا", "الأصغر يخرج أولًا"], "`First In First Out`: أول قيمة أُدخلت هي الأولى التي تُخرج."),
            WORDS("أكمل الجمل عن عمليات الدور:", "العملية [[Insert]] تُدخل قيمة إلى نهاية الدور، والعملية [[Remove]] تُخرج القيمة التي في الرأس، والعملية [[Head]] تعيدها بدون إخراجها، والعملية [[IsEmpty]] تفحص إن كان الدور فارغًا.", ["Push", "Pop", "Top"], "`Push` و `Pop` و `Top` عمليات الراصّة لا الدور."),
            XCS("Queue<int> q = new Queue<int>();\nq.Insert(3); q.Insert(6); q.Insert(9);\nq.Remove();\nq.Insert(q.Head() * 2);\nConsole.Write(q);"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟ اكتب الناتج كما يُطبع.", "[6,9,12]", "بعد الإدخالات `[3,6,9]`. `Remove` تُخرج 3. الرأس الآن 6، فندخل 12 إلى النهاية: `[6,9,12]`."),
              { code: inMain("Queue<int> q = new Queue<int>();\nq.Insert(3); q.Insert(6); q.Insert(9);\nq.Remove();\nq.Insert(q.Head() * 2);\nConsole.Write(q);"), out: "[6,9,12]" }),
            TF("بعد نقل كل قيم الدور `a` إلى دور فارغ `b` بالحلقة `while (!a.IsEmpty()) b.Insert(a.Remove());` يكون ترتيب القيم في `b` مثل ترتيبها الأصلي في `a`.", true, "رأس `a` يخرج أولًا ويدخل أولًا إلى `b`، فيبقى رأسًا. الدور يحافظ على الترتيب؛ الراصّة هي التي تقلبه."),
            XCS("Stack<int> s = new Stack<int>();\nQueue<int> q = new Queue<int>();\nfor (int i = 1; i <= 4; i++)\n{\n    if (i % 2 == 0)\n        s.Push(i);\n    else\n        q.Insert(i);\n}\nwhile (!s.IsEmpty())\n    q.Insert(s.Pop());\nConsole.Write(q);"),
            proved(SHORT("ماذا يطبع المقطع أعلاه (راصّة ودور معًا)؟ اكتب الناتج كما يُطبع.", "[1,3,4,2]", "بعد حلقة `for`: الدور `[1,3]` والراصّة `[4,2]` (الرأس 4). ثم تخرج 4 من الراصّة أولًا وتدخل الدور، وبعدها 2."),
              { code: inMain("Stack<int> s = new Stack<int>();\nQueue<int> q = new Queue<int>();\nfor (int i = 1; i <= 4; i++)\n{\n    if (i % 2 == 0)\n        s.Push(i);\n    else\n        q.Insert(i);\n}\nwhile (!s.IsEmpty())\n    q.Insert(s.Pop());\nConsole.Write(q);"), out: "[1,3,4,2]" }),
            MC("لماذا تحتفظ الفئة `Queue<T>` بمؤشّرين `First` و `Last`، بينما تكفي الراصّةَ مؤشّر واحد؟", ["لأن الدور يحفظ قيمًا أكثر", "*لأن الإخراج من طرف والإدخال إلى الطرف الآخر، و `Last` يجعل الإدخال `O(1)`", "لأن `ToString` تحتاج إلى مؤشّرين", "لأن الدور يُبنى بمصفوفة"], "`Remove` و `Head` تعملان مع `First`، و `Insert` تعمل مع `Last`. بدون `Last` كان الإدخال يحتاج إلى تمشيط السلسلة كلها."),
            MC("ماذا يحدث عند استدعاء `Remove` على دور فارغ؟", ["تُعاد القيمة 0", "تُعاد `null` دائمًا", "*خطأ في التشغيل: العملية تشترط ألا يكون الدور فارغًا", "لا يحدث شيء"], "في التنفيذ بسلسلة خلايا يكون `First` مساويًا `null`، واستدعاء `First.GetValue()` خطأ في التشغيل. لذلك نفحص `IsEmpty` أولًا."),
            proved(SHORT("معطى `Q = [5,1,4]`. ما القيمة التي تعيدها `Exists(Q, 7)`؟ اكتب `true` أو `false`.", "false", "العملية تُخرج 5 ثم 1 ثم 4 من النسخة ولا تجد 7، فتنتهي الحلقة وتُعاد `false`."),
              { code: EXISTS, run: queueOf("Q", "int", [5, 1, 4]) + "\n" + yesNo("Exists(Q, 7)"), lib: COPY_QUEUE, out: "false" }),
            ORDER("نريد حذف القيمة التي في **نهاية** الدور `q` (طوله `n`) مع الحفاظ على ترتيب الباقي، وبدون مبنى مساعد. رتّب الخطوات:", ["نحسب طول الدور `n`", "نكرّر `n - 1` مرة: `q.Insert(q.Remove());`", "الآن القيمة التي كانت في النهاية صارت في الرأس", "نُخرجها بالأمر `q.Remove();` ولا نعيدها"], "تدوير الدور `n - 1` خطوة يجلب القيمة الأخيرة إلى الرأس، وبقية القيم تبقى خلفها بترتيبها الأصلي."),
            CLASSIFY("صنّف كل عملية: هل تغيّر محتوى الدور؟", ["تغيّر الدور", "لا تغيّر الدور"], [["`Insert`", 0], ["`Remove`", 0], ["`Head`", 1], ["`IsEmpty`", 1], ["`ToString`", 1]], "`Insert` تضيف و `Remove` تحذف. الثلاث الباقية تقرأ فقط."),
            CLASSIFY("راصّة أم دور؟ اختر المبنى الملائم لكل حالة:", ["راصّة (`LIFO`)", "دور (`FIFO`)"], [["زرّ التراجع `Undo` في محرّر النصوص", 0], ["مستندات تنتظر الطابعة", 1], ["زبائن أمام شبّاك البنك", 1], ["فحص اتّزان الأقواس", 0], ["قلب ترتيب قيم دور", 0], ["رسائل تُعالَج بحسب وقت وصولها", 1]], "حين يكون ترتيب الوصول هو ترتيب المعالجة نختار الدور. وحين نحتاج إلى آخر ما دخل أولًا، أو إلى قلب الترتيب، نختار الراصّة."),
            XCS(IS_SORTED_EARLY),
            proved(SHORT("العملية أعلاه كتبها طالب ليفحص إن كان الدور مرتّبًا تصاعديًا، والمطلوب أن تحافظ على الدور. ماذا يبقى في الدور `q = [2,5,3,8]` بعد استدعائها؟ اكتب الدور كما يُطبع.", "[8]", "تُخرج 2 ثم 5 وتُدخلان إلى `temp`، ثم تُخرج 3 وعند المقارنة `3 < 5` تنتهي العملية بالأمر `return false;`. القيمتان 2 و5 بقيتا في `temp` والقيمة 3 لم تُدخل أصلًا، فيبقى في `q` القيمة 8 فقط. الإرجاع مسموح فقط بعد إعادة كل القيم."),
              { code: IS_SORTED_EARLY, run: queueOf("q", "int", [2, 5, 3, 8]) + "\nIsSorted(q);\nConsole.Write(q);", out: "[8]" }),
            MC("في `RemoveMin`: لماذا نُدخل المستندات إلى **دور** مساعد وليس إلى راصّة مساعدة؟", ["لأن الراصّة لا تحفظ كائنات", "*لأن الدور المساعد يحافظ على ترتيب المستندات الباقية عند إعادتها", "لأن الدور أسرع من الراصّة", "لا فرق بين الاثنين"], "المطلوب إخراج مستند واحد وترك الباقي بترتيبه. النقل إلى دور مساعد ثم العودة يحفظ الترتيب بمرور واحد في كل اتجاه."),
          ],
        },
      ],
    },
  ],
};
