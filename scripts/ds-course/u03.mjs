// Unit 3 — سلاسل الخلايا المترابطة Node / Node<T> (الكتاب: الفصل الثالث، ص 105–178).
// النسخة الممسوحة ينقصها: ص 106، 108–109، 118، 121–125 (وفيها جدول Node<T>) و 134–138 (السلاسل باتجاهين — خارج هذه الوحدة).
import {
  P, H, NOTE, LIST, OL, TABLE, EX, CS, API, ADDED, CLAR, XP, XH, XDEF, XCS, XEX, XTIP, XNOTE, XLIST, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, LAB, FIG, QH, SOLUTION, proved, provedCount, chainOf,
} from "./dsl.mjs";

// ── driver helpers of this unit ───────────────────────────────────────────────────────────────────────────────────────
/** A chain of the non-generic class Node, given from its first cell. */
const nodes = (name, values) => `Node ${name} = ${values.reduceRight((next, v) => `new Node(${v}${next ? ", " + next : ""})`, "")};`;
/** Statements shown inside a Main. */
const inMain = body => "public static void Main()\n{\n" + body.split("\n").map(l => (l ? "    " + l : l)).join("\n") + "\n}";
const chain = (name, values) => chainOf(name, "int", values);
// hidden helpers: a chain as [first,…,last]
const SHOW = `
public static string Show(Node Head)
{
    string s = "[";
    Node Pos = Head;
    while (Pos != null)
    {
        s += Pos.GetValue();
        if (Pos.HasNext()) s += ",";
        Pos = Pos.GetNext();
    }
    return s + "]";
}`;
const SHOW_T = `
public static string Show(Node<int> Head)
{
    string s = "[";
    Node<int> Pos = Head;
    while (Pos != null)
    {
        s += Pos.GetValue();
        if (Pos.HasNext()) s += ",";
        Pos = Pos.GetNext();
    }
    return s + "]";
}`;

// ── the class Node, as the course library writes it (the book's own listing is on pages missing from the scan) ─────────
const NODE_CLASS = `
public class Node
{
    private int Value;
    private Node Next;
    public Node(int Value)
    {
        this.Value = Value;
        this.Next = null;
    }
    public Node(int Value, Node Next)
    {
        this.Value = Value;
        this.Next = Next;
    }
    public int GetValue() { return this.Value; }
    public void SetValue(int Value) { this.Value = Value; }
    public Node GetNext() { return this.Next; }
    public void SetNext(Node Next) { this.Next = Next; }
    public bool HasNext() { return this.Next != null; }
    public override string ToString() { return this.Value.ToString(); }
}`;

// ── building a chain ──────────────────────────────────────────────────────────────────────────────────────────────────
const OPTION1 = inMain("Node Head = new Node(13);\nNode Pos = new Node(15);\nHead.SetNext(Pos);");
const BUILD = to => `
Node Head = new Node(1);
Node Last = Head;
for (int i = 2; i <= ${to}; i++)
{
    Last.SetNext(new Node(i));
    Last = Last.GetNext();
}`;

// ── traversal ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const PRINT_LOOP = `
Node Pos = Head;
while(Pos!= null)
{
    Console.Write(Pos.ToString() + " ");
    Pos = Pos.GetNext();
}`;
const SUM_LOOP = print => `
Node Pos = Head;
int Sum = 0;
while (Pos != null)
{
    Sum += Pos.GetValue();
    Pos = Pos.GetNext();
}
${print}`;
const SEARCH = (yes, no) => `
Node Pos = Head;
Console.WriteLine("Enter an integer:");
int Num = int.Parse(Console.ReadLine());
bool Found = false;
while (Pos != null)
{
    if (Num == Pos.GetValue())
    {
        Found = true;
        break;
    }
    Pos = Pos.GetNext();
}
if (Found)
    Console.WriteLine(${yes});
else
    Console.WriteLine(${no});`;
const SEARCH_MAIN = inMain(nodes("Head", [13, 15, 17]) + SEARCH("Num + \" is in the list\"", "Num + \" is not in the list\""));

// ── operations that receive a chain ───────────────────────────────────────────────────────────────────────────────────
const GET_MAX = `
public static int GetMaxValue(Node Head)
{
    Node Pos = Head;
    int MaxValue = Pos.GetValue();
    Pos = Pos.GetNext();
    while (Pos != null)
    {
        if (MaxValue < Pos.GetValue())
            MaxValue = Pos.GetValue();
        Pos = Pos.GetNext();
    }
    return MaxValue;
}`;
const GET_POS = `
public static Node GetPos(Node Head, int Num)
{
    Node Pos = Head;
    while (Pos != null)
    {
        if (Pos.GetValue() == Num)
            return Pos;
        Pos = Pos.GetNext();
    }
    return null;
}`;
const TO_NODE = `
public static Node ToNode(int[] A)
{
    Node Head = new Node(A[0]);
    Node Last = Head;
    for (int i = 1; i < A.Length; i++)
    {
        Last.SetNext(new Node(A[i]));
        Last = Last.GetNext();
    }
    return Head;
}`;
const PRINT = `
public static void Print(Node Head)
{
    Node Pos = Head;
    while (Pos != null)
    {
        Console.Write(Pos.ToString() + " ");
        Pos = Pos.GetNext();
    }
    Console.WriteLine();
}`;
const GET_ODDS = `
public static Node GetOdds(Node Chain)
{
    Node Head = null, Last = null;
    Node Pos = Chain;
    while (Pos != null)
    {
        if (Pos.GetValue() % 2 != 0)
        {
            Node NewNode = new Node(Pos.GetValue());
            if (Head == null)
                Head = NewNode;
            else
                Last.SetNext(NewNode);
            Last = NewNode;
        }
        Pos = Pos.GetNext();
    }
    return Head;
}`;

// ── deleting cells ────────────────────────────────────────────────────────────────────────────────────────────────────
const DELETE_SECOND = `
Node Previous = Head;
Node Pos = Previous.GetNext();
Previous.SetNext(Pos.GetNext()); // الخطوة الأولى
Pos.SetNext(null); // الخطوة الثانية`;
const DELETE_NODE = last => `
public static bool DeleteNode(Node Head, int Num)
{
    Node Pos = Head;
    Node Previous = null, PosToDelete = null;
    while (Pos != null)
    {
        if (Pos.HasNext() && Pos.GetNext().GetValue() == Num)
        {
            Previous = Pos;
            PosToDelete = Pos.GetNext();
            break;
        }
        Pos = Pos.GetNext();
    }
    if (Pos == null)
        return false; // Num was not found in the list
    Previous.SetNext(PosToDelete.GetNext());// فك الارتباط من جهة اليسار
    PosToDelete.SetNext(null);// فك الارتباط من جهة اليمين
    return ${last};
}`;

// ── the generic class Node<T> ─────────────────────────────────────────────────────────────────────────────────────────
const POINT = `
public class Point
{
    private double x;
    private double y;
    public Point()
    {
        this.x = 0;
        this.y = 0;
    }
    public Point(double x, double y)
    {
        this.x = x;
        this.y = y;
    }
    public double GetX() { return this.x; }
    public double GetY() { return this.y; }
    public double Distance(Point other)
    {
        double dx = this.x - other.GetX();
        double dy = this.y - other.GetY();
        return Math.Sqrt(dx * dx + dy * dy);
    }
    public override string ToString()
    {
        return "(" + this.x + "," + this.y + ")";
    }
}`;
const GET_FAR = `
public static Point GetFarMostPoint(Node<Point> Head, Point p)
{
    if (Head == null || p == null)
        return null;
    Node<Point> Pos = Head;
    double MaxDistance = Pos.GetValue().Distance(p);
    double Distance;
    Point FarMostPoint = Pos.GetValue();
    Pos = Pos.GetNext();
    while (Pos != null)
    {
        Distance = Pos.GetValue().Distance(p);
        if (Distance > MaxDistance)
        {
            MaxDistance = Distance;
            FarMostPoint = Pos.GetValue();
        }
        Pos = Pos.GetNext();
    }
    return FarMostPoint;
}`;
const GET_LAST_POS = `
public static Node<int> GetLastPos(Node<int> Head)
{
    Node<int> Last = Head;
    while (Last != null && Last.HasNext())
    {
        Last = Last.GetNext();
    }
    return Last;
}`;
const TO_NODE_T = `
public static Node<int> ToNode(int[] A)
{
    Node<int> Head = new Node<int>(A[0]);
    Node<int> Last = Head;
    for (int i = 1; i < A.Length; i++)
    {
        Last.SetNext(new Node<int>(A[i]));
        Last = Last.GetNext();
    }
    return Head;
}`;
const APPEND = `
public static void Append(Node<int> Head, int N)
{
    Node<int> Last = GetLastPos(Head);
    Last.SetNext(new Node<int>(N));
}`;
const GET_PREVIOUS = `
public static Node<int> GetPrevious(Node<int> Head, Node<int> Pos)
{
    Node<int> Previous = Head;
    while (Previous != null && Previous.GetNext() != Pos)
    {
        Previous = Previous.GetNext();
    }
    return Previous;
}`;
const ADD_AFTER = `
public static void AddAfter(Node<int> Head, Node<int> Pos, int N)
{
    Node<int> NewNode = new Node<int>(N, Pos.GetNext());
    Pos.SetNext(NewNode);
}`;
const MATH_EXPRESSION = `
public class MathExpression
{
    private int N1, N2;
    private char Op;
    public MathExpression(int N1, char Op, int N2)
    {
        this.N1 = N1;
        this.Op = Op;
        this.N2 = N2;
    }
    public int Calculate()
    {
        if (Op == '+') return N1 + N2;
        if (Op == '-') return N1 - N2;
        if (Op == '*') return N1 * N2;
        return N1 / N2;
    }
}`;
const SUM_EXPRESSIONS = name => `
public static int SumOfAllExpressions(Node<MathExpression> Chain)
{
    Node<MathExpression> Pos = Chain;
    int Sum = 0;
    while (Pos != null)
    {
        Sum += Pos.GetValue().${name}();
        Pos = Pos.GetNext();
    }
    return Sum;
}`;

// ── the recursive structure ───────────────────────────────────────────────────────────────────────────────────────────
const GET_LENGTH = `
public static int GetLength(Node<int> Head)
{
    if (Head == null)
        return 0;
    return 1 + GetLength(Head.GetNext());
}`;
const GET_SUM = `
public static int GetSum(Node<int> Head)
{
    if (Head == null)
        return 0;
    return Head.GetValue() + GetSum(Head.GetNext());
}`;
const GET_POS_REC = `
public static Node<int> GetPos(Node<int> Head, int N)
{
    if (Head == null)
        return null; // Not Found.
    if (Head.GetValue() == N)
        return Head;
    return GetPos(Head.GetNext(), N);
}`;

// ── the book's exercises: the trace questions (1, 2, 5) ───────────────────────────────────────────────────────────────
const WHAT = `
public static bool What(Node<int> Head)
{
    if (Head == null)
        return false;
    int f = Head.GetValue();
    Node<int> Pos = Head;
    while (Pos.HasNext())
    {
        Pos = Pos.GetNext();
    }
    if (f == Pos.GetValue())
        return true;
    return false;
}`;
const WHAT1 = `
public static bool What1(Node<int> Head, int s)
{
    Node<int> Pos = Head;
    int a, b;
    while (Pos != null)
    {
        a = Pos.GetValue();
        b = Pos.GetNext().GetValue();
        if (a + b != s) return false;
        Pos = Pos.GetNext().GetNext();
    }
    return true;
}`;
const WHAT12 = `
public static int What1(Node<int> pos)
{
    if (pos.GetNext() == null) return 0;
    else
        return pos.GetNext().GetValue() + What1(pos.GetNext());
}
public static bool What2(Node<int> pos)
{
    if (pos == null) return true ;
    else
    {
        int x = What1(pos);
        if (pos.GetValue() <= x)
        {
            Console.WriteLine ("Node:" + pos.GetValue());
            return false && What2(pos.GetNext());
        }
        else
            return true && What2(pos.GetNext());
    }

}`;
const Q5_CHAIN = [130, 65, 32, 16, 8, 5, 2];

// ── the book's exercises: the writing questions (3, 9, 13, 14) and their solutions ────────────────────────────────────
const BEGINS_BLANK = `
public static bool BeginsWith(Node<int> L1, Node<int> L2)
{
    Node<int> Pos1 = _______;
    Node<int> Pos2 = _______;
    while(______________ && ______________)
    {
        if (Pos1.GetValue() != Pos2.GetValue())
            return _______;
        Pos1 = Pos1.GetNext();
        Pos2 = Pos2.GetNext();
    }
    return ______________;
}`;
const BEGINS_WITH = `
public static bool BeginsWith(Node<int> L1, Node<int> L2)
{
    Node<int> Pos1 = L1;
    Node<int> Pos2 = L2;
    while(Pos1 != null && Pos2 != null)
    {
        if (Pos1.GetValue() != Pos2.GetValue())
            return false;
        Pos1 = Pos1.GetNext();
        Pos2 = Pos2.GetNext();
    }
    return Pos2 == null;
}`;
const EXISTS = `
public static bool Exists(Node<int> Chain, int Num)
{
    Node<int> Pos = Chain;
    while (Pos != null)
    {
        if (Pos.GetValue() == Num)
            return true;
        Pos = Pos.GetNext();
    }
    return false;
}`;
const ADD_LAST = `
public static Node<int> AddLast(Node<int> Head, int Num)
{
    Node<int> NewNode = new Node<int>(Num);
    if (Head == null)
        return NewNode;
    GetLastPos(Head).SetNext(NewNode);
    return Head;
}`;
const INTERSECTION = `
public static Node<int> Intersection(Node<int> Chain1, Node<int> Chain2)
{
    Node<int> Chain3 = null;
    Node<int> Pos = Chain1;
    while (Pos != null)
    {
        int x = Pos.GetValue();
        if (Exists(Chain2, x) && !Exists(Chain3, x))
            Chain3 = AddLast(Chain3, x);
        Pos = Pos.GetNext();
    }
    return Chain3;
}`;
const UNION = `
public static Node<int> Union(Node<int> Chain1, Node<int> Chain2)
{
    Node<int> Chain3 = null;
    Node<int> Pos = Chain1;
    while (Pos != null)
    {
        if (!Exists(Chain3, Pos.GetValue()))
            Chain3 = AddLast(Chain3, Pos.GetValue());
        Pos = Pos.GetNext();
    }
    Pos = Chain2;
    while (Pos != null)
    {
        if (!Exists(Chain3, Pos.GetValue()))
            Chain3 = AddLast(Chain3, Pos.GetValue());
        Pos = Pos.GetNext();
    }
    return Chain3;
}`;
const SET_HELPERS = [EXISTS, ADD_LAST, GET_LAST_POS];
const SET_RUN = call => chain("Chain1", [7, 9, 12, 30]) + "\n" + chain("Chain2", [9, 10, 12, 17]) + "\nNode<int> Result = " + call + "(Chain1, Chain2);\n";
const REMOVE_EVEN = `
public static void RemoveEvenBetweenOdds(Node<int> L)
{
    Node<int> Pos = L;
    while (Pos != null && Pos.HasNext() && Pos.GetNext().HasNext())
    {
        Node<int> Mid = Pos.GetNext();
        Node<int> After = Mid.GetNext();
        if (Pos.GetValue() % 2 != 0 && Mid.GetValue() % 2 == 0 && After.GetValue() % 2 != 0)
            Pos.SetNext(After);
        Pos = Pos.GetNext();
    }
}`;
const Q13_CHAIN = [5, 2, 9, 4, 7, 12, 14, 9];
const IS_TRIPLED = `
public static bool IsTripled(Node<int> Chain)
{
    int Length = GetLength(Chain);
    if (Length % 3 != 0)
        return false;
    Node<int> Pos1 = Chain;
    Node<int> Pos2 = Skip(Chain, Length / 3);
    Node<int> Pos3 = Skip(Pos2, Length / 3);
    while (Pos3 != null)
    {
        if (Pos1.GetValue() != Pos2.GetValue() || Pos2.GetValue() != Pos3.GetValue())
            return false;
        Pos1 = Pos1.GetNext();
        Pos2 = Pos2.GetNext();
        Pos3 = Pos3.GetNext();
    }
    return true;
}`;
const SKIP = `
public static Node<int> Skip(Node<int> Pos, int k)
{
    for (int i = 0; i < k; i++)
        Pos = Pos.GetNext();
    return Pos;
}`;
const Q14_CHAIN = [2, 5, 3, 7, 2, 5, 3, 7, 2, 5, 3, 7];
const MYSTERY = `
public static int Mystery(Node<int> Head)
{
    if (Head == null)
        return 0;
    if (Head.GetValue() % 2 == 0)
        return 1 + Mystery(Head.GetNext());
    return Mystery(Head.GetNext());
}`;

// ── the question pages (solved + homework): more trace questions in the unit's style ──────────────────────────────────
const SECRET = `
public static int Secret(Node<int> Head)
{
    int s = 0;
    Node<int> Pos = Head;
    while (Pos != null)
    {
        if (Pos.GetValue() % 2 == 0)
            s += Pos.GetValue();
        else
            s -= Pos.GetValue();
        Pos = Pos.GetNext();
    }
    return s;
}`;
const THIN = `
public static void Thin(Node<int> Head)
{
    Node<int> Pos = Head;
    while (Pos != null && Pos.HasNext())
    {
        Pos.SetNext(Pos.GetNext().GetNext());
        Pos = Pos.GetNext();
    }
}`;
const REC = `
public static int Rec(Node<int> Pos)
{
    if (!Pos.HasNext())
        return Pos.GetValue();
    int m = Rec(Pos.GetNext());
    if (Pos.GetValue() > m)
        return Pos.GetValue();
    return m;
}`;
const CHANGE = `
public static void Change(Node<int> Head)
{
    Node<int> Pos = Head;
    while (Pos != null)
    {
        if (Pos.GetValue() % 2 == 0)
            Pos.SetValue(Pos.GetValue() / 2);
        else
            Pos.SetValue(Pos.GetValue() * 3);
        Pos = Pos.GetNext();
    }
}`;
const BUILD_REVERSED = `
public static Node<int> Build(Node<int> Head)
{
    Node<int> Res = null;
    Node<int> Pos = Head;
    while (Pos != null)
    {
        Res = new Node<int>(Pos.GetValue(), Res);
        Pos = Pos.GetNext();
    }
    return Res;
}`;
const CHECK_PAIRS = `
public static bool Check(Node<int> Head)
{
    Node<int> P = Head;
    while (P != null)
    {
        Node<int> Q = P.GetNext();
        while (Q != null)
        {
            if (P.GetValue() == Q.GetValue())
                return true;
            Q = Q.GetNext();
        }
        P = P.GetNext();
    }
    return false;
}`;
const Q5_RUN = chain("Chain", Q5_CHAIN);

