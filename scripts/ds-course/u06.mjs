// Unit 6 — الأشجار الثنائية BinNode<T> (الكتاب: الفصل السادس، ص 246–256 و 266–269، وتمارين مختارة من ص 281–304).
// شجرة البحث الثنائية (ص 257–265، 270–280) في الوحدة 7.
import {
  P, H, NOTE, LIST, OL, EX, CS, API, CLAR, XP, XH, XCS, XDEF, XTIP, XNOTE, XLIST, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, LAB, FIG, proved, provedCount, treeOf,
} from "./dsl.mjs";

// ── الأشجار المستعملة في الرسومات والأسئلة: [القيمة، الابن الأيسر، الابن الأيمن] ───────────────────────────────────────
const T3 = [5, 3, 7];
const T5 = [5, [3, 2, 4], 7];
const T6 = [5, [3, 1, 4], [7, null, 9]];
const T7 = [5, [3, 2, 4], [7, 6, 8]];
const TH = [5, [3, 1, null], 7];
const TW = [1, [2, 4, null], [3, [5, null, 6], null]];
const TV = [4, [9, 1, [6, 3, null]], [2, null, 7]];
const TP = [6, [2, 9, [5, 1, null]], [8, null, 3]];
const TQ5 = [3, [5, [3, null, 4], [5, 6, 3]], [3, null, [5, null, 1]]];
const TQ7 = [86, [82, null, [76, 78, null]], [70, 66, null]];
const TQ24 = [3, [1, 0, null], [5, 4, [8, 7, null]]];
const TQ2 = [3, [-1, -6, null], [5, 8, [-1, 7, null]]];
const TQ10 = [1, [2, [3, null, [4, null, 5]], null], [6, [7, null, 8], 9]];
const TQ11 = [10, [8, 3, 5], [2, 2, null]];
const TM = [1, 2, [3, 6, 7]];

// ترتيب الزيارة في كل تمشيط، محسوبًا من الشجرة نفسها (تُقارن به مخرجات برامج C# في البراهين)
const parts = t => (Array.isArray(t) ? t : [t]);
const walk = (t, how) => {
  if (t === null || t === undefined) return [];
  const [v, l, r] = parts(t);
  const L = walk(l, how), R = walk(r, how);
  return how === "pre" ? [v, ...L, ...R] : how === "in" ? [...L, v, ...R] : [...L, ...R, v];
};
const levels = t => {
  const out = [], q = [t];
  while (q.length) {
    const x = q.shift();
    if (x === null || x === undefined) continue;
    const [v, l, r] = parts(x);
    out.push(v);
    q.push(l, r);
  }
  return out;
};
const seq = a => "`[" + a.join(",") + "]`"; // كما تُكتب في خيارات الأسئلة (داخل علامتي ` لتبقى من اليسار إلى اليمين)
const printed = a => a.map(v => v + " ").join(""); // كما تطبعها عمليات الكتاب
/** شجرة رموز (BinNode<char>) مكتوبة [رمز، يسار، يمين]. */
const charTreeOf = (name, tree) => {
  const e = t => (t === null || t === undefined ? "null" : !Array.isArray(t) ? `new BinNode<char>('${t}')` : `new BinNode<char>(${e(t[1])}, '${t[0]}', ${e(t[2])})`);
  return `BinNode<char> ${name} = ${e(tree)};`;
};

// ── كود الكتاب ────────────────────────────────────────────────────────────────────────────────────────────────────────
const BUILD = `
public static void Main()
{
    BinNode<int> bt = new BinNode<int>(5);
    bt.SetLeft(new BinNode<int>(3));
    bt.SetRight(new BinNode<int>(7));
    Console.WriteLine(bt.GetValue() +
          bt.GetLeft().GetValue() +
       bt.GetRight().GetValue());
}`;
const SUM_PRE = `
public static int SumOfTreeValues(BinNode<int> bt)
{
    if (bt == null)
      return 0;
    return bt.GetValue() +
           SumOfTreeValues(bt.GetLeft()) +
           SumOfTreeValues(bt.GetRight());
}`;
const SUM_TEST_TREE = `
BinNode<int> bt = new BinNode<int>(new BinNode<int>(3),
                                   5,
                                   new BinNode<int>(7));
bt.GetLeft().SetLeft(new BinNode<int>(2));
bt.GetLeft().SetRight(new BinNode<int>(4));
bt.GetRight().SetLeft(new BinNode<int>(6));
bt.GetRight().SetRight(new BinNode<int>(8));`;
const NUM = `
public static int NumOfTreeNodes(BinNode<int> bt)
{
    if (bt == null)
      return 0;
    return 1 +
        NumOfTreeNodes(bt.GetLeft()) +
      NumOfTreeNodes(bt.GetRight());
}`;
const SUM_IN = `
public static int SumOfTreeValues(BinNode<int> bt)
{
    if (bt == null) return 0;
    return SumOfTreeValues(bt.GetLeft()) +
           bt.GetValue() +
           SumOfTreeValues(bt.GetRight());
}`;
const SUM_POST = `
public static int SumOfTreeValues(BinNode<int> bt)
{
    if (bt == null) return 0;
    return SumOfTreeValues(bt.GetLeft()) +
           SumOfTreeValues(bt.GetRight()) +
           bt.GetValue();
}`;
const PRE = `
public static void PreOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    Console.Write(bt.GetValue() + " "); // نطبع قيمة الأب أوّلا
    PreOrder (bt.GetLeft());// ثمّ نطبع قيمة الولد الأيسر
    PreOrder (bt.GetRight());// ثمّ نطبع قيمة الولد الأيمن
}`;
const IN = `
public static void InOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    InOrder(bt.GetLeft());
    Console.Write(bt.GetValue() + " ");
    InOrder(bt.GetRight());
}`;
const POST = `
public static void PostOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    PostOrder (bt.GetLeft());
    PostOrder (bt.GetRight());
    Console.Write(bt.GetValue() + " ");
}`;
const EVAL = `
public static int EvalExpressionTree(BinNode<char> tree)
{
    // If we have an operand then return its value
    if (IsLeaf(tree))
        return int.Parse(tree.GetValue().ToString());

    // Evaluate left sub tree expression
    int LeftVal = EvalExpressionTree(tree.GetLeft());

    // Evaluate left sub tree expression
    int RightVal = EvalExpressionTree(tree.GetRight());

    char Op = tree.GetValue();
    // Apply Op on both numbers
    return EvalOperator(LeftVal, Op, RightVal);
}

public static bool IsLeaf(BinNode<char> bt)
{
    return !bt.HasLeft() && !bt.HasRight();
}

public static int EvalOperator(int a, char Op, int b)
{
    if (Op == '+') return (a + b);
    else if (Op == '-') return (a - b);
    else if (Op == '*') return (a * b);
    return (a / b);// We assume b != 0
}`;
const EVAL_TEST_TREE = `
BinNode<char> bt = new BinNode<char>(new BinNode<char>('*'),
                                     '+',
                                     new BinNode<char>('*'));
bt.GetLeft().SetLeft(new BinNode<char>('5'));
bt.GetLeft().SetRight(new BinNode<char>('7'));
bt.GetRight().SetLeft(new BinNode<char>('5'));
bt.GetRight().SetRight(new BinNode<char>('2'));`;
const LEVELS = `
public static void LevelsOrder(BinNode<int> bt)
{
    Queue<BinNode<int>> q = new Queue<BinNode<int>>();
    q.Insert(bt);
    BinNode<int> btTemp;
    while (!q.IsEmpty())
    {
        btTemp = q.Remove();
        Console.Write(btTemp.GetValue() + " ");
        if (btTemp.HasLeft())
            q.Insert(btTemp.GetLeft());
        if (btTemp.HasRight())
            q.Insert(btTemp.GetRight());
    }
    Console.WriteLine();
}`;
const LEVELS_LIST = `
public static Node<int> LevelsOrderList(BinNode<int> bt)
{
    Node<int> Head = null, Last = null;
    Queue<BinNode<int>> q = new Queue<BinNode<int>>();
    q.Insert(bt);
    BinNode<int> btTemp;
    while (!q.IsEmpty())
    {
        btTemp = q.Remove();
        if (Head == null)
        {
            Head = new Node<int>(btTemp.GetValue());
            Last = Head;
        }
        else
        {
            Last.SetNext(new Node<int>(btTemp.GetValue()));
            Last = Last.GetNext();
        }
        if (btTemp.HasLeft())  q.Insert(btTemp.GetLeft());
        if (btTemp.HasRight()) q.Insert(btTemp.GetRight());
    }
    return Head;
}`;
const HEIGHT = `
public static int Height(BinNode<int> bt)
{
    if (bt == null)
        return -1; // ارتفاع شجرة فارغة -1
    int hl = Height(bt.GetLeft()); // نحسب ارتفاع الشجرة الفرعيّة اليُسرى
    int hr = Height(bt.GetRight()); // نحسب ارتفاع الشجرة الفرعيّة اليُمنى
    int h = 1 + Math.Max(hl, hr); // ثم نُعيد الأعلى من بين الارتفاعين بعد إضافة 1
    return h;
}`;

// ── تمارين الكتاب المختارة: أسئلة التتبّع 5 و7 و24 ─────────────────────────────────────────────────────────────────────
const Q5 = `
public static bool What1(BinNode<int> bt, int Val)
{
    if (bt == null) return false;
    if (bt.GetValue() == Val) return true;
    return What1(bt.GetLeft(), Val) || What1(bt.GetRight(), Val);
}

public static void What2(BinNode<int> bt)
{
    int Temp = bt.GetValue();
    while (What1(bt, Temp))
        Temp++;
    bt.SetValue(Temp);
}

public static void What3(BinNode<int> bt)
{
    if (bt != null)
    {
       if(bt.GetLeft() != null &&
         bt.GetValue() == bt.GetLeft().GetValue())
         What2(bt.GetLeft());
       if(bt.GetRight() != null &&
          bt.GetValue() == bt.GetRight().GetValue())
          What2(bt.GetRight());
        What3(bt.GetLeft());
        What3(bt.GetRight());
    }
}`;
const Q7 = `
public static int What1(BinNode<int> t, Stack<int> st)
{
    if (t == null || (t.GetLeft() == null && t.GetRight() == null))
        return 0;
    if (t.GetLeft() != null && t.GetRight() != null)
        return What1(t.GetLeft(), st) + What1(t.GetRight(), st);
    else
    {
        st.Push(t.GetValue());
        return 1 + What1(t.GetLeft(), st) + What1(t.GetRight(), st);
    }
}`;
const Q7_MAIN = `
static void Main(string[] args)
{
    Stack<int> s = new Stack<int>();
    Console.WriteLine(What1(bt, s));
    Console.WriteLine(s);
}`;
const Q7_RUN = treeOf("bt", TQ7) + "\nStack<int> s = new Stack<int>();\n";
const Q24 = `
public static int What1(BinNode<int> bt, int V)
{
    return What2(bt, V, 1) - 1;
}

public static int What2(BinNode<int> bt, int V, int X)
{
    if (bt == null)
        return 0;
    if (bt.GetValue() == V)
        return X;
    int Y = What2(bt.GetLeft(), V, X + 1);
    if (Y != 0)
        return Y;
    Y = What2(bt.GetRight(), V, X + 1);
    return Y;
}`;

