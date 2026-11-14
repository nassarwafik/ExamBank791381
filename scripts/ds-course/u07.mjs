// Unit 7 — شجرة البحث الثنائية (الكتاب: الفصل السادس، ص 257–263 و 270–280، وتمارين مختارة من ص 281–299).
import {
  P, H, DEF, NOTE, LIST, OL, TABLE, EX, CS, OUT, CLAR, XP, XH, XCS, XOUT, XEX, XTIP, XNOTE, XLIST, XTABLE, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, LAB, FIG, proved, provedCount, treeOf,
} from "./dsl.mjs";

/** "40 20 10 " (what a traversal prints) → "`[40,20,10]`" (how an option / an explanation writes it). */
const seq = out => "`[" + out.trim().split(/\s+/).join(",") + "]`";

// ── كود الكتاب ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const TO_BST = `
public static BinNode<int> ToBST(int[] A)
{
    BinNode<int> bt = new BinNode<int>(A[0]);
    for (int i = 1; i < A.Length; i++)
        InsertIntoBST(bt, A[i]);// لاحظ أنّ إضافة كلّ قيمة جديدة تبدأ عند الجذر
    return bt;
}
public static void InsertIntoBST(BinNode<int> bt, int Value)
{
    if (bt.GetValue() > Value)
    {
        if (bt.GetLeft() == null)
            bt.SetLeft(new BinNode<int>(Value));
        else
            InsertIntoBST(bt.GetLeft(), Value);
    }
    else
    {
        if (bt.GetRight() == null)
            bt.SetRight(new BinNode<int>(Value));
        else
            InsertIntoBST(bt.GetRight(), Value);
    }
}`;
const IN_ORDER = `
public static void InOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    InOrder(bt.GetLeft());
    Console.Write(bt.GetValue() + " ");
    InOrder(bt.GetRight());
}`;
// the three printing traversals of the previous unit (book p. 254), used here as hidden helpers
const ORDERS = `
public static void PreOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    Console.Write(bt.GetValue() + " "); // نطبع قيمة الأب أوّلا
    PreOrder (bt.GetLeft());// ثمّ نطبع قيمة الولد الأيسر
    PreOrder (bt.GetRight());// ثمّ نطبع قيمة الولد الأيمن
}
public static void InOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    InOrder(bt.GetLeft());
    Console.Write(bt.GetValue() + " ");
    InOrder(bt.GetRight());
}
public static void PostOrder(BinNode<int> bt)
{
    if (bt == null)
        return;
    PostOrder (bt.GetLeft());
    PostOrder (bt.GetRight());
    Console.Write(bt.GetValue() + " ");
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
const EXISTS = `
public static bool ExistsInBST(BinNode<int> bt, int Value)
{
    if (bt == null)return false;
    if (bt.GetValue() == Value)// هل القيمة التي نبحث عنها موجودة في الخليّة الحالية؟
        return true;
    if (bt.GetValue() > Value)// هل القيمة التي نبحث عنها أصغر من قيمة الخليّة الحالية؟
        return ExistsInBST(bt.GetLeft(), Value);
    return ExistsInBST(bt.GetRight(), Value);

}`;
const BUILD = `
public static int Find(int[] A, int value)
{
    for (int i = 0; i < A.Length; i++)
        if (A[i] == value) return i;
    return -1;
}
public static BinNode<int> BuildTree(int[] PreA, int[] InA)
{
    if (PreA == null || InA == null)
        return null;
    // First value in the PreA is the root
    int RootPre = 0;
    // Find the index of the root value in the InA array
    int RootIn = Find(InA, PreA[RootPre]);

    // Build the arrays for the left sub tree
    int Size = RootIn;
    int SizeLeft = Size;
    int[] InLeft = null, PreLeft = null;
    if (Size > 0)
    {
        InLeft = new int[Size];
        for (int i = 0; i < Size; i++)
            InLeft[i] = InA[i];
        PreLeft = new int[Size];
        for (int i = 0; i < Size; i++)
            PreLeft[i] = PreA[i + 1];
    }
    // Build the arrays for the right sub tree
    int[] InRight = null, PreRight = null;
    Size = InA.Length - RootIn - 1;
    if (Size > 0)
    {
        InRight = new int[Size];
        for (int i = 0; i < Size; i++)
            InRight[i] = InA[RootIn + i + 1];
        PreRight = new int[Size];
        for (int i = 0; i < Size; i++)
            PreRight[i] = PreA[SizeLeft + i + 1];
    }
    return new BinNode<int>(BuildTree(PreLeft, InLeft),
                            PreA[RootPre],
                            BuildTree(PreRight, InRight));
}`;
const BUILD_CHECK = `
int[] A = { 9, 20, 3, 1, 6, 7, 8, 11, 10, 15 };
BinNode<int> bt1 = ToBST(A);
int btSize = Size(bt1);
int[] InA = new int[btSize];
Console.WriteLine();
Inorder(bt1, InA, 0);
int[] PreA = new int[btSize];
PreOrder(bt1, PreA, 0);

BinNode<int> bt2 = BuildTree(PreA, InA);
if (AreEqual(bt1, bt2))
    Console.WriteLine("Both trees are equal");
else
    Console.WriteLine("Both trees are NOT equal");`;
const ARE_EQUAL = `
public static bool AreEqual(BinNode<int> bt1, BinNode<int> bt2)
{
    // 1. Are both trees empty?
    if (bt1 == null && bt2 == null)
        return true;

    // 2. Both trees are non-empty -> compare them
    if (bt1 != null && bt2 != null)
        return (bt1.GetValue() == bt2.GetValue()
                && AreEqual(bt1.GetLeft(), bt2.GetLeft())
                && AreEqual(bt1.GetRight(), bt2.GetRight()));

    // 3. one empty, one not -> false
    return false;
}`;
const IN_ARR = `
static int Inorder(BinNode<int> b, int[] arr, int i)
{
    if (b == null)
        return i;
    if (b.GetLeft() != null)
        i = Inorder(b.GetLeft(), arr, i);
    arr[i] = b.GetValue();
    i++;
    if (b.GetRight() != null)
        i = Inorder(b.GetRight(), arr, i);
    return i;
}`;
const PRE_ARR = `
static int PreOrder(BinNode<int> b, int[] arr, int i)
{
    if (b == null)
        return i;
    arr[i] = b.GetValue();
    i++;
    if (b.GetLeft() != null)
        i = PreOrder(b.GetLeft(), arr, i);
    if (b.GetRight() != null)
        i = PreOrder(b.GetRight(), arr, i);
    return i;
}`;
// سؤال 21 من الكتاب (ص 298)
const Q21 = `
public static int What(BinNode<int> Root)
{
    int x = 0;
    int y = 0;
    if (Root.GetLeft() != null)
        x = 1 + What(Root.GetLeft());
    if (Root.GetRight() != null)
        y = 1 + What(Root.GetRight());
    return Math.Max(x, y);
}
public static void What1(BinNode<int> Root)
{
    int[] A = new int[What(Root)+1];
    What2(Root, A, 0);
}
public static void What2(BinNode<int> Root, int[] A, int Len)
{
    if (Root == null) return;

    A[Len] = Root.GetValue();
    Len++;

    if (Root.GetLeft() == null && Root.GetRight() == null)
        PrintArray(A, Len);
    else
    {
        What2(Root.GetLeft(), A, Len);
        What2(Root.GetRight(), A, Len);
    }
}
public static void PrintArray(int[] A, int Len)
{
    for (int i = 0; i < Len; i++) Console.Write(A[i] + " ");
    Console.WriteLine("");
}`;
const Q21_RUN = "int[] V = { 15, 17, 9, 5, 10, 21, 19 };\nBinNode<int> bst = ToBST(V);";

// ── كود أضفناه (إثراء) ─────────────────────────────────────────────────────────────────────────────────────────────────
const SIZE = `
public static int Size(BinNode<int> bt)
{
    if (bt == null) return 0;
    return 1 + Size(bt.GetLeft()) + Size(bt.GetRight());
}`;
const IS_BST = `
public static bool IsBST(BinNode<int> bt)
{
    if (bt == null)
        return true; // الشجرة الفارغة شجرة بحث
    if (bt.GetLeft() != null && MaxOfTree(bt.GetLeft()) >= bt.GetValue())
        return false; // في اليسار قيمة ليست أصغر من قيمة الأب
    if (bt.GetRight() != null && MinOfTree(bt.GetRight()) < bt.GetValue())
        return false; // في اليمين قيمة أصغر من قيمة الأب
    return IsBST(bt.GetLeft()) && IsBST(bt.GetRight());
}`;
const MIN_MAX = `
// أكبر قيمة في شجرة ثنائية غير فارغة (أي شجرة، لا شجرة بحث بالضرورة)
public static int MaxOfTree(BinNode<int> bt)
{
    int Max = bt.GetValue();
    if (bt.GetLeft() != null)
        Max = Math.Max(Max, MaxOfTree(bt.GetLeft()));
    if (bt.GetRight() != null)
        Max = Math.Max(Max, MaxOfTree(bt.GetRight()));
    return Max;
}
// أصغر قيمة في شجرة ثنائية غير فارغة
public static int MinOfTree(BinNode<int> bt)
{
    int Min = bt.GetValue();
    if (bt.GetLeft() != null)
        Min = Math.Min(Min, MinOfTree(bt.GetLeft()));
    if (bt.GetRight() != null)
        Min = Math.Min(Min, MinOfTree(bt.GetRight()));
    return Min;
}`;
const DELETE = `
public static BinNode<int> DeleteFromBST(BinNode<int> bt, int Value)
{
    if (bt == null)
        return null; // القيمة غير موجودة في الشجرة
    if (Value < bt.GetValue())
        bt.SetLeft(DeleteFromBST(bt.GetLeft(), Value));
    else if (Value > bt.GetValue())
        bt.SetRight(DeleteFromBST(bt.GetRight(), Value));
    else
    {
        // وجدنا الخلية التي نريد حذفها
        if (bt.GetLeft() == null && bt.GetRight() == null)
            return null; // الحالة 1: ورقة
        if (bt.GetLeft() == null)
            return bt.GetRight(); // الحالة 2: ابن واحد (أيمن)
        if (bt.GetRight() == null)
            return bt.GetLeft(); // الحالة 2: ابن واحد (أيسر)
        int Min = MinOfBST(bt.GetRight()); // الحالة 3: ابنان
        bt.SetValue(Min);
        bt.SetRight(DeleteFromBST(bt.GetRight(), Min));
    }
    return bt;
}
// أصغر قيمة في شجرة بحث غير فارغة: نمشي إلى اليسار حتى النهاية
public static int MinOfBST(BinNode<int> bt)
{
    while (bt.GetLeft() != null)
        bt = bt.GetLeft();
    return bt.GetValue();
}`;

// ── أسئلة التتبّع ───────────────────────────────────────────────────────────────────────────────────────────────────────
const T1 = `
public static void Main()
{
    int[] A = { 40, 20, 60, 10, 30 };
    BinNode<int> bt = ToBST(A);
    InsertIntoBST(bt, 25);
    InsertIntoBST(bt, 50);
    PreOrder(bt);
}`;
const T1_OUT = "40 20 10 30 25 60 50 ";
const SECRET = `
public static int Secret(BinNode<int> bt)
{
    if (bt.GetLeft() == null)
        return bt.GetValue();
    return Secret(bt.GetLeft());
}`;
const SECRET_TREE = [50, [30, [10, null, 20], 40], [70, 60, 80]];
const T3 = `
public static void Main()
{
    int[] A = { 50, 30, 70, 10, 40, 60, 80 };
    BinNode<int> bt = ToBST(A);
    bt = DeleteFromBST(bt, 10);
    bt = DeleteFromBST(bt, 30);
    bt = DeleteFromBST(bt, 50);
    Console.WriteLine(bt.GetValue());
    InOrder(bt);
}`;

// ── حلول أسئلة الكتابة ──────────────────────────────────────────────────────────────────────────────────────────────────
const MAX_OF_BST = `
public static int MaxOfBST(BinNode<int> bt)
{
    while (bt.GetRight() != null)
        bt = bt.GetRight();
    return bt.GetValue();
}`;
const EXISTS_LOOP = `
public static bool ExistsInBST(BinNode<int> bt, int Value)
{
    while (bt != null)
    {
        if (bt.GetValue() == Value)
            return true;
        if (bt.GetValue() > Value)
            bt = bt.GetLeft();
        else
            bt = bt.GetRight();
    }
    return false;
}`;
const COUNT_RANGE = `
public static int CountInRange(BinNode<int> bt, int Low, int High)
{
    if (bt == null)
        return 0;
    if (bt.GetValue() < Low)
        return CountInRange(bt.GetRight(), Low, High);
    if (bt.GetValue() > High)
        return CountInRange(bt.GetLeft(), Low, High);
    return 1 + CountInRange(bt.GetLeft(), Low, High)
             + CountInRange(bt.GetRight(), Low, High);
}`;

// ── أشجار الأمثلة ───────────────────────────────────────────────────────────────────────────────────────────────────────
const BOOK_TREE = [5, [3, 2, 4], [7, 6, 8]];
const SEVEN = [50, [30, 10, 40], [70, 60, 80]];
const Q1_TREE = [3, [-1, -6, null], [5, 8, [-1, 7, null]]];
const Q1_OUT = { pre: "3 -1 -6 5 8 -1 7 ", inn: "-6 -1 3 8 5 7 -1 ", post: "-6 -1 8 7 -1 5 3 " };
const Q17_TREE = [17, [10, [-1, null, 5], 12], 28];
const Q21_TREE = [15, [9, 5, 10], [17, null, [21, 19, null]]];
const MAX_TREE = [50, [30, 10, 40], [70, 60, [80, 75, null]]];
const tf = call => "Console.Write(" + call + " ? \"true\" : \"false\");";

export default {
  n: 7,
  title: "شجرة البحث الثنائية",
  short: "شجرة البحث",
  description: "شرط شجرة البحث الثنائية، بناؤها وإدخال قيمة إليها، التمشيط الداخلي الذي يطبع القيم مرتّبة، البحث عن قيمة ونجاعته بحسب شكل الشجرة، فحص هل الشجرة شجرة بحث، حذف خلية بحالاته الثلاث، إعادة بناء شجرة من نتيجتي تمشيط، وأسئلة تتبّع وكتابة.",
  src: "257",
  lessons: [
    {
      title: "ما شجرة البحث الثنائية؟",
      pages: [
        {
          title: "شجرة البحث الثنائية وشرطها",
          src: "257",
          keywords: ["شجرة بحث ثنائية", "BST", "Binary Search Tree", "الشجرة الفرعية اليسرى", "الشجرة الفرعية اليمنى"],
          objective: "أن تعرف الشرط الذي يجعل شجرة ثنائية شجرة بحث، وأن تفحصه على شجرة مرسومة.",
          blocks: [
            H("شجرة البحث الثنائية", 2),
            P("هنالك نوع خاص من الأشجار الثنائية وهي __شجرة البحث الثنائية__ – `Binary Search Tree` (**BST**). بالإضافة إلى كون هذه الشجرة شجرة ثنائية، على كل خلية من خلاياها (باستثناء الأوراق) أن تحقّق الشرط التالي:"),
            DEF("شرط شجرة البحث", "قيمة الأب **أكبر أو تساوي** قيم جميع خلايا الشجرة الفرعية اليسرى، و**أصغر أو تساوي** قيم جميع خلايا الشجرة الفرعية اليمنى."),
            P("**الشجرة التالية هي شجرة بحث ثنائية:**"),
            FIG("شجرة بحث ثنائية", [{ kind: "tree", tree: BOOK_TREE, facts: true }]),
            H("شرح لماذا هي شجرة بحث ثنائية", 3),
            LIST([
              ["قيمة الجذر 5", "أكبر من قيم جميع خلايا الشجرة الفرعية اليسرى (3 و2 و4)، وأصغر من قيم جميع خلايا الشجرة الفرعية اليمنى (7 و6 و8)."],
              ["الأب 3", "أكبر من قيم جميع خلايا الشجرة الفرعية اليسرى (2)، وأصغر من قيم جميع خلايا الشجرة الفرعية اليمنى (4)."],
              ["الأب 7", "أكبر من قيم جميع خلايا الشجرة الفرعية اليسرى (6)، وأصغر من قيم جميع خلايا الشجرة الفرعية اليمنى (8)."],
              "باقي الخلايا أوراق.",
            ]),
            CLAR("في الكتاب", "طُبع الاسم الإنجليزي في الكتاب `Binray Search Tree`، والصحيح `Binary Search Tree`."),
            XP("بكلمات بسيطة: كل ما هو **أصغر** من خلية يسكن في **يسارها**، وكل ما هو **أكبر** منها يسكن في **يمينها**. انتبه: الشرط يتحدّث عن **كل** خلايا الشجرة الفرعية، لا عن الابن المباشر فقط."),
            FIG("قارن: شجرة بحث وشجرة ليست شجرة بحث", [
              { kind: "tree", tree: [5, [3, 2, 4], [7, null, 8]], label: "شجرة بحث: كل ما في يسار `5` أصغر منها" },
              { kind: "tree", tree: [5, [3, 2, 6], [7, null, 8]], hi: ["LR"], label: "ليست شجرة بحث: `6` في يسار `5` وهي أكبر منها" },
            ]),
            XNOTE("القيم المتساوية", "الشرط كما كتبه الكتاب يسمح بالتساوي في الجهتين. لكن عملية الإدخال التي ستراها في الصفحة التالية تضع القيمة المساوية دائمًا في **اليمين**. في أمثلة هذه الوحدة لا تتكرّر القيم، فلا يؤثّر ذلك عليها."),
            MC("في شجرة بحث ثنائية قيمة جذرها `20` والقيم فيها لا تتكرّر. أين يمكن أن توجد القيمة `13`؟", ["*في الشجرة الفرعية اليسرى للجذر فقط", "في الشجرة الفرعية اليمنى للجذر فقط", "في أي مكان في الشجرة", "في ورقة فقط"], "`13` أصغر من `20`، وكل القيم الأصغر من الجذر تقع في شجرته الفرعية اليسرى. قد تكون هناك في أي مستوى، وليس في ورقة بالضرورة."),
            TF("حتى تكون شجرة ثنائية شجرة بحث، يكفي أن يكون كل ابن أيسر أصغر من أبيه وكل ابن أيمن أكبر من أبيه.", false, "لا يكفي. الشرط يخصّ **كل** خلايا الشجرة الفرعية. في الرسم الثاني أعلاه الخلية `6` أكبر من أبيها `3` وهي ابنه الأيمن، لكنها تقع في يسار الجذر `5` وهي أكبر منه، فالشجرة ليست شجرة بحث."),
            MC("في شجرة البحث المرسومة في أول الصفحة (جذرها `5`)، أين تقع أصغر قيمة؟", ["في الجذر", "*في أقصى اليسار: نمشي من الجذر إلى اليسار حتى النهاية", "في أقصى اليمين", "في أي ورقة"], "كل قيمة أصغر من خلية تقع في يسارها. فإذا مشينا يسارًا من الجذر (`5` ثم `3` ثم `2`) وصلنا إلى أصغر قيمة: `2`."),
          ],
        },
      ],
    },
    {
      title: "بناء الشجرة والإدخال",
      pages: [
        {
          title: "بناء شجرة بحث: `ToBST` و `InsertIntoBST`",
          src: "258",
          keywords: ["ToBST", "InsertIntoBST", "إدخال قيمة", "بناء شجرة بحث"],
          objective: "أن تدخل قيمة جديدة إلى شجرة بحث في مكانها الصحيح، وأن تبني شجرة بحث من مصفوفة.",
          blocks: [
            H("كيفية بناء شجرة بحث ثنائية", 2),
            P("معطاة مجموعة من القيم الصحيحة – مثلًا في مصفوفة باسم `A`."),
            LIST([
              "القيمة الأولى هي الجذر، أي `A[0]`.",
              "كل قيمة إضافية نقارنها مع قيمة الجذر.",
              ["إذا كانت أصغر من قيمة الجذر", "يجب إضافتها بشكل تراجعي في الشجرة الفرعية اليسرى. إذا كان الابن الأيسر غير موجود، أي `null`، ننشئ خلية جديدة فيها القيمة التي يجب إضافتها ونجعلها الابن الأيسر للجذر. خلاف ذلك نبحث عن مكانها الصحيح، وبشكل تراجعي، في الشجرة الفرعية اليسرى."],
              ["خلاف ذلك", "يجب إضافتها بشكل تراجعي في الشجرة الفرعية اليمنى. إذا كان الابن الأيمن غير موجود، أي `null`، ننشئ خلية جديدة فيها القيمة التي يجب إضافتها ونجعلها الابن الأيمن للجذر. خلاف ذلك نبحث عن مكانها الصحيح، وبشكل تراجعي، في الشجرة الفرعية اليمنى."],
            ]),
            CS(TO_BST),
            XP("القاعدة قصيرة: **الأصغر إلى اليسار، وغير ذلك إلى اليمين**. القيمة الجديدة تنزل من الجذر، وفي كل خلية تختار جهة واحدة، حتى تجد مكانًا فارغًا (`null`) فتصير هناك **ورقة** جديدة."),
            FIG("نبني شجرة بحث من المصفوفة `{5, 3, 7, 4}`", [
              { kind: "tree", tree: [5], hi: [""], label: "`A[0] = 5` هي الجذر" },
              { kind: "tree", tree: [5, 3, null], hi: ["L"], label: "`3` أصغر من `5`: إلى اليسار" },
              { kind: "tree", tree: [5, 3, 7], hi: ["R"], label: "`7` ليست أصغر من `5`: إلى اليمين" },
              { kind: "tree", tree: [5, [3, null, 4], 7], hi: ["LR"], label: "`4`: يسار `5` ثم يمين `3`" },
            ]),
            TRACE({
              title: "`ToBST` تبني الشجرة قيمة بعد قيمة", code: TO_BST,
              run: "int[] A = { 5, 3, 7, 4 };\nBinNode<int> bt = ToBST(A);",
              given: "المصفوفة `A = {5, 3, 7, 4}`، والاستدعاء `BinNode<int> bt = ToBST(A);`.",
              description: "راقب: كل قيمة جديدة تبدأ رحلتها من الجذر.",
            }),
            XNOTE("انتبه", "`InsertIntoBST` تشترط أن تكون الشجرة **غير فارغة** (تبدأ بالأمر `bt.GetValue()`)، و `ToBST` تشترط أن تكون في المصفوفة قيمة واحدة على الأقل. والقيمة **المساوية** لقيمة خلية تذهب إلى **اليمين**، لأن الشرط `bt.GetValue() > Value` لا يتحقّق."),
            XP("جرّب بنفسك: في المختبر شجرة فيها الجذر `50` فقط. أدخِل القيم `30` ثم `70` ثم `10` ثم `40` ثم `60` ثم `80`، وتوقّع مكان كل قيمة **قبل** أن تضغط."),
            LAB("bst", { tree: [50], name: "bt", title: "مختبر: ابنِ شجرة بحث", description: "أدخِل قيمًا وراقب المسار الذي تسلكه كل قيمة من الجذر إلى مكانها." }),
            FIG("شجرة للسؤال التالي", [{ kind: "tree", tree: [50, [30, 10, 40], [70, null, 80]] }]),
            proved(MC("ننفّذ على الشجرة المرسومة أعلاه الأمر `InsertIntoBST(bt, 65);`. أين توضع القيمة `65`؟", ["ابنًا أيمن للخلية `40`", "*ابنًا أيسر للخلية `70`", "ابنًا أيسر للخلية `80`", "ابنًا أيمن للخلية `80`"], "`65` ليست أصغر من `50` فننزل يمينًا إلى `70`. `65` أصغر من `70` والابن الأيسر للخلية `70` غير موجود، فتوضع هناك."),
              { code: TO_BST, run: treeOf("bt", [50, [30, 10, 40], [70, null, 80]]) + "\nInsertIntoBST(bt, 65);\nConsole.Write(bt.GetRight().GetLeft().GetValue());", out: "65", loose: true }),
            proved(SHORT("نبني شجرة بحث بالعملية `ToBST` من القيم `[8,3,10,1,6]` بهذا الترتيب (`8` أولًا). ما قيمة الابن الأيمن للخلية `3`؟", "6", "`8` الجذر. `3` أصغر: يسار `8`. `10` يمين `8`. `1` يسار `8` ثم يسار `3`. `6` أصغر من `8` فتنزل يسارًا إلى `3`، وهي ليست أصغر من `3` فتصير ابنه الأيمن."),
              { code: TO_BST, run: "int[] A = { 8, 3, 10, 1, 6 };\nBinNode<int> bt = ToBST(A);\nConsole.Write(bt.GetLeft().GetRight().GetValue());", out: "6" }),
            MC("لماذا تبدأ إضافة كل قيمة جديدة من الجذر، لا من آخر خلية أُضيفت؟", ["لأن الجذر أكبر قيمة في الشجرة", "*لأن مكان القيمة يتحدّد بمقارنتها مع الخلايا من الجذر نزولًا", "لأن العملية `ToBST` لا تعرف إلا الجذر صدفةً", "لا فرق: يمكن البدء من أي خلية"], "حتى يبقى شرط شجرة البحث صحيحًا لكل الآباء، يجب أن تمرّ القيمة على كل أب من الجذر نزولًا، وتختار عند كل واحد الجهة الصحيحة."),
          ],
        },
      ],
    },
    {
      title: "التمشيط الداخلي يعطي ترتيبًا تصاعديًا",
      pages: [
        {
          title: "تمشيط `Inorder` لشجرة بحث",
          src: "259",
          keywords: ["Inorder", "تمشيط داخلي", "ترتيب تصاعدي", "InOrder"],
          objective: "أن تعرف أنّ التمشيط الداخلي لشجرة بحث يطبع قيمها مرتّبة ترتيبًا تصاعديًا، وأن تفهم السبب.",
          blocks: [
            H("مثال لتمشيط شجرة بحث ثنائية بطريقة التمشيط الداخلي – `Inorder`", 2),
            P("دعونا نتتبّع تمشيط وطباعة قيم شجرة البحث الثنائية التالية بطريقة `Inorder`:"),
            FIG("شجرة البحث التي نمشّطها", [{ kind: "tree", tree: BOOK_TREE }]),
            XP("تذكير من الوحدة السابقة (ص 254 في الكتاب): العملية `InOrder` تعالج الشجرة الفرعية اليسرى، ثم تطبع قيمة الأب، ثم تعالج الشجرة الفرعية اليمنى. (الكتاب يسمّي هذا التمشيط «التمشيط الضمني».)"),
            CS(IN_ORDER),
            XP("في الكتاب مخطّط للاستدعاءات التراجعية: من كل استدعاء تخرج ثلاثة أسهم — إلى استدعاء الابن الأيسر، ثم إلى القيمة المطبوعة، ثم إلى استدعاء الابن الأيمن. هذا هو المخطّط مكتوبًا كقائمة (اقرأه من أعلى إلى أسفل):"),
            XOUT(`
              Inorder(5)
              ├── Inorder(3)
              │   ├── Inorder(2)
              │   │   ├── Inorder(null)
              │   │   ├── 2
              │   │   └── Inorder(null)
              │   ├── 3
              │   └── Inorder(4)
              │       ├── Inorder(null)
              │       ├── 4
              │       └── Inorder(null)
              ├── 5
              └── Inorder(7)
                  ├── Inorder(6)
                  │   ├── Inorder(null)
                  │   ├── 6
                  │   └── Inorder(null)
                  ├── 7
                  └── Inorder(8)
                      ├── Inorder(null)
                      ├── 8
                      └── Inorder(null)`),
            P("ناتج التمشيط (اتجاه الطباعة من اليسار إلى اليمين):"),
            OUT("2 3 4 5 6 7 8"),
            NOTE("لاحظ", "القيم طُبعت مرتّبة ترتيبًا **تصاعديًا** من اليسار إلى اليمين. وهذا صحيح لكل شجرة بحث ثنائية تُمشَّط بطريقة `Inorder`."),
            P("نقصد بالقيمة المكتوبة داخل الاستدعاء، مثل `Inorder(5)`، مؤشّرًا إلى الخلية التي تحتوي على هذه القيمة."),
            CLAR("في الكتاب", "في مخطّط الكتاب كُتب اسم العملية `Inorder`، أمّا في الكود فاسمها `InOrder` (بحرف `O` كبير). لغة `C#` تميّز بين الحرف الكبير والصغير، والتتبّع التالي يستعمل الاسم الذي في الكود."),
            TRACE({
              title: "`InOrder` على شجرة البحث", code: IN_ORDER,
              run: treeOf("bt", BOOK_TREE) + "\nInOrder(bt);",
              given: "الشجرة `bt` المرسومة أعلاه (جذرها `5`)، والاستدعاء `InOrder(bt)`.",
              description: "راقب الناتج: بأي ترتيب تُطبع القيم؟",
            }),
            XTIP("لماذا يخرج الترتيب تصاعديًا؟", "قبل أن تطبع `InOrder` قيمة خلية، تطبع كل ما في شجرتها الفرعية اليسرى، أي كل القيم **الأصغر** منها. وبعد أن تطبعها، تطبع كل ما في اليمنى، أي القيم **الأكبر**. وهذا يحدث عند كل خلية، فيخرج الناتج كله مرتّبًا."),
            XP("فكرة مفيدة: إذا أردت ترتيب مصفوفة، ابنِ منها شجرة بحث بالعملية `ToBST` ثم مشّط الشجرة بطريقة `Inorder`."),
            proved(MC("بنينا شجرة بحث بالعملية `ToBST` من القيم `[9,4,12,1,6]` بهذا الترتيب. ماذا تطبع `InOrder` لهذه الشجرة؟", ["`[9,4,12,1,6]`", "`[9,4,1,6,12]`", "*" + seq("1 4 6 9 12 "), "`[12,9,6,4,1]`"], "تمشيط `Inorder` لشجرة بحث يطبع القيم مرتّبة ترتيبًا تصاعديًا دائمًا، مهما كان ترتيب إدخالها."),
              { code: IN_ORDER, lib: TO_BST, run: "int[] A = { 9, 4, 12, 1, 6 };\nBinNode<int> bt = ToBST(A);\nInOrder(bt);", out: "1 4 6 9 12 ", loose: true }),
            TF("إذا غيّرنا ترتيب إدخال القيم إلى شجرة البحث، يتغيّر ناتج تمشيط `Inorder`.", false, "ترتيب الإدخال يغيّر **شكل** الشجرة، لكن تمشيط `Inorder` لأي شجرة بحث يطبع القيم نفسها مرتّبة ترتيبًا تصاعديًا."),
            MC("طبع تمشيط `Inorder` لشجرة ثنائية القيم `[3,8,5,10]` بهذا الترتيب. ماذا نستنتج؟", ["الشجرة شجرة بحث ثنائية", "*الشجرة ليست شجرة بحث ثنائية", "الشجرة على شكل سلسلة", "لا يمكن أن نستنتج شيئًا"], "لو كانت شجرة بحث لطُبعت القيم مرتّبة ترتيبًا تصاعديًا. هنا `8` طُبعت قبل `5`، فالشجرة ليست شجرة بحث."),
          ],
        },
      ],
    },
    {
      title: "البحث ونجاعته",
      pages: [
        {
          title: "البحث عن قيمة: `ExistsInBST`",
          src: "260",
          keywords: ["ExistsInBST", "بحث", "شرط التوقّف", "مسار البحث"],
          objective: "أن تبحث عن قيمة في شجرة بحث بالنزول في مسار واحد فقط.",
          blocks: [
            H("البحث عن قيمة في شجرة بحث ثنائية", 2),
            P("بما أنّ القيم مرتّبة في الشجرة فإنّ ألغوريثم البحث يعمل بالطريقة التالية:"),
            LIST([
              "إذا كانت الشجرة فارغة (أو وصلنا في التمشيط إلى خلية `null`) نُعيد `false` للدلالة على أننا لم نجد القيمة.",
              "إذا كانت القيمة التي نبحث عنها موجودة في الخلية الحالية، نُعيد `true`.",
            ], { title: "شروط التوقّف" }),
            LIST([
              "إذا كانت القيمة التي نبحث عنها **أصغر** من القيمة الموجودة في الخلية الحالية، نبحث عنها (بشكل تراجعي) **في الشجرة الفرعية اليسرى**.",
              "خلاف ذلك، أي إذا كانت القيمة التي نبحث عنها **أكبر** (**أو تساوي**) القيمة الموجودة في الخلية الحالية، نبحث عنها (بشكل تراجعي) **في الشجرة الفرعية اليمنى**.",
            ], { title: "خلاف ذلك" }),
            CS(EXISTS),
            FIG("البحث عن `6`: مسار واحد من الجذر", [{ kind: "tree", tree: BOOK_TREE, hi: ["", "R", "RL"], label: "`6` أكبر من `5`: يمين. `6` أصغر من `7`: يسار. وجدناها" }]),
            TRACE({
              title: "`ExistsInBST` تجد القيمة `6`", code: EXISTS,
              run: treeOf("bt", BOOK_TREE) + "\nConsole.WriteLine(ExistsInBST(bt, 6));",
              given: "الشجرة `bt` المرسومة أعلاه، والاستدعاء `ExistsInBST(bt, 6)`.",
              description: "كم خلية فحصت العملية من الخلايا السبع؟",
            }),
            TRACE({
              title: "`ExistsInBST` لا تجد القيمة `1`", code: EXISTS,
              run: treeOf("bt", BOOK_TREE) + "\nConsole.WriteLine(ExistsInBST(bt, 1));",
              given: "الشجرة `bt` نفسها، والاستدعاء `ExistsInBST(bt, 1)`.",
              description: "متى تعرف العملية أنّ القيمة غير موجودة؟",
            }),
            XP("قارن مع البحث في شجرة ثنائية عادية: هناك قد نضطرّ إلى زيارة **كل** الخلايا. هنا نختار عند كل خلية جهة واحدة ونترك الجهة الأخرى كلها، فننزل في **مسار واحد** من الجذر."),
            LAB("bst", { tree: BOOK_TREE, name: "bt", title: "مختبر: ابحث في شجرة البحث", description: "ابحث عن `4` ثم عن `9`، وراقب الخلايا التي يمرّ بها البحث." }),
            provedCount(SHORT("نبحث في الشجرة المرسومة أعلاه بالاستدعاء `ExistsInBST(bt, 4)`. كم مرة تُستدعى العملية `ExistsInBST` (مع الاستدعاء الأول)؟", "3", "الاستدعاء الأول للخلية `5`، والثاني لابنها الأيسر `3` (لأن `4` أصغر من `5`)، والثالث للخلية `4` (لأن `4` ليست أصغر من `3`) وفيها نجد القيمة."),
              { code: EXISTS, run: treeOf("bt", BOOK_TREE) + "\nConsole.Write(ExistsInBST(bt, 4));" }, "if (bt == null)return false;", 3),
            MC("نبحث في الشجرة نفسها عن القيمة `9`. أي خلايا تقارن العملية القيمة بها، بالترتيب؟", ["`5` ثم `3` ثم `4`", "*`5` ثم `7` ثم `8`", "`5` ثم `7` ثم `6` ثم `8`", "كل الخلايا السبع"], "`9` أكبر من `5` فننزل يمينًا إلى `7`، وأكبر من `7` فننزل يمينًا إلى `8`، وأكبر من `8` لكن الابن الأيمن للخلية `8` هو `null`، فتُعاد `false`."),
            TF("حين تكون القيمة غير موجودة، تفحص `ExistsInBST` كل خلايا الشجرة قبل أن تعيد `false`.", false, "العملية تنزل في مسار واحد فقط حتى تصل إلى `null`. عدد الخلايا التي تفحصها لا يزيد على عدد المستويات."),
          ],
        },
        {
          title: "نجاعة البحث: شكل الشجرة يحسم",
          src: "260–262",
          keywords: ["نجاعة", "O(h)", "O(n)", "O(log n)", "سلسلة", "شجرة ممتلئة", "شجرة كاملة"],
          objective: "أن تحدّد نجاعة البحث في شجرة بحث بحسب شكلها: سلسلة أم شجرة ممتلئة.",
          blocks: [
            H("تحليل درجة نجاعة هذه العملية", 2),
            P("الحقيقة أنّ تحليل النجاعة يتعلّق بمبنى الشجرة. لدينا الحالات التالية:"),
            P("**الحالة الأولى:** إذا كانت جميع القيم المعطاة مرتّبة، من البداية، ترتيبًا تصاعديًا أو تنازليًا، حينها تكون الشجرة عبارة عن **سلسلة**. وعليه تكون **النجاعة خطية**، لأنّنا سنزور جميع الخلايا ولن نجد القيمة في أسوأ الحالات – أي عندما تكون القيمة التي نبحث عنها أكبر (في حالة الترتيب التصاعدي) من جميع قيم الشجرة، أو أصغر (في حالة الترتيب التنازلي). أمثلة على ذلك الشجرتان التاليتان:"),
            FIG("شجرتان على شكل سلسلة", [
              { kind: "tree", tree: [5, null, [7, null, [8, null, [9, null, "…"]]]], label: "قيم مرتّبة تصاعديًا: سلسلة إلى اليمين" },
              { kind: "tree", tree: [5, [4, [3, "…", null], null], null], label: "قيم مرتّبة تنازليًا: سلسلة إلى اليسار" },
            ]),
            P("**الحالة الثانية:** إذا كانت جميع القيم المعطاة تشكّل سلسلة **زك – زاك**. مثل الشجرة التالية:"),
            FIG("سلسلة زك – زاك", [{ kind: "tree", tree: [20, [9, null, [19, [15, null, [17, "…", null]], null]], null] }]),
            P("أسوأ الحالات ستكون إذا بحثنا عن القيمة التي يجب أن تأتي في الشجرة بعد القيمة الأخيرة (مثلًا 16 بالنسبة للشجرة أعلاه). حينها سنزور كل الخلايا."),
            P("بإمكاننا اعتبار حجم الإدخال عدد خلايا الشجرة – `n`، أو ارتفاعها – `h`. وعليه نستطيع أن نقول بأنّ النجاعة بالنسبة للأشجار الثلاث أعلاه هي `O(n)` أو `O(h)`."),
            P("**الحالة الثالثة:** إذا كانت جميع القيم المعطاة تشكّل **شجرة ممتلئة** – `Fully Binary Tree`، وهي عبارة عن شجرة فيها لكل خلية ابنان بالضبط – باستثناء الأوراق (وكلها في المستوى الأخير). مثل الشجرة التالية:"),
            FIG("شجرة ممتلئة", [{ kind: "tree", tree: BOOK_TREE, facts: true }]),
            P("أو **كاملة** – `Complete Binary Tree`، وهي عبارة عن شجرة فيها كل مستوى ممتلئ، أي فيه لكل خلية ابنان بالضبط – باستثناء ربما المستوى الأخير. الخلايا الناقصة تكون من جهة اليمين. مثل الشجرة التالية:"),
            FIG("شجرة كاملة", [{ kind: "tree", tree: [25, [14, [12, 9, 13], [20, 18, 21]], [29, [28, 27, null], 30]], facts: true }]),
            P("أسوأ الحالات ستكون إذا بحثنا عن قيمة غير موجودة في الشجرة. عدد الخلايا سوف يقلّ في كل استدعاء إلى النصف. وعليه تكون النجاعة **لوغاريثمية** أي `O(log n)`، وهي كما نعرف من أحسن درجات النجاعة المعروفة."),
            XH("القيم نفسها، ثلاثة أشكال", 3),
            XP("الشكل يتحدّد بـ**ترتيب الإدخال**. هذه ثلاث أشجار بحث فيها القيم نفسها من 1 إلى 6، بُنيت بالعملية `ToBST` بثلاثة ترتيبات مختلفة. قارن الارتفاع:"),
            FIG("ترتيب الإدخال يحدّد شكل الشجرة", [
              { kind: "tree", tree: [4, [2, 1, 3], [6, 5, null]], facts: true, label: "أُدخلت `[4,2,6,1,3,5]`: شجرة قصيرة" },
              { kind: "tree", tree: [6, [5, [4, [3, [2, 1, null], null], null], null], null], facts: true, label: "أُدخلت `[6,5,4,3,2,1]`: سلسلة إلى اليسار" },
              { kind: "tree", tree: [1, null, [2, null, [3, null, [4, null, [5, null, 6]]]]], facts: true, label: "أُدخلت `[1,2,3,4,5,6]`: سلسلة إلى اليمين" },
            ]),
            XTABLE(["شكل الشجرة", "الارتفاع `h`", "أسوأ بحث"], [
              ["سلسلة (يمين، يسار أو زك – زاك)", "`n - 1`", "`O(n)`: نزور كل الخلايا"],
              ["ممتلئة أو كاملة", "حوالي `log n`", "`O(log n)`: خلية واحدة من كل مستوى"],
              ["أي شكل", "`h`", "`O(h)`: مسار واحد من الجذر"],
            ], { caption: "نجاعة `ExistsInBST` بحسب شكل الشجرة" }),
            provedCount(SHORT("بنينا شجرة بالعملية `ToBST` من القيم `[1,2,3,4,5,6]` بهذا الترتيب، ثم نفّذنا `ExistsInBST(bt, 7)`. كم مرة تُستدعى العملية `ExistsInBST` (مع الاستدعاء الأول)؟", "7", "الشجرة سلسلة إلى اليمين فيها 6 خلايا. `7` أكبر من كل القيم، فنمرّ على الخلايا الست كلها، والاستدعاء السابع يستقبل `null` ويعيد `false`."),
              { code: EXISTS, lib: TO_BST, run: "int[] A = { 1, 2, 3, 4, 5, 6 };\nBinNode<int> bt = ToBST(A);\nConsole.Write(ExistsInBST(bt, 7));" }, "if (bt == null)return false;", 7),
            provedCount(SHORT("والآن بنينا الشجرة من القيم نفسها بالترتيب `[4,2,6,1,3,5]`، ونفّذنا `ExistsInBST(bt, 7)`. كم مرة تُستدعى العملية هذه المرّة؟", "3", "الاستدعاء الأول للجذر `4`، والثاني لابنه الأيمن `6`، والثالث يستقبل `null` لأن الخلية `6` لا ابن أيمن لها. الشجرة القصيرة اختصرت البحث من 7 استدعاءات إلى 3."),
              { code: EXISTS, lib: TO_BST, run: "int[] A = { 4, 2, 6, 1, 3, 5 };\nBinNode<int> bt = ToBST(A);\nConsole.Write(ExistsInBST(bt, 7));" }, "if (bt == null)return false;", 3),
            MC("في شجرة بحث **ممتلئة** فيها 15 خلية (4 مستويات)، كم خلية على الأكثر تقارن `ExistsInBST` القيمة بها؟", ["15", "8", "*4", "1"], "البحث ينزل في مسار واحد: خلية واحدة من كل مستوى. في الشجرة 4 مستويات (0 إلى 3)، فلا تزيد المقارنات على 4 خلايا."),
            MC("أي ترتيب إدخال للقيم من 1 إلى 7 يعطي أقصر شجرة بحث؟", ["`[1,2,3,4,5,6,7]`", "`[7,6,5,4,3,2,1]`", "*`[4,2,6,1,3,5,7]`", "`[1,7,2,6,3,5,4]`"], "حين ندخل `4` أولًا تنقسم القيم الباقية بالتساوي بين اليسار واليمين، ثم `2` و `6` تقسمان كل جهة بالتساوي: تخرج شجرة ممتلئة ارتفاعها 2. الترتيبان الأولان يعطيان سلسلة، والأخير يعطي سلسلة زك – زاك."),
          ],
        },
      ],
    },
    {
      title: "هل الشجرة شجرة بحث؟",
      pages: [
        {
          title: "فحص: هل الشجرة شجرة بحث ثنائية؟",
          src: "262–263",
          keywords: ["IsBST", "فحص شجرة بحث", "أكبر قيمة", "أصغر قيمة"],
          objective: "أن تفهم لماذا لا يكفي فحص كل خلية مع ابنيها، وأن تكتب عملية تفحص هل الشجرة شجرة بحث.",
          blocks: [
            EX({ mode: "practice", title: "سؤال", prompt: "اكتب عملية خارجية تتلقّى جذر شجرة ثنائية من نمط صحيح وتُعيد `true` إذا كانت شجرة بحث ثنائية. خلاف ذلك تُعيد `false`." }),
            P("نُعيد للذهن مرة أخرى بأنّ الصفة «قيمة الأب أكبر من قيمة الابن الأيسر وأصغر أو تساوي قيمة الابن الأيمن» يجب أن تتحقّق لكل خلية من خلايا الشجرة (باستثناء الأوراق). لكن في نفس الوقت **لا يكفي** أن نفحص هذه الصفة لكل خلية على حدة، كما يبيّن المثال التالي:"),
            FIG("كل خلية «سليمة» مع ابنيها، ومع ذلك…", [{ kind: "tree", tree: [3, [2, 1, 4], 5], hi: ["LR"] }]),
            P("فلو فحصنا الصفة لكل خلية على حدة، لقلنا بأنّ الشجرة أعلاه شجرة بحث ثنائية:"),
            LIST([
              "قيمة الخلية 3 أكبر من قيمة الابن الأيسر 2 وأصغر أو تساوي قيمة الابن الأيمن 5.",
              "قيمة الخلية 2 أكبر من قيمة الابن الأيسر 1 وأصغر أو تساوي قيمة الابن الأيمن 4.",
              "باقي الخلايا أوراق.",
            ]),
            P("ولكنّ هذا غير صحيح، فالقيمة 4 موجودة في الشجرة الفرعية اليسرى رغم أنّها أكبر من قيمة الجذر. ما الحل إذن؟"),
            DEF("أحد الحلول", "أن تحقّق قيمة كل خلية الشرط التالي: **أكبر** قيمة في الشجرة الفرعية اليسرى أصغر من قيمة الأب، و**أصغر** قيمة في الشجرة الفرعية اليمنى أكبر من قيمة الأب."),
            P("لاحظ أنّ الشجرة أعلاه لا تحقّق هذه الشروط، وبالتالي هي ليست شجرة بحث ثنائية."),
            CLAR("في الكتاب", "في السطر الثاني من الشرط طُبعت كلمة «أكبر» مرة زائدة في آخره («…أكبر من قيمة الأب أكبر»). المقصود: أصغر قيمة في الشجرة الفرعية اليمنى أكبر من قيمة الأب."),
            CLAR("صفحتان ناقصتان من نسختنا", "كود الحل في الكتاب مطبوع في الصفحتين 264–265، وهما غير موجودتين في نسختنا من الكتاب. الكود التالي كتبناه نحن بحسب الشرط الذي يذكره الكتاب."),
            XCS(IS_BST),
            XCS(MIN_MAX),
            XLIST([
              "الشجرة الفارغة شجرة بحث: هذا شرط التوقّف.",
              "إذا وُجدت شجرة فرعية يسرى، نحسب أكبر قيمة فيها. إن لم تكن أصغر من قيمة الأب نعيد `false` فورًا.",
              "إذا وُجدت شجرة فرعية يمنى، نحسب أصغر قيمة فيها. إن كانت أصغر من قيمة الأب نعيد `false` فورًا.",
              "الأب سليم؟ نفحص بالطريقة نفسها، وبشكل تراجعي، الشجرتين الفرعيتين.",
            ], { title: "كيف تعمل `IsBST`؟" }),
            XNOTE("التساوي في اليمين", "سمحنا في الكود بأن تساوي أصغر قيمة في اليمين قيمة الأب (الشرط `<` وليس `<=`)، لأن `InsertIntoBST` تضع القيمة المساوية في اليمين. هكذا كل شجرة تبنيها `ToBST` تنجح في الفحص. `MaxOfTree` و `MinOfTree` تزوران كل خلايا الشجرة الفرعية، لأننا لا نعرف بعد إن كانت مرتّبة."),
            TRACE({
              title: "`IsBST` على الشجرة التي في المثال", code: IS_BST, lib: MIN_MAX, quiet: ["MaxOfTree", "MinOfTree"],
              run: treeOf("bt", [3, [2, 1, 4], 5]) + "\nConsole.WriteLine(IsBST(bt));",
              given: "الشجرة `bt` المرسومة أعلاه (جذرها `3`)، والاستدعاء `IsBST(bt)`.",
              description: "عند أي خلية تكتشف العملية الخلل؟",
            }),
            TRACE({
              title: "`IsBST` على شجرة بحث", code: IS_BST, lib: MIN_MAX, quiet: ["MaxOfTree", "MinOfTree"],
              run: treeOf("bt", [5, [3, 2, 4], 7]) + "\nConsole.WriteLine(IsBST(bt));",
              given: "شجرة بحث جذرها `5`، ابنه الأيسر `3` (وله الابنان `2` و `4`) وابنه الأيمن `7`، والاستدعاء `IsBST(bt)`.",
            }),
            XTIP("طريقة ثانية", "تعلّمت أنّ تمشيط `Inorder` لشجرة بحث يطبع القيم مرتّبة ترتيبًا تصاعديًا. والعكس صحيح أيضًا: إذا خرجت القيم في تمشيط `Inorder` غير مرتّبة، فالشجرة ليست شجرة بحث."),
            FIG("ثلاث أشجار للسؤال التالي", [
              { kind: "tree", tree: [8, [3, 1, 6], [10, null, 14]], label: "الشجرة (أ)" },
              { kind: "tree", tree: [8, [3, 1, 9], [10, null, 14]], label: "الشجرة (ب)" },
              { kind: "tree", tree: [8, [3, null, 6], [12, 10, null]], label: "الشجرة (ج)" },
            ]),
            proved(MC("أي شجرة من الأشجار الثلاث **ليست** شجرة بحث ثنائية؟", ["الشجرة (أ)", "*الشجرة (ب)", "الشجرة (ج)", "الثلاث كلها أشجار بحث"], "في الشجرة (ب) القيمة `9` ابن أيمن للخلية `3` وهي أكبر منها، لكنها تقع في الشجرة الفرعية **اليسرى** للجذر `8` وهي أكبر منه. أكبر قيمة في يسار الجذر يجب أن تكون أصغر منه."),
              { code: IS_BST, lib: MIN_MAX, run: [[8, [3, 1, 6], [10, null, 14]], [8, [3, 1, 9], [10, null, 14]], [8, [3, null, 6], [12, 10, null]]].map((t, i) => treeOf("t" + i, t) + "\nConsole.WriteLine(IsBST(t" + i + "));").join("\n"), out: "True\nFalse\nTrue\n", loose: true }),
            MC("لماذا تحسب `IsBST` أكبر قيمة في **كل** الشجرة الفرعية اليسرى، ولا تكتفي بقيمة الابن الأيسر؟", ["لأن الابن الأيسر قد يكون `null`", "*لأن قيمة أكبر من الأب قد تختبئ في مستوى أعمق من الشجرة الفرعية اليسرى", "لأن الابن الأيسر دائمًا أكبر قيمة في جهته", "لتكون العملية أسرع"], "في مثال الكتاب الابن الأيسر `2` أصغر من الجذر `3`، لكن حفيده `4` أكبر من الجذر. فحص الابن وحده لا يكشف ذلك."),
          ],
        },
      ],
    },
    {
      title: "حذف خلية",
      pages: [
        {
          title: "حذف خلية: الحالات الثلاث",
          src: "270–271",
          keywords: ["حذف", "ورقة", "ابن واحد", "ابنان", "أصغر قيمة في اليمين"],
          objective: "أن تحذف خلية من شجرة بحث في كل واحدة من الحالات الثلاث دون أن يُهدم ترتيب الشجرة.",
          blocks: [
            H("حذف خلية من شجرة بحث ثنائية", 2),
            P("إنّ عملية حذف خلية من شجرة بحث ثنائية تتطلّب دقّة وانتباهًا، لأنّ الحذف الخاطئ قد يؤدّي إلى هدم مبنى الشجرة وإضاعة المبنى الأصلي."),
            LIST([
              "ورقة – أي لا أبناء لها.",
              "خلية ولها ابن واحد.",
              "خلية ولها ابنان.",
            ], { title: "الخلية التي نريد حذفها قد تكون" }),
            P("**حذف ورقة** – هذه أسهل الحالات، ونقوم بذلك من خلال جعل الورقة `null`."),
            FIG("حذف ورقة: `Delete(10)`", [
              { kind: "tree", tree: [50, [30, 10, 40], 70], hi: ["LL"], label: "قبل: `10` ورقة" },
              { kind: "tree", tree: [50, [30, null, 40], 70], label: "بعد `Delete(10)`" },
            ]),
            P("**خلية لها ابن واحد** – نقوم بذلك من خلال نسخ الابن وحفظه في الخلية نفسها، وبعدها نحذف الابن."),
            FIG("حذف خلية لها ابن واحد (في الكتاب: `Delete(40)`)", [
              { kind: "tree", tree: [50, [30, null, 40], [70, 60, 80]], hi: ["LR"], label: "قبل: الكتاب يبرز الخلية `40`" },
              { kind: "tree", tree: [50, 40, [70, 60, 80]], label: "بعد: اختفت `30` وحلّت `40` مكانها" },
            ]),
            CLAR("في الكتاب", "على سهم هذا الشكل كُتب في الكتاب `Delete(40)` وأُبرزت الخلية `40`. لكنّ الخلية التي لها ابن واحد هي `30`، والنتيجة تُظهر أنّ `30` هي التي اختفت وأنّ ابنها `40` حلّ مكانها. المقصود إذن `Delete(30)`. (لو حذفنا `40` فعلًا لكانت حذف ورقة، ولبقيت `30` في الشجرة.)"),
            P("**خلية لها ابنان** – نقوم بذلك من خلال إيجاد **أصغر قيمة في الشجرة الفرعية اليمنى** وتخزينها في الخلية التي نريد حذفها. إمكانية أخرى تكمن في إيجاد **أكبر قيمة في الشجرة الفرعية اليسرى** وتخزينها في الخلية التي نريد حذفها. ومن ثمّ حذف الخلية التي فيها أصغر / أكبر قيمة."),
            FIG("حذف خلية لها ابنان: `Delete(50)` بأصغر قيمة في اليمين", [
              { kind: "tree", tree: [50, 40, [70, 60, 80]], hi: ["", "RL"], label: "قبل: أصغر قيمة في يمين `50` هي `60`" },
              { kind: "tree", tree: [60, 40, [70, null, 80]], hi: [""], label: "بعد: `60` في الجذر، وحُذفت خليتها" },
            ]),
            P("أو"),
            FIG("حذف خلية لها ابنان: `Delete(50)` بأكبر قيمة في اليسار", [
              { kind: "tree", tree: [50, 40, [70, 60, 80]], hi: ["", "L"], label: "قبل: أكبر قيمة في يسار `50` هي `40`" },
              { kind: "tree", tree: [40, null, [70, 60, 80]], hi: [""], label: "بعد: `40` في الجذر، وحُذفت خليتها" },
            ]),
            XTIP("لماذا أصغر قيمة في اليمين بالذات؟", "هي أكبر من كل ما في اليسار (لأنها من اليمين)، وأصغر من كل ما بقي في اليمين (لأنها الأصغر هناك). فإذا وضعناها مكان القيمة المحذوفة بقي شرط شجرة البحث صحيحًا. ثم إنّ خليتها لا ابن أيسر لها، فحذفها سهل: ورقة أو خلية لها ابن واحد."),
            P("والآن دعونا نكتب كل هذا بلغة `C#`. لاحظ أنّ العملية `DeleteFromBST` تُعيد مؤشّرًا على الجذر لأنّه، أي الجذر، قد يُحذف وبالتالي قد يتغيّر."),
            XP("قبل الكود، جرّب الحالات الثلاث في المختبر. المختبر يعمل بالإمكانية الأولى للكتاب: خلية لها ابنان تأخذ **أصغر قيمة في شجرتها الفرعية اليمنى**. احذف `10` (ورقة)، ثم `30` (صار لها ابن واحد)، ثم `50` (لها ابنان)."),
            LAB("bst", { tree: SEVEN, name: "bt", title: "مختبر: احذف من شجرة البحث", description: "قبل كل حذف حدّد الحالة: ورقة، ابن واحد أم ابنان؟ ثم شغّل تمشيط `Inorder` وتأكّد أنّ القيم ما زالت مرتّبة." }),
            MATCH("صِل كل حالة بما نفعله عند الحذف:", [["ورقة", "نجعلها `null`: أبوها لا يشير إليها بعد الآن"], ["خلية لها ابن واحد", "ابنها يحلّ مكانها"], ["خلية لها ابنان", "نخزّن فيها أصغر قيمة في شجرتها الفرعية اليمنى، ثم نحذف خلية تلك القيمة"]], "في الحالتين الأوليين تخرج الخلية من الشجرة. في الحالة الثالثة تبقى الخلية في مكانها وتتغيّر قيمتها فقط، والخلية التي تخرج من الشجرة هي خلية أصغر قيمة في اليمين."),
            FIG("شجرة للسؤالين التاليين", [{ kind: "tree", tree: [50, [30, 10, null], [70, 60, [80, 75, 90]]] }]),
            proved(MC("نحذف من الشجرة المرسومة أعلاه القيمة `70` بالإمكانية الأولى (أصغر قيمة في الشجرة الفرعية اليمنى). أي قيمة تُخزَّن مكانها؟", ["`60`", "*`75`", "`80`", "`90`"], "الشجرة الفرعية اليمنى للخلية `70` فيها `80` و `75` و `90`، وأصغرها `75`. أمّا `60` فهي في الشجرة الفرعية **اليسرى** (تلك هي الإمكانية الثانية)."),
              { code: DELETE, run: treeOf("bt", [50, [30, 10, null], [70, 60, [80, 75, 90]]]) + "\nbt = DeleteFromBST(bt, 70);\nConsole.Write(bt.GetRight().GetValue());", out: "75" }),
            CLASSIFY("في الشجرة نفسها (قبل أي حذف): صنّف كل قيمة بحسب حالة حذف خليتها.", ["ورقة", "لها ابن واحد", "لها ابنان"], [["`10`", 0], ["`30`", 1], ["`50`", 2], ["`60`", 0], ["`70`", 2], ["`80`", 2], ["`90`", 0]], "`10` و `60` و `90` (وكذلك `75`) أوراق. `30` لها ابن أيسر فقط. `50` و `70` و `80` لكل واحدة منها ابنان."),
          ],
        },
        {
          title: "العملية `DeleteFromBST` بلغة `C#`",
          keywords: ["DeleteFromBST", "MinOfBST", "حذف", "الجذر يتغيّر"],
          objective: "أن تقرأ كود الحذف وتتتبّعه في كل حالة من الحالات الثلاث.",
          blocks: [
            CLAR("صفحتان ناقصتان من نسختنا", "كود العملية `DeleteFromBST` مطبوع في الكتاب في الصفحتين 272–273، وهما غير موجودتين في نسختنا. الكود التالي كتبناه نحن. هو يتبع حالات الكتاب الثلاث، ويستعمل في حالة الابنين الإمكانية الأولى (أصغر قيمة في الشجرة الفرعية اليمنى)، ويُعيد مؤشّرًا على الجذر كما يقول الكتاب."),
            XCS(DELETE),
            XLIST([
              ["البحث عن الخلية", "إذا كانت القيمة أصغر من قيمة الخلية الحالية نحذف (بشكل تراجعي) من الشجرة الفرعية اليسرى، وإذا كانت أكبر فمن اليمنى. ما تعيده العملية نربطه من جديد بالأمر `SetLeft` أو `SetRight`."],
              ["الحالة 1: ورقة", "نعيد `null`، فيصير مكانها عند أبيها `null`."],
              ["الحالة 2: ابن واحد", "نعيد الابن نفسه، فيرتبط أبوها بابنها مباشرة."],
              ["الحالة 3: ابنان", "نجد أصغر قيمة في الشجرة الفرعية اليمنى بالعملية `MinOfBST`، نخزّنها في الخلية، ثم نحذف تلك القيمة من الشجرة الفرعية اليمنى باستدعاء تراجعي."],
              ["في النهاية", "نعيد `bt`: جذر الشجرة (الفرعية) بعد الحذف."],
            ], { title: "كيف تعمل العملية؟" }),
            XNOTE("طريقة الاستدعاء", "نستدعي العملية دائمًا هكذا: `bt = DeleteFromBST(bt, Value);`. لو حذفنا الجذر وهو ورقة أو له ابن واحد، يتغيّر الجذر نفسه، والمتغيّر `bt` يجب أن يستقبل الجذر الجديد."),
            CLAR("ابن واحد: نسخ أم ربط؟", "الكتاب يصف الحالة الثانية هكذا: ننسخ الابن إلى الخلية ثم نحذف الابن. في الكود نصل إلى النتيجة نفسها بطريقة أبسط: نعيد الابن، فيرتبط به أبو الخلية المحذوفة. هكذا يصعد الابن **مع كل شجرته الفرعية** إن كانت له واحدة."),
            FIG("الحالة 1: نحذف الورقة `10`", [{ kind: "tree", tree: [50, [30, 10, 40], 70], hi: ["LL"] }]),
            TRACE({
              title: "`DeleteFromBST(bt, 10)`: حذف ورقة", code: DELETE, lib: ORDERS,
              run: treeOf("bt", [50, [30, 10, 40], 70]) + "\nbt = DeleteFromBST(bt, 10);\nInOrder(bt);",
              given: "الشجرة `bt` المرسومة أعلاه، والأمر `bt = DeleteFromBST(bt, 10);` ثم طباعة الشجرة بتمشيط `Inorder`.",
              description: "راقب ما تعيده كل عملية إلى التي استدعتها.",
            }),
            FIG("الحالة 2: نحذف `30` ولها ابن واحد", [{ kind: "tree", tree: [50, [30, null, 40], [70, 60, 80]], hi: ["L"] }]),
            TRACE({
              title: "`DeleteFromBST(bt, 30)`: خلية لها ابن واحد", code: DELETE, lib: ORDERS,
              run: treeOf("bt", [50, [30, null, 40], [70, 60, 80]]) + "\nbt = DeleteFromBST(bt, 30);\nInOrder(bt);",
              given: "الشجرة `bt` المرسومة أعلاه، والأمر `bt = DeleteFromBST(bt, 30);` ثم طباعة الشجرة بتمشيط `Inorder`.",
            }),
            FIG("الحالة 3: نحذف الجذر `50` وله ابنان", [{ kind: "tree", tree: [50, 40, [70, 60, 80]], hi: [""] }]),
            TRACE({
              title: "`DeleteFromBST(bt, 50)`: خلية لها ابنان", code: DELETE, lib: ORDERS,
              run: treeOf("bt", [50, 40, [70, 60, 80]]) + "\nbt = DeleteFromBST(bt, 50);\nPreOrder(bt);",
              given: "الشجرة `bt` المرسومة أعلاه، والأمر `bt = DeleteFromBST(bt, 50);` ثم طباعة الشجرة بتمشيط `Preorder`.",
              description: "القيمة `60` تُنسخ إلى الجذر، ثم تُحذف خليتها الأصلية باستدعاء تراجعي.",
            }),
            FIG("شجرة للأسئلة التالية", [{ kind: "tree", tree: SEVEN }]),
            proved(MC("ننفّذ على الشجرة المرسومة أعلاه الأمر `bt = DeleteFromBST(bt, 50);`. ماذا يطبع بعده الأمر `PreOrder(bt);`؟", ["`[30,10,40,70,60,80]`", "*" + seq("60 30 10 40 70 80 "), "`[40,30,10,70,60,80]`", "`[70,30,10,40,60,80]`"], "للجذر `50` ابنان. أصغر قيمة في شجرته الفرعية اليمنى هي `60`، فتُخزَّن في الجذر وتُحذف خليتها (ورقة). تمشيط `Preorder` يبدأ بالجذر الجديد `60`."),
              { code: DELETE, lib: ORDERS, run: treeOf("bt", SEVEN) + "\nbt = DeleteFromBST(bt, 50);\nPreOrder(bt);", out: "60 30 10 40 70 80 ", loose: true }),
            proved(SHORT("ننفّذ على الشجرة نفسها (كما هي في الرسم) الأمر `bt = DeleteFromBST(bt, 30);`. ما القيمة التي تصير في الابن الأيسر للجذر؟", "40", "للخلية `30` ابنان. أصغر قيمة في شجرتها الفرعية اليمنى هي `40`، فتُخزَّن مكان `30`، ثم تُحذف الورقة `40`."),
              { code: DELETE, run: treeOf("bt", SEVEN) + "\nbt = DeleteFromBST(bt, 30);\nConsole.Write(bt.GetLeft().GetValue());", out: "40" }),
            MC("لماذا نكتب `bt = DeleteFromBST(bt, x);` ولا نكتفي بالأمر `DeleteFromBST(bt, x);`؟", ["لأن العملية لا تغيّر الشجرة أبدًا", "*لأن الجذر نفسه قد يُحذف، فيجب أن يستقبل `bt` الجذر الجديد", "لأن العملية تعيد القيمة المحذوفة", "لا فرق بين الكتابتين في أي حالة"], "إذا كان الجذر ورقة تعيد العملية `null`، وإذا كان له ابن واحد تعيد ذلك الابن. بدون الإسناد يبقى `bt` يشير إلى الخلية القديمة."),
            proved(MC("ننفّذ على الشجرة نفسها (كما هي في الرسم) الأمر `bt = DeleteFromBST(bt, 99);`، والقيمة `99` غير موجودة. ماذا يطبع بعده الأمر `InOrder(bt);`؟", ["لا شيء: الشجرة تصير فارغة", "*" + seq("10 30 40 50 60 70 80 "), "`[10,30,40,50,60,70]`", "يحدث خطأ في التشغيل"], "البحث ينزل يمينًا حتى يصل إلى `null`، فتعيد العملية `null` ويبقى الابن الأيمن للخلية `80` كما كان: `null`. الشجرة لا تتغيّر."),
              { code: DELETE, lib: ORDERS, run: treeOf("bt", SEVEN) + "\nbt = DeleteFromBST(bt, 99);\nInOrder(bt);", out: "10 30 40 50 60 70 80 ", loose: true }),
          ],
        },
      ],
    },
    {
      title: "إعادة بناء الشجرة",
      pages: [
        {
          title: "إعادة بناء شجرة من `Inorder` و `Preorder`",
          src: "274–277",
          keywords: ["إعادة بناء الشجرة", "Reconstruction", "Preorder", "Inorder", "Postorder"],
          objective: "أن ترسم شجرة ثنائية إذا أُعطيت نتيجة تمشيطها بطريقتي `Preorder` و `Inorder`.",
          blocks: [
            H("إعادة بناء الشجرة", 2),
            P("أحيانًا تكون معطاة نتيجة تمشيط قيم شجرة ثنائية وفق الطريقتين `Inorder` و `Preorder`، أو `Inorder` و `Postorder`، ويُطلب منّا إعادة بناء الشجرة – `Binary Tree Reconstruction`."),
            DEF("الفكرة الرئيسية", "نتيجة التمشيط وفق `Preorder` أو وفق `Postorder` تحدّد لنا **خلية الأب**، وأمّا نتيجة التمشيط وفق `Inorder` فإنها تحدّد لنا **الأبناء**."),
            H("مثال (4)", 3),
            P("نتيجة تمشيط قيم شجرة ثنائية ما وفق `Inorder` كانت كالتالي:"),
            OUT("9, 10, 13, 14, 15, 19, 20, 21, 25"),
            P("ونتيجة تمشيط قيم نفس الشجرة وفق `Preorder` كانت كالتالي:"),
            OUT("15, 10, 9, 13, 14, 21, 19, 20, 25"),
            P("واضح من قائمة القيم وفق `Preorder` بأنّ القيمة 15 هي قيمة خلية الجذر. بعدها نبحث عن مكان قيمة الأب في قائمة القيم وفق `Inorder` لنعرف من هم الأبناء. وبشكل أدق: لنعرف ما هي القيم الموجودة في الشجرة الفرعية اليسرى (القيم التي قبل 15) وما هي القيم الموجودة في الشجرة الفرعية اليمنى (القيم التي بعد 15)."),
            P("والآن نُكمل بناء الشجرتين الفرعيتين، اليسرى واليمنى، بنفس الطريقة وبشكل تراجعي:"),
            OL([
              ["الشجرة الفرعية اليسرى وفيها القيم `9, 10, 13, 14`", "لمعرفة الأب ننظر إلى نتيجة التمشيط وفق `Preorder` لنجد أنّ الأب هو الخلية التي قيمتها 10. ثم ننظر إلى نتيجة التمشيط وفق `Inorder` لنعرف الأبناء."],
              ["الشجرة الفرعية اليمنى للخلية 10 وفيها القيم `13, 14`", "الأب هو الخلية التي قيمتها 13. من `Inorder` نجد أنّ الشجرة الفرعية اليسرى للقيمة 13 فارغة، والشجرة الفرعية اليمنى فيها خلية واحدة قيمتها 14."],
              ["الشجرة الفرعية اليمنى للجذر وفيها القيم `19, 20, 21, 25`", "من `Preorder` نجد أنّ الأب هو الخلية التي قيمتها 21. ثم ننظر إلى `Inorder` لنعرف الأبناء."],
              ["الشجرة الفرعية اليسرى للخلية 21 وفيها القيم `19, 20`", "الأب هو الخلية التي قيمتها 19. الشجرة الفرعية اليسرى للقيمة 19 فارغة، والشجرة الفرعية اليمنى فيها خلية واحدة قيمتها 20."],
            ]),
            XP("الرسوم التالية تعيد أشكال الكتاب خطوة بعد خطوة. الخلية المظلّلة التي كُتبت فيها عدّة قيم تمثّل **شجرة فرعية لم تُبنَ بعد** (في الكتاب رُسمت مثلّثًا)."),
            FIG("إعادة البناء: الخطوات الأولى", [
              { kind: "tree", tree: [15], hi: [""], label: "الجذر `15`: أول قيمة في `Preorder`" },
              { kind: "tree", tree: [15, "9…14", "19…25"], hi: ["L", "R"], label: "يسار: `[9,10,13,14]` · يمين: `[19,20,21,25]`" },
              { kind: "tree", tree: [15, [10, 9, "13,14"], "19…25"], hi: ["LR", "R"], label: "الأب `10`: قبله `9` وبعده `[13,14]`" },
            ]),
            FIG("إعادة البناء: حتى الشجرة الكاملة", [
              { kind: "tree", tree: [15, [10, 9, [13, null, 14]], "19…25"], hi: ["R"], label: "الأب `13`: لا شيء قبله، وبعده `14`" },
              { kind: "tree", tree: [15, [10, 9, [13, null, 14]], [21, "19,20", 25]], hi: ["RL"], label: "الأب `21`: قبله `[19,20]` وبعده `25`" },
              { kind: "tree", tree: [15, [10, 9, [13, null, 14]], [21, [19, null, 20], 25]], label: "الأب `19`: لا شيء قبله، وبعده `20`" },
            ]),
            XTIP("القاعدة في جملتين", "`Preorder` يقول: **من الأب؟** — أول قيمة تظهر فيه من قيم المجموعة. `Inorder` يقول: **من على يساره ومن على يمينه؟** — ما قبل الأب في اليسار، وما بعده في اليمين."),
            GUIDED({
              title: "نحلّ معًا: شجرة من خمس قيم",
              prompt: "معطى `Preorder`: `8, 3, 1, 6, 10` و `Inorder`: `1, 3, 6, 8, 10`. ارسم الشجرة.",
              steps: [
                "أول قيمة في `Preorder` هي الجذر: `8`.",
                "في `Inorder` القيم التي قبل `8` هي `1, 3, 6` (الشجرة الفرعية اليسرى)، والتي بعدها `10` (اليمنى).",
                "من القيم `1, 3, 6` أول ما يظهر في `Preorder` هو `3`: هو الأب، أي الابن الأيسر للجذر.",
                "في `Inorder` القيمة `1` قبل `3` والقيمة `6` بعدها: `1` الابن الأيسر للخلية `3` و `6` ابنها الأيمن.",
                "`10` وحدها في اليمين: هي الابن الأيمن للجذر.",
              ],
              result: "الجذر `8`، ابنه الأيسر `3` (وله الابنان `1` و `6`) وابنه الأيمن `10`.",
            }),
            XTIP("ملاحظة لشجرة البحث", "في المثالين نتيجة `Inorder` مرتّبة ترتيبًا تصاعديًا، فالشجرتان شجرتا بحث. ولأن `Inorder` لشجرة بحث هو دائمًا القيم مرتّبة، يكفي لإعادة بناء **شجرة بحث** أن نعرف نتيجة `Preorder` وحدها."),
            MC("نتيجة `Preorder` لشجرة ثنائية هي `[7,2,1,5,9]`. ما قيمة الجذر؟", ["`1`", "`5`", "*`7`", "`9`"], "في تمشيط `Preorder` يُطبع الأب قبل ابنيه، فأول قيمة هي دائمًا الجذر."),
            MC("لشجرة ثنائية: `Preorder` هو `[7,2,1,5,9]` و `Inorder` هو `[1,2,5,7,9]`. أي قيم تقع في الشجرة الفرعية اليسرى للجذر؟", ["`[9]`", "*`[1,2,5]`", "`[2,1]`", "`[1,2,5,9]`"], "الجذر `7`. في `Inorder` كل ما يسبق `7` يقع في شجرته الفرعية اليسرى: `1` و `2` و `5`. والقيمة `9` بعده، فهي في اليمنى."),
            TF("يكفي أن نعرف نتيجة تمشيط `Preorder` وحدها لنعيد بناء أي شجرة ثنائية.", false, "`Preorder` يحدّد الأب فقط. لتقسيم القيم الباقية بين اليسار واليمين نحتاج `Inorder`. (في شجرة **البحث** نعرف `Inorder` سلفًا: القيم مرتّبة.)"),
          ],
        },
        {
          title: "العملية `BuildTree` بلغة `C#`",
          src: "277–280",
          keywords: ["BuildTree", "Find", "AreEqual", "PreA", "InA"],
          objective: "أن تفهم كيف تُترجم خطوات إعادة البناء إلى عملية تراجعية تعمل على مصفوفتين.",
          blocks: [
            P("والآن بإمكاننا برمجة هذا الألغوريثم بلغة `C#` مفترضين أنّ نتيجة التمشيط معطاة في مصفوفتين أحاديتين:"),
            LIST([
              "المصفوفة `PreA` تحتوي على نتيجة التمشيط وفق `Preorder`.",
              "والمصفوفة `InA` تحتوي على نتيجة التمشيط وفق `Inorder`.",
            ]),
            P("ونستعين بالعملية `Find` التي تتلقّى مصفوفة وقيمة ثمّ تُعيد رقم الخلية التي تحتوي على القيمة إذا وجدتها. خلاف ذلك تُعيد العملية `-1`:"),
            CS(BUILD),
            XLIST([
              ["الجذر", "`PreA[0]` هو قيمة الجذر. `RootIn` هو مكانه في `InA`."],
              ["اليسار", "قبل الجذر في `InA` توجد `RootIn` قيم: ننسخها إلى `InLeft`. وننسخ العدد نفسه من القيم التي تلي الجذر في `PreA` إلى `PreLeft`."],
              ["اليمين", "ما بقي في المصفوفتين ننسخه إلى `InRight` و `PreRight`."],
              ["شرط التوقّف", "إذا لم تكن في جهةٍ قيم تبقى مصفوفتاها `null`، والاستدعاء التراجعي معهما يعيد `null`: لا ابن في تلك الجهة."],
              ["الربط", "في النهاية ننشئ خلية الجذر، وابناها هما ما يعيده الاستدعاءان التراجعيان."],
            ], { title: "`BuildTree` بكلمات بسيطة" }),
            TRACE({
              title: "`BuildTree` تبني شجرة من ثلاث قيم", code: BUILD, lib: ORDERS, quiet: ["Find"],
              run: "int[] PreA = { 2, 1, 3 };\nint[] InA = { 1, 2, 3 };\nBinNode<int> bt = BuildTree(PreA, InA);\nPostOrder(bt);",
              given: "المصفوفتان `PreA = {2, 1, 3}` و `InA = {1, 2, 3}`، والاستدعاء `BuildTree(PreA, InA)` ثم طباعة الشجرة بتمشيط `Postorder`.",
              description: "راقب المصفوفات الصغيرة التي تُبنى لكل جهة، ومتى تبقى `null`.",
            }),
            P("**كود لفحص العملية**"),
            CS(BUILD_CHECK),
            CLAR("في الكتاب", "كود الفحص يستدعي العملية `Size` التي تُعيد عدد خلايا الشجرة، وهي غير معرّفة بهذا الاسم في الفصل (عملية عدّ الخلايا في الكتاب اسمها `NumOfTreeNodes`). والأمر `Console.WriteLine();` يطبع سطرًا فارغًا فقط. انتبه أيضًا: `Inorder` و `PreOrder` هنا عمليتان جديدتان (في آخر الصفحة) تنسخان القيم إلى مصفوفة ولا تطبعانها."),
            H("العملية `AreEqual`", 3),
            LIST([
              ["ادّعاء الدخول", "تتلقّى شجرتين ثنائيتين من نمط صحيح."],
              ["ادّعاء الخروج", "تُعيد `true` إذا كانت الشجرتان متساويتين من حيث المبنى والقيم. خلاف ذلك تُعيد `false`."],
            ]),
            CS(ARE_EQUAL),
            H("العمليتان `Inorder` و `PreOrder` اللتان تنسخان إلى مصفوفة", 3),
            LIST([
              ["ادّعاء الدخول", "تتلقّى شجرة ثنائية ومصفوفة أحادية بحجم عدد خلايا الشجرة ورقم خلية مساعدًا (إندكس)."],
              ["ادّعاء الخروج", "تقوم بتمشيط الشجرة (بشكل داخلي في `Inorder` وبَدْئي في `PreOrder`) وتنسخ القيم إلى المصفوفة. العملية تُعيد في كل استدعاء رقم الخلية التي ستُخزَّن فيها القيمة التالية."],
            ]),
            CS(IN_ARR),
            CS(PRE_ARR),
            proved(MC("ماذا يطبع كود الفحص في سطره الأخير؟", ["*`Both trees are equal`", "`Both trees are NOT equal`", "`True`", "لا يطبع شيئًا"], "الكود يبني شجرة بحث `bt1`، ينسخ نتيجتي `Inorder` و `Preorder` إلى مصفوفتين، ثم يعيد بناء شجرة `bt2` منهما. إعادة البناء صحيحة، فالشجرتان متساويتان في المبنى والقيم."),
              { code: ARE_EQUAL, lib: [TO_BST, SIZE, BUILD, IN_ARR, PRE_ARR], run: BUILD_CHECK, out: "\nBoth trees are equal\n", loose: true }),
            proved(SHORT("بنينا `bt1` بالعملية `ToBST` من القيم `[2,1,3]` و `bt2` من القيم `[1,2,3]` (كل مرة بالترتيب المكتوب). ماذا تعيد `AreEqual(bt1, bt2)`؟ اكتب true أو false.", "false", "في الشجرتين القيم نفسها، لكن المبنى مختلف: جذر `bt1` هو `2` وله ابنان، أمّا `bt2` فسلسلة إلى اليمين جذرها `1`. المقارنة تفشل عند الجذر."),
              { code: ARE_EQUAL, lib: TO_BST, run: "int[] A = { 2, 1, 3 };\nint[] B = { 1, 2, 3 };\nBinNode<int> bt1 = ToBST(A);\nBinNode<int> bt2 = ToBST(B);\n" + tf("AreEqual(bt1, bt2)"), out: "false" }),
            MC("في `BuildTree`: إذا كان الجذر في الخانة `RootIn = 0` من `InA`، ماذا نعرف عن الشجرة؟", ["*لا توجد شجرة فرعية يسرى للجذر", "لا توجد شجرة فرعية يمنى للجذر", "الشجرة فيها خلية واحدة فقط", "المصفوفتان فيهما خطأ"], "`RootIn` هو عدد القيم التي تسبق الجذر في `Inorder`، أي حجم الشجرة الفرعية اليسرى. إذا كان 0 تبقى `InLeft` و `PreLeft` مساويتين `null`، فيكون الابن الأيسر `null`."),
          ],
        },
      ],
    },
    {
      title: "أسئلة تتبّع وكتابة",
      pages: [
        {
          title: "أسئلة تتبّع",
          src: "298–299",
          keywords: ["تتبّع", "شجرة بحث", "What", "What1"],
          blocks: [
            XP("تمعّن في كل مقطع وتتبّعه **بدون** الاستعانة بالحاسوب: ارسم الشجرة في دفترك وأجب أولًا، ثم افتح التتبّع لتتأكد. الأسئلة 1–3 تستعمل عمليات هذه الوحدة: `ToBST` و `InsertIntoBST` و `DeleteFromBST`، وعمليات الطباعة `PreOrder` و `InOrder` من الوحدة السابقة."),
            XH("سؤال 1 — بناء وإدخال", 3),
            XCS(T1),
            proved(MC("ماذا يطبع المقطع أعلاه؟", ["`[10,20,25,30,40,50,60]`", "*" + seq(T1_OUT), "`[40,20,60,10,30,25,50]`", "`[40,20,10,25,30,60,50]`"], "بعد `ToBST`: الجذر `40`، في يساره `20` (وله الابنان `10` و `30`) وفي يمينه `60`. القيمة `25` تنزل يسار `40` ثم يمين `20` ثم يسار `30`. القيمة `50` تنزل يمين `40` ثم يسار `60`. تمشيط `Preorder` يطبع الأب ثم اليسار ثم اليمين."),
              { code: T1, lib: [TO_BST, ORDERS], out: T1_OUT, loose: true }),
            proved(SHORT("بعد تنفيذ المقطع: ما القيمة المخزّنة في الابن الأيسر للخلية `30`؟", "25", "`25` أصغر من `40` (يسار)، ليست أصغر من `20` (يمين)، وأصغر من `30` (يسار). الابن الأيسر للخلية `30` كان `null`، فوُضعت فيه."),
              { code: TO_BST, run: "int[] A = { 40, 20, 60, 10, 30 };\nBinNode<int> bt = ToBST(A);\nInsertIntoBST(bt, 25);\nInsertIntoBST(bt, 50);\nConsole.Write(bt.GetLeft().GetRight().GetLeft().GetValue());", out: "25" }),
            TRACE({ title: "تتبّع سؤال 1", code: T1, lib: [TO_BST, ORDERS], description: "العمليات المساعدة تعمل هنا بلا خطوات مفصّلة: راقب الشجرة بعد كل أمر." }),
            XH("سؤال 2 — العملية `Secret`", 3),
            XCS(SECRET),
            FIG("الشجرة المعطاة `bt`", [{ kind: "tree", tree: SECRET_TREE }]),
            proved(SHORT("ما القيمة التي يعيدها الاستدعاء `Secret(bt)` للشجرة المرسومة؟", "10", "العملية تنزل إلى اليسار ما دام هناك ابن أيسر: `50` ثم `30` ثم `10`. للخلية `10` ابن أيمن فقط، فلا ابن أيسر لها، وتُعاد قيمتها. القيمة `20` لا تُزار أبدًا."),
              { code: SECRET, run: treeOf("bt", SECRET_TREE) + "\nConsole.Write(Secret(bt));", out: "10" }),
            MC("ماذا تنفّذ العملية `Secret` حين تستقبل شجرة بحث غير فارغة؟", ["تعيد قيمة أول ورقة في الشجرة", "تعيد ارتفاع الشجرة", "*تعيد أصغر قيمة في الشجرة", "تعيد قيمة الابن الأيسر للجذر"], "في شجرة البحث كل قيمة أصغر من خلية تقع في يسارها، فالخلية التي في أقصى اليسار فيها أصغر قيمة. هذه الخلية ليست ورقة بالضرورة: في المثال للخلية `10` ابن أيمن."),
            MC("ما درجة نجاعة العملية `Secret`، حيث `h` ارتفاع الشجرة و `n` عدد خلاياها؟", ["`O(1)`", "*`O(h)`", "`O(n)` دائمًا", "`O(n * h)`"], "العملية تنزل في مسار واحد إلى اليسار، فلا تزور أكثر من خلية واحدة في كل مستوى. في شجرة على شكل سلسلة إلى اليسار يساوي ذلك `O(n)`."),
            TRACE({ title: "تتبّع `Secret`", code: SECRET, run: treeOf("bt", SECRET_TREE) + "\nConsole.WriteLine(Secret(bt));", given: "الشجرة `bt` المرسومة أعلاه، والاستدعاء `Secret(bt)`." }),
            XH("سؤال 3 — ثلاث عمليات حذف", 3),
            XCS(T3),
            proved(SHORT("ما العدد الذي يطبعه الأمر `Console.WriteLine(bt.GetValue());` في المقطع أعلاه؟", "60", "حذف `10`: ورقة. حذف `30`: لها الآن ابن واحد (`40`) فيحلّ مكانها. حذف `50`: للجذر ابنان، وأصغر قيمة في شجرته الفرعية اليمنى هي `60`، فتصير قيمة الجذر `60`."),
              { code: DELETE, lib: TO_BST, run: "int[] A = { 50, 30, 70, 10, 40, 60, 80 };\nBinNode<int> bt = ToBST(A);\nbt = DeleteFromBST(bt, 10);\nbt = DeleteFromBST(bt, 30);\nbt = DeleteFromBST(bt, 50);\nConsole.Write(bt.GetValue());", out: "60" }),
            proved(MC("وماذا يطبع الأمر الأخير `InOrder(bt);`؟", ["`[60,40,70,80]`", "*" + seq("40 60 70 80 "), "`[40,50,60,70,80]`", "`[10,30,40,60,70,80]`"], "حُذفت القيم `10` و `30` و `50` وبقيت أربع قيم. الشجرة ما زالت شجرة بحث، فتمشيط `Inorder` يطبعها مرتّبة ترتيبًا تصاعديًا."),
              { code: T3, lib: [TO_BST, DELETE, ORDERS], out: "60\n40 60 70 80 ", loose: true }),
            TRACE({ title: "تتبّع سؤال 3", code: T3, lib: [TO_BST, DELETE, ORDERS], description: "هذه بالضبط أشكال الكتاب الثلاثة في الحذف، واحدًا بعد الآخر." }),
            XH("سؤال 4 — سؤال 21 من الكتاب", 3),
            P("معطاة مجموعة العمليات التالية:"),
            CS(Q21),
            EX({ mode: "practice", title: "سؤال 21 من الكتاب", prompt: "1. معطاة القيم التالية: `15, 17, 9, 5, 10, 21, 19`. قم ببناء شجرة بحث ثنائية `bst` (اختيار القيم من اليسار إلى اليمين، أي أنّ 15 سيصبح الجذر) ثمّ تتبّع تنفيذ المقطع `What(bst);` وحدّد المخرج. 2. ما هي وظيفة العملية `What`؟ 3. تتبّع تنفيذ المقطع `What1(bst);` وحدّد المخرج – لا حاجة لتتبّع تنفيذ استدعاءات العملية `What` والعملية `PrintArray`." }),
            CLAR("في الكتاب", "المقطع `What(bst);` لا يطبع شيئًا، لأن `What` تُعيد عددًا ولا تطبعه. المقصود بـ«المخرج» في البند 1 هو القيمة التي تعيدها العملية."),
            XP("ابنِ الشجرة في دفترك أولًا، ثم قارنها بالرسم التالي:"),
            FIG("الشجرة `bst` بعد إدخال القيم بالترتيب", [{ kind: "tree", tree: Q21_TREE }]),
            proved(SHORT("ما القيمة التي يعيدها الاستدعاء `What(bst)`؟", "3", "للخلية التي لا أبناء لها تعيد العملية 0. لكل خلية أخرى: 1 + أكبر النتيجتين من جهتيها. أطول مسار نازل من الجذر هو `15` ثم `17` ثم `21` ثم `19`، وفيه 3 خطوط."),
              { code: Q21, lib: TO_BST, run: Q21_RUN + "\nConsole.Write(What(bst));", out: "3" }),
            MC("ما وظيفة العملية `What`؟", ["تعيد عدد خلايا الشجرة", "تعيد عدد الأوراق", "*تعيد ارتفاع الشجرة", "تعيد أكبر قيمة في الشجرة"], "العملية تحسب لكل خلية عدد الخطوط حتى أبعد ورقة تحتها، وتأخذ الأكبر بين الجهتين. هذا هو ارتفاع الشجرة (لشجرة غير فارغة)."),
            proved(MC("ماذا يطبع الاستدعاء `What1(bst)`؟", ["سطرًا واحدًا: `15 9 5 10 17 21 19`", "*ثلاثة أسطر: `15 9 5` ثم `15 9 10` ثم `15 17 21 19`", "ثلاثة أسطر: `5` ثم `10` ثم `19`", "سطرين: `15 9 5 10` ثم `15 17 21 19`"], "`What2` تحفظ في المصفوفة قيم المسار من الجذر إلى الخلية الحالية، وحين تصل إلى ورقة تطبع المسار كله. في الشجرة ثلاث أوراق (`5` و `10` و `19`)، فتُطبع ثلاثة مسارات. حجم المصفوفة `What(Root)+1` هو عدد الخلايا في أطول مسار."),
              { code: Q21, lib: TO_BST, run: Q21_RUN + "\nWhat1(bst);", out: "15 9 5 \n15 9 10 \n15 17 21 19 \n", loose: true }),
            TRACE({ title: "تتبّع `What1(bst)`", code: Q21, lib: TO_BST, quiet: ["What", "PrintArray"], run: Q21_RUN + "\nWhat1(bst);", given: "الشجرة `bst` المرسومة أعلاه، والاستدعاء `What1(bst)`.", description: "راقب المصفوفة `A` والمتغيّر `Len`: كل استدعاء يكتب قيمته في خانة مستواه." }),
          ],
        },
        {
          title: "أسئلة كتابة: اكتب العملية",
          src: "281–295",
          keywords: ["كتابة عملية", "MaxOfBST", "CountInRange", "أسئلة الكتاب"],
          blocks: [
            XP("حلّ كل سؤال في دفترك أو في محرّر الكود **قبل** أن تنتقل إلى الصفحة التالية، ففيها الحلول مع تتبّعها. السؤالان الأولان من تمارين الكتاب، والثلاثة التالية أسئلة كتابة أضفناها."),
            EX({ mode: "practice", title: "سؤال 1 من الكتاب (البندان 2 و 3)", prompt: "2. هل الشجرة التي أمامك شجرة بحث ثنائية؟ علّل الإجابة. 3. اطبع قيم الشجرة بحسب الطرق الثلاث: `Preorder`, `Inorder`, `Postorder`." }),
            FIG("شجرة سؤال 1 من الكتاب", [{ kind: "tree", tree: Q1_TREE }]),
            EX({ mode: "practice", title: "سؤال 17 من الكتاب (البندان 1 و 2)", prompt: "1. معطاة قيم شجرة ثنائية تمّت طباعتها وفق تمشيط `Preorder` ووفق تمشيط `Inorder` (في الجدول التالي). المطلوب: بناء، أي رسم، الشجرة وفق هذه المعطيات. 2. هل يمكننا بناء الشجرة إذا توفّرت لنا نتائج التمشيط وفق `Inorder` و `Postorder`؟ اشرح." }),
            TABLE(["التمشيط", "القيم"], [["Preorder", "17, 10, -1, 5, 12, 28"], ["Inorder", "-1, 5, 10, 12, 17, 28"]], { ltr: [0, 1] }),
            XH("أسئلة كتابة إضافية", 3),
            XEX({ mode: "practice", title: "سؤال 3 — `MaxOfBST`", prompt: "اكتب عملية خارجية باسم `MaxOfBST` تتلقّى جذر شجرة بحث ثنائية **غير فارغة** من نمط صحيح، وتُعيد أكبر قيمة فيها. استغلّ ترتيب القيم في شجرة البحث: لا حاجة لزيارة كل الخلايا." }),
            XCS("public static int MaxOfBST(BinNode<int> bt)\n{\n    // اكتب هنا\n}"),
            XEX({ mode: "practice", title: "سؤال 4 — `ExistsInBST` بدون تراجعية", prompt: "اكتب العملية `ExistsInBST` من جديد **بدون تراجعية**: بحلقة `while` تنزل من الجذر، وفي كل دورة تنتقل إلى الابن الأيسر أو إلى الابن الأيمن. العملية تُعيد `true` إذا وجدت القيمة `Value`، وخلاف ذلك `false`." }),
            XCS("public static bool ExistsInBST(BinNode<int> bt, int Value)\n{\n    // اكتب هنا\n}"),
            XEX({ mode: "practice", title: "سؤال 5 — `CountInRange`", prompt: "اكتب عملية خارجية تراجعية باسم `CountInRange` تتلقّى جذر شجرة بحث ثنائية من نمط صحيح وعددين صحيحين `Low` و `High` (معطى أنّ `Low <= High`). العملية تُعيد عدد القيم `x` في الشجرة التي تحقّق `Low <= x <= High`. لا تدخل إلى شجرة فرعية إذا كان واضحًا من ترتيب شجرة البحث أنّه لا توجد فيها قيم مناسبة. مثال: لشجرة فيها القيم `[10,30,40,50,60,70,80]` و `Low = 35` و `High = 65` تُعيد العملية 3." }),
            XCS("public static int CountInRange(BinNode<int> bt, int Low, int High)\n{\n    // اكتب هنا\n}"),
            XLIST([
              "هل توقيع العملية صحيح (ما تستقبله وما تعيده)؟",
              "هل تفحص `null` قبل أن تستدعي `GetValue` أو `GetLeft` أو `GetRight` على خلية؟",
              "هل تستغلّ ترتيب شجرة البحث فتختار جهة واحدة حين يكفي ذلك؟",
              "في العملية التراجعية: هل يوجد شرط توقّف، وهل كل استدعاء تراجعي يعمل على شجرة أصغر؟",
            ], { title: "افحص حلّك قبل أن ترى الحل", variant: "checklist" }),
          ],
        },
        {
          title: "حلول أسئلة الكتابة",
          keywords: ["حلول", "MaxOfBST", "ExistsInBST", "CountInRange"],
          blocks: [
            XH("حل سؤال 1 من الكتاب", 3),
            FIG("شجرة سؤال 1: أين الخلل؟", [{ kind: "tree", tree: Q1_TREE, hi: ["RL", "RR"] }]),
            XP("الشجرة **ليست** شجرة بحث ثنائية. يكفي سبب واحد، وهنا سببان: القيمة `8` ابن **أيسر** للخلية `5` وهي أكبر منها؛ والقيمة `-1` (في اليمين) تقع في الشجرة الفرعية اليمنى للجذر `3` وهي أصغر منه."),
            XTABLE(["التمشيط", "الناتج"], [["Preorder", Q1_OUT.pre.trim()], ["Inorder", Q1_OUT.inn.trim()], ["Postorder", Q1_OUT.post.trim()]], { ltr: [0, 1], caption: "حل البند 3" }),
            XP("لاحظ أنّ ناتج `Inorder` غير مرتّب ترتيبًا تصاعديًا، وهذا وحده يكفي لنعرف أنّ الشجرة ليست شجرة بحث."),
            proved(MC("أي سطر هو ناتج تمشيط `Inorder` لشجرة سؤال 1؟", [seq(Q1_OUT.pre), "*" + seq(Q1_OUT.inn), seq(Q1_OUT.post), "`[-6,-1,-1,3,5,7,8]`"], "`Inorder`: اليسار ثم الأب ثم اليمين. يسار الجذر يعطي `-6` ثم `-1`، ثم الجذر `3`، ثم يمينه: `8` ثم `5` ثم `7` ثم `-1`. الخيار الأخير هو القيم مرتّبة، وكان سيكون الناتج لو كانت الشجرة شجرة بحث."),
              { code: ORDERS, run: treeOf("bt", Q1_TREE) + "\nPreOrder(bt);\nConsole.WriteLine();\nInOrder(bt);\nConsole.WriteLine();\nPostOrder(bt);\nConsole.WriteLine();", out: Q1_OUT.pre + "\n" + Q1_OUT.inn + "\n" + Q1_OUT.post + "\n", loose: true }),
            XH("حل سؤال 17 من الكتاب", 3),
            GUIDED({
              title: "نبني الشجرة خطوة خطوة",
              prompt: "`Preorder`: `17, 10, -1, 5, 12, 28` و `Inorder`: `-1, 5, 10, 12, 17, 28`.",
              steps: [
                "أول قيمة في `Preorder` هي الجذر: `17`.",
                "في `Inorder` القيم التي قبل `17` هي `-1, 5, 10, 12` (الشجرة الفرعية اليسرى)، والتي بعدها `28` (اليمنى).",
                "من قيم اليسار أول ما يظهر في `Preorder` هو `10`: هو الابن الأيسر للجذر. في `Inorder` قبله `-1, 5` وبعده `12`.",
                "من القيمتين `-1, 5` تظهر `-1` أولًا في `Preorder`، فهي الأب. في `Inorder` لا شيء قبلها، و `5` بعدها: إذن `5` ابنها الأيمن.",
                "`12` وحدها: الابن الأيمن للخلية `10`. و `28` وحدها: الابن الأيمن للجذر.",
              ],
              result: "الجذر `17`؛ ابنه الأيسر `10` وله الابن الأيسر `-1` (وابنها الأيمن `5`) والابن الأيمن `12`؛ والابن الأيمن للجذر `28`.",
            }),
            FIG("الشجرة المطلوبة في سؤال 17", [{ kind: "tree", tree: Q17_TREE, facts: true }]),
            proved(MC("تأكّد من رسمك: ما ناتج تمشيط `Postorder` للشجرة التي بنيتها؟", ["`[-1,5,10,12,17,28]`", "*" + seq("5 -1 12 10 28 17 "), "`[-1,5,12,10,28,17]`", "`[28,12,5,-1,10,17]`"], "`Postorder`: اليسار ثم اليمين ثم الأب. تحت `10`: أولًا `5` ثم أبوها `-1`، ثم `12`، ثم `10` نفسها. بعدها `28`، وأخيرًا الجذر `17`."),
              { code: BUILD, lib: ORDERS, run: "int[] PreA = { 17, 10, -1, 5, 12, 28 };\nint[] InA = { -1, 5, 10, 12, 17, 28 };\nBinNode<int> bt = BuildTree(PreA, InA);\nPostOrder(bt);", out: "5 -1 12 10 28 17 ", loose: true }),
            XP("**البند 2:** نعم، يمكن. في `Postorder` يُطبع الأب **بعد** ابنيه، فالجذر هو **آخر** قيمة (لا أولها). بعد أن نعرف الجذر نبحث عنه في `Inorder` ونقسّم القيم إلى يسار ويمين كما فعلنا، ونكرّر العمل لكل شجرة فرعية."),
            XH("حل سؤال 3 — `MaxOfBST`", 3),
            XCS(MAX_OF_BST),
            XLIST([
              "كل قيمة أكبر من خلية تقع في يمينها، فأكبر قيمة موجودة في أقصى اليمين.",
              "الحلقة تتوقّف عند خلية **لا ابن أيمن لها**. هذه الخلية ليست ورقة بالضرورة: قد يكون لها ابن أيسر.",
              "لا نفحص `bt == null` لأن المعطى أنّ الشجرة غير فارغة.",
              "النجاعة `O(h)`: مسار واحد إلى اليمين.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            FIG("الشجرة `bt` في التتبّع", [{ kind: "tree", tree: MAX_TREE }]),
            TRACE({ title: "تتبّع `MaxOfBST`", code: MAX_OF_BST, run: treeOf("bt", MAX_TREE) + "\nConsole.WriteLine(MaxOfBST(bt));", given: "الشجرة `bt` المرسومة أعلاه، والاستدعاء `MaxOfBST(bt)`." }),
            proved(SHORT("ما القيمة التي تعيدها `MaxOfBST(bt)` للشجرة المرسومة أعلاه؟", "80", "ننزل يمينًا: `50` ثم `70` ثم `80`. الخلية `80` لا ابن أيمن لها فنتوقّف عندها، مع أنّ لها ابنًا أيسر (`75`)."),
              { code: MAX_OF_BST, run: treeOf("bt", MAX_TREE) + "\nConsole.Write(MaxOfBST(bt));", out: "80" }),
            XH("حل سؤال 4 — `ExistsInBST` بدون تراجعية", 3),
            XCS(EXISTS_LOOP),
            XLIST([
              "شرط الحلقة `bt != null`: حين نصل إلى `null` لم يبقَ أين نبحث، فنعيد `false` بعد الحلقة.",
              "في كل دورة مقارنة مع خلية واحدة، ثم ننتقل إلى جهة **واحدة** فقط.",
              "تغيير `bt` داخل العملية لا يغيّر الشجرة: `bt` مؤشّر محلّي ينتقل من خلية إلى أخرى.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            TRACE({ title: "تتبّع `ExistsInBST` بالحلقة", code: EXISTS_LOOP, run: treeOf("bt", SEVEN) + "\nConsole.WriteLine(ExistsInBST(bt, 60));\nConsole.WriteLine(ExistsInBST(bt, 35));", given: "شجرة البحث التي بُنيت من القيم `[50,30,70,10,40,60,80]` بهذا الترتيب، والاستدعاءان `ExistsInBST(bt, 60)` ثم `ExistsInBST(bt, 35)`." }),
            proved(SHORT("للشجرة نفسها: ماذا تعيد `ExistsInBST(bt, 35)`؟ اكتب true أو false.", "false", "`35` أصغر من `50` (يسار)، أكبر من `30` (يمين)، أصغر من `40` (يسار)، والابن الأيسر للخلية `40` هو `null`. تنتهي الحلقة وتُعاد `false`."),
              { code: EXISTS_LOOP, run: treeOf("bt", SEVEN) + "\n" + tf("ExistsInBST(bt, 35)"), out: "false" }),
            XH("حل سؤال 5 — `CountInRange`", 3),
            XCS(COUNT_RANGE),
            XLIST([
              "شرط التوقّف: شجرة فارغة فيها 0 قيم.",
              "قيمة الخلية أصغر من `Low`: هي وكل ما في يسارها خارج المجال، فنعدّ في اليمين فقط.",
              "قيمة الخلية أكبر من `High`: هي وكل ما في يمينها خارج المجال، فنعدّ في اليسار فقط.",
              "خلاف ذلك الخلية داخل المجال: 1 + ما في اليسار + ما في اليمين.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            TRACE({ title: "تتبّع `CountInRange(bt, 35, 65)`", code: COUNT_RANGE, run: treeOf("bt", SEVEN) + "\nConsole.WriteLine(CountInRange(bt, 35, 65));", given: "شجرة البحث التي بُنيت من القيم `[50,30,70,10,40,60,80]` بهذا الترتيب، والاستدعاء `CountInRange(bt, 35, 65)`.", description: "أي خلايا لا تزورها العملية أبدًا؟" }),
            proved(SHORT("للشجرة نفسها: ما القيمة التي تعيدها `CountInRange(bt, 10, 45)`؟", "3", "القيم التي في المجال: `10` و `30` و `40`. الجذر `50` أكبر من `45`، فلا تدخل العملية إلى شجرته الفرعية اليمنى أبدًا."),
              { code: COUNT_RANGE, run: treeOf("bt", SEVEN) + "\nConsole.Write(CountInRange(bt, 10, 45));", out: "3" }),
            MC("في الاستدعاء `CountInRange(bt, 35, 65)` على الشجرة نفسها، أي خلية **لا** تزورها العملية؟", ["الخلية `40`", "الخلية `60`", "*الخلية `10`", "الخلية `30`"], "عند الخلية `30` (أصغر من `Low = 35`) تنتقل العملية إلى اليمين فقط، فلا تزور `10`. وبالطريقة نفسها عند `70` (أكبر من `High = 65`) تنتقل إلى اليسار فقط ولا تزور `80`."),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "شجرة البحث الثنائية"],
          blocks: [
            MC("ما الشرط الذي تحقّقه كل خلية في شجرة البحث الثنائية؟", ["قيمة الأب أكبر من قيم كل الخلايا التي تحته", "*القيم في شجرته الفرعية اليسرى ليست أكبر منه، والقيم في اليمنى ليست أصغر منه", "لكل أب ابنان بالضبط", "قيمة الابن الأيسر أصغر من قيمة الابن الأيمن فقط"], "الشرط يخصّ كل خلايا الشجرتين الفرعيتين: قيمة الأب أكبر أو تساوي قيم اليسار، وأصغر أو تساوي قيم اليمين."),
            WORDS("أكمل الجمل:", "في شجرة البحث الثنائية القيم الأصغر من الأب تقع في الشجرة الفرعية [[اليسرى]]، والقيم الأكبر منه في [[اليمنى]]. تمشيط [[Inorder]] يطبع قيمها مرتّبة ترتيبًا [[تصاعديًا]].", ["Preorder", "Postorder", "تنازليًا"], "`Inorder` يعالج اليسار (الأصغر) ثم الأب ثم اليمين (الأكبر)، فتخرج القيم من الأصغر إلى الأكبر."),
            proved(MC("نبني شجرة بحث بالعملية `ToBST` من القيم `[30,10,50,20,40]` بهذا الترتيب. ماذا يطبع `PreOrder` لهذه الشجرة؟", ["`[10,20,30,40,50]`", "`[30,10,50,20,40]`", "*" + seq("30 10 20 50 40 "), "`[20,10,40,50,30]`"], "الجذر `30`. `10` في يساره و `50` في يمينه. `20` تنزل يسارًا ثم تصير ابنًا أيمن للخلية `10`. `40` تنزل يمينًا ثم تصير ابنًا أيسر للخلية `50`. تمشيط `Preorder`: الأب ثم اليسار ثم اليمين."),
              { code: TO_BST, lib: ORDERS, run: "int[] A = { 30, 10, 50, 20, 40 };\nBinNode<int> bt = ToBST(A);\nPreOrder(bt);", out: "30 10 20 50 40 ", loose: true }),
            TF("ترتيب إدخال القيم لا يؤثّر على شكل شجرة البحث.", false, "القيمة الأولى تصير الجذر، وكل قيمة بعدها تأخذ مكانها بحسب ما سبقها. القيم `[1,2,3]` تعطي سلسلة، والقيم `[2,1,3]` تعطي جذرًا له ابنان."),
            provedCount(SHORT("بنينا شجرة بحث بالعملية `ToBST` من القيم `[20,10,30,5,15]` بهذا الترتيب، ثم نفّذنا `ExistsInBST(bt, 12)`. كم مرة تُستدعى العملية `ExistsInBST` (مع الاستدعاء الأول)؟", "4", "المسار: `20` ثم `10` (لأن `12` أصغر من `20`) ثم `15` (لأن `12` ليست أصغر من `10`)، ثم الابن الأيسر للخلية `15` وهو `null`. المجموع 4 استدعاءات، والأخير يعيد `false`."),
              { code: EXISTS, lib: TO_BST, run: "int[] A = { 20, 10, 30, 5, 15 };\nBinNode<int> bt = ToBST(A);\nConsole.Write(ExistsInBST(bt, 12));" }, "if (bt == null)return false;", 4),
            MC("أدخلنا إلى شجرة بحث فارغة 1000 قيمة مرتّبة ترتيبًا تصاعديًا. ما نجاعة البحث عن قيمة فيها في أسوأ الحالات؟", ["`O(1)`", "`O(log n)`", "*`O(n)`", "`O(n * n)`"], "القيم المرتّبة تعطي سلسلة إلى اليمين، ارتفاعها `n - 1`. البحث عن قيمة أكبر من كل القيم يمرّ على كل الخلايا."),
            proved(SHORT("بنينا شجرة بحث بالعملية `ToBST` من القيم `[10,20,30,40]` بهذا الترتيب. ما ارتفاع الشجرة؟", "3", "كل قيمة أكبر من كل ما سبقها، فتنزل دائمًا إلى اليمين: سلسلة من 4 خلايا بينها 3 خطوط."),
              { code: HEIGHT, lib: TO_BST, run: "int[] A = { 10, 20, 30, 40 };\nBinNode<int> bt = ToBST(A);\nConsole.Write(Height(bt));", out: "3" }),
            FIG("شجرة للسؤالين التاليين", [{ kind: "tree", tree: [20, [10, 5, 15], [30, 25, 35]] }]),
            proved(MC("نحذف الجذر `20` من الشجرة المرسومة أعلاه بالأمر `bt = DeleteFromBST(bt, 20);`. ما قيمة الجذر بعد الحذف؟", ["`10`", "`15`", "*`25`", "`30`"], "للجذر ابنان. أصغر قيمة في شجرته الفرعية اليمنى هي `25` (ننزل إلى `30` ثم يسارًا حتى النهاية)، فتُخزَّن في الجذر وتُحذف ورقتها."),
              { code: DELETE, run: treeOf("bt", [20, [10, 5, 15], [30, 25, 35]]) + "\nbt = DeleteFromBST(bt, 20);\nConsole.Write(bt.GetValue());", out: "25" }),
            CLASSIFY("في الشجرة نفسها (قبل الحذف): إلى أي جهة تنزل كل قيمة جديدة عند الجذر `20` إذا أدخلناها بالعملية `InsertIntoBST`؟", ["إلى اليسار", "إلى اليمين"], [["`12`", 0], ["`27`", 1], ["`20`", 1], ["`3`", 0], ["`40`", 1]], "الشرط في العملية هو `bt.GetValue() > Value`: الأصغر من `20` إلى اليسار، وكل ما عدا ذلك إلى اليمين — ومنه القيمة المساوية `20`."),
            ORDER("رتّب خطوات إعادة بناء شجرة من نتيجتي `Preorder` و `Inorder`:", ["نأخذ أول قيمة في `Preorder`: هي الجذر", "نبحث عن مكان الجذر في `Inorder`", "ما قبله في `Inorder` هو قيم الشجرة الفرعية اليسرى، وما بعده قيم اليمنى", "نكرّر الخطوات نفسها لكل شجرة فرعية"], "`Preorder` يحدّد الأب، و `Inorder` يقسّم القيم الباقية بين اليسار واليمين، ثم نعيد العمل بشكل تراجعي."),
            MATCH("صِل كل عملية بما تفعله:", [["`ToBST`", "تبني شجرة بحث من قيم مصفوفة"], ["`InsertIntoBST`", "تضيف قيمة واحدة في مكانها الصحيح"], ["`ExistsInBST`", "تفحص هل القيمة موجودة في الشجرة"], ["`DeleteFromBST`", "تحذف خلية وتُعيد جذر الشجرة"], ["`BuildTree`", "تعيد بناء شجرة من نتيجتي تمشيط"]], "العمليات الأربع الأولى تعمل على شجرة بحث وتستغلّ ترتيبها. `BuildTree` تعمل على أي شجرة ثنائية."),
            MC("أي قيمة نخزّن في خلية لها ابنان حين نحذفها بالإمكانية الأولى للكتاب؟", ["قيمة ابنها الأيمن دائمًا", "أكبر قيمة في شجرتها الفرعية اليمنى", "*أصغر قيمة في شجرتها الفرعية اليمنى", "قيمة أبيها"], "أصغر قيمة في اليمين أكبر من كل ما في اليسار وأصغر من كل ما بقي في اليمين، فيبقى شرط شجرة البحث صحيحًا. (الإمكانية الثانية: أكبر قيمة في الشجرة الفرعية اليسرى.)"),
          ],
        },
      ],
    },
  ],
};