// ── the question pages: more writing questions (new ones, and the book's exercises 24 and 26) ─────────────────────────
const COUNT_VALUE = `
public static int CountValue(Node<int> Head, int Num)
{
    int Count = 0;
    Node<int> Pos = Head;
    while (Pos != null)
    {
        if (Pos.GetValue() == Num)
            Count++;
        Pos = Pos.GetNext();
    }
    return Count;
}`;
const IS_FIBONACCI = `
public static bool IsFibonacci(Node<int> List)
{
    if (List == null || List.GetValue() != 0)
        return false;
    if (!List.HasNext())
        return true;
    if (List.GetNext().GetValue() != 1)
        return false;
    Node<int> Pos = List;
    while (Pos.GetNext().HasNext())
    {
        Node<int> Second = Pos.GetNext();
        Node<int> Third = Second.GetNext();
        if (Third.GetValue() != Pos.GetValue() + Second.GetValue())
            return false;
        Pos = Second;
    }
    return true;
}`;
const INSERT_SORTED = `
public static Node<int> InsertSorted(Node<int> Head, int Num)
{
    if (Head == null || Num <= Head.GetValue())
        return new Node<int>(Num, Head);
    Node<int> Pos = Head;
    while (Pos.HasNext() && Pos.GetNext().GetValue() < Num)
        Pos = Pos.GetNext();
    Pos.SetNext(new Node<int>(Num, Pos.GetNext()));
    return Head;
}`;
const GET_MAX_POS = `
public static Node<int> GetMaxPos(Node<int> Head)
{
    Node<int> MaxPos = Head;
    Node<int> Pos = Head.GetNext();
    while (Pos != null)
    {
        if (Pos.GetValue() > MaxPos.GetValue())
            MaxPos = Pos;
        Pos = Pos.GetNext();
    }
    return MaxPos;
}`;
const CHECK_LIST = `
public static bool CheckList(Node<int> L)
{
    Node<int> Pos = L;
    while (Pos != null)
    {
        if (!Pos.HasNext() || !Pos.GetNext().HasNext())
            return false;
        int a = Pos.GetValue();
        int b = Pos.GetNext().GetValue();
        int c = Pos.GetNext().GetNext().GetValue();
        if (a * a + b * b != c)
            return false;
        Pos = Pos.GetNext().GetNext().GetNext();
    }
    return true;
}`;
const DELETE_ALL = `
public static Node<int> DeleteAll(Node<int> Head, int Num)
{
    while (Head != null && Head.GetValue() == Num)
        Head = Head.GetNext();
    Node<int> Pos = Head;
    while (Pos != null && Pos.HasNext())
    {
        if (Pos.GetNext().GetValue() == Num)
            Pos.SetNext(Pos.GetNext().GetNext());
        else
            Pos = Pos.GetNext();
    }
    return Head;
}`;