// ── حلول أسئلة الكتابة (من وضع المؤلّف) ────────────────────────────────────────────────────────────────────────────────
const LEAVES_SUM = `
public static int SumOfLeaves(BinNode<int> bt)
{
    if (bt == null)
        return 0;
    if (!bt.HasLeft() && !bt.HasRight())
        return bt.GetValue();
    return SumOfLeaves(bt.GetLeft()) + SumOfLeaves(bt.GetRight());
}

public static bool IsLeavesSum(BinNode<int> bt, int Sum)
{
    return SumOfLeaves(bt) == Sum;
}`;
const LEAVES_SUM_WRONG = `
public static int SumOfLeaves(BinNode<int> bt)
{
    if (bt == null)
        return 0;
    if (!bt.HasLeft() || !bt.HasRight())
        return bt.GetValue();
    return SumOfLeaves(bt.GetLeft()) + SumOfLeaves(bt.GetRight());
}`;
const JUD = `
public static bool HasChild(BinNode<int> bt)
{
    return bt != null && (bt.HasLeft() || bt.HasRight());
}

public static bool IsJud(BinNode<int> bt)
{
    if (bt == null)
        return false;
    return HasChild(bt.GetLeft()) || HasChild(bt.GetRight());
}

public static int CountIsJud(BinNode<int> bt)
{
    if (bt == null)
        return 0;
    int Count = CountIsJud(bt.GetLeft()) + CountIsJud(bt.GetRight());
    if (IsJud(bt))
        Count++;
    return Count;
}`;
const PATH_SUM = `
public static bool HasPathSum(BinNode<int> bt, int Sum)
{
    if (bt == null)
        return false;
    if (!bt.HasLeft() && !bt.HasRight())
        return bt.GetValue() == Sum;
    int Rest = Sum - bt.GetValue();
    return HasPathSum(bt.GetLeft(), Rest) || HasPathSum(bt.GetRight(), Rest);
}`;
const ARE_MIRROR = `
public static bool AreMirror(BinNode<int> bt1, BinNode<int> bt2)
{
    if (bt1 == null && bt2 == null)
        return true;
    if (bt1 == null || bt2 == null)
        return false;
    return bt1.GetValue() == bt2.GetValue()
        && AreMirror(bt1.GetLeft(), bt2.GetRight())
        && AreMirror(bt1.GetRight(), bt2.GetLeft());
}`;
const MIRROR = `
public static BinNode<int> Mirror(BinNode<int> bt)
{
    if (bt == null)
        return null;
    return new BinNode<int>(Mirror(bt.GetRight()),
                            bt.GetValue(),
                            Mirror(bt.GetLeft()));
}`;
const SECRET = `
public static int Secret(BinNode<int> bt)
{
    if (bt == null)
        return 0;
    if (!bt.HasLeft() && !bt.HasRight())
        return 1;
    return Secret(bt.GetLeft()) + Secret(bt.GetRight());
}`;
const yesNo = call => `Console.Write(${call} ? "true" : "false");`;
// مقاطع قصيرة تُعرض فوق أسئلة «ماذا يطبع المقطع؟»
const BUILD_Q = [
  "BinNode<int> t = new BinNode<int>(new BinNode<int>(4), 9, null);",
  "t.GetLeft().SetRight(new BinNode<int>(6));",
  "Console.Write(t.GetLeft().GetRight().GetValue() + t.GetValue());",
].join("\n");
const PRACTICE_Q = [
  "BinNode<int> t = new BinNode<int>(10);",
  "t.SetLeft(new BinNode<int>(4));",
  "t.SetRight(new BinNode<int>(new BinNode<int>(7), 20, null));",
  "Console.Write(t.GetRight().GetLeft().GetValue() - t.GetLeft().GetValue());",
].join("\n");
// برهان سؤال «ماذا في الدور؟»: أول دورتين من LevelsOrder يدويًّا على الشجرة TV
const QUEUE_Q = `
public static void Main()
{
    ${treeOf("bt", TV)}
    Queue<BinNode<int>> q = new Queue<BinNode<int>>();
    q.Insert(bt);
    BinNode<int> t = q.Remove();
    q.Insert(t.GetLeft());
    q.Insert(t.GetRight());
    t = q.Remove();
    q.Insert(t.GetLeft());
    q.Insert(t.GetRight());
    Console.Write(q);
}`;

export default {
  n: 6,
  title: "الأشجار الثنائية (BinNode)",
  short: "الأشجار الثنائية",
  description: "مصطلحات الشجرة، الخلية الثنائية وبناء شجرة، المبنى التراجعي للشجرة (مجموع القيم وعدد الخلايا)، التمشيط البَدْئي والداخلي والنهائي، شجرة التعابير الحسابية، التمشيط بحسب المستوى بمساعدة دور، حساب ارتفاع الشجرة، وأسئلة تتبّع وكتابة.",
  src: "243",
  lessons: [
    {
      title: "مصطلحات الشجرة",
      pages: [
        {
          title: "الشجرة الثنائية ومصطلحاتها",
          keywords: ["شجرة ثنائية", "جذر", "ورقة", "أب", "ابن", "مستوى", "ارتفاع", "شجرة فرعية"],
          objective: "أن تسمّي أجزاء الشجرة الثنائية: الجذر، الأوراق، المستويات والارتفاع.",
          blocks: [
            XH("ما الشجرة؟", 2),
            XP("حتى الآن رتّبنا المعلومات في **خط واحد**: سلسلة خلايا، راصّة، دور. في __الشجرة__ الترتيب مختلف: من كل خلية قد تتفرّع خلايا أخرى، كما في شجرة العائلة، أو في مجلّدات الحاسوب التي بداخلها مجلّدات."),
            XDEF("الشجرة الثنائية", "**الشجرة الثنائية** (`Binary Tree`) مبنى معلومات مكوّن من خلايا، ولكل خلية **على الأكثر ابنان**: __ابن أيسر__ و__ابن أيمن__. الخلية التي في أعلى الشجرة تسمّى __الجذر__، ومنها نصل إلى كل خلية أخرى."),
            FIG("شجرة ثنائية فيها 6 خلايا", [{ kind: "tree", tree: T6, facts: true, label: "الجذر في الأعلى والأوراق في الأسفل" }]),
            XLIST([
              ["الجذر (`Root`)", "الخلية التي في أعلى الشجرة، وليس لها أب. في الرسم: `5`."],
              ["أب وابن (`Parent` / `Child`)", "الخلية `3` هي __أب__ للخليتين `1` و `4`، وهما __ابناها__: `1` الابن الأيسر و `4` الابن الأيمن."],
              ["ورقة (`Leaf`)", "خلية ليس لها أبناء. في الرسم: `1` و `4` و `9`."],
              ["خلية داخلية (`Internal Node`)", "خلية لها ابن واحد على الأقل. في الرسم: `5` و `3` و `7`."],
              ["شجرة فرعية (`Sub Tree`)", "خلية ما مع كل الخلايا التي تحتها. الخلية `3` مع `1` و `4` هي الشجرة الفرعية اليسرى للجذر."],
              ["مستوى (`Level`)", "الجذر في المستوى 0، وأبناؤه في المستوى 1، وأبناء أبنائه في المستوى 2، وهكذا."],
              ["مسار (`Path`)", "خلايا متتالية ننتقل فيها من أب إلى ابنه. من الجذر إلى الورقة `4`: الخلية `5` ثم `3` ثم `4`."],
              ["ارتفاع (`Height`)", "عدد الخطوط الموصلة من الجذر إلى **أبعد** ورقة. ارتفاع الشجرة التي في الرسم 2."],
            ], { title: "مصطلحات نستعملها في كل الوحدة" }),
            XNOTE("ثلاث حالات للارتفاع", "شجرة فيها خلية واحدة فقط ارتفاعها `0`. مع كل مستوى إضافي يزيد الارتفاع بواحد. والشجرة الفارغة (`null`) نعرّف ارتفاعها `-1`. هكذا يحسب الكتاب الارتفاع في صفحة 269."),
            FIG("الارتفاع في ثلاث أشجار", [
              { kind: "tree", tree: 8, facts: true, label: "خلية واحدة: الارتفاع 0" },
              { kind: "tree", tree: [8, [4, null, 6], null], facts: true, label: "ثلاث خلايا في مسار واحد: الارتفاع 2" },
              { kind: "tree", tree: [8, 4, [12, 10, 14]], facts: true, label: "خمس خلايا: الارتفاع 2 أيضًا" },
            ]),
            XP("جرّب بنفسك: اختر خلية وأضف لها ابنًا، أو احذف ورقة، وراقب كيف يتغيّر عدد الخلايا والأوراق والارتفاع."),
            LAB("tree", { tree: T6, title: "جرّب: أضف أبناء واحذف أوراقًا", description: "متى يزيد الارتفاع؟ ومتى تتوقّف خلية عن كونها ورقة؟" }),
            CLAR("كلمات الكتاب", "الكتاب يكتب «البيناريّة» بمعنى الثنائية، و«ولد» بمعنى ابن، وفي التمارين «عقدة» بمعنى خلية. المعنى واحد."),
            CLAR("صفحة إثراء", "مقدّمة الفصل (ص 244–245) ليست في نسخة الكتاب التي بين أيدينا، فكُتبت تعريفات هذه الصفحة إثراءً. وهي تتّفق مع ما يقوله الكتاب في الصفحات التالية."),
            MC("في الرسم الأول (شجرة فيها 6 خلايا)، أي الخلايا أوراق؟", ["5 و3 و7", "*1 و4 و9", "3 و7 فقط", "1 و4 فقط"], "الورقة خلية ليس لها أبناء. الخلية 7 لها ابن أيمن (9) فليست ورقة، أمّا 9 فلا أبناء لها."),
            MATCH("صِل كل مصطلح بمعناه:", [["الجذر", "الخلية التي ليس لها أب"], ["ورقة", "خلية ليس لها أبناء"], ["شجرة فرعية", "خلية مع كل الخلايا التي تحتها"], ["الارتفاع", "عدد الخطوط من الجذر إلى أبعد ورقة"]], "الجذر واحد في كل شجرة، والأوراق قد تكون كثيرة. كل خلية هي جذر لشجرة فرعية."),
            SHORT("شجرة فيها جذر، وللجذر ابن أيسر واحد فقط، ولهذا الابن ابن أيمن واحد فقط. ما ارتفاع الشجرة؟", "2", "من الجذر إلى الورقة الوحيدة خطّان، فالارتفاع 2. اتجاه الابن (أيسر أو أيمن) لا يغيّر الارتفاع."),
            TF("في الشجرة الثنائية، لكل خلية ابنان بالضبط.", false, "لكل خلية **على الأكثر** ابنان: قد يكون لها ابنان، أو ابن واحد، أو لا أبناء (ورقة)."),
          ],
        },
      ],
    },
    {
      title: "الخلية الثنائية `BinNode<T>`",
      pages: [
        {
          title: "الخلية الثنائية وواجهة الفئة `BinNode<T>`",
          src: "246–247",
          keywords: ["BinNode<T>", "Left", "Right", "Value", "HasLeft", "HasRight"],
          objective: "أن تعرف صفات الخلية الثنائية وعمليات الفئة BinNode.",
          blocks: [
            H("الخلية الثنائية – `BinNode`", 2),
            P("معنى الكلمة **ثنائية** أنّ لكل خلية في الشجرة **على الأكثر** ابنان، ابن أيسر وابن أيمن. معنى **على الأكثر** أي أنّ عدد الأبناء قد يكون:"),
            LIST([
              "`0` – حينها تكون الخلية ورقة.",
              "`1` – أي للخلية ابن واحد فقط، إمّا ابن أيسر أو ابن أيمن.",
              "`2` – أي للخلية ابنان بالضبط، ابن أيسر وابن أيمن.",
            ]),
            P("ولذلك ستحتوي الخلية الثنائية على **مؤشّرين اثنين**: مؤشّر إلى الابن الأيمن – `Right` – ومؤشّر إلى الابن الأيسر – `Left`. القيم تُخزّن في الصفة `Value`. لاحظ أنّ الفئة `BinNode` هي فئة عامّة، أي `Generic Class`."),
            FIG("خلية ثنائية واحدة", [{ kind: "tree", tree: 5, pointers: [["bt", ""]], label: "`Value = 5`، و `Left` و `Right` يساويان `null`" }]),
            XP("قارن بخلية السلسلة `Node<T>`: هناك مؤشّر واحد `Next` إلى الخلية التالية، وهنا مؤشّران `Left` و `Right` إلى الابنين. مؤشّر قيمته `null` معناه أنّ هذا الابن غير موجود."),
            P("والآن نتعرّف على واجهة هذه الفئة العامّة `BinNode<T>`:"),
            API("`BinNode<T>`", [
              ["private T Value;", "القيمة أو المعلومة المُخزّنة في الخلية."],
              ["private BinNode<T> Left, Right;", "مؤشّر إلى خلية الابن الأيمن وآخر إلى خلية الابن الأيسر."],
              ["public BinNode(int Value)", "عملية بنائية تتلقّى قيمة ومن ثمّ تنشئ خلية مُخزّنة فيها القيمة والمؤشّران يؤشّران إلى `null`، أي غير موجودين."],
              ["public BinNode(BinNode<T> Left, T Value, BinNode<T> Right)", "عملية بنائية تتلقّى قيمة ومؤشّرين ومن ثمّ تنشئ خلية مُخزّنة فيها القيمة والمؤشّران يؤشّران إلى ما يؤشّر إليه البارامتران."],
              ["public T GetValue()", "عملية `Get` للصفة `Value`."],
              ["public void SetValue(T Value)", "عملية `Set` للصفة `Value`."],
              ["public void SetLeft(BinNode<T> Left)", "عملية `Set` للصفة `Left`."],
              ["public BinNode<T> GetLeft()", "عملية `Get` للصفة `Left`."],
              ["public void SetRight(BinNode<T> Right)", "عملية `Set` للصفة `Right`."],
              ["public BinNode<T> GetRight()", "عملية `Get` للصفة `Right`."],
              ["public bool HasRight()", "عملية تُعيد `true` إذا كان للخلية الحالية ابن أيمن. خلاف ذلك تُعيد `false`."],
              ["public bool HasLeft()", "عملية تُعيد `true` إذا كان للخلية الحالية ابن أيسر. خلاف ذلك تُعيد `false`."],
              ["public override string ToString()", "عملية تُعيد القيمة كنصّ."],
            ]),
            CLAR("خطأ مطبعي في الكتاب", "العملية البنائية الأولى مطبوعة في الكتاب `public BinNode(int Value)`. المقصود `public BinNode(T Value)`: الفئة عامّة، فنمط القيمة هو `T` وليس `int` دائمًا. بالصيغة الصحيحة نستطيع أن نكتب مثلًا `new BinNode<char>('+')`."),
            CLAR("جدول الكتاب", "في الكتاب تظهر عمليات `Get` و `Set` الست في خانة واحدة وصفها «عملية Get وعملية Set لكل صفة». فصلناها هنا إلى أسطر لتسهل قراءتها."),
            XNOTE("انتبه", "قبل أن تكتب `bt.GetLeft().GetValue()` تأكّد أنّ الابن الأيسر موجود: `if (bt.HasLeft())`. استدعاء عملية على `null` خطأ في التشغيل."),
            MATCH("صِل كل عملية بما تفعله:", [["`GetLeft()`", "تُعيد مؤشّرًا إلى الابن الأيسر"], ["`SetRight(x)`", "تجعل `x` الابن الأيمن للخلية"], ["`HasLeft()`", "تفحص إن كان للخلية ابن أيسر"], ["`GetValue()`", "تُعيد القيمة المخزّنة في الخلية"]], "عمليات `Get` تقرأ صفة، وعمليات `Set` تغيّرها، و `HasLeft` و `HasRight` تفحصان وجود الابن."),
            MC("كم مؤشّرًا إلى خلايا أخرى يوجد في كل خلية من النوع `BinNode<T>`؟", ["مؤشّر واحد: `Next`", "*مؤشّران: `Left` و `Right`", "ثلاثة مؤشّرات: `Left` و `Right` و `Parent`", "لا يوجد مؤشّرات"], "في الخلية الثنائية مؤشّران: واحد إلى الابن الأيسر وواحد إلى الابن الأيمن. الخلية لا تحفظ مؤشّرًا إلى أبيها."),
            TF("يمكن أن يكون لخلية ثنائية ابن أيمن دون أن يكون لها ابن أيسر.", true, "عدد الأبناء 0 أو 1 أو 2. إذا كان للخلية ابن واحد فقد يكون الأيسر وقد يكون الأيمن."),
          ],
        },
        {
          title: "بناء شجرة خطوة بخطوة",
          src: "247–249",
          keywords: ["بناء شجرة", "SetLeft", "SetRight", "عملية بنائية"],
          objective: "أن تبني شجرة ثنائية صغيرة بأوامر C#.",
          blocks: [
            P("والآن دعونا نتعرّف على كيفية استعمال هذه الفئة لإنشاء أشجار ثنائية. الأمر التالي يُنشئ لنا خلية ثنائية جديدة مُخزّنة فيها القيمة 5 ولا أبناء لها – أي أنّها بنفسها ورقة:"),
            CS("BinNode<int> bt = new BinNode<int>(5);"),
            P("والأمر التالي يُضيف إلى الخلية `bt` ابنًا أيسر مُخزّنة فيه القيمة 5:"),
            CS("bt.SetLeft(new BinNode<int>(3));"),
            CLAR("خطأ مطبعي في الكتاب", "نصّ الكتاب يقول «القيمة 5»، لكنّ الأمر نفسه والرسم في الكتاب يخزّنان في الابن الأيسر القيمة `3`. الصحيح: القيمة 3."),
            P("والأمر التالي يُضيف إلى الخلية `bt` ابنًا أيمن مُخزّنة فيه القيمة 7:"),
            CS("bt.SetRight(new BinNode<int>(7));"),
            FIG("الشجرة بعد كل أمر", [
              { kind: "tree", tree: 5, pointers: [["bt", ""]], label: "بعد `new BinNode<int>(5)`" },
              { kind: "tree", tree: [5, 3, null], pointers: [["bt", ""]], hi: ["L"], label: "بعد `SetLeft`: ابن أيسر قيمته 3" },
              { kind: "tree", tree: T3, pointers: [["bt", ""]], hi: ["R"], label: "بعد `SetRight`: ابن أيمن قيمته 7" },
            ]),
            P("كان بإمكاننا إنشاء هذه الشجرة بواسطة **أمر واحد فقط**، من خلال استعمال العملية البنائية الثانية، التي تتلقّى، إضافة إلى القيمة، مؤشّرين إلى الابنين:"),
            CS(`
              BinNode<int> bt = new BinNode<int>(new BinNode<int>(3),
                5,
                new BinNode<int>(7));`),
            XTIP("ترتيب البارامترات", "في العملية البنائية الثانية الترتيب مثل الرسم: الابن الأيسر، ثم القيمة، ثم الابن الأيمن. إذا لم يكن هناك ابن نكتب `null` مكانه."),
            P("الأمر التالي يطبع مجموع القيم المُخزّنة في هذه الشجرة:"),
            CS(`
              Console.WriteLine(bt.GetValue() +
                    bt.GetLeft().GetValue() +
                 bt.GetRight().GetValue());`),
            TRACE({ title: "بناء الشجرة أمرًا أمرًا", code: BUILD, description: "أوامر الكتاب (ص 247–249) داخل `Main`. راقب الشجرة وهي تكبر، ثم الناتج." }),
            XP("في المختبر التالي كل إضافة تُكتب تحت الرسم كأمر `C#`. أكمل الشجرة: أضف ابنين للخلية `3`."),
            LAB("tree", { tree: T3, name: "bt", title: "جرّب: أكمل بناء الشجرة", description: "اختر خلية، اكتب قيمة، ثم أضفها ابنًا أيسر أو ابنًا أيمن." }),
            XCS(BUILD_Q),
            proved(MC("ماذا يطبع المقطع أعلاه؟", ["13", "*15", "19", "69"], "الجذر 9 وابنه الأيسر 4. الأمر الثاني يضيف للخلية 4 ابنًا أيمن قيمته 6. المطبوع: `6 + 9 = 15`."),
              { code: "public static void Main()\n{\n" + BUILD_Q.replace(/^/gm, "    ") + "\n}", out: "15" }),
            MC("أي أمر يبني شجرة جذرها 8، وللجذر ابن أيسر قيمته 2، وليس له ابن أيمن؟", ["*`new BinNode<int>(new BinNode<int>(2), 8, null)`", "`new BinNode<int>(null, 8, new BinNode<int>(2))`", "`new BinNode<int>(8, new BinNode<int>(2), null)`", "`new BinNode<int>(2, 8)`"], "ترتيب البارامترات: الابن الأيسر، ثم القيمة، ثم الابن الأيمن. الابن الأيمن غير موجود، فنكتب مكانه `null`."),
          ],
        },
      ],
    },
    {
      title: "المبنى التراجعي للشجرة",
      pages: [
        {
          title: "المبنى التراجعي: مجموع القيم وعدد الخلايا",
          src: "250–252",
          keywords: ["تراجعية", "شجرة فرعية", "SumOfTreeValues", "NumOfTreeNodes", "شرط التوقّف"],
          objective: "أن تكتب عملية تراجعية تمرّ على كل خلايا الشجرة.",
          blocks: [
            H("المبنى التراجعي للشجرة الثنائية", 2),
            P("قلنا سابقًا بأنّ كل جزء من الشجرة (خلية ما وكل الخلايا التي تحتها) هو أيضًا شجرة وتُسمّى __شجرة فرعية__ – `Sub Tree`. ولذلك فمبناها **تراجعي**."),
            LIST([
              "شجرة فارغة، أي مؤشّر إلى `null`،",
              "أو هي خلية الجذر ولها شجرتان ثنائيتان فرعيتان – الشجرة الفرعية اليُمنى والشجرة الفرعية اليُسرى.",
            ], { title: "بإمكاننا أن نعرّف الشجرة الثنائية بشكل تراجعي على أنّها" }),
            FIG("الجذر وشجرتاه الفرعيتان", [{ kind: "tree", tree: T7, hi: ["L", "LL", "LR"], label: "المظلّلة: الشجرة الفرعية اليسرى للجذر" }]),
            P("هذه الحقيقة تجعل كتابة عمليات تعمل على الأشجار بشكل تراجعي أمرًا سهلًا نوعًا ما. وإليكم بعض الأمثلة:"),
            EX({
              title: "مثال (1)", prompt: "اكتب عملية تراجعية تتلقّى مؤشّرًا إلى جذر شجرة ثنائية من نمط صحيح، ومن ثمّ تُعيد مجموع القيم المُخزّنة في خلاياها.",
              steps: ["شرط التوقّف: أن تكون الشجرة فارغة، حينها نُعيد القيمة 0.", "خلاف ذلك: نُعيد القيمة المُخزّنة في الخلية الحالية + مجموع القيم في الشجرة الفرعية اليُسرى + مجموع القيم في الشجرة الفرعية اليُمنى."],
              explanation: "لاحظ أنّ شرط التوقّف يتحقّق كلّما انتهينا من جمع القيم في الأشجار الفرعية. لاحظ أنّ العملية `GetLeft()` تُعيد مؤشّرًا إلى الشجرة الفرعية اليُسرى والعملية `GetRight()` تُعيد مؤشّرًا إلى الشجرة الفرعية اليُمنى.",
            }),
            CS(SUM_PRE),
            TRACE({
              title: "`SumOfTreeValues` على شجرة من 3 خلايا", code: SUM_PRE,
              run: treeOf("bt", T3) + "\nConsole.WriteLine(SumOfTreeValues(bt));",
              given: "الشجرة `bt`: الجذر 5، ابنه الأيسر 3 وابنه الأيمن 7. الاستدعاء `SumOfTreeValues(bt)`.",
              description: "راقب راصّة الاستدعاءات: كل استدعاء ينتظر نتيجتَي ابنيه، ثم يجمع ويعيد.",
            }),
            P("**كود لفحص العملية:**"),
            CS(SUM_TEST_TREE.trim() + "\nConsole.WriteLine(\"Sum of tree values is {0}\", SumOfTreeValues(bt));"),
            P("الشجرة التي أنشأناها لإجراء الفحص هي التالية:"),
            FIG("شجرة الفحص", [{ kind: "tree", tree: T7, facts: true }]),
            P("من الآن فصاعدًا نرسم الشجرة بشكل مُبسّط كما في الصورة أعلاه: الخلية الثنائية دائرة فيها القيمة المُخزّنة داخلها، والمؤشّرات هي الأسهم الخارجة من الدائرة."),
            XP("الكتاب لا يطبع ناتج كود الفحص. الناتج هو `Sum of tree values is 35`، لأنّ `5 + 3 + 7 + 2 + 4 + 6 + 8 = 35`."),
            EX({
              title: "مثال (2)", prompt: "اكتب عملية تراجعية تتلقّى مؤشّرًا إلى جذر شجرة ثنائية من نمط صحيح، ومن ثمّ تُعيد عدد خلاياها.",
              steps: ["شرط التوقّف: أن تكون الشجرة فارغة، حينها نُعيد القيمة 0.", "خلاف ذلك: نُعيد 1 + عدد خلايا الشجرة الفرعية اليُسرى + عدد خلايا الشجرة الفرعية اليُمنى."],
            }),
            CS(NUM),
            TRACE({
              title: "`NumOfTreeNodes` على شجرة من 4 خلايا", code: NUM,
              run: treeOf("bt", [5, [3, null, 4], 7]) + "\nConsole.WriteLine(NumOfTreeNodes(bt));",
              given: "الشجرة `bt`: الجذر 5، ابنه الأيسر 3 (وله ابن أيمن 4)، وابنه الأيمن 7. الاستدعاء `NumOfTreeNodes(bt)`.",
              description: "كل خلية تعدّ نفسها (1) وتضيف ما يعيده ابناها. الابن غير الموجود يعيد 0.",
            }),
            XTIP("قالب العملية التراجعية على شجرة", "أولًا: إذا كانت الشجرة فارغة (`bt == null`) نعيد قيمة جاهزة. ثانيًا: نعالج الخلية الحالية، ونستدعي العملية نفسها للشجرة الفرعية اليسرى وللشجرة الفرعية اليمنى، ثم نركّب النتائج."),
            proved(SHORT("ما القيمة التي تعيدها `SumOfTreeValues(bt)` لشجرة الفحص التي في الرسم (7 خلايا)؟", "35", "`5 + 3 + 7 + 2 + 4 + 6 + 8 = 35`. كل خلية تُجمع مرة واحدة."),
              { code: SUM_PRE, run: SUM_TEST_TREE.trim() + "\nConsole.Write(SumOfTreeValues(bt));", out: "35" }),
            provedCount(SHORT("شجرة فيها 3 خلايا: جذر وابنان. كم مرة تُستدعى `SumOfTreeValues` بالمجموع (مع الاستدعاءات التي تتلقّى `null`)؟", "7", "3 استدعاءات للخلايا الثلاث، و4 استدعاءات تتلقّى `null`: لكل ورقة ابنان غير موجودين. المجموع 7. تأكّد من التتبّع أعلاه."),
              { code: SUM_PRE, run: treeOf("bt", T3) + "\nConsole.Write(SumOfTreeValues(bt));" }, "if (bt == null)", 7),
            MC("ماذا يحدث لو حذفنا من `NumOfTreeNodes` شرط التوقّف `if (bt == null) return 0;`؟", ["تعيد العملية عددًا أكبر بواحد", "تعيد العملية 0 دائمًا", "*خطأ في التشغيل: نصل إلى `null` ونستدعي عليه `GetLeft()`", "لا يتغيّر شيء"], "بدون شرط التوقّف تستمرّ العملية إلى ابن غير موجود، أي `null`، وتحاول استدعاء `bt.GetLeft()` عليه. شرط التوقّف هو الذي يوقف التراجعية عند كل شجرة فرعية فارغة."),
          ],
        },
      ],
    },
    {
      title: "طرق تمشيط الشجرة",
      pages: [
        {
          title: "ثلاث طرق للتمشيط بحسب العمق",
          src: "253–254",
          keywords: ["تمشيط", "Preorder", "Inorder", "Postorder", "DFS", "BFS"],
          objective: "أن تميّز بين التمشيط البَدْئي والداخلي والنهائي.",
          blocks: [
            H("طرق لكيفية تمشيط شجرة ثنائية", 2),
            P("لاحظ أنّنا في المثالين السابقين استعملنا **نفس القالب** لتمشيط الشجرة بشكل كامل:"),
            OL([
              "أولًا عالجنا الأب – أخذنا قيمته في المثال الأول أو عددناه في المثال الثاني.",
              "ثم عالجنا الابن الأيسر أو الشجرة الفرعية اليُسرى بشكل تراجعي.",
              "ثم عالجنا الابن الأيمن أو الشجرة الفرعية اليُمنى بشكل تراجعي.",
            ]),
            P("والحقيقة أنّ هذا القالب يُعتبر واحدة من عدّة طرق لكيفية تمشيط شجرة ثنائية. هذه الطرق تنقسم إلى قسمين:"),
            H("1. تمشيط بحسب العمق – `Depth First Traversals`", 3),
            LIST([
              ["تمشيط بَدْئي – `Preorder Traversal (Root-Left-Right)`", "نزور الأب أولًا ثم الابن الأيسر ثم الابن الأيمن. **الأب في البداية.**"],
              ["تمشيط داخلي أو ضمني – `Inorder Traversal (Left-Root-Right)`", "نزور الابن الأيسر أولًا ثم الأب ثم الابن الأيمن. **الأب في الداخل أو الوسط.**"],
              ["تمشيط نهائي – `Postorder Traversal (Left-Right-Root)`", "نزور الابن الأيسر أولًا ثم الابن الأيمن ثم الأب. **الأب في النهاية.**"],
            ], { title: "وهو ينقسم إلى 3 طرق" }),
            FIG("الطرق الثلاث على شجرة من 3 خلايا", [
              { kind: "tree", tree: T3, hi: [""], label: "`Preorder`: الأب 5 ثم 3 ثم 7" },
              { kind: "tree", tree: T3, hi: [""], label: "`Inorder`: نزور 3 ثم الأب 5 ثم 7" },
              { kind: "tree", tree: T3, hi: [""], label: "`Postorder`: نزور 3 ثم 7 ثم الأب 5" },
            ]),
            H("2. تمشيط بحسب المستوى – `Breadth First Traversal`", 3),
            P("ويُسمّى أيضًا `Level Order Traversal`. سنناقش هذا النوع من التمشيط لاحقًا."),
            P("يُسمّى التمشيط أحيانًا بالبحث، ولذلك يُقال `Depth First Search – DFS` أو `Breadth First Search – BFS`."),
            P("يُعتبر المثالان السابقان، العملية `SumOfTreeValues` والعملية `NumOfTreeNodes`، مثالين على تمشيط بَدْئي لأنّنا عالجنا الأب أولًا ثم الابن الأيسر ثم الابن الأيمن. النتيجة ستكون نفسها لو استخدمنا أي طريقة من الطريقتين الأخريين، تمشيط داخلي أو تمشيط نهائي."),
            P("تمشيط الشجرة وفق طريقة التمشيط الداخلي – `Inorder`. هنا عالجنا أولًا الابن الأيسر ثم الأب ثم الابن الأيمن:"),
            CS(SUM_IN),
            P("تمشيط الشجرة وفق طريقة التمشيط النهائي – `Postorder`. هنا عالجنا أولًا الابن الأيسر ثم الابن الأيمن ثم الأب:"),
            CS(SUM_POST),
            XP("لماذا لا تتغيّر النتيجة؟ لأنّ المجموع لا يتأثّر بترتيب الجمع. لكن حين **نطبع** القيم يظهر الفرق بين الطرق الثلاث، كما في الصفحة التالية."),
            FIG("شجرة من 7 خلايا", [{ kind: "tree", tree: T7 }]),
            GUIDED({
              title: "نحلّ معًا: ترتيب الزيارة في الطرق الثلاث",
              prompt: "في أي ترتيب تُزار خلايا الشجرة التي في الرسم (7 خلايا) في كل طريقة؟ فكّر أولًا ثم اكشف الخطوات.",
              steps: [
                "`Preorder` (الأب أولًا): نبدأ بالجذر `5`. ثم الشجرة الفرعية اليسرى كلها: `3` ثم `2` ثم `4`. ثم الشجرة الفرعية اليمنى كلها: `7` ثم `6` ثم `8`.",
                "ترتيب `Preorder` هو `[5,3,2,4,7,6,8]`.",
                "`Inorder` (الأب في الوسط): الشجرة الفرعية اليسرى كلها أولًا، وفيها أيضًا الأب في الوسط: `2` ثم `3` ثم `4`. ثم الجذر `5`. ثم اليمنى: `6` ثم `7` ثم `8`.",
                "ترتيب `Inorder` هو `[2,3,4,5,6,7,8]`.",
                "`Postorder` (الأب في النهاية): من اليسرى `2` ثم `4` ثم أبوهما `3`. من اليمنى `6` ثم `8` ثم أبوهما `7`. وفي النهاية الجذر `5`.",
                "ترتيب `Postorder` هو `[2,4,3,6,8,7,5]`.",
              ],
              result: "الجذر هو أول خلية في `Preorder` وآخر خلية في `Postorder`. وفي `Inorder` يفصل الجذر بين خلايا شجرته اليسرى وخلايا شجرته اليمنى.",
            }),
            MATCH("صِل كل طريقة بترتيب الزيارة فيها:", [["`Preorder`", "الأب، ثم الابن الأيسر، ثم الابن الأيمن"], ["`Inorder`", "الابن الأيسر، ثم الأب، ثم الابن الأيمن"], ["`Postorder`", "الابن الأيسر، ثم الابن الأيمن، ثم الأب"]], "اسم الطريقة يدلّ على مكان الأب: `Pre` قبل ابنيه، `In` بينهما، `Post` بعدهما. الابن الأيسر دائمًا قبل الأيمن."),
            MC("في أي طريقة يكون جذر الشجرة **آخر** خلية نزورها؟", ["`Preorder`", "`Inorder`", "*`Postorder`", "في الطرق الثلاث"], "في التمشيط النهائي نزور الشجرة الفرعية اليسرى كلها، ثم اليمنى كلها، ثم الأب. فالجذر آخر خلية."),
          ],
        },
        {
          title: "طباعة قيم الشجرة بالطرق الثلاث",
          src: "254–255",
          keywords: ["PreOrder", "InOrder", "PostOrder", "طباعة", "نجاعة خطية"],
          objective: "أن تكتب ناتج طباعة شجرة بكل طريقة من طرق التمشيط الثلاث.",
          blocks: [
            P("أمثلة على تمشيط الشجرة وفق هذه الطرق الثلاث تكمن في **طباعة قيم الشجرة**:"),
            CS(PRE.trim() + "\n" + IN.trim() + "\n" + POST.trim()),
            NOTE("لاحظ", "الفرق الوحيد بين هذه الطرق الثلاث هو **مكان وجود أمر الطباعة**، أي ترتيب طباعة قيمة الأب بين ابنيه الاثنين. الابن الأيسر يأتي دائمًا قبل الابن الأيمن."),
            FIG("الشجرة التي نتتبّع طباعتها", [{ kind: "tree", tree: T5, pointers: [["bt", ""]] }]),
            TRACE({
              title: "`PreOrder`: الأب يُطبع أولًا", code: PRE, max: 80,
              run: treeOf("bt", T5) + "\nPreOrder(bt);",
              given: "الشجرة `bt`: الجذر 5، ابنه الأيسر 3 (وابناه 2 و4)، وابنه الأيمن 7. الاستدعاء `PreOrder(bt)`.",
              description: "كل خلية تُطبع عند الوصول إليها، قبل النزول إلى ابنيها.",
            }),
            TRACE({
              title: "`InOrder`: الأب يُطبع بين ابنيه", code: IN, max: 80,
              run: treeOf("bt", T5) + "\nInOrder(bt);",
              given: "الشجرة نفسها، والاستدعاء `InOrder(bt)`.",
              description: "الخلية تنتظر: تُطبع فقط بعد أن تنتهي شجرتها الفرعية اليسرى كلها.",
            }),
            XP("جرّب في المختبر: اضغط أزرار التمشيط وراقب ترتيب الزيارة. ثم غيّر الشجرة (أضف ابنًا أو احذف ورقة) وتوقّع الترتيب قبل أن تضغط."),
            LAB("tree", { tree: T7, name: "bt", title: "جرّب: طرق التمشيط على شجرتك" }),
            P("من السهل رؤية أنّ درجة نجاعة كل واحدة من هذه الطرق الثلاث **نجاعة خطية** بالنسبة لعدد خلايا الشجرة. فكل واحدة من هذه العمليات تزور كل خلية مرة واحدة فقط، ونجاعة جميع العمليات المُستعملة التابعة للفئة `BinNode` (`GetLeft()` و `GetRight()` و `GetValue()`) نجاعة ثابتة، أي `O(1)`."),
            CLAR("رمز النجاعة", "رمز النجاعة الخطية غير ظاهر في نسخة الكتاب الممسوحة. النجاعة الخطية تُكتب `O(n)`، حيث `n` عدد خلايا الشجرة."),
            proved(MC("ماذا تطبع `PostOrder(bt)` للشجرة `bt` نفسها التي تتبّعناها؟ القيم مكتوبة بالترتيب من اليسار.", [seq(walk(T5, "pre")), seq(walk(T5, "in")), "*" + seq(walk(T5, "post")), seq(levels(T5))], "في `PostOrder` أمر الطباعة بعد الاستدعاءين: نطبع 2 ثم 4 ثم أباهما 3، ثم الشجرة اليمنى 7، وفي النهاية الجذر 5."),
              { code: POST, run: treeOf("bt", T5) + "\nPostOrder(bt);", out: printed(walk(T5, "post")), loose: true }),
            FIG("شجرة للسؤال التالي", [{ kind: "tree", tree: TW, pointers: [["bt", ""]] }]),
            proved(MC("ماذا تطبع `InOrder(bt)` للشجرة التي في الرسم الأخير؟ القيم مكتوبة بالترتيب من اليسار.", ["*" + seq(walk(TW, "in")), seq(walk(TW, "pre")), seq(walk(TW, "post")), seq(levels(TW))], "نبدأ من أقصى اليسار: 4 ثم أبوها 2 (ليس له ابن أيمن)، ثم الجذر 1. في الشجرة اليمنى: الخلية 5 ليس لها ابن أيسر فتُطبع، ثم ابنها الأيمن 6، ثم أبوها 3."),
              { code: IN, run: treeOf("bt", TW) + "\nInOrder(bt);", out: printed(walk(TW, "in")), loose: true }),
            WORDS("أكمل الجملة عن مكان أمر الطباعة:", "في `PreOrder` يأتي أمر الطباعة [[قبل]] الاستدعاءين التراجعيين، وفي `InOrder` يأتي [[بين]] الاستدعاءين، وفي `PostOrder` يأتي [[بعد]] الاستدعاءين.", ["بدل"], "مكان أمر الطباعة هو الفرق الوحيد بين العمليات الثلاث."),
          ],
        },
      ],
    },
    {
      title: "شجرة التعابير الحسابية",
      pages: [
        {
          title: "شجرة التعابير الحسابية",
          src: "255–256",
          keywords: ["Expression Tree", "EvalExpressionTree", "BinNode<char>", "IsLeaf"],
          objective: "أن تحسب قيمة تعبير حسابي مخزّن في شجرة ثنائية.",
          blocks: [
            H("شجرة تعابير حسابية – `Expression Tree`", 2),
            P("شجرة تعابير حسابية بسيطة عبارة عن شجرة ثنائية تُخزّن في خلاياها الداخلية – `Internal Nodes` – رمزًا يُعبّر عن عملية حسابية (`+` أو `-` أو `*` أو `/`) وفي أوراقها أرقامًا (من `0` إلى `9`). لحساب القيمة النهائية للتعبير كتبنا العملية التالية:"),
            CS(EVAL),
            CLAR("في الكتاب", "التعليق `Evaluate left sub tree expression` مطبوع مرّتين. فوق السطر `int RightVal = …` المقصود `right`: حساب الشجرة الفرعية **اليمنى**."),
            XP("الشجرة من النوع `BinNode<char>`: كل خلية تخزّن رمزًا واحدًا. الورقة تخزّن رقمًا كرمز، مثل `'7'`، والأمر `int.Parse(tree.GetValue().ToString())` يحوّله إلى العدد 7. والقسمة في `EvalOperator` قسمة أعداد صحيحة."),
            P("**كود لفحص العملية `EvalExpressionTree`:**"),
            CS(EVAL_TEST_TREE.trim() + "\nstring str = \"(5*7)+(5*2)\";\nConsole.WriteLine(\"{0} = {1}\", str, EvalExpressionTree(bt));"),
            FIG("الشجرة التي يبنيها كود الفحص", [{ kind: "tree", tree: ["+", ["*", "5", "7"], ["*", "5", "2"]], pointers: [["bt", ""]], label: "العمليات في الخلايا الداخلية والأرقام في الأوراق" }]),
            XP("الكتاب لا يرسم هذه الشجرة ولا يطبع الناتج. الناتج هو `(5*7)+(5*2) = 45`."),
            TRACE({
              title: "حساب `(5*7)+(5*2)` خلية خلية", code: EVAL, quiet: ["IsLeaf", "EvalOperator"], max: 80,
              run: EVAL_TEST_TREE.trim() + "\nConsole.WriteLine(EvalExpressionTree(bt));",
              given: "الشجرة التي يبنيها كود الفحص للتعبير `(5*7)+(5*2)`، والاستدعاء `EvalExpressionTree(bt)`.",
              description: "كل عملية حسابية تنتظر قيمة شجرتها اليسرى وقيمة شجرتها اليمنى، ثم تُحسب.",
            }),
            XTIP("أي تمشيط هذا؟", "العملية تحسب الشجرة الفرعية اليسرى، ثم اليمنى، وفي **النهاية** تعالج الأب (العملية الحسابية): هذا تمشيط نهائي – `Postorder`. ولو طبعنا قيم الشجرة بتمشيط داخلي – `Inorder` – لحصلنا على التعبير كما نكتبه، بدون الأقواس: `5 * 7 + 5 * 2`."),
            FIG("شجرة تعبير للسؤال التالي", [{ kind: "tree", tree: ["/", ["-", "9", "3"], "2"] }]),
            proved(SHORT("ما القيمة التي تعيدها `EvalExpressionTree` لشجرة التعبير التي في الرسم الأخير؟", "3", "الشجرة اليسرى: `9 - 3 = 6`. الشجرة اليمنى ورقة قيمتها 2. الجذر عملية قسمة: `6 / 2 = 3`. التعبير هو `(9-3)/2`."),
              { code: EVAL, run: charTreeOf("bt", ["/", ["-", "9", "3"], "2"]) + "\nConsole.Write(EvalExpressionTree(bt));", out: "3" }),
            proved(MC("شجرة تعبير جذرها `/`، ابنه الأيسر الورقة `7` وابنه الأيمن الورقة `2`. ماذا تعيد `EvalExpressionTree`؟", ["`3.5`", "*3", "4", "خطأ في التشغيل"], "`EvalOperator` تعيد `int`، والقسمة `a / b` بين عددين صحيحين قسمة صحيحة: `7 / 2 = 3` والباقي يُهمل."),
              { code: EVAL, run: charTreeOf("bt", ["/", "7", "2"]) + "\nConsole.Write(EvalExpressionTree(bt));", out: "3" }),
            TF("في شجرة تعابير حسابية يمكن أن تكون العملية `+` مخزّنة في ورقة.", false, "العملية الحسابية تحتاج إلى طرفين، فهي دائمًا في خلية داخلية لها ابنان. الأوراق تخزّن الأرقام فقط."),
          ],
        },
      ],
    },
    {
      title: "التمشيط بحسب المستوى وارتفاع الشجرة",
      pages: [
        {
          title: "التمشيط بحسب المستوى",
          src: "266–268",
          keywords: ["Breadth First", "LevelsOrder", "Queue<BinNode<int>>", "مستوى", "LevelsOrderList"],
          objective: "أن تمشّط شجرة مستوى بعد مستوى بمساعدة دور.",
          blocks: [
            H("تمشيط بحسب المستوى – `Breadth First Traversal`", 2),
            OL([
              "أن نزور الجذر – أي نزور الخلية الموجودة في المستوى رقم 0.",
              "ثم نزور الخلايا الموجودة في المستوى رقم 1 من اليسار إلى اليمين.",
              "ثم نزور الخلايا الموجودة في المستوى رقم 2 من اليسار إلى اليمين.",
              "وهكذا إلى آخر مستوى في الشجرة.",
            ], { title: "المقصود بالتمشيط بحسب المستوى هو" }),
            EX({
              title: "مثال (3)", prompt: "بالنسبة للشجرة التالية، والتمشيط بهدف الطباعة مثلًا، تُطبع القيم التالية: `A E G X F M D K`",
              steps: ["مستوى رقم 0: `A`", "مستوى رقم 1: `E` ثم `G`", "مستوى رقم 2: `X` ثم `F` ثم `M`", "مستوى رقم 3: `D` ثم `K`"],
            }),
            FIG("شجرة المثال (3)", [{ kind: "tree", tree: ["A", ["E", "X", "F"], ["G", null, ["M", "D", "K"]]], label: "الخلية `G` لها ابن أيمن فقط" }]),
            P("يستعين ألغوريثم التمشيط بحسب المستوى **بدور** من نوع `Queue<BinNode<...>>` ويُنفّذ الأوامر التالية:"),
            OL([
              "قم ببناء دور جديد من نوع `Queue<BinNode<...>>`.",
              "أدخل الجذر إلى الدور.",
              "طالما أنّ الدور ليس فارغًا: أخرج خلية من الدور، واطبع القيمة المُخزّنة في هذه الخلية. إذا كان لهذه الخلية ابن أيسر أدخله إلى الدور، وإذا كان لها ابن أيمن أدخله إلى الدور.",
            ]),
            P("وإليكم البرمجة بلغة `C#`. لاحظ أنّنا افترضنا بأنّ خلايا الشجرة تحتوي على قيم صحيحة."),
            CS(LEVELS),
            XP("لماذا دور؟ الدور يعمل وفق المبدأ `FIFO`: من يدخل أولًا يخرج أولًا. خلايا المستوى 1 تدخل الدور قبل خلايا المستوى 2، فتخرج وتُطبع قبلها."),
            FIG("الشجرة التي نتتبّعها", [{ kind: "tree", tree: T6, pointers: [["bt", ""]] }]),
            TRACE({
              title: "`LevelsOrder`: الشجرة والدور معًا", code: LEVELS, max: 80,
              run: treeOf("bt", T6) + "\nLevelsOrder(bt);",
              given: "الشجرة `bt`: الجذر 5، ابنه الأيسر 3 (وابناه 1 و4)، وابنه الأيمن 7 (وله ابن أيمن 9). الاستدعاء `LevelsOrder(bt)`.",
              description: "راقب الدور: الخلية التي تخرج تُطبع، ويدخل ابناها إلى نهاية الدور.",
            }),
            XNOTE("انتبه", "العملية تفترض أنّ الشجرة ليست فارغة. لو كان `bt` يساوي `null` لدخل `null` إلى الدور، ثم يفشل الأمر `btTemp.GetValue()`."),
            P("أحيانًا لا نريد طباعة القيم، وإنّما نريد إعادة القيم بواسطة سلسلة خلايا مترابطة. ولذلك المطلوب كتابة عملية تتلقّى جذر شجرة ثنائية `BinNode<int>` ومن ثمّ تقوم بتمشيطها بحسب المستوى وتعيد القيم بواسطة سلسلة خلايا مترابطة."),
            CS(LEVELS_LIST),
            XP("التمشيط هو نفسه. بدل الطباعة نضيف كل قيمة إلى **نهاية** السلسلة بمساعدة المؤشّر `Last`. كود الفحص في الكتاب يبني شجرته بالعملية `ToBST` التي نتعلّمها في الوحدة التالية، لذلك نفحص هنا على الشجرة التي تتبّعناها:"),
            FIG("السلسلة التي تعيدها `LevelsOrderList` للشجرة التي تتبّعناها", [{ kind: "chain", items: levels(T6), pointers: [["Head", 0], ["Last", 5]] }]),
            FIG("شجرة للأسئلة التالية", [{ kind: "tree", tree: TV, pointers: [["bt", ""]] }]),
            proved(MC("ماذا تطبع `LevelsOrder(bt)` للشجرة التي في الرسم الأخير؟ القيم مكتوبة بالترتيب من اليسار.", [seq(walk(TV, "pre")), "*" + seq(levels(TV)), seq(walk(TV, "in")), seq(walk(TV, "post"))], "المستوى 0: الجذر 4. المستوى 1: 9 ثم 2. المستوى 2: 1 ثم 6 ثم 7. المستوى 3: 3. في كل مستوى نقرأ من اليسار إلى اليمين."),
              { code: LEVELS, run: treeOf("bt", TV) + "\nLevelsOrder(bt);", out: printed(levels(TV)) + "\n", loose: true }),
            proved(MC("للشجرة نفسها: ماذا يكون في الدور `q` (من الرأس) مباشرة بعد أن تُخرج الخلية 9 ويدخل ابناها؟", ["`[1,6]`", "*`[2,1,6]`", "`[1,6,2]`", "`[9,2]`"], "بعد إخراج الجذر 4 يدخل ابناه: `[9,2]`. ثم تخرج 9 من الرأس ويدخل ابناها 1 و6 إلى **نهاية** الدور، فتبقى 2 في الرأس: `[2,1,6]`."),
              { code: QUEUE_Q, out: "[2,1,6]" }),
            proved(SHORT("للشجرة نفسها: ما القيمة المخزّنة في الخلية **الرابعة** من السلسلة التي تعيدها `LevelsOrderList(bt)`؟", "1", "السلسلة بترتيب المستويات: 4 ثم 9 ثم 2 ثم 1 ثم 6 ثم 7 ثم 3. الخلية الرابعة قيمتها 1."),
              { code: LEVELS_LIST, run: treeOf("bt", TV) + "\nNode<int> Head = LevelsOrderList(bt);\nConsole.Write(Head.GetNext().GetNext().GetNext().GetValue());", out: "1" }),
            ORDER("رتّب ما يحدث في دورة واحدة من حلقة `LevelsOrder`:", ["نُخرج خلية من رأس الدور", "نطبع قيمة هذه الخلية", "إذا كان لها ابن أيسر ندخله إلى الدور", "إذا كان لها ابن أيمن ندخله إلى الدور"], "الابن الأيسر يدخل قبل الأيمن، ولذلك تُطبع خلايا كل مستوى من اليسار إلى اليمين."),
          ],
        },
        {
          title: "ارتفاع الشجرة",
          src: "269",
          keywords: ["ارتفاع", "Height", "Math.Max"],
          objective: "أن تحسب ارتفاع شجرة ثنائية بعملية تراجعية.",
          blocks: [
            H("حساب ارتفاع شجرة ثنائية", 2),
            P("قلنا سابقًا بأنّ ارتفاع الشجرة هو عدد الخطوط الموصلة من الجذر إلى **أبعد** ورقة. إذا كانت الشجرة مكوّنة من خلية واحدة – أي `Leaf Tree` – يكون ارتفاعها 0. ومع كل مستوى إضافي يزيد ارتفاع الشجرة بواحد. نُعرّف بأنّ ارتفاع شجرة فارغة (أي عندما تكون `bt = null`) يكون `-1`."),
            P("لاحظ أنّنا نحسب ارتفاع الشجرة الفرعية اليُسرى ثم نحسب ارتفاع الشجرة الفرعية اليُمنى. ثم نُعيد الأعلى من بين الارتفاعين بعد إضافة 1 للخط الواصل بين الجذر والمستوى رقم 1. وعليه نحصل على العملية التالية لحساب ارتفاع شجرة ثنائية:"),
            CS(HEIGHT),
            P("الصورة التالية تُبيّن كيفية حساب الارتفاع:"),
            FIG("حساب الارتفاع من `hl` و `hr`", [{ kind: "tree", tree: TH, hi: ["L", "LL"], facts: true, label: "`hl = 1` و `hr = 0`، إذن `h = 1 + 1 = 2`" }]),
            XP("في الرسم: الشجرة الفرعية اليسرى (المظلّلة) ارتفاعها `hl = 1`، واليمنى ورقة فارتفاعها `hr = 0`. الأعلى بينهما 1، ونضيف 1 للخط النازل من الجذر."),
            TRACE({
              title: "`Height` على شجرة من 4 خلايا", code: HEIGHT, max: 80,
              run: treeOf("bt", TH) + "\nConsole.WriteLine(Height(bt));",
              given: "الشجرة `bt` التي في الرسم: الجذر 5، ابنه الأيسر 3 (وله ابن أيسر 1)، وابنه الأيمن 7. الاستدعاء `Height(bt)`.",
              description: "راقب `hl` و `hr` في كل إطار: كل خلية تأخذ الأعلى بينهما وتضيف 1.",
            }),
            XTIP("لماذا `-1` للشجرة الفارغة؟", "للورقة ابنان غير موجودين، فعندها `hl = -1` و `hr = -1`. إذن ارتفاع الورقة `1 + Math.Max(-1, -1) = 0`، وهذا بالضبط ما نريده."),
            proved(SHORT("ما القيمة التي تعيدها `Height(bt)` لشجرة فيها 7 خلايا: الجذر 5، ابناه 3 و7، ولكل واحد منهما ابنان؟", "2", "من الجذر إلى أي ورقة خطّان. ارتفاع كل شجرة فرعية 1، فالنتيجة `1 + 1 = 2`."),
              { code: HEIGHT, run: treeOf("bt", T7) + "\nConsole.Write(Height(bt));", out: "2" }),
            FIG("شجرة للسؤال التالي", [{ kind: "tree", tree: [9, [4, null, [6, 5, null]], null], pointers: [["bt", ""]] }]),
            proved(SHORT("ما القيمة التي تعيدها `Height(bt)` للشجرة التي في الرسم الأخير (4 خلايا)؟", "3", "الخلايا الأربع في مسار واحد، ومن الجذر 9 إلى الورقة 5 ثلاثة خطوط. اتجاه الأبناء لا يغيّر الارتفاع."),
              { code: HEIGHT, run: treeOf("bt", [9, [4, null, [6, 5, null]], null]) + "\nConsole.Write(Height(bt));", out: "3" }),
            MC("شجرة ثنائية ارتفاعها 2. ما أكبر عدد ممكن من الخلايا فيها؟", ["3", "4", "*7", "8"], "في المستوى 0 خلية واحدة، وفي المستوى 1 خليتان على الأكثر، وفي المستوى 2 أربع خلايا على الأكثر: `1 + 2 + 4 = 7`. وأصغر عدد ممكن 3 خلايا في مسار واحد."),
            TF("شجرة فيها خلية واحدة فقط ارتفاعها 1.", false, "ارتفاعها 0: لا يوجد أي خط بين الجذر وورقة، فالجذر نفسه هو الورقة."),
          ],
        },
      ],
    },
    {
      title: "أسئلة تتبّع وكتابة",
      pages: [
        {
          title: "أسئلة تتبّع (1): سؤال 5 من الكتاب",
          src: "284–285",
          keywords: ["تتبّع", "What1", "What2", "What3", "بحث في شجرة"],
          blocks: [
            XP("تتبّع كل عملية **بدون** الاستعانة بالحاسوب. أجب أولًا، ثم افتح التتبّع لتتأكّد."),
            EX({
              mode: "practice", title: "سؤال 5 من الكتاب", prompt: "معطاة العمليات التالية والشجرة الثنائية `bt`.",
              steps: [
                "تتبّع تنفيذ العملية `What1` بالنسبة للابن الأيمن للشجرة الثنائية `bt` و `Val = 1`، وحدّد مهمّة العملية ودرجة نجاعتها.",
                "تتبّع تنفيذ العملية `What2` بالنسبة للشجرة الثنائية `bt`، وحدّد مهمّة العملية ودرجة نجاعتها. لا حاجة لتتبّع استدعاءات العملية `What1`.",
                "تتبّع تنفيذ العملية `What3` بالنسبة للشجرة الثنائية `bt`، وحدّد مهمّة العملية ودرجة تعقيدها. لا حاجة لتتبّع استدعاءات العملية `What2`.",
              ],
            }),
            CS(Q5),
            FIG("الشجرة `bt`", [{ kind: "tree", tree: TQ5, pointers: [["bt", ""]] }]),
            CLAR("في الكتاب", "في نصّ السؤال كُتبت أسماء العمليات بحرف صغير: `what1` و `what2` و `what3`. في الكود الأسماء `What1` و `What2` و `What3`، ولغة `C#` تميّز بين الحرف الكبير والصغير."),
            XH("القسم 1 — العملية `What1`", 3),
            proved(SHORT("ماذا تعيد `What1(bt.GetRight(), 1)`؟ اكتب `true` أو `false`.", "true", "الابن الأيمن للجذر هو الخلية 3، وابنها الأيمن 5، وابنه الأيمن 1. العملية تنزل في هذا المسار حتى تجد القيمة 1 فتعيد `true`."),
              { code: Q5, run: treeOf("bt", TQ5) + "\n" + yesNo("What1(bt.GetRight(), 1)"), out: "true" }),
            MC("ما مهمّة العملية `What1`؟", ["تعيد `true` إذا كانت قيمة الجذر تساوي `Val` فقط", "*تعيد `true` إذا كانت القيمة `Val` موجودة في إحدى خلايا الشجرة", "تعدّ الخلايا التي قيمتها `Val`", "تعيد `true` إذا كانت `Val` موجودة في ورقة فقط"], "العملية تفحص الخلية الحالية، وإذا لم تجد القيمة تبحث في الشجرة الفرعية اليسرى ثم في اليمنى. في أسوأ الحالات تزور كل خلية مرة واحدة، فنجاعتها خطية: `O(n)`."),
            TRACE({
              title: "تتبّع `What1` على الابن الأيمن للجذر", code: Q5,
              run: treeOf("bt", TQ5) + "\nConsole.WriteLine(What1(bt.GetRight(), 1));",
              given: "الشجرة `bt` التي في الرسم، والاستدعاء `What1(bt.GetRight(), 1)`.",
            }),
            XH("القسم 2 — العملية `What2`", 3),
            proved(SHORT("ننفّذ `What2(bt)` على الشجرة الأصلية. ما قيمة الجذر بعد انتهاء العملية؟", "7", "`Temp` يبدأ من 3. القيم 3 و4 و5 و6 موجودة كلها في الشجرة، فيزيد `Temp` في كل مرة. القيمة 7 غير موجودة، فتتوقّف الحلقة ويصير الجذر 7."),
              { code: Q5, run: treeOf("bt", TQ5) + "\nWhat2(bt);\nConsole.Write(bt.GetValue());", out: "7" }),
            XP("مهمّة `What2`: تغيّر قيمة الجذر إلى أول عدد أكبر من قيمته **غير موجود** في الشجرة. الحلقة تدور على الأكثر `n + 1` مرات، وفي كل دورة تُستدعى `What1` التي نجاعتها `O(n)`. لذلك نجاعة `What2` هي `O(n²)`."),
            TRACE({
              title: "تتبّع `What2` على الشجرة `bt`", code: Q5, quiet: ["What1"],
              run: treeOf("bt", TQ5) + "\nWhat2(bt);\nConsole.WriteLine(bt.GetValue());",
              given: "الشجرة `bt` التي في الرسم، والاستدعاء `What2(bt)`. استدعاءات `What1` تُنفّذ بدون تتبّع، كما يطلب السؤال.",
            }),
            XH("القسم 3 — العملية `What3`", 3),
            proved(MC("ننفّذ `What3(bt)` على الشجرة الأصلية. أي خلايا تتغيّر قيمتها؟", ["الجذر فقط: يصير 7", "*الابن الأيمن للجذر يصير 4، والخلية 5 التي لها ابنان (6 و3) تصير 7", "كل خلية قيمتها 3 تصير 4", "لا تتغيّر أي خلية"], "العملية تفحص كل أب مع ابنيه. الجذر 3 يساوي ابنه الأيمن 3، فتُستدعى `What2` على هذا الابن: القيمة 4 غير موجودة في شجرته الفرعية فيصير 4. والخلية 5 (الابن الأيسر للجذر) تساوي ابنها الأيمن 5، وفي شجرة هذا الابن القيمتان 5 و6 موجودتان، فيصير 7."),
              { code: Q5, run: treeOf("bt", TQ5) + "\nWhat3(bt);\nConsole.Write(bt.GetRight().GetValue() + \" \" + bt.GetLeft().GetRight().GetValue());", out: "4 7", loose: true }),
            XP("مهمّة `What3`: تمرّ على كل الشجرة، وكل ابن قيمته **تساوي** قيمة أبيه تغيّر قيمته بمساعدة `What2`. في النهاية لا يبقى ابن يساوي أباه. العملية تزور كل خلية مرة واحدة، وقد تستدعي عندها `What2`، فدرجة تعقيدها لا تزيد على `O(n³)`."),
            TRACE({
              title: "تتبّع `What3` على الشجرة `bt`", code: Q5, quiet: ["What1", "What2"], max: 250,
              run: treeOf("bt", TQ5) + "\nWhat3(bt);",
              given: "الشجرة `bt` التي في الرسم، والاستدعاء `What3(bt)`. استدعاءات `What2` تُنفّذ بدون تتبّع، كما يطلب السؤال.",
              description: "راقب الشجرة: متى تتغيّر قيمة خلية؟",
            }),
          ],
        },
        {
          title: "أسئلة تتبّع (2): سؤالا 7 و24 من الكتاب",
          src: "287–303",
          keywords: ["تتبّع", "راصّة", "مستوى خلية"],
          blocks: [
            EX({
              mode: "practice", title: "سؤال 7 من الكتاب", prompt: "معطاة العمليات التالية والشجرة الثنائية `bt`.",
              steps: [
                "تتبّع تنفيذ العملية `What1(bt,s)` بالنسبة للشجرة الثنائية `bt` التالية والراصّة الفارغة `s` بشكل مفصّل، واصفًا حالة الراصّة والقيم المُرجعة.",
                "سجّل ادّعاءَي الدخول والخروج للعملية `What1`.",
              ],
            }),
            CS(Q7.trim() + Q7_MAIN),
            FIG("الشجرة `bt`", [{ kind: "tree", tree: TQ7, pointers: [["bt", ""]] }]),
            XP("في `Main` الشجرة `bt` معطاة: هي الشجرة التي في الرسم."),
            proved(SHORT("ما العدد الذي يطبعه الأمر `Console.WriteLine(What1(bt, s));`؟", "3", "الخلايا التي لها ابن واحد فقط هي 82 و76 و70، وكل واحدة منها تضيف 1. الجذر 86 له ابنان فلا يُعدّ، والورقتان 78 و66 تعيدان 0."),
              { code: Q7, run: Q7_RUN + "Console.Write(What1(bt, s));", out: "3" }),
            proved(MC("ماذا يطبع الأمر `Console.WriteLine(s);` بعد ذلك؟", ["`[82,76,70]`", "*`[70,76,82]`", "`[86,82,70]`", "`[66,78]`"], "القيم تُدفع بترتيب الزيارة: 82 ثم 76 (في الشجرة اليسرى) ثم 70. آخر ما دُفع هو رأس الراصّة، فتُطبع `[70,76,82]`."),
              { code: Q7, run: Q7_RUN + "What1(bt, s);\nConsole.Write(s);", out: "[70,76,82]" }),
            TRACE({
              title: "تتبّع سؤال 7", code: Q7, max: 120,
              run: Q7_RUN + "Console.WriteLine(What1(bt, s));\nConsole.WriteLine(s);",
              given: "الشجرة `bt` التي في الرسم والراصّة الفارغة `s`، ثم أوامر `Main`.",
              description: "راقب الراصّة: أي خلايا تُدفع قيمها؟",
            }),
            XP("**ادّعاء الدخول:** تتلقّى العملية جذر شجرة ثنائية `t` وراصّة `st`. **ادّعاء الخروج:** تعيد عدد الخلايا التي لها **ابن واحد بالضبط**، وتُدخل قيم هذه الخلايا إلى الراصّة."),
            EX({
              mode: "practice", title: "سؤال 24 من الكتاب", prompt: "معطاة العمليتان التاليتان والشجرة التالية `bt` – قيمها لا تتكرّر.",
              steps: ["تتبّع الاستدعاء `What1(bt, 8)` وحدّد ماذا يُعاد.", "ما هي مهمّة العملية `What1`؟"],
            }),
            CS(Q24),
            FIG("الشجرة `bt`", [{ kind: "tree", tree: TQ24, pointers: [["bt", ""]] }]),
            proved(SHORT("ما القيمة التي يعيدها `What1(bt, 8)`؟", "2", "`What2` تبدأ بالقيمة `X = 1` عند الجذر، وتزيد `X` بواحد مع كل نزول. القيمة 8 في المستوى 2، فهناك `X = 3`، وتُعاد 3. ثم `What1` تطرح 1: النتيجة 2."),
              { code: Q24, run: treeOf("bt", TQ24) + "\nConsole.Write(What1(bt, 8));", out: "2" }),
            proved(SHORT("وما القيمة التي يعيدها `What1(bt, 6)`؟ (القيمة 6 غير موجودة في الشجرة)", "-1", "حين لا توجد القيمة تعيد `What2` العدد 0 من كل الاستدعاءات، فتعيد `What1` القيمة `0 - 1`، أي `-1`."),
              { code: Q24, run: treeOf("bt", TQ24) + "\nConsole.Write(What1(bt, 6));", out: "-1" }),
            MC("ما مهمّة العملية `What1`؟", ["تعيد عدد الخلايا التي قيمتها أصغر من `V`", "تعيد ارتفاع الشجرة", "*تعيد رقم المستوى الذي فيه الخلية التي قيمتها `V`، وتعيد `-1` إذا لم توجد", "تعيد عدد أبناء الخلية التي قيمتها `V`"], "`X` يعدّ الخلايا في المسار من الجذر إلى الخلية الحالية. عند إيجاد القيمة يُعاد `X`، وبعد طرح 1 نحصل على رقم المستوى: الجذر في المستوى 0."),
            TRACE({
              title: "تتبّع `What1(bt, 8)`", code: Q24, max: 120,
              run: treeOf("bt", TQ24) + "\nConsole.WriteLine(What1(bt, 8));",
              given: "الشجرة `bt` التي في الرسم، والاستدعاء `What1(bt, 8)`.",
              description: "البحث يبدأ في الشجرة الفرعية اليسرى. متى ينتقل إلى اليمنى؟",
            }),
          ],
        },
        {
          title: "أسئلة كتابة: اكتب العملية",
          src: "282–302",
          keywords: ["كتابة عملية", "أوراق", "HasPathSum", "CountIsJud", "مرآة"],
          blocks: [
            XP("اكتب كل عملية في دفترك أو في محرّر الكود **قبل** أن تنتقل إلى الصفحة التالية، ففيها الحلول مع تتبّعها. الأسئلة الأربعة من تمارين الكتاب."),
            EX({ mode: "practice", title: "سؤال 2 من الكتاب", prompt: "اكتب عملية تتلقّى كبارامترات شجرة ثنائية من نوع `int` أي `BinNode<int>` وعددًا صحيحًا `Sum`. العملية تعيد `true` إذا كان حاصل جمع قيم جميع الأوراق مساويًا لـ `Sum`. خلاف ذلك تعيد العملية `false`. مثال: بالنسبة للشجرة التالية و `Sum = 9` تعيد العملية `true` لأنّ `-6 + 8 + 7 = 9`." }),
            FIG("شجرة سؤال 2", [{ kind: "tree", tree: TQ2, hi: ["LL", "RL", "RRL"], label: "الأوراق مظلّلة" }]),
            XCS("public static bool IsLeavesSum(BinNode<int> bt, int Sum)\n{\n    // اكتب هنا\n}"),
            EX({
              mode: "practice", title: "سؤال 10 من الكتاب",
              steps: [
                "اكتب عملية باسم `IsJud` تتلقّى شجرة ثنائية من الأعداد الصحيحة وترجع `true` إن كان «جدًّا» (أي له ابن ولابنه ابن) و `false` خلاف ذلك.",
                "اكتب عملية `CountIsJud` تتلقّى شجرة ثنائية من الأعداد الصحيحة وترجع عدد الأجداد في الشجرة.",
              ],
            }),
            P("**مثلًا في الشجرة التالية هنالك 4 أجداد:**"),
            FIG("شجرة سؤال 10", [{ kind: "tree", tree: TQ10, hi: ["", "L", "LL", "R"], label: "الأجداد الأربعة مظلّلون" }]),
            CLAR("سؤال 10", "المقصود في البند الأول: **جذر** الشجرة التي تتلقّاها العملية هو «جدّ» إذا كان له ابن، ولهذا الابن ابن. في رسم الكتاب الخلايا بلا قيم؛ الأرقام هنا للتمييز بين الخلايا فقط."),
            XCS("public static bool IsJud(BinNode<int> bt)\n{\n    // اكتب هنا\n}\n\npublic static int CountIsJud(BinNode<int> bt)\n{\n    // اكتب هنا\n}"),
            EX({ mode: "practice", title: "سؤال 11 من الكتاب", prompt: "اكتب عملية باسم `HasPathSum` تتلقّى كبارامتر جذر شجرة ثنائية `bt` من نوع `BinNode<int>` وعددًا صحيحًا `Sum`. العملية تعيد `true` إذا وجدت مسارًا واحدًا على الأقل حاصل جمع قيم خلاياه يساوي العدد `Sum`. خلاف ذلك تعيد العملية `false`." }),
            FIG("شجرة سؤال 11", [{ kind: "tree", tree: TQ11, pointers: [["bt", ""]] }]),
            LIST([
              "`HasPathSum(bt, 21)` لأنّ `3 + 8 + 10 = 21`",
              "`HasPathSum(bt, 23)` لأنّ `5 + 8 + 10 = 23`",
              "`HasPathSum(bt, 14)` لأنّ `2 + 2 + 10 = 14`",
            ], { title: "مثال: بالنسبة للشجرة أعلاه تعيد الاستدعاءات التالية `true`" }),
            CLAR("سؤال 11", "السؤال لا يقول أين يبدأ المسار وأين ينتهي. في الأمثلة الثلاثة يبدأ المسار من **الجذر** وينتهي عند **ورقة**، وهذا هو المعنى الذي نعتمده في الحل."),
            XCS("public static bool HasPathSum(BinNode<int> bt, int Sum)\n{\n    // اكتب هنا\n}"),
            EX({
              mode: "practice", title: "سؤال 23 من الكتاب",
              steps: [
                "اكتب عملية خارجية تتلقّى شجرتين ثنائيتين `bt1` و `bt2` تحويان أعدادًا صحيحة. العملية تُعيد `true` إذا كانت `bt2` مرآة لـ `bt1`. خلاف ذلك تُعيد العملية `false`.",
                "ما هي درجة نجاعة زمن تشغيل العملية من القسم أ؟ اشرح.",
                "اكتب عملية خارجية تتلقّى شجرة ثنائية `bt` تحوي أعدادًا صحيحة. العملية تُنشئ وتُعيد شجرة ثنائية جديدة هي مرآة لـ `bt`.",
              ],
            }),
            NOTE("لاحظ", "الجذر يبقى في شجرة المرآة كما هو، وكل ابن أيسر يُصبح ابنًا أيمن، والعكس أيضًا: كل ابن أيمن يُصبح ابنًا أيسر، وهكذا بالنسبة لكل الشجرة."),
            P("أمامك أمثلة لأزواج من الأشجار الثنائية حيث كل واحدة مرآة للأخرى:"),
            FIG("سؤال 23: الزوج الأول", [
              { kind: "tree", tree: [1, [2, 4, 5], [3, 6, 7]] },
              { kind: "tree", tree: [1, [3, 7, 6], [2, 5, 4]] },
            ]),
            FIG("سؤال 23: الزوج الثاني", [
              { kind: "tree", tree: TM },
              { kind: "tree", tree: [1, [3, 7, 6], 2] },
            ]),
            CLAR("سؤال 23", "البنود في الكتاب مرقّمة بالأرقام، لكنّ البند الثاني يقول «القسم أ». المقصود: العملية التي كتبتها في البند الأول."),
            XCS("public static bool AreMirror(BinNode<int> bt1, BinNode<int> bt2)\n{\n    // اكتب هنا\n}\n\npublic static BinNode<int> Mirror(BinNode<int> bt)\n{\n    // اكتب هنا\n}"),
            XLIST([
              "هل للعملية شرط توقّف يعالج الشجرة الفارغة (`null`)؟",
              "هل تفحص وجود الابن قبل أن تستدعي عليه `GetValue()`؟",
              "هل تستدعي العملية نفسها للشجرة الفرعية اليسرى **وأيضًا** لليمنى؟",
              "هل تعيد العملية قيمة في **كل** مسار ممكن في الكود؟",
            ], { title: "افحص حلّك قبل أن ترى الحل", variant: "checklist" }),
          ],
        },
        {
          title: "حلول أسئلة الكتابة",
          keywords: ["حلول", "SumOfLeaves", "CountIsJud", "HasPathSum", "Mirror"],
          blocks: [
            XH("حل سؤال 2 — مجموع الأوراق", 3),
            XCS(LEAVES_SUM),
            XLIST([
              "عملية مساعدة تراجعية `SumOfLeaves` تحسب مجموع قيم الأوراق.",
              "شرط التوقّف الأول: شجرة فارغة تعيد 0.",
              "شرط التوقّف الثاني: الورقة (بلا ابن أيسر **و** بلا ابن أيمن) تعيد قيمتها.",
              "خلية داخلية لا تضيف قيمتها: تعيد مجموع ما يعيده ابناها فقط.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            FIG("شجرة سؤال 2", [{ kind: "tree", tree: TQ2, pointers: [["bt", ""]], hi: ["LL", "RL", "RRL"] }]),
            TRACE({
              title: "تتبّع `IsLeavesSum` على شجرة السؤال", code: LEAVES_SUM, max: 100,
              run: treeOf("bt", TQ2) + "\nConsole.WriteLine(IsLeavesSum(bt, 9));",
              given: "شجرة سؤال 2 (أوراقها `-6` و `8` و `7`)، والاستدعاء `IsLeavesSum(bt, 9)`.",
              description: "أي خلايا تعيد قيمتها، وأيها تعيد مجموع ما يعيده ابناها فقط؟",
            }),
            XP("طالب كتب شرط الورقة بالعملية `||` بدل `&&`:"),
            XCS(LEAVES_SUM_WRONG),
            proved(MC("ماذا تعيد عملية الطالب لشجرة السؤال؟ (الصحيح 9)", ["9", "*6", "0", "خطأ في التشغيل"], "بالشرط `||` تُعتبر كل خلية ينقصها ابن واحد ورقة. الخلية `-1` اليسرى ينقصها ابن أيمن، فتُعاد قيمتها ولا نصل إلى الورقة `-6`. وكذلك الخلية `-1` اليمنى تُعاد بدل الورقة 7. المجموع: `-1 + 8 + -1 = 6`."),
              { code: LEAVES_SUM_WRONG, run: treeOf("bt", TQ2) + "\nConsole.Write(SumOfLeaves(bt));", out: "6" }),
            XH("حل سؤال 10 — الأجداد", 3),
            XCS(JUD),
            XP("العملية المساعدة `HasChild` تجيب عن سؤال واحد: هل الخلية موجودة ولها ابن واحد على الأقل؟ الجذر «جدّ» إذا كان أحد ابنيه كذلك. و `CountIsJud` تعدّ الأجداد في الشجرتين الفرعيتين، ثم تضيف 1 إذا كان الجذر نفسه جدًّا."),
            TRACE({
              title: "تتبّع `CountIsJud` على شجرة صغيرة", code: JUD, quiet: ["IsJud", "HasChild"], max: 100,
              run: treeOf("bt", [1, [2, 3, null], 4]) + "\nConsole.WriteLine(CountIsJud(bt));",
              given: "الشجرة `bt`: الجذر 1، ابنه الأيسر 2 (وله ابن أيسر 3)، وابنه الأيمن 4. الاستدعاء `CountIsJud(bt)`.",
              description: "الجذر وحده جدّ: ابنه 2 له ابن.",
            }),
            proved(SHORT("ما القيمة التي تعيدها `CountIsJud(bt)` لشجرة سؤال 10 (9 خلايا)؟", "4", "الأجداد: الجذر 1 (ابنه 2 له ابن)، والخلية 2 (ابنها 3 له ابن)، والخلية 3 (ابنها 4 له ابن)، والخلية 6 (ابنها 7 له ابن). الخلية 4 ابنها ورقة، فليست جدًّا."),
              { code: JUD, run: treeOf("bt", TQ10) + "\nConsole.Write(CountIsJud(bt));", out: "4" }),
            XH("حل سؤال 11 — `HasPathSum`", 3),
            XCS(PATH_SUM),
            XLIST([
              "شجرة فارغة: لا يوجد مسار، نعيد `false`.",
              "عند الورقة ينتهي المسار: نفحص إن كانت قيمتها تساوي ما بقي من `Sum`.",
              "عند خلية داخلية نطرح قيمتها من `Sum` ونبحث عن الباقي في الشجرة اليسرى **أو** في اليمنى.",
              "لا نعيد `true` عند خلية داخلية حتى لو صار الباقي 0: المسار يجب أن ينتهي عند ورقة.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            TRACE({
              title: "تتبّع `HasPathSum(bt, 14)`", code: PATH_SUM, max: 100,
              run: treeOf("bt", TQ11) + "\nConsole.WriteLine(HasPathSum(bt, 14));",
              given: "شجرة سؤال 11، والاستدعاء `HasPathSum(bt, 14)`.",
              description: "راقب `Sum` في كل إطار: كم بقي من المجموع المطلوب؟",
            }),
            proved(SHORT("ماذا تعيد `HasPathSum(bt, 18)` لشجرة سؤال 11؟ اكتب `true` أو `false`.", "false", "`10 + 8 = 18`، لكنّ الخلية 8 ليست ورقة، فهذا ليس مسارًا كاملًا. المسارات من الجذر إلى الأوراق مجاميعها 21 و23 و14 فقط."),
              { code: PATH_SUM, run: treeOf("bt", TQ11) + "\n" + yesNo("HasPathSum(bt, 18)"), out: "false" }),
            XH("حل سؤال 23 — المرآة", 3),
            XCS(ARE_MIRROR),
            XCS(MIRROR),
            XP("في `AreMirror` نقارن **يسار** الأولى مع **يمين** الثانية، ويمين الأولى مع يسار الثانية. كل خلية تُزار مرة واحدة على الأكثر، فالنجاعة خطية: `O(n)`، حيث `n` عدد خلايا الشجرة الأصغر. و `Mirror` تبني لكل خلية خلية جديدة، وتضع مرآة الشجرة اليمنى في اليسار ومرآة اليسرى في اليمين."),
            TRACE({
              title: "تتبّع `Mirror`: شجرة جديدة تُبنى", code: MIRROR, max: 100,
              run: treeOf("bt", TM) + "\nBinNode<int> m = Mirror(bt);\nPreOrder(m);", lib: PRE,
              given: "الشجرة `bt` من الزوج الثاني في السؤال: الجذر 1، ابنه الأيسر 2، وابنه الأيمن 3 (وابناه 6 و7). الأمر `BinNode<int> m = Mirror(bt);` ثم طباعة `m` بتمشيط بَدْئي.",
              description: "الشجرة الأصلية لا تتغيّر، والشجرة الجديدة تُبنى من الأوراق صعودًا.",
            }),
            proved(SHORT("معطاة الشجرتان `bt1` و `bt2` من الزوج الأول في السؤال. ماذا تعيد `AreMirror(bt1, bt2)`؟ اكتب `true` أو `false`.", "true", "الجذران متساويان، ويسار الأولى (2 وابناه 4 و5) مرآة ليمين الثانية (2 وابناه 5 و4)، وكذلك يمين الأولى مع يسار الثانية."),
              { code: ARE_MIRROR, run: treeOf("bt1", [1, [2, 4, 5], [3, 6, 7]]) + "\n" + treeOf("bt2", [1, [3, 7, 6], [2, 5, 4]]) + "\n" + yesNo("AreMirror(bt1, bt2)"), out: "true" }),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "شجرة ثنائية"],
          blocks: [
            WORDS("أكمل الجمل عن مصطلحات الشجرة:", "الخلية التي في أعلى الشجرة تسمّى [[الجذر]]، والخلية التي ليس لها أبناء تسمّى [[ورقة]]، وعدد الخطوط من الجذر إلى أبعد ورقة هو [[الارتفاع]].", ["المستوى", "الرأس"], "الجذر واحد وليس له أب. الورقة بلا أبناء. والارتفاع يُقاس إلى أبعد ورقة."),
            XCS(PRACTICE_Q),
            proved(SHORT("ماذا يطبع المقطع أعلاه؟", "3", "الابن الأيمن للجذر هو الخلية 20، وابنها الأيسر 7. الابن الأيسر للجذر 4. المطبوع: `7 - 4 = 3`."),
              { code: "public static void Main()\n{\n" + PRACTICE_Q.replace(/^/gm, "    ") + "\n}", out: "3" }),
            FIG("الشجرة `bt` للأسئلة التالية", [{ kind: "tree", tree: TP, pointers: [["bt", ""]] }]),
            CLASSIFY("صنّف خلايا الشجرة `bt` التي في الرسم:", ["ورقة", "خلية داخلية"], [["9", 0], ["6", 1], ["1", 0], ["5", 1], ["3", 0], ["8", 1], ["2", 1]], "الأوراق بلا أبناء: 9 و1 و3. الخلية 5 لها ابن أيسر (1) والخلية 8 لها ابن أيمن (3)، فهما داخليتان."),
            MATCH("للشجرة `bt` التي في الرسم: صِل كل عملية بما تطبعه (القيم مكتوبة بالترتيب من اليسار):", [["`PreOrder(bt)`", seq(walk(TP, "pre"))], ["`InOrder(bt)`", seq(walk(TP, "in"))], ["`PostOrder(bt)`", seq(walk(TP, "post"))], ["`LevelsOrder(bt)`", seq(levels(TP))]], "ابحث عن الجذر 6: في `PreOrder` و `LevelsOrder` هو أول قيمة، وفي `PostOrder` آخر قيمة، وفي `InOrder` في الوسط بين خلايا اليسار وخلايا اليمين."),
            proved(SHORT("ما القيمة التي تعيدها `Height(bt)` للشجرة `bt` التي في الرسم؟", "3", "أبعد ورقة هي 1: من الجذر 6 إلى 2 ثم 5 ثم 1، أي ثلاثة خطوط."),
              { code: HEIGHT, run: treeOf("bt", TP) + "\nConsole.Write(Height(bt));", out: "3" }),
            XCS(SECRET),
            proved(SHORT("ما القيمة التي تعيدها `Secret(bt)` للشجرة `bt` التي في الرسم؟", "3", "الورقة تعيد 1، والشجرة الفارغة تعيد 0، والخلية الداخلية تجمع ما يعيده ابناها. إذن العملية تعدّ الأوراق: 9 و1 و3."),
              { code: SECRET, run: treeOf("bt", TP) + "\nConsole.Write(Secret(bt));", out: "3" }),
            MC("ما مهمّة العملية `Secret`؟", ["تعيد عدد خلايا الشجرة", "*تعيد عدد الأوراق في الشجرة", "تعيد ارتفاع الشجرة", "تعيد عدد الخلايا الداخلية"], "القيمة 1 تُعاد عند الأوراق فقط. الخلايا الداخلية لا تضيف شيئًا، بل تجمع نتيجتَي ابنيها."),
            TF("في التمشيط بحسب المستوى نستعين براصّة من نوع `Stack<BinNode<int>>`.", false, "نستعين **بدور** من نوع `Queue<BinNode<int>>`: الخلية التي دخلت أولًا تخرج أولًا، فتُطبع خلايا كل مستوى قبل المستوى الذي تحته."),
            proved(MC("شجرة تعبير حسابي جذرها `*`. ابنه الأيسر `-` وله الورقتان `8` (يسرى) و `2` (يمنى)، وابنه الأيمن الورقة `3`. ماذا تعيد `EvalExpressionTree`؟", ["2", "14", "*18", "13"], "الشجرة اليسرى: `8 - 2 = 6`. ثم الجذر: `6 * 3 = 18`. التعبير هو `(8-2)*3`."),
              { code: EVAL, run: charTreeOf("bt", ["*", ["-", "8", "2"], "3"]) + "\nConsole.Write(EvalExpressionTree(bt));", out: "18" }),
            MC("ماذا تعيد كل واحدة من العمليات `SumOfTreeValues` و `NumOfTreeNodes` و `Height` حين تتلقّى شجرة فارغة (`null`)؟", ["كلها تعيد 0", "*الأولى 0، والثانية 0، والثالثة `-1`", "الأولى 0، والثانية 1، والثالثة 0", "كلها تعيد `-1`"], "مجموع شجرة فارغة 0 وعدد خلاياها 0. أمّا ارتفاعها فنعرّفه `-1`، حتى يكون ارتفاع الورقة `1 + (-1) = 0`."),
            MC("ما درجة نجاعة العملية `PreOrder` لشجرة فيها `n` خلايا؟", ["`O(1)`", "`O(log n)`", "*`O(n)`", "`O(n²)`"], "العملية تزور كل خلية مرة واحدة فقط، والعمليات `GetLeft` و `GetRight` و `GetValue` نجاعتها ثابتة. لذلك النجاعة خطية."),
          ],
        },
      ],
    },
  ],
};