export default {
  n: 3,
  title: "سلاسل الخلايا المترابطة (Node)",
  short: "سلاسل الخلايا",
  description: "الخلية والسلسلة وواجهة الفئة Node، بناء سلسلة، قالب التمشيط (طباعة، طول، مجموع، بحث)، عمليات تتلقّى سلسلة أو تبنيها، حذف خلايا وإدخالها، الفئة العامة للخلية، المبنى التراجعي للسلسلة، وأسئلة تتبّع وكتابة: خمسة محلولة من كل نوع، ووظيفة لكل سؤال فيها نافذة حل.",
  src: "105",
  lessons: [
    {
      title: "الخلية والسلسلة",
      pages: [
        {
          title: "الخلية والسلسلة: الفئة `Node`",
          src: "107",
          keywords: ["خلية", "Node", "سلسلة خلايا مترابطة", "Next", "رأس السلسلة", "null"],
          objective: "أن تعرف ممَّ تتكوّن الخلية، وكيف ترتبط الخلايا في سلسلة.",
          blocks: [
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "الصفحة 106 (بداية المقدّمة) غير موجودة في النسخة الممسوحة. التعريفان التاليان إضافة ليكتمل الشرح، وبعدهما نعود إلى نصّ الكتاب."),
            XDEF("الخلية", "__الخلية__ (`Node`) كائن صغير فيه صفتان: **قيمة** (`Value`) هي المعلومة المخزّنة، و**مؤشّر** (`Next`) يشير إلى الخلية التالية. إذا لم تكن بعدها خلية فقيمة المؤشّر `null`."),
            XDEF("سلسلة الخلايا المترابطة", "__سلسلة الخلايا المترابطة__ مجموعة خلايا، كل خلية تشير إلى التي بعدها. نصل إلى السلسلة كلها من مؤشّر واحد يشير إلى خليتها الأولى، ونسمّيه __رأس السلسلة__ (`Head`)."),
            XP("فكّر في قطار: كل عربة تحمل شيئًا، وهي مربوطة بالعربة التي بعدها. يكفي أن تمسك العربة الأولى لتصل إلى كل العربات. وبعكس المصفوفة، لا نحدّد طول السلسلة مسبقًا: نضيف خلية جديدة متى احتجنا."),
            P("فحين جعلنا المؤشّر `Next`، التابع للخلية الأولى، يؤشّر إلى خلية جديدة، ربطنا الخليتين معًا. وبذلك حصلنا على سلسلة مكوّنة من خليتين. فبعد أن كان طول السلسلة 1 أصبح بعد الإضافة 2. والآن أصبح الطول 3:"),
            FIG("السلسلة تكبر خلية بعد خلية", [
              { kind: "chain", items: [13], pointers: [["Head", 0]], label: "طول السلسلة 1" },
              { kind: "chain", items: [13, 15], pointers: [["Head", 0]], hi: [1], label: "الخلية 13 تشير إلى خلية جديدة: الطول 2" },
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0]], hi: [2], label: "الخلية 15 تشير إلى خلية جديدة: الطول 3" },
            ]),
            XNOTE("طريقة الكتابة في هذه الوحدة", "نكتب السلسلة بين قوسين من خليتها الأولى إلى الأخيرة. السلسلة `[13,15,17]` تعني: الرأس يشير إلى الخلية 13، وبعدها 15، ثم 17، ثم `null`."),
            P("والآن دعونا نلخّص واجهة الفئة `Node` ومن ثم ننتقل إلى كتابتها بلغة `C#`."),
            API("Node", [
              ["private int Value;", "القيمة أو المعلومة المخزّنة في الخلية."],
              ["private Node Next;", "مؤشّر إلى الخلية التالية."],
              ["public Node(int Value)", "عملية بنائية تتلقّى قيمة ومن ثم تنشئ خلية مخزّنة فيها القيمة، والمؤشّر `Next` يؤشّر إلى `null`."],
              ["public Node(int Value, Node Next)", "عملية بنائية تتلقّى قيمة ومؤشّرًا ومن ثم تنشئ خلية مخزّنة فيها القيمة، والمؤشّر `Next` يؤشّر إلى المؤشّر المُمرَّر كبارامتر."],
              ["public int GetValue()", "عملية `Get` للصفة `Value`."],
              ["public void SetValue(int Value)", "عملية `Set` للصفة `Value`."],
              ["public Node GetNext()", "عملية `Get` للصفة `Next`."],
              ["public void SetNext(Node Next)", "عملية `Set` للصفة `Next`."],
              ["public bool HasNext()", "عملية تعيد `true` إذا كان المؤشّر `Next` يؤشّر إلى خلية ليست `null`. خلاف ذلك تعيد `false`."],
              ["public override string ToString()", "عملية تعيد القيمة كنصّ."],
            ], { caption: "واجهة الفئة `Node`" }),
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "الصفحتان 108–109، وفيهما كتابة الفئة `Node` بلغة `C#`، غير موجودتين في النسخة الممسوحة. الكود التالي هو الفئة كما تستعملها هذه الدورة، وهو مطابق لجدول الواجهة أعلاه."),
            XCS(NODE_CLASS),
            MATCH("صِل كل عملية من الفئة `Node` بما تفعله:", [["`GetValue()`", "تعيد القيمة المخزّنة في الخلية"], ["`SetValue(x)`", "تغيّر القيمة المخزّنة في الخلية"], ["`GetNext()`", "تعيد المؤشّر إلى الخلية التالية"], ["`SetNext(p)`", "تجعل الخلية تشير إلى خلية أخرى"], ["`HasNext()`", "تفحص: هل توجد خلية بعد هذه الخلية؟"]], "لكل صفة عملية `Get` تقرؤها وعملية `Set` تغيّرها. و `HasNext` تفحص المؤشّر `Next` دون أن تغيّر شيئًا."),
            XCS("Node a = new Node(13);\nNode b = new Node(15, a);\nConsole.Write(b.GetNext().GetValue());"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟", "13", "العملية البنائية الثانية جعلت الخلية `b` (قيمتها 15) تشير إلى الخلية `a`. لذلك `b.GetNext()` هي الخلية `a`، وقيمتها 13."),
              { code: inMain("Node a = new Node(13);\nNode b = new Node(15, a);\nConsole.Write(b.GetNext().GetValue());"), out: "13" }),
            TF("في الخلية الأخيرة من السلسلة تعيد `HasNext()` القيمة `true`.", false, "المؤشّر `Next` في الخلية الأخيرة يساوي `null`، فتعيد `HasNext()` القيمة `false`."),
            MC("في سلسلة فيها 100 خلية، كم مؤشّرًا خارجيًا نحتاج لنصل إلى كل الخلايا؟", ["100 مؤشّر: واحد لكل خلية", "*مؤشّر واحد إلى الخلية الأولى", "مؤشّران: إلى الأولى وإلى الأخيرة", "لا نحتاج إلى أي مؤشّر"], "كل خلية تشير إلى التي بعدها. من الرأس نصل إلى الثانية، ومنها إلى الثالثة، وهكذا حتى `null`."),
          ],
        },
        {
          title: "بناء سلسلة",
          src: "110–111",
          keywords: ["بناء سلسلة", "SetNext", "new Node", "Last", "مؤشّر مساعد"],
          objective: "أن تبني سلسلة من خليتين بثلاث طرق، وسلسلة طويلة بحلقة ومؤشّر مساعد.",
          blocks: [
            XP("نريد بناء السلسلة `[13,15]`: خلية قيمتها 13 وبعدها خلية قيمتها 15. الكتاب يعرض ثلاث إمكانيات."),
            XH("الإمكانية الأولى", 3),
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "أوامر الإمكانية الأولى مطبوعة في صفحة غير موجودة في النسخة الممسوحة (108–109). كتبناها هنا بحسب شرح الكتاب لها في الصفحة 110 وبحسب رسمه: مؤشّر إضافي `Pos` يشير إلى الخلية الثانية."),
            XCS("Node Head = new Node(13);\nNode Pos = new Node(15);\nHead.SetNext(Pos);"),
            P("الأمر الثالث يجعل المؤشّر `Next`، التابع للخلية الأولى، يؤشّر إلى الخلية `Pos`."),
            TRACE({ title: "الإمكانية الأولى أمرًا أمرًا", code: OPTION1, description: "الأوامر الثلاثة داخل `Main`. راقب: متى ترتبط الخليتان؟" }),
            H("الإمكانية الثانية", 3),
            CS("Node Head = new Node(13);\nHead.SetNext(new Node(15));"),
            P("أي أننا لم نستعمل المؤشّر الإضافي `Pos`."),
            H("الإمكانية الثالثة", 3),
            P("في الإمكانية الثالثة نستعمل العملية البنائية الثانية، أي التي تتلقّى قيمة ومؤشّرًا، ومن ثم تنشئ خلية مخزّنة فيها القيمة وتجعل المؤشّر `Next` يؤشّر إلى المؤشّر المُمرَّر كبارامتر."),
            CS("Node Head = new Node(13, new Node(15));"),
            XTIP("اقرأ من الداخل إلى الخارج", "في `new Node(13, new Node(15))` تُنشأ الخلية 15 أولًا، ثم تُنشأ الخلية 13 وهي تشير إليها. هكذا نبني سلسلة قصيرة في سطر واحد: `new Node(13, new Node(15, new Node(17)))`."),
            H("سلسلة الأعداد من 1 إلى 10", 3),
            EX({ title: "مثال", prompt: "اكتب مقطعًا ينشئ سلسلة من الخلايا مخزّنة فيها الأعداد الصحيحة من 1 إلى 10.", steps: ["نستعمل حلقة `for` لأنّ المجال معروف.", "ننشئ الخلية الأولى ونخزّن فيها القيمة 1.", "نستعمل مؤشّرًا مساعدًا يؤشّر إلى آخر خلية أضيفت إلى السلسلة بعد كل دورة."] }),
            CLAR("في الكتاب", "في نصّ الكتاب «بعدها ننشئ الخلية الأولى». المقصود أنّ الخلية الأولى تُنشأ **قبل** الحلقة، كما يظهر في الكود."),
            TABLE(["الأمر", "الشرح"], [
              ["Node Head = new Node(1);", "هنا ننشئ الخلية الأولى ونخزّن فيها القيمة 1."],
              ["Node Last = Head;", "نستعمل مؤشّرًا مساعدًا يؤشّر إلى آخر خلية أضيفت إلى السلسلة."],
              ["Last.SetNext(new Node(i));", "ننشئ خلية جديدة فيها القيمة `i` ونجعلها الـ `Next` لآخر خلية أضيفت."],
              ["Last = Last.GetNext();", "نقدّم المؤشّر المساعد ليؤشّر إلى آخر خلية أضيفت."],
            ], { ltr: [0] }),
            CS(BUILD(10)),
            NOTE("لاحظ", "رأس السلسلة لم يتغيّر منذ لحظة إنشائه. وذلك لأنّ السلسلة تُعرف بالمؤشّر إلى بدايتها، أي إلى رأسها."),
            TRACE({ title: "بناء السلسلة `[1,2,3,4]` بالحلقة", code: inMain(BUILD(4).trim()), description: "الحلقة هنا حتى 4 بدل 10 ليبقى التتبّع قصيرًا. راقب `Last`: يتقدّم دائمًا إلى آخر خلية، و `Head` ثابت." }),
            LAB("chain", { values: [13, 15], name: "Head", title: "جرّب: ابنِ سلسلة", description: "اضغط `p = Head` ثم `p = p.GetNext()` لتصل إلى آخر خلية، ثم اكتب قيمة واضغط «أدخِل بعد p». المؤشّر `p` يقوم هنا بدور `Last`." }),
            XCS("Node Head = new Node(5, new Node(8, new Node(2)));\nConsole.Write(Head.GetNext().GetNext().GetValue());"),
            proved(MC("ماذا يطبع المقطع أعلاه؟", ["5", "8", "*2", "خطأ في التشغيل"], "السلسلة هي `[5,8,2]`. `Head.GetNext()` هي الخلية 8، و `Head.GetNext().GetNext()` هي الخلية 2."),
              { code: inMain("Node Head = new Node(5, new Node(8, new Node(2)));\nConsole.Write(Head.GetNext().GetNext().GetValue());"), out: "2" }),
            XCS("Node Head = new Node(4);\nNode Last = Head;\nfor (int i = 1; i <= 3; i++)\n{\n    Last.SetNext(new Node(i * 10));\n    Last = Last.GetNext();\n}\nConsole.Write(Last.GetValue());"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟", "30", "الحلقة تضيف الخلايا 10 ثم 20 ثم 30، فتصير السلسلة `[4,10,20,30]`. المؤشّر `Last` يشير إلى آخر خلية أضيفت، وقيمتها 30. أمّا `Head` فبقي على الخلية 4."),
              { code: inMain("Node Head = new Node(4);\nNode Last = Head;\nfor (int i = 1; i <= 3; i++)\n{\n    Last.SetNext(new Node(i * 10));\n    Last = Last.GetNext();\n}\nConsole.Write(Last.GetValue());"), out: "30" }),
            MC("لماذا نستعمل المؤشّر المساعد `Last` ولا نقدّم `Head` نفسه؟", ["لأنّ `Head` لا يملك العملية `SetNext`", "*لأنّ السلسلة تُعرف برأسها: لو تقدّم `Head` لضاعت الخلايا الأولى", "لأنّ `Last` أسرع من `Head`", "لا فرق، يمكن تقديم `Head`"], "الخلية التي لا يشير إليها أي مؤشّر لا نستطيع الوصول إليها. لذلك يبقى `Head` على الخلية الأولى، ونتحرّك بمؤشّر مساعد."),
          ],
        },
      ],
    },
    {
      title: "تمشيط السلسلة",
      pages: [
        {
          title: "قالب التمشيط: طباعة، طول، مجموع، بحث",
          src: "112–114",
          keywords: ["تمشيط", "قالب التمشيط", "Pos", "طول السلسلة", "مجموع القيم", "بحث"],
          objective: "أن تمشّط سلسلة بمؤشّر مساعد لتطبع قيمها أو تعدّها أو تجمعها أو تبحث فيها.",
          blocks: [
            H("تمشيط السلسلة", 2),
            P("تمشيط السلسلة يكون بواسطة مؤشّر مساعد نجعله في البداية يؤشّر إلى رأس السلسلة. ثم نستعين بحلقة `while` تدور طالما أنّ المؤشّر لم يصل إلى ما بعد الخلية الأخيرة. بعد كل دورة نقدّم المؤشّر المساعد ليؤشّر إلى الخلية التالية في السلسلة. وعليه فإنّ قالب التمشيط يكون كالتالي:"),
            CS("Node Pos = Head;\nwhile(Pos!= null)\n{\n    // ...\n    Pos = Pos.GetNext();\n}"),
            TABLE(["الأمر", "الشرح"], [
              ["Node Pos = Head;", "نجعل المؤشّر المساعد يؤشّر في البداية إلى رأس السلسلة."],
              ["while(Pos!= null)", "طالما أنّ المؤشّر لم يصل إلى ما بعد الخلية الأخيرة، أي لم يصبح بعد `null`."],
              ["// ...", "في هذه الأسطر نكتب الأوامر التي تُنجز المطلوب من التمشيط، مثل: طباعة القيم أو عدّ الخلايا أو البحث عن قيمة أو جمع القيم وما إلى ذلك."],
              ["Pos = Pos.GetNext();", "بعد كل دورة نقدّم المؤشّر المساعد ليؤشّر إلى الخلية التالية في السلسلة. لاحظ أنه بدون هذا الأمر سنحصل على حلقة لانهائية."],
            ], { ltr: [0], caption: "قالب التمشيط" }),
            FIG("المؤشّر `Pos` يتقدّم خلية بعد خلية", [
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0], ["Pos", 0]], label: "البداية: `Pos = Head`" },
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0], ["Pos", 1]], label: "بعد `Pos = Pos.GetNext()`" },
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0], ["Pos", 2]], label: "`Pos` على الخلية الأخيرة، وبعد تقديم آخر يصير `null`" },
            ]),
            EX({ title: "مثال", prompt: "معطاة السلسلة `Head`. اكتب مقطعًا يطبع القيم المخزّنة في الخلايا في سطر واحد بحيث يُفصل بين القيم بفراغ واحد.", steps: ["هنا نستعمل قالب التمشيط المشروح أعلاه."] }),
            CS(PRINT_LOOP),
            TRACE({ title: "طباعة قيم السلسلة `[13,15,17]`", code: inMain(nodes("Head", [13, 15, 17]) + PRINT_LOOP), description: "مقطع الكتاب داخل `Main`، وقبله سطر يبني السلسلة. راقب `Pos` والناتج." }),
            EX({ title: "مثال", prompt: "معطاة السلسلة `Head`. اكتب مقطعًا يحسب ويطبع طول السلسلة، أي عدد خلاياها.", steps: ["هنا أيضًا نستعمل قالب التمشيط: في كل دورة يزيد العدّاد `Length` بواحد."] }),
            CS("Node Pos = Head;\nint Length = 0;\nwhile (Pos != null)\n{\n    Length++;\n    Pos = Pos.GetNext();\n}\nConsole.WriteLine(\"Length = {0}\", Length);"),
            EX({ title: "مثال", prompt: "معطاة السلسلة `Head`. اكتب مقطعًا يحسب ويطبع مجموع القيم المخزّنة في خلايا السلسلة.", steps: ["هنا أيضًا نستعمل قالب التمشيط: في كل دورة نضيف قيمة الخلية إلى `Sum`."] }),
            CS(SUM_LOOP("Console.WriteLine(\"Sum = {0}\", Sum);")),
            CLAR("الطباعة في التتبّعات", "أمر الكتاب `Console.WriteLine(\"Sum = {0}\", Sum);` يطبع قيمة `Sum` مكان `{0}`. في تتبّعات هذه الدورة وأسئلتها نكتب الأمر نفسه بصيغة الجمع: `Console.WriteLine(\"Sum = \" + Sum);`، والناتج المطبوع واحد."),
            EX({ title: "مثال", prompt: "معطاة السلسلة `Head`. اكتب مقطعًا يستقبل عددًا صحيحًا `Num` ثم يفحص إن كان `Num` موجودًا في السلسلة أم لا، ويطبع رسالة مناسبة.", steps: ["هنا أيضًا نستعمل قالب التمشيط."] }),
            CS(SEARCH("\"{0} is in the list\", Num", "\"{0} is not in the list\", Num")),
            XLIST([
              "المتغيّر `Found` يبدأ بالقيمة `false`: لم نجد العدد بعد.",
              "إذا ساوت قيمة الخلية العدد `Num` يصير `Found` مساويًا `true`، والأمر `break` يوقف الحلقة فورًا: لا حاجة إلى متابعة التمشيط.",
              "إذا وصل `Pos` إلى `null` دون أن نجد العدد، يبقى `Found` مساويًا `false`.",
            ], { title: "كيف يعمل مقطع البحث؟" }),
            TRACE({ title: "البحث عن 15 في السلسلة `[13,15,17]`", code: SEARCH_MAIN, stdin: "15", description: "مقطع الكتاب داخل `Main` (الطباعة بصيغة الجمع). المستخدم يُدخل العدد 15." }),
            MC("معطاة السلسلة `Head = [4,9,2]`. ماذا يطبع مقطع المجموع؟", ["*`Sum = 15`", "`Sum = 3`", "`Sum = 2`", "`Sum = 0`"], "في كل دورة تُضاف قيمة الخلية إلى `Sum`: `4 + 9 + 2 = 15`. العدد 3 هو طول السلسلة لا مجموعها."),
            MC("ماذا يحدث لو نسينا الأمر `Pos = Pos.GetNext();` في قالب التمشيط؟", ["تُطبع الخلية الأولى مرة واحدة فقط", "*حلقة لانهائية: `Pos` يبقى على الخلية الأولى ولا يصير `null` أبدًا", "خطأ في الترجمة", "تنتهي الحلقة فورًا"], "الشرط `Pos != null` يبقى صحيحًا ما دام `Pos` لا يتقدّم. هذا ما ينبّه إليه الكتاب في شرح القالب."),
            XCS("Node Pos = Head;\nwhile (Pos.HasNext())\n{\n    Console.Write(Pos.ToString() + \" \");\n    Pos = Pos.GetNext();\n}"),
            proved(MC("طالب كتب شرط الحلقة `Pos.HasNext()` كما في المقطع أعلاه. ماذا يُطبع للسلسلة `[13,15,17]`؟", ["`13 15 17`", "*`13 15`", "`15 17`", "لا شيء"], "حين يصل `Pos` إلى الخلية الأخيرة (17) تعيد `HasNext()` القيمة `false`، فتنتهي الحلقة قبل طباعتها. وإذا كانت السلسلة فارغة يحدث خطأ في التشغيل، لأنّ `Pos` يساوي `null`. الشرط الصحيح `Pos != null`."),
              { code: inMain(nodes("Head", [13, 15, 17]) + "\nNode Pos = Head;\nwhile (Pos.HasNext())\n{\n    Console.Write(Pos.ToString() + \" \");\n    Pos = Pos.GetNext();\n}"), out: "13 15 " }),
            provedCount(SHORT("في مقطع البحث، السلسلة `[13,15,17]` والمستخدم يُدخل 17. كم مرة يُنفَّذ الأمر `Pos = Pos.GetNext();`؟", "2", "`Pos` يتقدّم بعد الخلية 13 وبعد الخلية 15. عند الخلية 17 نجد العدد، والأمر `break` يوقف الحلقة قبل الوصول إلى أمر التقديم."),
              { code: SEARCH_MAIN, stdin: "17" }, "Pos = Pos.GetNext();", 2),
            TF("إذا حذفنا الأمر `break` من مقطع البحث تبقى الرسالة المطبوعة صحيحة، لكنّ الحلقة تكمل حتى نهاية السلسلة.", true, "`Found` يصير `true` عند إيجاد العدد ولا يعود إلى `false`. الأمر `break` لا يغيّر النتيجة، لكنه يوفّر دورات لا حاجة إليها."),
          ],
        },
      ],
    },
    {
      title: "السلسلة والعمليات",
      pages: [
        {
          title: "عمليات تتلقّى سلسلة: `GetMaxValue` و `GetPos`",
          src: "115–116",
          keywords: ["عملية خارجية", "GetMaxValue", "GetPos", "النجاعة", "O(n)"],
          objective: "أن تكتب عملية خارجية تتلقّى رأس سلسلة وتمشّطها، وأن تحدّد نجاعتها.",
          blocks: [
            H("تمرير السلسلة إلى العمليات", 2),
            P("بإمكاننا كتابة عمليات خارجية، أي ستاتية وغير تابعة للفئة `Node`، تتلقّى مؤشّرًا إلى بداية سلسلة وتمشّط السلسلة باستعمال القالب المشروح أعلاه."),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى مؤشّرًا إلى بداية سلسلة غير فارغة (أي فيها على الأقل خلية واحدة) ثم تجد وتعيد أكبر قيمة في السلسلة." }),
            CS(GET_MAX),
            XLIST([
              "`MaxValue` يبدأ بقيمة الخلية الأولى، لا بصفر: لو كانت كل القيم سالبة لكان الصفر جوابًا خاطئًا.",
              "لذلك يشترط المثال أن تكون السلسلة غير فارغة: `Pos.GetValue()` على سلسلة فارغة خطأ في التشغيل.",
              "التمشيط يبدأ من الخلية الثانية، لأنّ الأولى أُخذت قيمتها من قبل.",
            ], { title: "ثلاث ملاحظات على الحل" }),
            TRACE({ title: "`GetMaxValue` على السلسلة `[8,21,13]`", code: GET_MAX, run: nodes("Head", [8, 21, 13]) + "\nConsole.WriteLine(GetMaxValue(Head));", given: "السلسلة `Head = [8,21,13]`، والاستدعاء `GetMaxValue(Head)`." }),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى مؤشّرًا إلى بداية سلسلة وعددًا صحيحًا `Num` ثم تبحث عن `Num` في السلسلة وتعيد المؤشّر إلى الخلية التي تحويه إن وجدته. خلاف ذلك تعيد العملية `null`." }),
            CS(GET_POS),
            TRACE({ title: "`GetPos` تبحث عن 17 في `[13,15,17]`", code: GET_POS, run: nodes("Head", [13, 15, 17]) + "\nNode Found = GetPos(Head, 17);\nConsole.WriteLine(Found.GetValue());", given: "السلسلة `Head = [13,15,17]`، والاستدعاء `GetPos(Head, 17)`.", description: "العملية تعيد مؤشّرًا إلى خلية، لا عددًا. راقب إلى أين يشير `Found` في النهاية." }),
            H("تحليل نجاعة العملية", 3),
            P("حجم الإدخال: نفرض أنّ طول السلسلة (أي عدد خلاياها) `n`."),
            P("درجة نجاعة العمليتين `GetValue()` و `GetNext()` التابعتين للفئة `Node` هي `O(1)`."),
            P("في أسوأ الحالات لن نجد الخلية التي تحتوي على `Num`. ولذلك سوف تُنفَّذ الحلقة بالكامل، أي ستدور `n` مرة، بعدد خلايا السلسلة. وعليه تكون درجة نجاعة العملية `O(n)`، أي خطّية."),
            proved(SHORT("ما القيمة التي تعيدها `GetMaxValue(Head)` للسلسلة `Head = [5,12,9,4]`؟", "12", "`MaxValue` يبدأ بـ 5، ثم يصير 12 عند الخلية الثانية. القيمتان 9 و4 ليستا أكبر من 12."),
              { code: GET_MAX, run: nodes("Head", [5, 12, 9, 4]) + "\nConsole.Write(GetMaxValue(Head));", out: "12" }),
            XCS("Node P = GetPos(Head, 15);\nif (P != null)\n    P.SetValue(50);"),
            proved(MC("معطاة السلسلة `Head = [13,15,17]`. كيف تبدو بعد تنفيذ المقطع أعلاه؟", ["`[13,15,17]`", "*`[13,50,17]`", "`[50,15,17]`", "`[13,17]`"], "`GetPos` تعيد مؤشّرًا إلى الخلية نفسها التي في السلسلة، لا نسخة عنها. لذلك `P.SetValue(50)` يغيّر قيمة تلك الخلية."),
              { code: GET_POS, run: nodes("Head", [13, 15, 17]) + "\nNode P = GetPos(Head, 15);\nif (P != null)\n    P.SetValue(50);\nConsole.Write(Show(Head));", lib: SHOW, out: "[13,50,17]" }),
            MC("معطاة السلسلة `Head = [13,15,17]`. ماذا يحدث عند تنفيذ `Console.WriteLine(GetPos(Head, 99).GetValue());`؟", ["يُطبع 0", "يُطبع 99", "*خطأ في التشغيل: `GetPos` أعادت `null`", "يُطبع 17"], "العدد 99 غير موجود، فتعيد `GetPos` القيمة `null`، واستدعاء `GetValue()` على `null` خطأ في التشغيل. لذلك نفحص النتيجة أولًا: `if (P != null)`."),
            MC("ما درجة نجاعة العملية `GetMaxValue` لسلسلة فيها `n` خلايا؟", ["`O(1)`", "*`O(n)`", "`O(n²)`", "`O(log n)`"], "لا نعرف أكبر قيمة قبل أن نمرّ على كل الخلايا: الحلقة تدور `n - 1` مرة، وفي كل دورة عمليات نجاعتها `O(1)`."),
          ],
        },
        {
          title: "عمليات تبني سلسلة: `ToNode`",
          src: "116–117",
          keywords: ["ToNode", "بناء سلسلة من مصفوفة", "Print", "GenerateRandomChain"],
          objective: "أن تكتب عملية تبني سلسلة جديدة وتعيد مؤشّرًا إلى رأسها.",
          blocks: [
            H("كتابة عمليات تبني سلسلة وتعيد مؤشّرًا إلى رأسها", 3),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى مصفوفة أحادية من نمط صحيح. العملية تبني سلسلة جديدة وتخزّن في خلاياها نفس قيم المصفوفة وبنفس ترتيبها. العملية تعيد مؤشّرًا إلى رأس السلسلة الجديدة." }),
            CS(TO_NODE),
            P("كود لفحص هذه العملية في الـ `Main`:"),
            CS("int[] A = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };\nNode Head = ToNode(A);\nPrint(Head);"),
            CLAR("العملية `Print`", "كود الفحص يستدعي `Print(Head)`، وتعريفها ليس في الصفحات الموجودة من النسخة الممسوحة. المقصود عملية تطبع قيم السلسلة بقالب التمشيط، مثل العملية التالية:"),
            XCS(PRINT),
            TRACE({ title: "`ToNode` تبني سلسلة من المصفوفة `{2, 4, 6}`", code: TO_NODE, run: "int[] A = { 2, 4, 6 };\nNode Head = ToNode(A);\nPrint(Head);", lib: PRINT, given: "المصفوفة `A = {2, 4, 6}`، والاستدعاء `Node Head = ToNode(A);`.", description: "هذا هو مقطع بناء السلسلة بالمؤشّر `Last`، لكن القيم تأتي من المصفوفة." }),
            XNOTE("انتبه", "`ToNode` تبدأ بـ `A[0]`، فهي تفترض أنّ في المصفوفة قيمة واحدة على الأقل."),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى 3 أعداد صحيحة: `Length` و `Min` و `Max`. العملية تبني سلسلة جديدة بطول `Length` وتُدخل إليها قيمًا عشوائية من المجال `[Min,Max]` (يشمل الطرفين). ومن ثم تعيد مؤشّرًا إلى رأس السلسلة الجديدة." }),
            CS(`
              public static Node GenerateRandomChain(int Length, int Min, int Max)
              {
                  Random R = new Random();
                  Node Head = new Node(R.Next(Min, Max + 1));
                  Node Last = Head;
                  for (int i = 2; i <= Length; i++)
                  {
                      // الأمر التالي يُساعد على انشاء قيم عشوائية مُختلفة
                      System.Threading.Thread.Sleep(100);
                      Last.SetNext(new Node(R.Next(Min, Max + 1)));
                      Last = Last.GetNext();
                  }
                  return Head;
              }`),
            XP("`R.Next(Min, Max + 1)` تعيد عددًا عشوائيًا من `Min` حتى `Max`. البناء نفسه كما في `ToNode`: خلية أولى، ثم المؤشّر `Last` يضيف خلية في كل دورة. لا تتبّع لهذه العملية، لأنّ قيمها تتغيّر في كل تشغيل."),
            EX({ mode: "practice", title: "مثال للتدريب", prompt: "اكتب عملية تتلقّى مؤشّرًا `Chain` إلى بداية سلسلة ومن ثم تنشئ سلسلة جديدة فيها جميع خلايا `Chain` التي قيمها فردية. العملية تعيد مؤشّرًا إلى بداية السلسلة الجديدة. على العملية أن تعيد `null` إذا لم تجد أية أعداد فردية في السلسلة `Chain`." }),
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "حلّ هذا المثال في الصفحة 118، وهي غير موجودة في النسخة الممسوحة. الحل التالي إضافة، وليس حلّ الكتاب. حاول أن تكتب حلّك قبل أن تقرأه."),
            XCS(GET_ODDS),
            XP("الجديد هنا أنّ السلسلة الجديدة تبدأ **فارغة** (`Head = null`)، لأنّنا لا نعرف إن كنّا سنجد عددًا فرديًا. أول خلية نجدها تصير الرأس، وكل خلية بعدها تُربط بعد `Last`."),
            TRACE({ title: "`GetOdds` على السلسلة `[4,7,10,3]`", code: GET_ODDS, run: nodes("Chain", [4, 7, 10, 3]) + "\nNode Odds = GetOdds(Chain);\nConsole.WriteLine(Show(Odds));", lib: SHOW, given: "السلسلة `Chain = [4,7,10,3]`، والاستدعاء `Node Odds = GetOdds(Chain);`.", description: "راقب السلسلتين: الأصلية لا تتغيّر، والجديدة تُبنى خلية بعد خلية." }),
            XCS("int[] A = { 7, 3, 9 };\nNode Head = ToNode(A);\nConsole.Write(Head.GetNext().GetValue());"),
            proved(MC("ماذا يطبع المقطع أعلاه؟", ["7", "*3", "9", "`{7, 3, 9}`"], "`ToNode` تحافظ على ترتيب المصفوفة، فالسلسلة `[7,3,9]`. الخلية التي بعد الرأس قيمتها 3."),
              { code: TO_NODE, run: "int[] A = { 7, 3, 9 };\nNode Head = ToNode(A);\nConsole.Write(Head.GetNext().GetValue());", out: "3" }),
            ORDER("رتّب خطوات العملية `ToNode`:", ["ننشئ الخلية الأولى وفيها `A[0]`، و `Head` يشير إليها", "نجعل المؤشّر المساعد `Last` يشير إلى الرأس", "في كل دورة: ننشئ خلية فيها `A[i]` ونربطها بعد `Last`", "نقدّم `Last` إلى الخلية الجديدة", "بعد الحلقة نعيد `Head`"], "الرأس يُنشأ مرة واحدة ولا يتغيّر. المؤشّر `Last` هو الذي يتحرّك، والعملية تعيد الرأس."),
            proved(SHORT("ماذا تعيد `GetOdds(Chain)` للسلسلة `Chain = [2,8,6]`؟ اكتب `null` أو السلسلة بين قوسين.", "null", "لا توجد قيمة فردية، فلا تُنشأ أي خلية ويبقى `Head` مساويًا `null`."),
              { code: GET_ODDS, run: nodes("Chain", [2, 8, 6]) + "\nConsole.Write(GetOdds(Chain) == null ? \"null\" : \"chain\");", out: "null" }),
          ],
        },
      ],
    },
    {
      title: "حذف خلايا من السلسلة",
      pages: [
        {
          title: "حذف خلية من السلسلة",
          src: "119–120",
          keywords: ["حذف خلية", "Previous", "DeleteNode", "Garbage Collection"],
          objective: "أن تحذف خلية من سلسلة بتحويل مؤشّر الخلية السابقة لها.",
          blocks: [
            H("حذف خلايا من السلسلة", 2),
            P("والآن نتعلّم كيف نحذف خلايا من السلسلة. معطاة السلسلة `[13,15,17]`. **اكتب مقطعًا يحذف الخلية الثانية.**"),
            P("من أجل أن نحذف أية خلية من خلايا السلسلة، علينا أن نجد الخلية **السابقة** لها. الحذف هو فكّ هذه الخلية. يحصل هذا الفكّ حين نجعل الخلية السابقة (`Previous`) تؤشّر إلى الخلية التالية للخلية التي نريد حذفها. الخلية السابقة هنا هي الخلية `Head`."),
            FIG("حذف الخلية الثانية: قبل وبعد", [
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0], ["Previous", 0], ["Pos", 1]], hi: [1], label: "قبل الحذف: نريد حذف الخلية 15" },
              { kind: "chain", items: [13, 17], pointers: [["Head", 0], ["Previous", 0]], label: "الخطوة الأولى: الخلية 13 تشير إلى 17" },
              { kind: "chain", items: [15], pointers: [["Pos", 0]], label: "الخطوة الثانية: الخلية 15 تشير إلى `null`" },
            ]),
            P("في البرمجة، يحصل ذلك كالتالي:"),
            CS(DELETE_SECOND),
            TRACE({ title: "حذف الخلية الثانية من `[13,15,17]`", code: inMain(nodes("Head", [13, 15, 17]) + DELETE_SECOND), description: "مقطع الكتاب داخل `Main`. راقب الرسم بعد الخطوة الأولى: أين صارت الخلية 15؟" }),
            P("والحقيقة أنّ الخطوة الثانية لا حاجة إليها، لأنّ لغة `C#` توفّر آلية تعمل تلقائيًا لتحرير الكائنات التي لا تؤشّر إليها مؤشّرات صالحة. فقد أصبحت الخلية الثانية بلا مؤشّر يؤشّر إليها بعد أن حوّلناه في الخطوة الأولى. تُسمّى هذه الآلية `Garbage Collection` أو جمع النفايات."),
            OL([
              "إيجاد الخلية السابقة للخلية التي نريد أن نحذفها.",
              "فكّ الارتباط من جهة اليسار.",
              "فكّ الارتباط من جهة اليمين. هذه الخطوة، كما قيل سابقًا، ليست ضرورية، وإنما هي لمزيد من التوضيح فقط.",
            ], { title: "وبشكل عام، الحذف يتطلّب الخطوات التالية" }),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى مؤشّرًا إلى بداية سلسلة وعددًا صحيحًا `Num` ثم تبحث عن `Num` في السلسلة وتحذف الخلية الأولى التي تحويه، إن وجدته، وتعيد `true`. خلاف ذلك تعيد العملية `false`. افترض أنّ `Num` غير موجود في الخلية الأولى.", steps: ["مهمة الحلقة: إيجاد مؤشّر إلى الخلية السابقة للخلية التي نريد أن نحذفها (`Previous`)، وإيجاد مؤشّر إلى الخلية التي نريد أن نحذفها (`PosToDelete`)."] }),
            CS(DELETE_NODE("false")),
            CLAR("خطأ مطبعي في الكتاب", "السطر الأخير مطبوع في الكتاب `return false;`، مع أنّ نصّ المثال يقول إنّ العملية تعيد `true` حين تجد `Num` وتحذف خليته. الصحيح `return true;`. التتبّع التالي يستعمل الصيغة الصحيحة."),
            TRACE({ title: "`DeleteNode` تحذف 17 من `[13,15,17,19]` (بعد التصحيح)", code: DELETE_NODE("true"), run: nodes("Head", [13, 15, 17, 19]) + "\nConsole.WriteLine(DeleteNode(Head, 17));\nConsole.WriteLine(Show(Head));", lib: SHOW, given: "السلسلة `Head = [13,15,17,19]`، والاستدعاء `DeleteNode(Head, 17)`.", description: "الحلقة تتوقّف حين يكون `Pos` على الخلية **السابقة** للخلية المطلوبة." }),
            XNOTE("لماذا «`Num` غير موجود في الخلية الأولى»؟", "للخلية الأولى لا توجد خلية سابقة. حذفها يعني أن يتغيّر الرأس نفسه: `Head = Head.GetNext();`. والعملية `DeleteNode` لا تستطيع أن تغيّر المتغيّر `Head` الموجود عند من استدعاها."),
            LAB("chain", { values: [13, 15, 17, 19], name: "Head", title: "جرّب: احذف خلية", description: "اضغط على الخلية **السابقة** للخلية التي تريد حذفها فيشير إليها `p`، ثم اضغط «احذف التي بعد p». المؤشّر `p` يقوم هنا بدور `Previous`." }),
            XCS("Head.SetNext(Head.GetNext().GetNext());"),
            proved(MC("معطاة السلسلة `Head = [4,8,6,1]`. كيف تبدو بعد تنفيذ الأمر أعلاه؟", ["`[8,6,1]`", "*`[4,6,1]`", "`[4,8,1]`", "`[4,8,6]`"], "`Head.GetNext().GetNext()` هي الخلية 6. الرأس صار يشير إليها مباشرة، فخرجت الخلية 8 من السلسلة."),
              { code: inMain(nodes("Head", [4, 8, 6, 1]) + "\nHead.SetNext(Head.GetNext().GetNext());\nConsole.Write(Show(Head));"), lib: SHOW, out: "[4,6,1]" }),
            proved(TF("بالصيغة المطبوعة في الكتاب، الاستدعاء `DeleteNode(Head, 17)` للسلسلة `[13,15,17,19]` يحذف الخلية 17 لكنه يعيد `false`.", true, "الحذف يتمّ قبل السطر الأخير، فتصير السلسلة `[13,15,19]`. لكن السطر الأخير المطبوع `return false;` يجعل العملية تعيد `false` حتى حين تنجح."),
              { code: DELETE_NODE("false"), run: nodes("Head", [13, 15, 17, 19]) + "\nConsole.Write(DeleteNode(Head, 17) ? \"true\" : \"false\");\nConsole.Write(\" \" + Show(Head));", lib: SHOW, out: "false [13,15,19]" }),
            ORDER("رتّب خطوات حذف خلية من وسط السلسلة:", ["نمشّط السلسلة حتى نصل إلى الخلية السابقة `Previous`", "نحفظ مؤشّرًا إلى الخلية التي نريد حذفها", "نجعل `Previous` تشير إلى الخلية التي بعد المحذوفة", "نجعل الخلية المحذوفة تشير إلى `null` (خطوة غير ضرورية)"], "المهم هو إيجاد الخلية السابقة: هي التي يتغيّر مؤشّرها."),
            MC("بعد الخطوة الأولى من الحذف، ماذا يحدث للخلية التي لم يعد يشير إليها أي مؤشّر؟", ["تبقى في السلسلة لكنها مخفيّة", "يجب أن نحذفها نحن بأمر خاص", "*تحرّرها لغة `C#` تلقائيًا (`Garbage Collection`)", "تنتقل إلى نهاية السلسلة"], "آلية جمع النفايات تحرّر تلقائيًا كل كائن لا يشير إليه مؤشّر صالح."),
          ],
        },
      ],
    },
    {
      title: "الفئة العامة `Node<T>`",
      pages: [
        {
          title: "الفئة العامة `Node<T>`",
          src: "126–127",
          keywords: ["Node<T>", "فئة عامة", "Generic", "Node<Point>", "GetFarMostPoint"],
          objective: "أن تعرّف سلسلة خلايا من أي نمط، وأن تمشّط سلسلة كائنات.",
          blocks: [
            XH("الفئة العامة `Node<T>`", 2),
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "الصفحات 121–125 غير موجودة في النسخة الممسوحة، وفيها بداية هذا القسم وجدول واجهة الفئة `Node<T>`. الشرح والجدول التاليان إضافة، مبنيّة على جدول الفئة `Node` من الكتاب (ص 107) وعلى استعمال الكتاب للفئة `Node<T>` في الصفحات التي تليها."),
            XP("الفئة `Node` تخزّن أعدادًا صحيحة فقط. لو أردنا سلسلة نصوص أو سلسلة نقاط لاحتجنا إلى كتابة فئة جديدة لكل نمط. الحل هو __الفئة العامة__ `Node<T>`: الحرف `T` بارامتر نكتب مكانه النمط الذي نريد تخزينه."),
            ADDED(API("Node<T>", [
              ["private T Value;", "القيمة أو المعلومة المخزّنة في الخلية، من النمط `T`."],
              ["private Node<T> Next;", "مؤشّر إلى الخلية التالية."],
              ["public Node(T Value)", "عملية بنائية تنشئ خلية فيها القيمة، والمؤشّر `Next` يؤشّر إلى `null`."],
              ["public Node(T Value, Node<T> Next)", "عملية بنائية تنشئ خلية فيها القيمة، والمؤشّر `Next` يؤشّر إلى المؤشّر المُمرَّر كبارامتر."],
              ["public T GetValue()", "تعيد القيمة المخزّنة في الخلية."],
              ["public void SetValue(T Value)", "تغيّر القيمة المخزّنة في الخلية."],
              ["public Node<T> GetNext()", "تعيد المؤشّر إلى الخلية التالية."],
              ["public void SetNext(Node<T> Next)", "تجعل الخلية تشير إلى خلية أخرى."],
              ["public bool HasNext()", "تعيد `true` إذا كانت بعد الخلية خلية. خلاف ذلك تعيد `false`."],
              ["public override string ToString()", "تعيد القيمة كنصّ."],
            ], { caption: "واجهة الفئة `Node<T>` (إضافة: الجدول الأصلي في صفحة ناقصة)" })),
            XCS("Node<int> Head1 = new Node<int>(13);\nNode<string> Head2 = new Node<string>(\"abc\");"),
            XP("`Head1` رأس سلسلة أعداد صحيحة، و `Head2` رأس سلسلة نصوص. كل ما تعلّمناه عن `Node` يبقى كما هو: نكتب `Node<int>` مكان `Node`. ويمكن أن يكون النمط فئة كتبناها نحن، كما في مثال الكتاب:"),
            CS("Point p = new Point();\nNode<Point> Head3 = new Node<Point>(p);"),
            P("هذه المرة كتبنا بدلًا من البارامتر `T` نمطًا معروفًا وهو `Point`. كان بإمكاننا طبعًا كتابة نفس الأمر كالتالي:"),
            CS("Node<Point> Head3 = new Node<Point>(new Point());"),
            EX({ title: "مثال", prompt: "اكتب عملية تتلقّى مؤشّرًا إلى رأس سلسلة خلايا من نمط `Node<Point>`، أي أنّ كل خلية تُحفظ فيها نقطة من نمط `Point`، ومؤشّرًا إلى نقطة ما `p`. العملية تعيد النقطة الأبعد عن `p`.", steps: ["لاحظ أنّ `Pos.GetValue` تعيد مؤشّرًا إلى `Point`.", "لاحظ أننا استعملنا هنا قالب التمشيط الذي شرحناه سابقًا."] }),
            CS(GET_FAR),
            P("**كود لفحص العملية:**"),
            CS("Node<Point> Head = new Node<Point>(new Point(1, 1));\nNode<Point> Last = Head;\nfor (int i = 2; i <= 5; i++)\n{\n    Last.SetNext(new Node<Point>(new Point(i, i)));\n    Last = Last.GetNext();\n}\nConsole.WriteLine(GetFarMostPoint(Head, new Point()).ToString());"),
            CLAR("الفئة `Point`", "تعريف الفئة `Point` ليس في الصفحات الموجودة من النسخة الممسوحة. من استعمال الكتاب لها نعرف أنّ فيها: عملية بنائية بلا بارامترات، وعملية بنائية تتلقّى `x` و `y`، والعملية `Distance` التي تعيد البعد عن نقطة أخرى، و `ToString`. للتتبّع كتبنا الفئة هكذا (النقطة بلا بارامترات هي `(0,0)`):"),
            XCS(POINT),
            TRACE({
              title: "`GetFarMostPoint`: أبعد نقطة عن `(0,0)`", code: GET_FAR, lib: POINT, quiet: ["Distance"],
              run: "Node<Point> Head = new Node<Point>(new Point(3, 4), new Node<Point>(new Point(6, 8), new Node<Point>(new Point(0, 1))));\nPoint Far = GetFarMostPoint(Head, new Point());\nConsole.WriteLine(Far.ToString());",
              given: "سلسلة النقاط `(3,4)` ثم `(6,8)` ثم `(0,1)`، والاستدعاء `GetFarMostPoint(Head, new Point())`.",
              description: "هذه `GetMaxValue` نفسها، لكن ما نقارنه هو البعد عن `p`. أبعاد النقاط الثلاث عن `(0,0)`: 5 ثم 10 ثم 1.",
            }),
            MATCH("صِل كل سلسلة بتعريف رأسها:", [["سلسلة أعداد صحيحة", "`Node<int> Head`"], ["سلسلة نصوص", "`Node<string> Head`"], ["سلسلة رموز", "`Node<char> Head`"], ["سلسلة نقاط", "`Node<Point> Head`"]], "نكتب بين القوسين `< >` نمط القيمة التي تخزّنها كل خلية."),
            XCS("Node<string> Head = new Node<string>(\"ab\", new Node<string>(\"cd\"));\nConsole.Write(Head.GetValue() + Head.GetNext().GetValue());"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟", "abcd", "قيمة الخلية الأولى النصّ `\"ab\"` وقيمة الثانية `\"cd\"`. جمع نصّين يلصقهما: `abcd`."),
              { code: inMain("Node<string> Head = new Node<string>(\"ab\", new Node<string>(\"cd\"));\nConsole.Write(Head.GetValue() + Head.GetNext().GetValue());"), out: "abcd" }),
            MC("في سلسلة من نمط `Node<Point>`، ما نمط القيمة التي تعيدها `Pos.GetValue()`؟", ["`int`", "`Node<Point>`", "*`Point`", "`double`"], "`GetValue` تعيد قيمة من النمط `T`، وهنا `T` هو `Point`. لذلك يمكن أن نكتب بعدها مباشرة عملية من الفئة `Point`: `Pos.GetValue().Distance(p)`."),
          ],
        },
        {
          title: "آخر خلية والإضافة في النهاية: `GetLastPos` و `Append`",
          src: "127–129",
          keywords: ["GetLastPos", "Append", "GetPrevious", "Node<int>"],
          objective: "أن تجد آخر خلية في السلسلة والخلية السابقة لخلية، وأن تضيف خلية في النهاية.",
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مؤشّرًا إلى رأس سلسلة خلايا من نمط `Node<int>`. العملية تعيد مؤشّرًا إلى الخلية الأخيرة في السلسلة.", steps: ["الفكرة الأساسية: نقدّم المؤشّر طالما لم نصل إلى الخلية التي لا تؤشّر إلى خلية تالية، أي التي قيمة المؤشّر `Next` التابع لها `null`."] }),
            CS(GET_LAST_POS),
            TRACE({ title: "`GetLastPos` على السلسلة `[2,4,6]`", code: GET_LAST_POS, run: chain("Head", [2, 4, 6]) + "\nConsole.WriteLine(GetLastPos(Head).ToString());", given: "السلسلة `Head = [2,4,6]`، والاستدعاء `GetLastPos(Head)`.", description: "قارن مع قالب التمشيط: هناك تنتهي الحلقة و `Pos` يساوي `null`، وهنا تنتهي والمؤشّر **على** الخلية الأخيرة." }),
            P("**كود لفحص العملية:**"),
            CS("int[] A = { 2, 4, 6, 8, 10 };\nNode<int> Head = ToNode(A);\nPrint(Head);\nConsole.WriteLine(GetLastPos(Head).ToString());"),
            P("سبق أن كتبنا العملية `ToNode`، لكن ليس باستعمال الفئة العامة `Node<int>`:"),
            CS(TO_NODE_T),
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مؤشّرًا إلى رأس سلسلة خلايا من نمط `Node<int>` وعددًا صحيحًا `N`. العملية تضيف إلى نهاية السلسلة خلية جديدة فيها العدد `N`." }),
            CS(APPEND),
            TRACE({ title: "`Append` تضيف 8 إلى نهاية `[2,4,6]`", code: APPEND, lib: [GET_LAST_POS, SHOW_T], quiet: ["GetLastPos"], run: chain("Head", [2, 4, 6]) + "\nAppend(Head, 8);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [2,4,6]`، والاستدعاء `Append(Head, 8)`." }),
            XNOTE("انتبه", "`Append` تفترض أنّ السلسلة غير فارغة: للسلسلة الفارغة تعيد `GetLastPos` القيمة `null`، واستدعاء `Last.SetNext` خطأ في التشغيل. ونجاعتها `O(n)`، لأنّها تمشّط السلسلة كلها لتصل إلى آخرها."),
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مؤشّرًا `Head` إلى رأس سلسلة خلايا من نمط `Node<int>` ومؤشّرًا `Pos` إلى خلية من خلايا السلسلة. العملية تعيد مؤشّرًا إلى الخلية السابقة للخلية `Pos`." }),
            CS(GET_PREVIOUS),
            FIG("الخلية السابقة للخلية الأخيرة", [{ kind: "chain", items: [2, 4, 6, 8, 10], pointers: [["Head", 0], ["Previous", 3], ["Last", 4]], hi: [3], label: "`GetPrevious(Head, Last)` تعيد الخلية 8" }]),
            P("**كود لفحص العملية:**"),
            CS("int[] A = { 2, 4, 6, 8, 10 };\nNode<int> Head = ToNode(A);\nPrint(Head);\nNode<int> Last = GetLastPos(Head);\nNode<int> Previous = GetPrevious(Head, Last);\nif (Previous.GetValue() != 8)\n    Console.WriteLine(\"GetPrevious() failed\");\nelse\n    Console.WriteLine(\"GetPrevious() succeeded\");"),
            XP("`Print` في كود الفحص هي عملية الطباعة التي عرفناها، لكنها تتلقّى هنا `Node<int>`."),
            proved(MC("ماذا يطبع السطر الأخير من كود فحص `GetPrevious`؟", ["*`GetPrevious() succeeded`", "`GetPrevious() failed`", "8", "خطأ في التشغيل"], "آخر خلية قيمتها 10، والخلية السابقة لها قيمتها 8. الشرط `Previous.GetValue() != 8` غير صحيح، فننتقل إلى `else`."),
              { code: GET_PREVIOUS, lib: [GET_LAST_POS, TO_NODE_T], run: "int[] A = { 2, 4, 6, 8, 10 };\nNode<int> Head = ToNode(A);\nNode<int> Last = GetLastPos(Head);\nNode<int> Previous = GetPrevious(Head, Last);\nif (Previous.GetValue() != 8)\n    Console.WriteLine(\"GetPrevious() failed\");\nelse\n    Console.WriteLine(\"GetPrevious() succeeded\");", out: "GetPrevious() succeeded\n" }),
            proved(MC("ماذا تعيد `GetPrevious(Head, Head)`، أي حين يكون `Pos` هو الرأس نفسه؟", ["مؤشّرًا إلى الرأس", "مؤشّرًا إلى الخلية الأخيرة", "*`null`: لا خلية قبل الرأس", "خطأ في التشغيل"], "لا توجد خلية مؤشّرها `Next` يشير إلى الرأس. المؤشّر `Previous` يتقدّم حتى يصير `null`، فتنتهي الحلقة وتُعاد `null`."),
              { code: GET_PREVIOUS, run: chain("Head", [2, 4, 6]) + "\nConsole.Write(GetPrevious(Head, Head) == null ? \"null\" : \"cell\");", out: "null" }),
            XCS("Append(Head, 8);\nAppend(Head, 1);"),
            proved(MC("معطاة السلسلة `Head = [2,4]`. كيف تبدو بعد تنفيذ الأمرين أعلاه؟", ["`[1,8,2,4]`", "`[8,1,2,4]`", "*`[2,4,8,1]`", "`[2,4,1,8]`"], "كل استدعاء يضيف خلية بعد الخلية الأخيرة: أولًا 8، ثم 1 بعد 8."),
              { code: APPEND, lib: [GET_LAST_POS, SHOW_T], run: chain("Head", [2, 4]) + "\nAppend(Head, 8);\nAppend(Head, 1);\nConsole.Write(Show(Head));", out: "[2,4,8,1]" }),
          ],
        },
        {
          title: "إدخال خلية بعد خلية: `AddAfter`",
          src: "129–131",
          keywords: ["AddAfter", "إدخال خلية", "MathExpression", "سلسلة كائنات"],
          objective: "أن تُدخل خلية جديدة بعد خلية معيّنة دون أن تضيع بقية السلسلة.",
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مؤشّرًا `Head` إلى رأس سلسلة خلايا من نمط `Node<int>`، ومؤشّرًا `Pos` إلى خلية من خلايا السلسلة، وعددًا صحيحًا `N`. العملية تنشئ خلية جديدة بعد الخلية `Pos` وتخزّن فيها العدد `N`." }),
            CS(ADD_AFTER),
            P("لاحظ أننا استعملنا العملية البنائية الثانية من الفئة `Node<T>` التي تتلقّى القيمة ومؤشّرًا إلى الخلية التالية. وبهذا نكون قد ربطنا الخلية الجديدة من جهة اليمين. ثم نجعل الخلية الجديدة هي الخلية التالية للخلية `Pos`."),
            FIG("إدخال 3 بعد الخلية `Pos`: قبل وبعد", [
              { kind: "chain", items: [2, 4, 6], pointers: [["Head", 0], ["Pos", 0]], label: "قبل: `Pos` يشير إلى الخلية 2" },
              { kind: "chain", items: [2, 3, 4, 6], pointers: [["Head", 0], ["Pos", 0], ["NewNode", 1]], hi: [1], label: "بعد: الخلية الجديدة 3 بين 2 و4" },
            ]),
            P("**كود لفحص العملية:** المقطع التالي يضيف العدد 3 بعد الرأس مباشرة."),
            CS("int[] A = { 2, 4, 6, 8, 10 };\nNode<int> Head = ToNode(A);\nPrint(Head);\nAddAfter(Head, Head, 3);\nPrint(Head);"),
            TRACE({ title: "`AddAfter` تُدخل 3 بعد رأس `[2,4,6]`", code: ADD_AFTER, lib: SHOW_T, run: chain("Head", [2, 4, 6]) + "\nAddAfter(Head, Head, 3);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [2,4,6]`، والاستدعاء `AddAfter(Head, Head, 3)`.", description: "السطر الأول يربط الخلية الجديدة بما بعد `Pos`. السطر الثاني يربط `Pos` بها." }),
            XNOTE("الترتيب مهم", "نربط الخلية الجديدة بما بعد `Pos` **أولًا**، ثم نجعل `Pos` تشير إليها. لو بدأنا بـ `Pos.SetNext(NewNode)` لفقدنا المؤشّر الوحيد إلى بقية السلسلة."),
            LAB("chain", { values: [2, 4, 6], name: "Head", title: "جرّب: أدخِل خلية", description: "اضغط على خلية فيشير إليها `p`، اكتب قيمة، ثم اضغط «أدخِل بعد p». راقب في «الأوامر التي نفّذتها» الأمر المقابل بلغة `C#`." }),
            H("سلسلة كائنات: تعابير حسابية", 3),
            P("الفئة `MathExpression` تعرّف النمط «**تعبير حسابي بسيط**». التعبير الحسابي مكوّن من ثلاثة أجزاء: عددين صحيحين أكبر من 0 ورمز واحد من بين الرموز الأربعة (`+`، `-`، `*`، `/`) للعملية الحسابية."),
            API("MathExpression", [
              ["private int N1, N2;", "العددان."],
              ["private char Op;", "العملية الحسابية."],
              ["public MathExpression(int N1, char Op, int N2)", "عملية بنائية."],
              ["public int Calculate()", "عملية تنفّذ العملية الحسابية `Op` على العددين `N1` و `N2` وتعيد النتيجة."],
            ], { caption: "واجهة الفئة `MathExpression`" }),
            EX({ title: "مثال", prompt: "اكتب عملية خارجية تتلقّى مؤشّرًا إلى سلسلة تعابير حسابية ومن ثم تحسب وتعيد مجموع القيم النهائية لكل التعابير الموجودة في السلسلة.", steps: ["لاحظ أنّ `Pos.GetValue` تعيد مؤشّرًا إلى `MathExpression`."] }),
            CS(SUM_EXPRESSIONS("Calcluate")),
            CLAR("خطأ مطبعي في الكتاب", "في كود الكتاب كُتب اسم العملية `Calcluate()`، وفي جدول الفئة `Calculate()`. الاسم الصحيح `Calculate`، وبه فُحص السؤال الذي بعد كود الفحص."),
            P("**كود لفحص العملية:**"),
            CS(`
              MathExpression[] A = { new MathExpression(2, '+', 3),
                                     new MathExpression(4, '-', 1),
                                     new MathExpression(7, '*', 5),
                                     new MathExpression(4, '/', 2)};
              Node<MathExpression> Chain = new Node<MathExpression>(A[0]);
              Node<MathExpression> Last = Chain;
              for (int i = 1; i < A.Length; i++)
              {
                  Last.SetNext(new Node<MathExpression>(A[i]));
                  Last = Last.GetNext();
              }
              Console.WriteLine("Sum of all expressions = {0}", SumOfAllExpressions(Chain));`),
            proved(SHORT("ما القيمة التي تعيدها `SumOfAllExpressions(Chain)` في كود الفحص أعلاه؟", "45", "قيم التعابير: `2 + 3 = 5` و `4 - 1 = 3` و `7 * 5 = 35` و `4 / 2 = 2`. المجموع `5 + 3 + 35 + 2 = 45`."),
              { code: SUM_EXPRESSIONS("Calculate"), lib: MATH_EXPRESSION, run: "Node<MathExpression> Chain = new Node<MathExpression>(new MathExpression(2, '+', 3), new Node<MathExpression>(new MathExpression(4, '-', 1), new Node<MathExpression>(new MathExpression(7, '*', 5), new Node<MathExpression>(new MathExpression(4, '/', 2)))));\nConsole.Write(SumOfAllExpressions(Chain));", out: "45" }),
            XCS("AddAfter(Head, Head.GetNext(), 5);"),
            proved(MC("معطاة السلسلة `Head = [2,4,6]`. كيف تبدو بعد تنفيذ الأمر أعلاه؟", ["`[2,5,4,6]`", "*`[2,4,5,6]`", "`[5,2,4,6]`", "`[2,4,6,5]`"], "`Head.GetNext()` هي الخلية 4، والخلية الجديدة تدخل **بعدها**."),
              { code: ADD_AFTER, lib: SHOW_T, run: chain("Head", [2, 4, 6]) + "\nAddAfter(Head, Head.GetNext(), 5);\nConsole.Write(Show(Head));", out: "[2,4,5,6]" }),
            XCS("Node<int> NewNode = new Node<int>(3);\nPos.SetNext(NewNode);\nNewNode.SetNext(Pos.GetNext());"),
            proved(MC("طالب كتب الإدخال بالترتيب أعلاه. ما النتيجة؟", ["الإدخال صحيح كما في `AddAfter`", "*الخلية الجديدة تشير إلى نفسها، وبقية السلسلة تضيع", "الخلية الجديدة تدخل قبل `Pos`", "خطأ في الترجمة"], "بعد السطر الثاني صارت `Pos.GetNext()` هي الخلية الجديدة نفسها. فالسطر الثالث يجعلها تشير إلى نفسها، ولا مؤشّر يوصل إلى الخلايا التي كانت بعد `Pos`."),
              { code: inMain(chain("Head", [2, 4, 6]) + "\nNode<int> Pos = Head;\nNode<int> NewNode = new Node<int>(3);\nPos.SetNext(NewNode);\nNewNode.SetNext(Pos.GetNext());\nConsole.Write(NewNode.GetNext() == NewNode ? \"self\" : \"ok\");"), out: "self", loose: true }),
            MC("ما درجة نجاعة العملية `AddAfter` لسلسلة فيها `n` خلايا؟", ["*`O(1)`: أمران فقط، بلا تمشيط", "`O(n)`: يجب تمشيط السلسلة", "`O(n²)`", "تتعلّق بمكان `Pos`"], "العملية تتلقّى المؤشّر `Pos` جاهزًا، فتنشئ خلية وتغيّر مؤشّرًا واحدًا. لا تتحرّك أي خلية ولا حاجة إلى تمشيط."),
          ],
        },
      ],
    },
    {
      title: "المبنى التراجعي للسلسلة",
      pages: [
        {
          title: "المبنى التراجعي لسلسلة الخلايا",
          src: "132–133",
          keywords: ["تراجعية", "شرط التوقّف", "GetLength", "GetSum", "GetPos"],
          objective: "أن تكتب عملية تراجعية على سلسلة: شرط توقّف للسلسلة الفارغة، ثم خلية وبقية السلسلة.",
          blocks: [
            H("المبنى التراجعي لسلسلة الخلايا المترابطة", 2),
            P("قلنا سابقًا إنّ المبنى التراجعي هو مبنى كل جزء منه يشبه الكل. وواضح أنّ كل جزء من سلسلة خلايا مترابطة هو أيضًا سلسلة خلايا مترابطة. ولمزيد من الدقة بإمكاننا تعريف السلسلة بشكل تراجعي على النحو التالي:"),
            LIST(["إذا كانت السلسلة فارغة، فهي سلسلة خلايا مترابطة.", "خلاف ذلك السلسلة هي: خلية ومؤشّر إلى سلسلة خلايا مترابطة."]),
            FIG("كل جزء من السلسلة هو سلسلة", [
              { kind: "chain", items: [13, 15, 17], pointers: [["Head", 0]], hi: [0], label: "خلية (13) ومؤشّر إلى سلسلة" },
              { kind: "chain", items: [15, 17], hi: [0], label: "`Head.GetNext()`: سلسلة أقصر بخلية" },
              { kind: "chain", items: [17], hi: [0], label: "سلسلة من خلية واحدة، وبعدها سلسلة فارغة" },
            ]),
            P("ولنكتب الآن بعضًا من العمليات التراجعية التي تعمل على سلسلة خلايا مترابطة."),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى مؤشّرًا إلى سلسلة خلايا مترابطة من نمط `Node<int>` ومن ثم تعيد طول السلسلة، أي عدد خلاياها.", steps: ["شرط التوقّف: أن تكون (أو تصبح) السلسلة فارغة، وحينها نعيد 0.", "خلاف ذلك لدينا خلية + طول السلسلة المتبقّية بعد هذه الخلية."] }),
            CS(GET_LENGTH),
            TRACE({ title: "`GetLength` التراجعية على `[13,15,17]`", code: GET_LENGTH, run: chain("Head", [13, 15, 17]) + "\nConsole.WriteLine(GetLength(Head));", given: "السلسلة `Head = [13,15,17]`، والاستدعاء `GetLength(Head)`.", description: "في كل استدعاء يشير `Head` إلى خلية أبعد، حتى يصير `null`. ثم تعود الاستدعاءات واحدًا واحدًا وكل واحد يضيف 1." }),
            EX({ title: "مثال", prompt: "بشكل شبيه، اكتب عملية تراجعية تتلقّى مؤشّرًا إلى سلسلة خلايا مترابطة من نمط `Node<int>` ومن ثم تعيد مجموع القيم المخزّنة في الخلايا." }),
            CS(GET_SUM),
            GUIDED({
              title: "نحلّ معًا: `GetSum` للسلسلة `[4,6,10]`",
              prompt: "تتبّع الاستدعاء `GetSum(Head)` للسلسلة `[4,6,10]`. ماذا يعيد كل استدعاء؟",
              steps: [
                "الاستدعاء الأول: `Head` على الخلية 4. ليست `null`، فالنتيجة `4 + GetSum(...)` لبقية السلسلة `[6,10]`.",
                "الاستدعاء الثاني: `Head` على الخلية 6. النتيجة `6 + GetSum(...)` لبقية السلسلة `[10]`.",
                "الاستدعاء الثالث: `Head` على الخلية 10. النتيجة `10 + GetSum(null)`.",
                "الاستدعاء الرابع: `Head` يساوي `null`. هذا شرط التوقّف: يُعاد 0.",
                "نعود إلى الوراء: الثالث يعيد `10 + 0 = 10`، الثاني يعيد `6 + 10 = 16`، والأول يعيد `4 + 16 = 20`.",
              ],
              result: "`GetSum(Head)` تعيد `20`.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى مؤشّرًا إلى سلسلة خلايا مترابطة من نمط `Node<int>` وعددًا صحيحًا `N`. العملية تبحث عن `N` في السلسلة ومن ثم تعيد مؤشّرًا إلى الخلية التي تحويه إذا وجدته. خلاف ذلك تعيد `null`.", steps: ["شرط التوقّف الأول: أن تكون (أو تصبح) السلسلة فارغة، وحينها نعيد `null`.", "شرط التوقّف الثاني: إذا وجدنا `N` في الخلية الحالية، نعيد المؤشّر إليها.", "خلاف ذلك نبحث في السلسلة المتبقّية بعد هذه الخلية."] }),
            CS(GET_POS_REC),
            TRACE({ title: "`GetPos` التراجعية تبحث عن 15 في `[13,15,17]`", code: GET_POS_REC, run: chain("Head", [13, 15, 17]) + "\nNode<int> Found = GetPos(Head, 15);\nConsole.WriteLine(Found.GetValue());", given: "السلسلة `Head = [13,15,17]`، والاستدعاء `GetPos(Head, 15)`.", description: "حين نجد العدد لا نكمل إلى نهاية السلسلة: المؤشّر يُعاد من استدعاء إلى الذي قبله." }),
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "الصفحات 134–138 غير موجودة في النسخة الممسوحة، وفيها تتمّة هذا القسم وقسم «سلاسل خلايا مترابطة باتجاهين». هذه الوحدة لا تتناول السلاسل باتجاهين."),
            proved(SHORT("ما القيمة التي تعيدها `GetSum(Head)` للسلسلة `Head = [3,8,1,5]`؟", "17", "`3 + 8 + 1 + 5 = 17`. كل استدعاء يضيف قيمة خليته إلى مجموع بقية السلسلة."),
              { code: GET_SUM, run: chain("Head", [3, 8, 1, 5]) + "\nConsole.Write(GetSum(Head));", out: "17" }),
            provedCount(SHORT("كم مرة تُستدعى `GetLength` (مع الاستدعاء الأول) للسلسلة `[13,15,17]`؟", "4", "استدعاء لكل خلية (3 استدعاءات)، واستدعاء أخير يكون فيه `Head` مساويًا `null` ويعيد 0."),
              { code: GET_LENGTH, run: chain("Head", [13, 15, 17]) + "\nConsole.Write(GetLength(Head));" }, "if (Head == null)", 4),
            MC("ماذا يحدث لو حذفنا من `GetLength` السطرين `if (Head == null)` و `return 0;`؟", ["تعيد العملية طولًا أكبر بواحد", "*خطأ في التشغيل: عند نهاية السلسلة نستدعي `GetNext()` على `null`", "تعيد العملية 0 دائمًا", "لا يتغيّر شيء"], "بلا شرط التوقّف تستمرّ الاستدعاءات بعد الخلية الأخيرة: `Head` يساوي `null`، واستدعاء `Head.GetNext()` خطأ في التشغيل."),
          ],
        },
      ],
    },
    {
      title: "أسئلة وتمارين",
      pages: [
        {
          title: "أسئلة تتبّع محلولة",
          keywords: ["تتبّع", "أسئلة محلولة", "What", "تمشيط", "تراجعية"],
          blocks: [
            XP("خمسة أسئلة تتبّع محلولة، مرتّبة من الأسهل إلى الأصعب. اقرأ العملية وتتبّعها **بدون** الحاسوب، ثم قارن جوابك بالحل، وافتح التتبّع لترى السلسلة والمؤشّرات خطوة بخطوة. في تمارين الكتاب تُسمّى السلسلة أحيانًا «قائمة»، والمقصود واحد."),
            QH(1, "سهل", "`Secret`"),
            XCS(SECRET),
            FIG("السلسلة المعطاة في السؤال 1", [{ kind: "chain", items: [2, 7, 10, 1], pointers: [["Head", 0]] }]),
            XP("**السؤال:** ماذا تعيد `Secret(Head)` للسلسلة `[2,7,10,1]`؟ وما مهمة العملية؟"),
            XEX({ title: "الحل", steps: [
              "`s` يبدأ من 0، والمؤشّر `Pos` يمرّ على الخلايا واحدة واحدة (قالب التمشيط).",
              "الخلية 2 زوجية: تُضاف قيمتها، فيصير `s` مساويًا 2. الخلية 7 فردية: تُطرح قيمتها، فيصير `s` مساويًا `-5`.",
              "الخلية 10 زوجية: يصير `s` مساويًا 5. الخلية 1 فردية: يصير `s` مساويًا 4.",
              "المهمة: العملية تعيد مجموع القيم الزوجية ناقص مجموع القيم الفردية.",
            ], result: "تعيد العملية `4`." }),
            TRACE({ title: "تتبّع الحل: `Secret`", code: SECRET, run: chain("Head", [2, 7, 10, 1]) + "\nConsole.WriteLine(Secret(Head));", given: "السلسلة `Head = [2,7,10,1]`، والاستدعاء `Secret(Head)`." }),
            QH(2, "سهل", "`What` — سؤال 1 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 1 من الكتاب (ص 139)", prompt: "معطاة العملية `What`. (1) تتبّع تنفيذ العملية `What` للقائمة `[2,4,2,7,5,2]` وحدّد ماذا تعيد. (2) ماذا ستعيد العملية إذا كان طول القائمة 1؟ (3) ما مهمة العملية `What`؟ (4) حدّد درجة نجاعة العملية `What`. اشرح." }),
            XCS(WHAT),
            FIG("القائمة المعطاة في السؤال 2", [{ kind: "chain", items: [2, 4, 2, 7, 5, 2], pointers: [["Head", 0]] }]),
            XEX({ title: "الحل", steps: [
              "البند 1: المتغيّر `f` يحفظ قيمة الخلية الأولى، وهي 2. الحلقة تقدّم `Pos` حتى الخلية الأخيرة، وقيمتها 2 أيضًا. القيمتان متساويتان، فتُعاد `true`.",
              "البند 2: في قائمة طولها 1 الخلية الأولى هي الأخيرة أيضًا. الحلقة لا تدور، فتُعاد `true`.",
              "البند 3: العملية تفحص إن كانت قيمة الخلية الأولى تساوي قيمة الخلية الأخيرة. لا تنظر إلى القيم التي في الوسط، وللقائمة الفارغة تعيد `false`.",
              "البند 4: لنصل إلى الخلية الأخيرة نمرّ على كل الخلايا. الحلقة تدور `n - 1` مرة، فدرجة النجاعة `O(n)`.",
            ], result: "للقائمة `[2,4,2,7,5,2]` تعيد العملية `true`." }),
            TRACE({ title: "تتبّع الحل: `What`", code: WHAT, run: chain("Head", [2, 4, 2, 7, 5, 2]) + "\nConsole.WriteLine(What(Head));", given: "القائمة `Head = [2,4,2,7,5,2]`، والاستدعاء `What(Head)`." }),
            QH(3, "متوسط", "`What1` — سؤال 2 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 2 من الكتاب (ص 140)", prompt: "العملية `What` تتلقّى قائمة أعداد صحيحة طولها زوجي وأكبر من 0، وعددًا صحيحًا `s`. (1) تتبّع تنفيذ الاستدعاء `What(Head, 5)` للقائمة `[2,3,0,5,1,4]` وحدّد ماذا يُعاد. (2) ما مهمة العملية `What`؟ (3) حدّد درجة نجاعة العملية `What`. اشرح." }),
            XCS(WHAT1),
            CLAR("في الكتاب", "نصّ السؤال يسمّي العملية `What`، واسمها في الكود `What1`. المقصود العملية نفسها، والاستدعاء في البند الأول هو `What1(Head, 5)`."),
            XEX({ title: "الحل", steps: [
              "في كل دورة تُقرأ خليتان متتاليتان، `a` ثم `b`، وبعدها يتقدّم `Pos` خليتين.",
              "البند 1: الأزواج هي `2 + 3 = 5` ثم `0 + 5 = 5` ثم `1 + 4 = 5`. لم يختلف أي مجموع عن `s`، فتنتهي الحلقة وتُعاد `true`.",
              "البند 2: العملية تفحص إن كان مجموع كل زوج متتالٍ (الأولى والثانية، الثالثة والرابعة، وهكذا) يساوي `s`. أول زوج يخالف يُنهي العملية بالقيمة `false`.",
              "البند 3: الحلقة تدور نصف عدد الخلايا على الأكثر، فدرجة النجاعة `O(n)`.",
              "لماذا «طولها زوجي»؟ في قائمة طولها فردي تبقى في النهاية خلية بلا زوج: `Pos.GetNext()` تساوي `null`، واستدعاء `GetValue()` عليها خطأ في التشغيل.",
            ], result: "الاستدعاء `What1(Head, 5)` يعيد `true`." }),
            TRACE({ title: "تتبّع الحل: `What1`", code: WHAT1, run: chain("Head", [2, 3, 0, 5, 1, 4]) + "\nConsole.WriteLine(What1(Head, 5));", given: "القائمة `Head = [2,3,0,5,1,4]`، والاستدعاء `What1(Head, 5)`." }),
            QH(4, "متوسط", "`Thin`"),
            XCS(THIN),
            FIG("السلسلة المعطاة في السؤال 4", [{ kind: "chain", items: [10, 20, 30, 40, 50], pointers: [["Head", 0]] }]),
            XP("**السؤال:** كيف تبدو السلسلة `[10,20,30,40,50]` بعد الاستدعاء `Thin(Head)`؟ وما مهمة العملية؟"),
            XEX({ title: "الحل", steps: [
              "`Pos` على الخلية 10: الأمر `Pos.SetNext(Pos.GetNext().GetNext());` يجعلها تشير إلى الخلية 30، فتخرج الخلية 20 من السلسلة.",
              "`Pos` يتقدّم إلى الخلية التالية **الجديدة**، وهي 30. الأمر نفسه يجعلها تشير إلى الخلية 50، فتخرج الخلية 40.",
              "`Pos` يتقدّم إلى الخلية 50. لا خلية بعدها: `Pos.HasNext()` تعيد `false`، فتنتهي الحلقة.",
              "المهمة: العملية تحذف كل خلية ثانية (الثانية، الرابعة، وهكذا). الشرط `Pos.HasNext()` يضمن أنّ بعد `Pos` خلية نحذفها.",
            ], result: "السلسلة تصير `[10,30,50]`." }),
            TRACE({ title: "تتبّع الحل: `Thin`", code: THIN, lib: SHOW_T, run: chain("Head", [10, 20, 30, 40, 50]) + "\nThin(Head);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [10,20,30,40,50]`، والاستدعاء `Thin(Head)`.", description: "راقب الرسم: الخلية المحذوفة تخرج من السلسلة حين يتخطّاها المؤشّر `Next`." }),
            QH(5, "متقدّم", "`Rec` — عملية تراجعية"),
            XCS(REC),
            FIG("السلسلة المعطاة في السؤال 5", [{ kind: "chain", items: [4, 9, 2, 7], pointers: [["Head", 0]] }]),
            XP("**السؤال:** ماذا تعيد `Rec(Head)` للسلسلة `[4,9,2,7]`؟ وما مهمة العملية؟ افترض أنّ السلسلة غير فارغة."),
            XEX({ title: "الحل", steps: [
              "شرط التوقّف: الخلية الأخيرة (لا خلية بعدها) تعيد قيمتها.",
              "الاستدعاءات تنزل خلية بعد خلية حتى الخلية 7، وهي الأخيرة: تعيد 7.",
              "نعود إلى الخلية 2: `m` يساوي 7، و2 ليست أكبر من 7، فيُعاد 7.",
              "نعود إلى الخلية 9: `m` يساوي 7، و9 أكبر منه، فيُعاد 9.",
              "نعود إلى الخلية 4: `m` يساوي 9، و4 ليست أكبر منه، فيُعاد 9.",
              "المهمة: العملية تعيد أكبر قيمة في السلسلة. الفكرة التراجعية: أكبر قيمة هي الأكبر بين قيمة الخلية الأولى وأكبر قيمة في بقية السلسلة.",
            ], result: "تعيد العملية `9`." }),
            TRACE({ title: "تتبّع الحل: `Rec`", code: REC, run: chain("Head", [4, 9, 2, 7]) + "\nConsole.WriteLine(Rec(Head));", given: "السلسلة `Head = [4,9,2,7]`، والاستدعاء `Rec(Head)`.", description: "راقب مكدّس الاستدعاءات: في كل استدعاء يشير `Pos` إلى خلية أبعد، ثم تعود القيم من الأخير إلى الأول." }),
          ],
        },
        {
          title: "وظيفة: أسئلة تتبّع",
          keywords: ["وظيفة", "تتبّع", "نافذة الحل", "What1", "What2"],
          blocks: [
            XP("أربعة أسئلة تتبّع للوظيفة، مرتّبة من الأسهل إلى الأصعب. أجب عن كل سؤال أولًا، ثم اضغط «الحل»: تُفتح نافذة فيها الجواب وشرحه وتتبّع البرنامج خطوة بخطوة."),
            QH(1, "سهل", "`Change`"),
            XCS(CHANGE),
            FIG("السلسلة المعطاة في السؤال 1", [{ kind: "chain", items: [4, 5, 10, 1], pointers: [["Head", 0]] }]),
            proved(MC("كيف تبدو السلسلة `Head = [4,5,10,1]` بعد الاستدعاء `Change(Head)`؟", ["`[8,15,20,3]`", "*`[2,15,5,3]`", "`[2,5,5,1]`", "`[4,15,10,3]`"], "القيمة الزوجية تُقسم على 2، والقيمة الفردية تُضرب في 3. فتتحوّل 4 إلى 2، و5 إلى 15، و10 إلى 5، و1 إلى 3."),
              { code: CHANGE, lib: SHOW_T, run: chain("Head", [4, 5, 10, 1]) + "\nChange(Head);\nConsole.Write(Show(Head));", out: "[2,15,5,3]" }),
            SOLUTION({ title: "حل سؤال 1 — `Change`", answer: "السلسلة تصير `[2,15,5,3]`.", steps: [
              "المؤشّر `Pos` يمرّ على كل الخلايا بقالب التمشيط.",
              "في كل خلية: إذا كانت القيمة زوجية تُقسم على 2، وإلا تُضرب في 3. العملية `SetValue` تغيّر القيمة داخل الخلية نفسها.",
              "الخلية 4 تصير 2، والخلية 5 تصير 15، والخلية 10 تصير 5، والخلية 1 تصير 3.",
              "عدد الخلايا وترتيبها لا يتغيّران: المؤشّرات `Next` لم تُمسّ.",
            ], trace: { code: CHANGE, lib: SHOW_T, run: chain("Head", [4, 5, 10, 1]) + "\nChange(Head);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [4,5,10,1]`، والاستدعاء `Change(Head)`." } }),
            QH(2, "متوسط", "`Build`"),
            XCS(BUILD_REVERSED),
            FIG("السلسلة المعطاة في السؤال 2", [{ kind: "chain", items: [13, 15, 17], pointers: [["Head", 0]] }]),
            proved(MC("ماذا تعيد `Build(Head)` للسلسلة `Head = [13,15,17]`؟", ["`[13,15,17]`", "*`[17,15,13]`", "`[17]`", "`null`"], "كل خلية جديدة تُنشأ وهي تشير إلى `Res`، ثم تصير هي `Res`: أي أنها تدخل في **بداية** السلسلة الجديدة. آخر قيمة تُقرأ (17) تصير الأولى."),
              { code: BUILD_REVERSED, lib: SHOW_T, run: chain("Head", [13, 15, 17]) + "\nConsole.Write(Show(Build(Head)));", out: "[17,15,13]" }),
            proved(MC("وكيف تبدو السلسلة الأصلية `Head` بعد الاستدعاء؟", ["*`[13,15,17]`: لم تتغيّر", "`[17,15,13]`", "فارغة", "`[13]`"], "العملية تقرأ من السلسلة الأصلية بـ `GetValue` و `GetNext` فقط، وتبني خلايا جديدة. لا يوجد `SetNext` ولا `SetValue` على خلايا `Head`."),
              { code: BUILD_REVERSED, lib: SHOW_T, run: chain("Head", [13, 15, 17]) + "\nNode<int> R = Build(Head);\nConsole.Write(Show(Head));", out: "[13,15,17]" }),
            SOLUTION({ title: "حل سؤال 2 — `Build`", answer: "تعيد العملية سلسلة جديدة `[17,15,13]`، والسلسلة الأصلية تبقى `[13,15,17]`.", steps: [
              "`Res` يبدأ بالقيمة `null`: السلسلة الجديدة فارغة.",
              "عند الخلية 13: تُنشأ خلية جديدة قيمتها 13 تشير إلى `null`، و `Res` يشير إليها. السلسلة الجديدة `[13]`.",
              "عند الخلية 15: تُنشأ خلية قيمتها 15 تشير إلى الخلية 13، و `Res` يشير إليها. السلسلة الجديدة `[15,13]`.",
              "عند الخلية 17: السلسلة الجديدة `[17,15,13]`.",
              "المهمة: العملية تبني نسخة **مقلوبة** عن السلسلة، لأنّ كل خلية جديدة تدخل في البداية.",
            ], trace: { code: BUILD_REVERSED, lib: SHOW_T, run: chain("Head", [13, 15, 17]) + "\nNode<int> R = Build(Head);\nConsole.WriteLine(Show(R));", given: "السلسلة `Head = [13,15,17]`، والاستدعاء `Build(Head)`." } }),
            QH(3, "متقدّم", "`Check` — حلقتان متداخلتان"),
            XCS(CHECK_PAIRS),
            FIG("السلسلة المعطاة في السؤال 3", [{ kind: "chain", items: [3, 8, 5, 8, 1], pointers: [["Head", 0]] }]),
            proved(MC("ماذا تعيد `Check(Head)` للسلسلة `Head = [3,8,5,8,1]`؟", ["*`true`", "`false`", "العدد 8", "خطأ في التشغيل"], "لكل خلية `P` يمرّ `Q` على الخلايا التي بعدها. حين يكون `P` على الخلية 8 الأولى يصل `Q` إلى الخلية 8 الثانية: القيمتان متساويتان، فتُعاد `true`."),
              { code: CHECK_PAIRS, run: chain("Head", [3, 8, 5, 8, 1]) + "\nConsole.Write(Check(Head) ? \"true\" : \"false\");", out: "true" }),
            provedCount(SHORT("كم مرة يُنفَّذ الأمر `Q = Q.GetNext();` خلال هذا الاستدعاء؟", "5", "حين يكون `P` على الخلية 3 يمرّ `Q` على أربع خلايا ولا يجد قيمة مساوية: 4 مرات. حين يكون `P` على الخلية 8 يتقدّم `Q` مرة واحدة (بعد الخلية 5)، ثم يجد 8 فتنتهي العملية."),
              { code: CHECK_PAIRS, run: chain("Head", [3, 8, 5, 8, 1]) + "\nConsole.Write(Check(Head) ? \"true\" : \"false\");" }, "Q = Q.GetNext();", 5),
            SOLUTION({ title: "حل سؤال 3 — `Check`", answer: "تعيد العملية `true`، والأمر `Q = Q.GetNext();` يُنفَّذ 5 مرات.", steps: [
              "الحلقة الخارجية: `P` يمرّ على كل خلية. الحلقة الداخلية: `Q` يمرّ على كل الخلايا التي **بعد** `P`.",
              "`P` على الخلية 3: `Q` يمرّ على 8 ثم 5 ثم 8 ثم 1. لا قيمة تساوي 3، و `Q` تقدّم 4 مرات.",
              "`P` على الخلية 8: `Q` على الخلية 5 (ليست مساوية، يتقدّم)، ثم على الخلية 8: القيمتان متساويتان، فتُعاد `true`.",
              "المهمة: العملية تفحص إن كانت في السلسلة قيمة تتكرّر.",
              "النجاعة: في أسوأ الحالات (لا تكرار) تُقارَن كل خلية بكل الخلايا التي بعدها، فدرجة النجاعة `O(n²)`.",
            ], trace: { code: CHECK_PAIRS, run: chain("Head", [3, 8, 5, 8, 1]) + "\nConsole.WriteLine(Check(Head));", given: "السلسلة `Head = [3,8,5,8,1]`، والاستدعاء `Check(Head)`." } }),
            QH(4, "متقدّم", "`What1` و `What2` — سؤال 5 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 5 من الكتاب (ص 142)", prompt: "معطاة سلسلة من الخلايا المترابطة كل قيمها أعداد موجبة صحيحة: `[130,65,32,16,8,5,2]`، والمؤشّر `Chain` يشير إلى خليتها الأولى. (1) ماذا تعيد العملية `What1` إذا أرسلنا إليها `pos` وهو يؤشّر إلى الخلية 32؟ (2) ماذا تكون نتيجة الاستدعاء `What2(chain)`؟ (3) أعطِ مثالًا لسلسلة يُعاد لها عكس ما أُعيد في القسم ب. (4) اكتب ادّعاء الدخول وادّعاء الخروج لكل من العمليتين `What1` و `What2`." }),
            XCS(WHAT12),
            CLAR("في الكتاب", "في البند 2 كُتب `What2(chain)` بحرف صغير، والمؤشّر في رسم الكتاب اسمه `Chain`. و«القسم ب» في البند 3 هو البند 2."),
            FIG("السلسلة المعطاة في السؤال 4", [{ kind: "chain", items: Q5_CHAIN, pointers: [["Chain", 0], ["pos", 2]], hi: [2], label: "في البند 1: `pos` يؤشّر إلى الخلية 32" }]),
            proved(SHORT("البند 1: ماذا تعيد `What1(pos)` حين يؤشّر `pos` إلى الخلية 32؟", "31", "`What1` تجمع قيم كل الخلايا التي **بعد** `pos`: `16 + 8 + 5 + 2 = 31`. قيمة الخلية 32 نفسها لا تدخل في المجموع."),
              { code: WHAT12, run: Q5_RUN + "\nNode<int> pos = Chain.GetNext().GetNext();\nConsole.Write(What1(pos));", out: "31" }),
            proved(MC("البند 2: ماذا تكون نتيجة الاستدعاء `What2(Chain)`؟", ["*تعيد `true` ولا تطبع شيئًا", "تعيد `false` وتطبع `Node:130`", "تعيد `false` وتطبع `Node:2`", "تعيد `true` وتطبع كل القيم"], "`What2` تقارن كل قيمة بمجموع ما بعدها: `130 > 128` و `65 > 63` و `32 > 31` و `16 > 15` و `8 > 7` و `5 > 2` و `2 > 0`. كل قيمة أكبر من مجموع ما بعدها، فلا يُطبع شيء وتُعاد `true`."),
              { code: WHAT12, run: Q5_RUN + "\nConsole.Write(What2(Chain) ? \"true\" : \"false\");", out: "true" }),
            proved(MC("البند 3: أي سلسلة تعيد لها `What2` القيمة `false`؟", ["`[100,50,20,5]`", "`[9,4,2,1]`", "*`[5,3,2,1]`", "`[64]`"], "في `[5,3,2,1]` مجموع ما بعد الخلية الأولى `3 + 2 + 1 = 6`، و5 ليست أكبر من 6. تطبع العملية `Node:5` وتعيد `false`. وبسبب `false &&` لا تكمل العملية إلى بقية الخلايا."),
              { code: WHAT12, run: chain("Chain", [5, 3, 2, 1]) + "\nConsole.Write(What2(Chain) ? \"true\" : \"false\");", out: "Node:5\nfalse", loose: true }),
            SOLUTION({ title: "حل سؤال 4 — `What1` و `What2`", answer: "`What1` تعيد `31`، و `What2(Chain)` تعيد `true` ولا تطبع شيئًا.", steps: [
              "`What1(pos)` تراجعية: تعيد قيمة الخلية التي بعد `pos` + نتيجة `What1` لتلك الخلية. أي مجموع قيم كل الخلايا التي **بعد** `pos`. من الخلية 32: `16 + 8 + 5 + 2 = 31`.",
              "`What2(pos)` تحسب `x`، وهو مجموع ما بعد الخلية، وتقارنه بقيمة الخلية. إذا كانت القيمة أكبر من `x` تكمل إلى الخلية التالية.",
              "للسلسلة المعطاة: `130 > 128` و `65 > 63` و `32 > 31` و `16 > 15` و `8 > 7` و `5 > 2` و `2 > 0`. كل المقارنات تنجح حتى `null`، فتُعاد `true` ولا يُطبع شيء.",
              "البند 3: نريد سلسلة فيها قيمة ليست أكبر من مجموع ما بعدها، مثل `[5,3,2,1]`: تُطبع `Node:5` وتُعاد `false`. التعبير `false && …` لا يحسب طرفه الأيمن، فلا تكمل العملية إلى بقية الخلايا.",
              "ادّعاء الدخول للعملية `What1`: `pos` يؤشّر إلى خلية في سلسلة أعداد صحيحة (ليس `null`). ادّعاء الخروج: تعيد مجموع قيم الخلايا التي بعد الخلية `pos`.",
              "ادّعاء الدخول للعملية `What2`: `pos` مؤشّر إلى سلسلة أعداد صحيحة موجبة (قد تكون فارغة). ادّعاء الخروج: تعيد `true` إذا كانت كل قيمة أكبر من مجموع القيم التي بعدها. خلاف ذلك تطبع أول قيمة لا تحقّق الشرط وتعيد `false`.",
            ], trace: { code: WHAT12, quiet: ["What1"], run: Q5_RUN + "\nConsole.WriteLine(What2(Chain));", given: "السلسلة `Chain = [130,65,32,16,8,5,2]`، والاستدعاء `What2(Chain)`. استدعاءات `What1` تُنفَّذ بلا خطوات خاصة بها: القيمة `x` هي ما تعيده." } }),
          ],
        },
        {
          title: "أسئلة كتابة محلولة",
          keywords: ["كتابة عملية", "أسئلة محلولة", "BeginsWith", "IsFibonacci", "InsertSorted", "تقاطع", "اتحاد"],
          blocks: [
            XP("خمسة أسئلة كتابة محلولة، مرتّبة من الأسهل إلى الأصعب. حاول أن تكتب العملية في دفترك قبل أن تقرأ الحل. الكتاب لا يعرض حلولًا لتمارينه: الحلول هنا إضافة، وكل حل منها فُحص بالتتبّع. قد يكون حلّك مختلفًا وصحيحًا: افحصه بقائمة «ما يُفحص في الحل»."),
            QH(1, "سهل", "`CountValue` — عدّ قيمة"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب العملية `CountValue` التي تتلقّى مؤشّرًا إلى رأس سلسلة من نمط `Node<int>` وعددًا صحيحًا `Num`، وتعيد عدد الخلايا التي قيمتها `Num`. مثال: للسلسلة `[4,7,4,2]` والعدد 4 تعيد العملية 2." }),
            XCS(COUNT_VALUE),
            XLIST([
              "العدّاد `Count` يبدأ من 0 **قبل** الحلقة.",
              "قالب التمشيط كاملًا: `Pos = Head`، الشرط `Pos != null`، والتقديم `Pos = Pos.GetNext();` في كل دورة.",
              "المقارنة بقيمة الخلية: `Pos.GetValue() == Num`.",
              "`return Count;` بعد الحلقة، لا داخلها.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("هذا قالب التمشيط نفسه، وما نكتبه مكان `// ...` هو فحص واحد. للسلسلة الفارغة لا تدور الحلقة، فتُعاد 0. العملية تمرّ على كل الخلايا مرة واحدة: النجاعة `O(n)`."),
            TRACE({ title: "تتبّع الحل: `CountValue`", code: COUNT_VALUE, run: chain("Head", [4, 7, 4, 2]) + "\nConsole.WriteLine(CountValue(Head, 4));", given: "السلسلة `Head = [4,7,4,2]`، والاستدعاء `CountValue(Head, 4)`." }),
            QH(2, "متوسط", "`BeginsWith` — سؤال 3 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 3 من الكتاب (ص 141)", prompt: "تتلقّى العملية التالية قائمتين من نمط صحيح `L1` و `L2`. العملية يجب أن تعيد `true` إذا تبيّن لها أنّ `L1` تبدأ بـ `L2`. خلاف ذلك تعيد `false`. (1) أكمل الناقص بحيث تؤدّي العملية المطلوب منها. (2) حدّد درجة نجاعة زمن تشغيل العملية. اشرح." }),
            XCS(BEGINS_BLANK),
            XP("مثال: القائمة `[2,4,6,8]` تبدأ بالقائمة `[2,4]`، ولا تبدأ بالقائمة `[2,6]`. **الحل** — العملية بعد إكمال الفراغات الستة:"),
            XCS(BEGINS_WITH),
            XLIST([
              "المؤشّران يبدآن من رأسَي القائمتين: `L1` و `L2`.",
              "الحلقة تدور طالما لم تنتهِ أي واحدة من القائمتين: `Pos1 != null && Pos2 != null`.",
              "عند أول قيمتين مختلفتين نعيد `false`.",
              "بعد الحلقة: `L1` تبدأ بـ `L2` فقط إذا انتهت `L2` كلها، أي `Pos2 == null`.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("انتبه إلى السطر الأخير: من يكتب `return true;` يخطئ حين تكون `L2` أطول. مثلًا `L1 = [2,4]` و `L2 = [2,4,6]`: تنتهي الحلقة لأنّ `Pos1` صار `null`، لكن `Pos2` ما زال على الخلية 6، فالجواب الصحيح `false`. النجاعة: الحلقة تدور على الأكثر بعدد خلايا القائمة الأقصر، فهي خطّية: `O(n)`."),
            TRACE({ title: "تتبّع الحل: هل `[2,4,6,8]` تبدأ بـ `[2,4]`؟", code: BEGINS_WITH, run: chain("L1", [2, 4, 6, 8]) + "\n" + chain("L2", [2, 4]) + "\nConsole.WriteLine(BeginsWith(L1, L2));", given: "القائمتان `L1 = [2,4,6,8]` و `L2 = [2,4]`، والاستدعاء `BeginsWith(L1, L2)`." }),
            QH(3, "متوسط", "`IsFibonacci` — سؤال 24 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 24 من الكتاب (ص 161)", prompt: "قائمة «فيبوناتشي» هي قائمة تحتوي على عدد معيّن من حدود متتالية فيبوناتشي التي فيها: الحدّ الأول 0، الحدّ الثاني 1، وكل حدّ إضافي هو مجموع الحدّين السابقين له. مثال لقائمة «فيبوناتشي»: `[0,1,1,2,3,5,8,13]`. اكتب عملية باسم `IsFibonacci` تتلقّى كبارامتر قائمة ثم تفحصها وتعيد `true` إذا كانت قائمة «فيبوناتشي». خلاف ذلك تعيد العملية `false`." }),
            XCS(IS_FIBONACCI),
            XLIST([
              "الحدّ الأول يجب أن يكون 0 (والقائمة الفارغة ليست قائمة «فيبوناتشي»).",
              "قائمة من خلية واحدة قيمتها 0 مقبولة. إذا وُجدت خلية ثانية فقيمتها يجب أن تكون 1.",
              "في الحلقة ثلاث خلايا متتالية: `Pos` ثم `Second` ثم `Third`، والفحص: قيمة الثالثة = مجموع الاثنتين اللتين قبلها.",
              "شرط الحلقة `Pos.GetNext().HasNext()` يضمن وجود الخلية الثالثة قبل قراءتها.",
              "`Pos` يتقدّم خلية واحدة فقط في كل دورة، لا ثلاثًا.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("نفحص أولًا الحدّين الأولين، لأنّ لهما قيمتين ثابتتين. بعدها كل حدّ يُفحص بالحدّين اللذين قبله، فنحرّك «نافذة» من ثلاث خلايا خلية واحدة في كل دورة. أول خلل يعيد `false`."),
            TRACE({ title: "تتبّع الحل: `IsFibonacci` على `[0,1,1,2,3]`", code: IS_FIBONACCI, run: chain("List", [0, 1, 1, 2, 3]) + "\nConsole.WriteLine(IsFibonacci(List));", given: "القائمة `List = [0,1,1,2,3]`، والاستدعاء `IsFibonacci(List)`.", description: "راقب المؤشّرات الثلاثة `Pos` و `Second` و `Third`: تتحرّك معًا خلية واحدة في كل دورة." }),
            QH(4, "متوسط", "`InsertSorted` — إدخال في سلسلة مرتّبة"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب العملية `InsertSorted` التي تتلقّى مؤشّرًا إلى رأس سلسلة من نمط `Node<int>` قيمها مرتّبة تصاعديًا، وعددًا صحيحًا `Num`. العملية تُدخل خلية جديدة فيها `Num` في مكانها الصحيح، بحيث تبقى السلسلة مرتّبة، وتعيد مؤشّرًا إلى رأس السلسلة. مثال: إدخال 7 إلى `[2,5,9,12]` يعطي `[2,5,7,9,12]`." }),
            FIG("إدخال 7 إلى سلسلة مرتّبة", [
              { kind: "chain", items: [2, 5, 9, 12], pointers: [["Head", 0], ["Pos", 1]], label: "`Pos` يقف على آخر خلية قيمتها أصغر من 7" },
              { kind: "chain", items: [2, 5, 7, 9, 12], pointers: [["Head", 0], ["Pos", 1]], hi: [2], label: "الخلية الجديدة تدخل بعد `Pos`" },
            ]),
            XCS(INSERT_SORTED),
            XLIST([
              "حالة خاصة أولًا: السلسلة فارغة، أو `Num` لا يزيد على قيمة الرأس. عندها الخلية الجديدة تصير هي الرأس، ونعيدها.",
              "في الحالة العامة نبحث عن الخلية **السابقة** لمكان الإدخال: نتقدّم طالما القيمة التي بعد `Pos` أصغر من `Num`.",
              "الفحص `Pos.HasNext()` قبل `Pos.GetNext().GetValue()`، حتى لا نقرأ من `null` حين يكون `Num` أكبر من كل القيم.",
              "الإدخال كما في `AddAfter`: الخلية الجديدة تشير إلى ما بعد `Pos`، ثم `Pos` تشير إليها.",
              "العملية تعيد الرأس، ومن يستدعيها يكتب: `Head = InsertSorted(Head, 7);`.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("لماذا تعيد العملية الرأس؟ لأنّ الرأس قد يتغيّر: إذا كان `Num` أصغر من كل القيم تصير الخلية الجديدة هي الأولى، والعملية لا تستطيع تغيير المتغيّر `Head` الموجود عند من استدعاها. التتبّع الأول للحالة العامة، والثاني لإدخال قبل الرأس."),
            TRACE({ title: "تتبّع الحل: إدخال 7 إلى `[2,5,9,12]`", code: INSERT_SORTED, lib: SHOW_T, run: chain("Head", [2, 5, 9, 12]) + "\nHead = InsertSorted(Head, 7);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [2,5,9,12]`، والاستدعاء `Head = InsertSorted(Head, 7);`." }),
            TRACE({ title: "تتبّع الحل: إدخال 1 قبل الرأس", code: INSERT_SORTED, lib: SHOW_T, run: chain("Head", [2, 5, 9]) + "\nHead = InsertSorted(Head, 1);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [2,5,9]`، والاستدعاء `Head = InsertSorted(Head, 1);`." }),
            QH(5, "متقدّم", "التقاطع والاتحاد — سؤال 9 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 9 من الكتاب (ص 145)", prompt: "(1) اكتب عملية تتلقّى كبارامتر سلسلتي خلايا مترابطة من نمط `Node<int>`. على العملية أن تعيد سلسلة جديدة تحتوي على القيم المشتركة بين السلسلتين (أي تقاطع قيم السلسلتين) بدون تكرار. مثال: للسلسلتين `[7,9,12,30]` و `[9,10,12,17]` تعيد العملية السلسلة `[9,12]`. (2) اكتب عملية تتلقّى كبارامتر سلسلتي خلايا مترابطة من نمط `Node<int>`. على العملية أن تعيد سلسلة جديدة تحتوي على اتحاد قيم السلسلتين، أي جميع القيم الموجودة في السلسلتين لكن بدون تكرار. مثال: للسلسلتين نفسيهما تعيد العملية السلسلة `[7,9,12,30,10,17]`. ملاحظة: حاول كتابة عمليات مساعدة واستعمالها في القسمين." }),
            XP("نكتب عمليتين مساعدتين ونستعملهما في القسمين: `Exists` تفحص إن كانت قيمة موجودة في سلسلة، و `AddLast` تضيف خلية إلى نهاية سلسلة (قد تكون فارغة) وتعيد رأسها. `AddLast` تستعمل العملية `GetLastPos` من الكتاب."),
            XCS(EXISTS),
            XCS(ADD_LAST),
            XCS(INTERSECTION),
            XCS(UNION),
            XLIST([
              "السلسلة الجديدة تبدأ فارغة: `Chain3 = null`، و `AddLast` تعيد الرأس، لذلك نكتب `Chain3 = AddLast(Chain3, x);`.",
              "في التقاطع: القيمة تُضاف إذا كانت في `Chain2` **و**ليست في `Chain3` بعد.",
              "في الاتحاد: نمرّ على السلسلتين، وكل قيمة ليست في `Chain3` بعد تُضاف.",
              "الفحص `!Exists(Chain3, …)` هو الذي يمنع التكرار، حتى لو تكرّرت القيمة في السلسلة الأصلية.",
              "السلسلتان الأصليتان لا تتغيّران: نقرأ منهما فقط.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("في الاتحاد تدخل أولًا قيم `Chain1` كلها، ثم من `Chain2` فقط القيم غير الموجودة: الترتيب بحسب الدخول، لا تصاعديًا. في التتبّعين تُنفَّذ العمليات المساعدة بلا خطوات خاصة بها: راقب السلسلة الثالثة وهي تُبنى."),
            TRACE({ title: "تتبّع الحل: `Intersection`", code: INTERSECTION, lib: [...SET_HELPERS, SHOW_T], quiet: ["Exists", "AddLast", "GetLastPos"], run: SET_RUN("Intersection") + "Console.WriteLine(Show(Result));", given: "السلسلتان `Chain1 = [7,9,12,30]` و `Chain2 = [9,10,12,17]`، والاستدعاء `Intersection(Chain1, Chain2)`." }),
            TRACE({ title: "تتبّع الحل: `Union`", code: UNION, lib: [...SET_HELPERS, SHOW_T], quiet: ["Exists", "AddLast", "GetLastPos"], run: SET_RUN("Union") + "Console.WriteLine(Show(Result));", given: "السلسلتان `Chain1 = [7,9,12,30]` و `Chain2 = [9,10,12,17]`، والاستدعاء `Union(Chain1, Chain2)`." }),
          ],
        },
        {
          title: "وظيفة: أسئلة كتابة",
          keywords: ["وظيفة", "كتابة عملية", "نافذة الحل", "GetMaxPos", "DeleteAll", "مثلّثة"],
          blocks: [
            XP("خمسة أسئلة كتابة للوظيفة، مرتّبة من الأسهل إلى الأصعب. اكتب كل عملية في دفترك أو في محرّر الكود، ثم اضغط «الحل» وقارن: في النافذة كود الحل، وما يُفحص فيه، وتتبّعه خطوة بخطوة."),
            XLIST([
              "هل توقيع العملية صحيح (ما تتلقّاه وما تعيده)؟",
              "هل تفحص أنّ المؤشّر ليس `null` قبل كل `GetValue` أو `GetNext`؟",
              "هل يتقدّم المؤشّر في كل دورة، فلا تكون الحلقة لانهائية؟",
              "هل يعمل حلّك لسلسلة فارغة، ولسلسلة من خلية واحدة؟",
              "في الحذف: هل وجدت الخلية **السابقة** للخلية التي تحذفها؟",
            ], { title: "افحص حلّك قبل أن تفتح نافذة الحل", variant: "checklist" }),
            QH(1, "سهل", "`GetMaxPos` — الخلية التي فيها أكبر قيمة"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب العملية `GetMaxPos` التي تتلقّى مؤشّرًا إلى رأس سلسلة غير فارغة من نمط `Node<int>`، وتعيد **مؤشّرًا إلى الخلية** التي فيها أكبر قيمة. مثال: للسلسلة `[8,21,13]` تعيد العملية مؤشّرًا إلى الخلية 21." }),
            XCS("public static Node<int> GetMaxPos(Node<int> Head)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 1 — `GetMaxPos`", code: GET_MAX_POS, steps: [
              "هذه هي العملية `GetMaxValue` من الكتاب، لكننا نحفظ **مؤشّرًا** إلى الخلية الأكبر بدل أن نحفظ قيمتها.",
              "`MaxPos` يبدأ على الخلية الأولى، والتمشيط يبدأ من الخلية الثانية.",
              "كلما وجدنا خلية قيمتها أكبر من قيمة `MaxPos` ننقل `MaxPos` إليها.",
              "تمشيط واحد للسلسلة: درجة النجاعة `O(n)`.",
            ], checklist: [
              "العملية تعيد `Node<int>`، لا `int`.",
              "`MaxPos` يبدأ بـ `Head` (السلسلة غير فارغة).",
              "المقارنة بين **قيمتين**: `Pos.GetValue() > MaxPos.GetValue()`.",
              "تقديم `Pos` في كل دورة، و `return MaxPos;` بعد الحلقة.",
            ], trace: { run: chain("Head", [8, 21, 13]) + "\nNode<int> Max = GetMaxPos(Head);\nConsole.WriteLine(Max.GetValue());", given: "السلسلة `Head = [8,21,13]`، والاستدعاء `GetMaxPos(Head)`." } }),
            proved(MC("في السلسلة `[5,12,9,12]` تظهر أكبر قيمة مرتين. إلى أي خلية تعيد عملية الحل (بالشرط `>`) مؤشّرًا؟", ["*إلى الخلية الثانية: أول خلية قيمتها 12", "إلى الخلية الرابعة: آخر خلية قيمتها 12", "إلى الخلية الأولى", "`null`"], "حين يصل `Pos` إلى الخلية الرابعة يكون `MaxPos` على الخلية الثانية، و12 ليست **أكبر** من 12، فلا ينتقل `MaxPos`. لو كتبنا `>=` لأُعيدت الخلية الأخيرة."),
              { code: GET_MAX_POS, run: chain("Head", [5, 12, 9, 12]) + "\nConsole.Write(GetMaxPos(Head) == Head.GetNext() ? \"second\" : \"other\");", out: "second", loose: true }),
            QH(2, "متوسط", "`CheckList` — سؤال 26 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 26 من الكتاب (ص 163)", prompt: "قائمة «مُتَمَيِّزة» هي قائمة تحتوي على ثلاثيات من الأعداد الصحيحة `(a,b,c)`، وكل ثلاثية تحقّق المعادلة `a² + b² = c`. القائمة `[2,3,13,6,2,40,2,5,29]` هي قائمة «مُتَمَيِّزة»، لأنّ `2² + 3² = 13` و `6² + 2² = 40` و `2² + 5² = 29`. اكتب عملية باسم `CheckList` تتلقّى قائمة `Node<int>` ثم تفحصها وتعيد `true` إذا كانت «مُتَمَيِّزة». خلاف ذلك تعيد العملية `false`." }),
            CLAR("في الكتاب", "المعادلة مطبوعة في الكتاب `a2 + b2 = c`، وكذلك `22 + 32 = 13`: الأسّ نزل إلى السطر. المقصود `a² + b² = c`."),
            XCS("public static bool CheckList(Node<int> L)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 2 — `CheckList`", code: CHECK_LIST, steps: [
              "نقرأ القائمة ثلاث خلايا في كل دورة: `a` ثم `b` ثم `c`.",
              "قبل القراءة نفحص أنّ الخلايا الثلاث موجودة. إذا بقيت خلية أو خليتان بلا ثلاثية كاملة فالقائمة ليست مُتَمَيِّزة.",
              "إذا كان `a * a + b * b` لا يساوي `c` نعيد `false` فورًا.",
              "بعد كل ثلاثية صحيحة يتقدّم `Pos` ثلاث خلايا. إذا وصل إلى `null` فكل الثلاثيات صحيحة: نعيد `true`.",
            ], checklist: [
              "فحص وجود الخلية الثانية والثالثة قبل `GetValue`: `Pos.HasNext()` و `Pos.GetNext().HasNext()`.",
              "التربيع بالضرب: `a * a`، لا بالرمز `^`.",
              "`return false` عند أول ثلاثية لا تحقّق المعادلة.",
              "تقديم `Pos` **ثلاث** خلايا في كل دورة.",
            ], trace: { run: chain("L", [2, 3, 13, 1, 2, 5]) + "\nConsole.WriteLine(CheckList(L));", given: "القائمة `L = [2,3,13,1,2,5]` (ثلاثيتان)، والاستدعاء `CheckList(L)`." } }),
            proved(SHORT("ماذا تعيد `CheckList(L)` للقائمة `[2,3,13,6,2,41]`؟ اكتب `true` أو `false`.", "false", "الثلاثية الأولى صحيحة: `4 + 9 = 13`. في الثانية `36 + 4 = 40`، والقيمة الثالثة 41، فتُعاد `false`."),
              { code: CHECK_LIST, run: chain("L", [2, 3, 13, 6, 2, 41]) + "\nConsole.Write(CheckList(L) ? \"true\" : \"false\");", out: "false" }),
            QH(3, "متوسط", "`DeleteAll` — حذف كل ظهور لقيمة"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب العملية `DeleteAll` التي تتلقّى مؤشّرًا إلى رأس سلسلة من نمط `Node<int>` وعددًا صحيحًا `Num`. العملية تحذف من السلسلة **كل** الخلايا التي قيمتها `Num`، حتى لو كانت في بداية السلسلة، وتعيد مؤشّرًا إلى رأس السلسلة بعد الحذف. مثال: حذف 4 من `[4,7,4,4,2,4]` يعطي `[7,2]`." }),
            FIG("حذف كل ظهور للقيمة 4", [
              { kind: "chain", items: [4, 7, 4, 4, 2, 4], pointers: [["Head", 0]], hi: [0, 2, 3, 5], label: "قبل: أربع خلايا قيمتها 4، وإحداها الرأس" },
              { kind: "chain", items: [7, 2], pointers: [["Head", 0]], label: "بعد الحذف: الرأس تغيّر" },
            ]),
            XCS("public static Node<int> DeleteAll(Node<int> Head, int Num)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 3 — `DeleteAll`", code: DELETE_ALL, steps: [
              "الحلقة الأولى تعالج بداية السلسلة: طالما قيمة الرأس `Num` ننقل `Head` إلى الخلية التالية.",
              "الحلقة الثانية تعالج بقية السلسلة: `Pos` هي الخلية **السابقة**، وننظر إلى الخلية التي بعدها.",
              "إذا كانت قيمة الخلية التي بعد `Pos` هي `Num` نحذفها: `Pos` تتخطّاها. **لا نقدّم** `Pos` في هذه الدورة، لأنّ الخلية التالية الجديدة قد تكون `Num` أيضًا.",
              "وإلا نقدّم `Pos` خلية واحدة.",
              "العملية تعيد الرأس لأنّه قد يتغيّر، ومن يستدعيها يكتب: `Head = DeleteAll(Head, 4);`.",
            ], checklist: [
              "حلقة خاصة لحذف الخلايا من **بداية** السلسلة، مع الفحص `Head != null`.",
              "في بقية السلسلة: الحذف من الخلية السابقة بالأمر `Pos.SetNext(Pos.GetNext().GetNext());`.",
              "تقديم `Pos` **فقط** حين لا نحذف (داخل `else`).",
              "`return Head;` في النهاية، وقد يكون `null` إذا حُذفت كل الخلايا.",
            ], trace: { lib: SHOW_T, run: chain("Head", [4, 7, 4, 4, 2, 4]) + "\nHead = DeleteAll(Head, 4);\nConsole.WriteLine(Show(Head));", given: "السلسلة `Head = [4,7,4,4,2,4]`، والاستدعاء `Head = DeleteAll(Head, 4);`." } }),
            proved(MC("ماذا تعيد `DeleteAll(Head, 5)` للسلسلة `Head = [5,5,5]`؟", ["مؤشّرًا إلى الخلية الأولى", "مؤشّرًا إلى الخلية الأخيرة", "*`null`: حُذفت كل الخلايا", "خطأ في التشغيل"], "الحلقة الأولى تنقل `Head` ثلاث مرات حتى يصير `null`. الفحص `Head != null` في شرطها يمنع خطأ التشغيل، والحلقة الثانية لا تدور."),
              { code: DELETE_ALL, run: chain("Head", [5, 5, 5]) + "\nConsole.Write(DeleteAll(Head, 5) == null ? \"null\" : \"cell\");", out: "null" }),
            QH(4, "متقدّم", "حذف عدد زوجي بين عددين فرديين — سؤال 13 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 13 من الكتاب (ص 147)", prompt: "اكتب عملية تتلقّى كبارامتر قائمة من نمط `Node<int>`. العملية تحذف من القائمة كل عدد زوجي مُحاط مباشرة بعددين فرديين، بحيث تكون درجة نجاعة زمن التشغيل خطّية. مثال: القائمة `[5,2,9,4,7,12,14,9]` تصبح `[5,9,7,12,14,9]`. شرح: القيمة 2 زوجية وهي مُحاطة بالعددين الفرديين 5 و9، والقيمة 4 زوجية وهي مُحاطة بالعددين الفرديين 9 و7." }),
            FIG("السؤال 4: القائمة قبل وبعد", [
              { kind: "chain", items: Q13_CHAIN, pointers: [["L", 0]], hi: [1, 3], label: "قبل: الخليتان 2 و4 بين عددين فرديين" },
              { kind: "chain", items: [5, 9, 7, 12, 14, 9], pointers: [["L", 0]], label: "بعد استدعاء العملية" },
            ]),
            XCS("public static void RemoveEvenBetweenOdds(Node<int> L)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 4 — `RemoveEvenBetweenOdds`", code: REMOVE_EVEN, steps: [
              "ننظر في كل دورة إلى ثلاث خلايا متتالية: `Pos` ثم `Mid` ثم `After`.",
              "إذا كانت `Pos` فردية و `Mid` زوجية و `After` فردية نحذف `Mid`: الخلية `Pos` تشير إلى `After`.",
              "`Pos` هي الخلية السابقة للخلية المحذوفة، فلا نحتاج إلى بحث إضافي عنها.",
              "بعد الحذف يتقدّم `Pos` إلى `After`، وهي عدد فردي قد يكون قبل عدد زوجي آخر.",
              "تمشيط واحد للقائمة: درجة النجاعة خطّية، `O(n)`، كما يطلب السؤال.",
            ], checklist: [
              "شرط الحلقة يضمن وجود ثلاث خلايا: `Pos != null && Pos.HasNext() && Pos.GetNext().HasNext()`.",
              "فحص الزوجي بـ `% 2 == 0` والفردي بـ `% 2 != 0`.",
              "الحذف بأمر واحد من الخلية السابقة: `Pos.SetNext(After);`.",
              "الخلية الأولى لا تُحذف أبدًا (لا خلية قبلها)، فالرأس لا يتغيّر والعملية `void`.",
            ], trace: { lib: SHOW_T, run: chain("L", Q13_CHAIN) + "\nRemoveEvenBetweenOdds(L);\nConsole.WriteLine(Show(L));", given: "القائمة `L = [5,2,9,4,7,12,14,9]`، والاستدعاء `RemoveEvenBetweenOdds(L)`." } }),
            proved(MC("كيف تبدو القائمة `L = [3,8,5,6,6,1,4,7]` بعد استدعاء عملية الحل؟", ["`[3,5,1,7]`", "*`[3,5,6,6,1,7]`", "`[3,5,6,6,1,4,7]`", "`[3,8,5,1,7]`"], "8 بين 3 و5 فتُحذف، و4 بين 1 و7 فتُحذف. أمّا 6 و6 فكل واحدة منهما جارتها زوجية، فتبقيان."),
              { code: REMOVE_EVEN, lib: SHOW_T, run: chain("L", [3, 8, 5, 6, 6, 1, 4, 7]) + "\nRemoveEvenBetweenOdds(L);\nConsole.Write(Show(L));", out: "[3,5,6,6,1,7]" }),
            QH(5, "متقدّم", "السلسلة المُثَلَّثَة — سؤال 14 من الكتاب"),
            XEX({ mode: "practice", title: "سؤال 14 من الكتاب (ص 148)", prompt: "سلسلة خلايا مترابطة من نمط `Node<int>` تُعتبر مُثَلَّثَة إذا توفّرت فيها الشروط التالية: عدد الخلايا فيها من مضاعفات العدد 3، والأعداد في خلايا الثلث الأول مساوية للأعداد في خلايا الثلث الثاني والثلث الثالث وتظهر أيضًا بنفس الترتيب. اكتب عملية تتلقّى كبارامتر الخلية الأولى في سلسلة الخلايا المترابطة ثم تفحص السلسلة وتعيد `true` إذا كانت مُثَلَّثَة، وخلاف ذلك تعيد `false`." }),
            FIG("السؤال 5: سلسلة مُثَلَّثَة", [{ kind: "chain", items: Q14_CHAIN, pointers: [["Chain", 0]], hi: [4, 5, 6, 7], label: "الأثلاث الثلاثة متساوية: `[2,5,3,7]` ثلاث مرات" }]),
            XCS("public static bool IsTripled(Node<int> Chain)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 5 — `IsTripled`", code: IS_TRIPLED.trim() + "\n" + SKIP.trim(), steps: [
              "نحسب طول السلسلة بالعملية `GetLength` من الكتاب. إذا لم يكن من مضاعفات 3 نعيد `false` فورًا.",
              "نضع ثلاثة مؤشّرات: `Pos1` على بداية الثلث الأول، `Pos2` على بداية الثاني، و `Pos3` على بداية الثالث. العملية المساعدة `Skip` تعيد المؤشّر بعد أن يتقدّم `k` خلايا.",
              "نقدّم المؤشّرات الثلاثة معًا، ونقارن القيم الثلاث في كل دورة. أول اختلاف يعيد `false`.",
              "حين يصل `Pos3` إلى `null` تكون كل خلايا الأثلاث قد قورنت: نعيد `true`.",
            ], checklist: [
              "فحص أنّ الطول من مضاعفات 3: `Length % 3 != 0`.",
              "`Pos2` يبدأ بعد ثلث السلسلة، و `Pos3` بعد ثلثين.",
              "المقارنة بين القيم الثلاث في **الموضع نفسه** من كل ثلث.",
              "شرط الحلقة على `Pos3`: هو أول مؤشّر يصل إلى `null`.",
            ], trace: { lib: GET_LENGTH, quiet: ["GetLength", "Skip"], run: chain("Chain", [2, 5, 2, 5, 2, 5]) + "\nConsole.WriteLine(IsTripled(Chain));", given: "السلسلة `Chain = [2,5,2,5,2,5]` (طولها 6، وكل ثلث فيه خليتان)، والاستدعاء `IsTripled(Chain)`. العمليتان `GetLength` و `Skip` تُنفَّذان بلا خطوات خاصة بهما." } }),
            proved(SHORT("ماذا تعيد `IsTripled(Chain)` لسلسلة الكتاب `[2,5,3,7,2,5,3,7,2,5,3,7]`؟ اكتب `true` أو `false`.", "true", "الطول 12 من مضاعفات 3، والأثلاث الثلاثة كلها `[2,5,3,7]`."),
              { code: IS_TRIPLED, lib: [SKIP, GET_LENGTH], run: chain("Chain", Q14_CHAIN) + "\nConsole.Write(IsTripled(Chain) ? \"true\" : \"false\");", out: "true" }),
            proved(SHORT("وماذا تعيد للسلسلة `[1,2,1,2,2,1]`؟ اكتب `true` أو `false`.", "false", "الطول 6 والأثلاث `[1,2]` ثم `[1,2]` ثم `[2,1]`. القيم نفسها، لكن الترتيب في الثلث الثالث مختلف."),
              { code: IS_TRIPLED, lib: [SKIP, GET_LENGTH], run: chain("Chain", [1, 2, 1, 2, 2, 1]) + "\nConsole.Write(IsTripled(Chain) ? \"true\" : \"false\");", out: "false" }),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "سلسلة خلايا", "Node"],
          blocks: [
            MC("ما قيمة المؤشّر `Next` في الخلية الأخيرة من السلسلة؟", ["0", "*`null`", "مؤشّر إلى الخلية الأولى", "مؤشّر إلى الخلية نفسها"], "الخلية الأخيرة لا تشير إلى خلية بعدها، فمؤشّرها `null`. بهذا نعرف في التمشيط أنّ السلسلة انتهت."),
            WORDS("أكمل الجمل عن عمليات الخلية:", "العملية [[GetValue]] تعيد القيمة المخزّنة في الخلية، والعملية [[GetNext]] تعيد المؤشّر إلى الخلية التالية، والعملية [[SetNext]] تربط الخلية بخلية أخرى، والعملية [[HasNext]] تفحص إن كانت بعد الخلية خلية.", ["Push", "Pop", "Insert"], "`Push` و `Pop` عمليتا الراصّة، و `Insert` عملية الدور. الخلية لها `Get` و `Set` لكل صفة، ومعهما `HasNext`."),
            XCS("Node<int> Head = new Node<int>(3, new Node<int>(6, new Node<int>(9)));\nHead.GetNext().SetValue(Head.GetValue() + Head.GetNext().GetNext().GetValue());\nConsole.Write(Head.GetNext().GetValue());"),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟", "12", "السلسلة `[3,6,9]`. قيمة الخلية الثانية تتغيّر إلى مجموع الأولى والثالثة: `3 + 9 = 12`."),
              { code: inMain("Node<int> Head = new Node<int>(3, new Node<int>(6, new Node<int>(9)));\nHead.GetNext().SetValue(Head.GetValue() + Head.GetNext().GetNext().GetValue());\nConsole.Write(Head.GetNext().GetValue());"), out: "12" }),
            ORDER("رتّب أسطر مقطع يحسب طول السلسلة `Head`:", ["`Node<int> Pos = Head;`", "`int Length = 0;`", "`while (Pos != null)`", "`Length++;`", "`Pos = Pos.GetNext();`"], "قالب التمشيط: مؤشّر مساعد يبدأ من الرأس، حلقة حتى `null`، وفي نهاية كل دورة نقدّم المؤشّر."),
            XCS("Head.SetNext(Head.GetNext().GetNext());\nAddAfter(Head, Head, 7);"),
            proved(MC("معطاة السلسلة `Head = [1,2,3]`. كيف تبدو بعد تنفيذ الأمرين أعلاه؟", ["`[1,7,2,3]`", "*`[1,7,3]`", "`[7,1,3]`", "`[1,3,7]`"], "الأمر الأول يحذف الخلية الثانية: `[1,3]`. الأمر الثاني يُدخل 7 بعد الرأس: `[1,7,3]`."),
              { code: ADD_AFTER, lib: SHOW_T, run: chain("Head", [1, 2, 3]) + "\nHead.SetNext(Head.GetNext().GetNext());\nAddAfter(Head, Head, 7);\nConsole.Write(Show(Head));", out: "[1,7,3]" }),
            CLASSIFY("صنّف كل عملية بحسب درجة نجاعتها لسلسلة فيها `n` خلايا:", ["`O(1)`", "`O(n)`"], [["`GetValue`", 0], ["`AddAfter`", 0], ["`GetLastPos`", 1], ["`Append`", 1], ["`GetPos`", 1], ["`SetNext`", 0]], "العمليات التي تعمل على خلية واحدة معطاة نجاعتها `O(1)`. العمليات التي تمشّط السلسلة نجاعتها `O(n)`، ومنها `Append` لأنّها تبحث أولًا عن الخلية الأخيرة."),
            TF("الأمر `Pos = Pos.GetNext();` داخل التمشيط يغيّر السلسلة نفسها.", false, "الأمر يغيّر المؤشّر المساعد `Pos` فقط. الخلايا وروابطها تبقى كما هي. ما يغيّر السلسلة هو `SetNext` و `SetValue`."),
            XCS(MYSTERY),
            proved(SHORT("ما القيمة التي تعيدها `Mystery(Head)` للسلسلة `Head = [4,7,10,3,8]`؟", "3", "العملية تعدّ القيم الزوجية تراجعيًا: كل خلية زوجية تضيف 1 إلى نتيجة بقية السلسلة. القيم الزوجية هي 4 و10 و8."),
              { code: MYSTERY, run: chain("Head", [4, 7, 10, 3, 8]) + "\nConsole.Write(Mystery(Head));", out: "3" }),
            XCS(WHAT1),
            proved(SHORT("العملية `What1` أعلاه من سؤال 2 في الكتاب. ماذا يعيد الاستدعاء `What1(Head, 5)` إذا كانت القائمة `[2,3,4,5,1,4]`؟ اكتب `true` أو `false`.", "false", "العملية تفحص القيم زوجًا زوجًا. الزوج الأول `2 + 3 = 5`، لكن الزوج الثاني `4 + 5 = 9` لا يساوي 5، فتُعاد `false` فورًا."),
              { code: WHAT1, run: chain("Head", [2, 3, 4, 5, 1, 4]) + "\nConsole.Write(What1(Head, 5) ? \"true\" : \"false\");", out: "false" }),
            MATCH("صِل كل مهمة بالعملية التي تنفّذها:", [["إيجاد الخلية الأخيرة", "`GetLastPos`"], ["إضافة خلية في نهاية السلسلة", "`Append`"], ["إدخال خلية بعد خلية معيّنة", "`AddAfter`"], ["إيجاد الخلية السابقة لخلية", "`GetPrevious`"], ["بناء سلسلة من مصفوفة", "`ToNode`"]], "هذه هي العمليات الخارجية الأساسية التي كتبها الكتاب للفئة `Node<int>`."),
            MC("لماذا نحتاج إلى الخلية السابقة حين نحذف خلية من وسط السلسلة؟", ["لأنّ قيمتها تُنسخ إلى الخلية المحذوفة", "*لأنّ مؤشّرها `Next` هو الذي يجب أن يتخطّى الخلية المحذوفة", "لأنّها تُحذف هي أيضًا", "لا نحتاج إليها"], "الحذف هو أن تشير الخلية السابقة إلى ما بعد الخلية المحذوفة: `Previous.SetNext(PosToDelete.GetNext());`."),
            MC("ما شرط التوقّف في عملية تراجعية تعمل على سلسلة، مثل `GetLength`؟", ["أن تكون قيمة الخلية 0", "*أن تكون السلسلة فارغة: `Head == null`", "أن يكون طول السلسلة زوجيًا", "أن نصل إلى الخلية الأولى"], "كل استدعاء يعمل على سلسلة أقصر بخلية. في النهاية تصير السلسلة فارغة، وهذه أبسط حالة: نعيد الجواب مباشرة."),
          ],
        },
      ],
    },
  ],
};
