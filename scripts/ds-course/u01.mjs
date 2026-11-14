// Unit 1 — العمليات التراجعية (الكتاب: الفصل الأول، ص 7–60؛ النسخة الممسوحة ينقصها ص 28–34 و 38–40 و 54–57).
import {
  P, H, DEF, NOTE, LIST, OL, TABLE, EX, CS, OUT, CLAR, XP, XH, XCS, XEX, XTIP, XNOTE, XLIST, GUIDED, MC, TF, SHORT, ORDER, MATCH, WORDS, CLASSIFY,
  TRACE, FIG, proved, provedCount, QH, SOLUTION, XOUT, XTABLE,
} from "./dsl.mjs";

// ── مقدّمة الفصل (ص 8–15) ─────────────────────────────────────────────────────────────────────────────────────────────
const F_SEQ = `
public static int F(int n)
{
    if (n == 1)
        return 0;
    return F(n - 1) + 3;
}`;
const FACT = `
public static int F(int n)
{
    if (n == 1)
        return 1;
    return F(n - 1) * n;
}`;
const FIB = `
public static int Fib(int n)
{
   if (n == 1) return 0;
   if (n == 2) return 1;
   return Fib(n - 1) + Fib(n - 2);
}`;
const ENDLESS_1 = `
public static void F(int n)
{
   Console.WriteLine(n % 10);
   F(n / 10);
}`;
const ENDLESS_2 = `
public static void F(int n)
{
    if (n == 0) return;
    Console.WriteLine(n % 10);
    F(n);
}`;
const DIGITS_DOWN = `
public static void F(int n)
{
    if (n == 0) return;
    Console.WriteLine(n % 10);
    F(n / 10);
}`;
const ADD = `
public static int Add(int a, int b)
{
    if (b == 0) return a;
    return 1 + Add(a, b - 1);
}`;
const POW = `
public static int Pow(int m, int n)
{
    if (n == 0) return 1;
    return Pow(m, n - 1) * m;
}`;
const GCD = `
public static int Gcd(int a, int b)
{
    if (a == b) return a;
    if (a > b) return Gcd(a - b, b);
    return Gcd(a, b - a);  // b > a
}`;
const EUCLID = `
public static int EuclideanAlgorithm(int a, int b)
{
    if (b == 0) return a;
    return EuclideanAlgorithm(b, a % b);
}`;
const IS_EVEN = `
public static bool IsEven(int n)
{
     if (n == 0) return true;
     else return (IsOdd(n - 1));
}
public static bool IsOdd(int n)
{
     return (!IsEven(n));
}`;

// ── منازل العدد (ص 18–27) ─────────────────────────────────────────────────────────────────────────────────────────────
const SUM_DIGITS = `
public static int SumOfDigits(int n)
{
    if (n >= 0 && n <= 9)
        return n;
    return n % 10 + SumOfDigits(n / 10);
}`;
const NUM_DIGITS = `
public static int NumOfDigits(int n)
{
    if (n >= 0 && n <= 9) return 1;
    return 1 + NumOfDigits(n / 10);
}`;
const ODD_DIGITS_1 = `
public static int NumOfOddDigits(int n)
{
    if (n == 0) return 0;
    if (n % 2 == 1)
        return 1 + NumOfOddDigits(n / 10);
    else
        return NumOfOddDigits(n / 10);
}`;
const ODD_DIGITS_2 = `
public static int NumOfOddDigits(int n)
{
    if (n == 0) return 0;
    return n % 2 + NumOfOddDigits(n / 10);
}`;
const EXISTS_TAIL = `
public static bool Exists(int n, int d)
{
    if (n % 10 == d) return true;
    if (n == 0) return false;
    return Exists(n / 10, d);
}`;
const EXISTS_OR = `
public static bool Exists(int n, int d)
{
    if (n == 0) return false;
    return (n % 10 == d) || Exists(n / 10, d);
}`;
const COUNT_C = `
public static int Count(int n, int d)
{
    if (n >= 0 && n <= 9)
    {
        if (n == d)
            return 1;
        else
            return 0;
    }
    int c = 0;
    if (n % 10 == d)
        c = 1;
    return c + Count((n / 10), d);
}`;
const COUNT_2 = `
public static int Count(int n, int d)
{
    if (n >= 0 && n <= 9)
    {
        if (n == d) return 1;
        else return 0;
    }
    if (n % 10 == d) return 1 + Count((n / 10), d);
    return Count((n / 10), d);
}`;
const CHECK_TAIL = `
public static bool Check(int n)
{
    if (n == 0) return true;
    if (n % 2 == 0) return false;
    return Check(n / 10);
}`;
const CHECK_AND = test => `
public static bool Check(int n)
{
    if (n == 0)
        return true;
    return (${test}) && Check(n / 10);
}`;
const MAX_DIGIT = `
public static int MaxDigit(int n)
{
    if (n < 10)
        return (n);
    else
    {
        int x = n % 10; // منزلة الآحاد
        int y = MaxDigit(n / 10); // هذا الاستدعاء يُعيد أكبر منزلة في العدد المُتبقّي بدون منزلة الآحاد
        if (x > y)
            return x;
        else
            return y;
    }
}`;
const TR = `
public static void Tr(int k, int n)
{
    if (k == n) Console.Write(k);
    else
    {
        Console.Write(k);
        Tr(k + 1, n);
        Console.Write(k);
    }
}`;
const TR_BOOK = `
for (int i = 1; i <= 5; i++)
{
    Tr(1, i);
    Console.WriteLine();
}` + TR;
const TR_MAIN = `
public static void Main()
{
    for (int i = 1; i <= 3; i++)
    {
        Tr(1, i);
        Console.WriteLine();
    }
}` + TR;

// ── المصفوفات و«قسّم تسد» (ص 35–37) ───────────────────────────────────────────────────────────────────────────────────
const SUM_FROM = `
public static int SumFrom(int[] A, int i)
{
    if (i == A.Length) return 0;
    return A[i] + SumFrom(A, i + 1);
}`;
const SUM_DC = `
public static int Sum(int[] A, int s, int e)
{
    if (s == e) return A[s];
    int m = (s + e) / 2;
    int s1 = Sum(A, s, m);
    int s2 = Sum(A, m + 1, e);
    return s1 + s2;
}`;
const BOOK_ARRAY = "int[] A = { 2, -1, 3, 0, 4 };";

// ── النصوص (ص 41–45) ──────────────────────────────────────────────────────────────────────────────────────────────────
const CONTAINS = `
public static bool Contains(string str, char ch)
{
    if (str.Length == 0)
        return false;
    if (str[0] == ch)
        return true;
    return Contains(str.Substring(1), ch);
}`;
const IS_PAL = `
public static bool IsPal(string str)
{
    if (str.Length == 0 || str.Length == 1) return true;
    if (str[0] != str[str.Length - 1]) return false;
    return IsPal(str.Substring(1, str.Length - 2));
}`;
const IS_REVERSED = `
public static bool IsReversedOf(string str1, string str2)
{
    if (str1.Length != str2.Length)
        return false;
    if (str1.Length == 0 && str2.Length == 0)
        return true;
    if (str1.Length == 1 && str2.Length == 1)
        return str1[0] == str2[0];
    if (str1[0] != str2[str2.Length - 1])
        return false;
    return IsReversedOf(str1.Substring(1),
                        str2.Substring(0, str2.Length - 1));
}`;
const REVERSE = `
public static string Reverse(string str)
{
    if (str == "") return str;
    return Reverse(str.Substring(1)) + str[0].ToString();
}`;
const ARE_EQUAL = `
public static bool AreEqual(string str1, string str2)
{
    if (str1.Length != str2.Length)
        return false;
    if (str1.Length == 0 && str2.Length == 0)
        return true;
    if (str1.Length == 1 && str2.Length == 1)
        return str1[0] == str2[0];
    if (str1[0] != str2[0])
        return false;
    return AreEqual(str1.Substring(1), str2.Substring(1));
}`;

// ── تمارين الكتاب المختارة (ص 46–53) ──────────────────────────────────────────────────────────────────────────────────
const F1_ITERATIVE = `
public static int F1_Iterative(int Low, int High)
{
      int Total = 0;
      for (int i = Low; i <= High; i++) Total += i;
      return Total;
}`;
const F2_ITERATIVE = `
public static int F2_Iterative(int[] A)
{
    int Index = 0;
    for (int i = 1; i < A.Length; i++)
    {
        if (A[Index] < A[i])
            Index = i;
    }
    return Index;
}`;
const F3_ITERATIVE = `
public static bool F3_Iterative(string str)
{
      if (str.Length % 2 == 1) return false;
      for (int i = 0; i < str.Length - 1; i += 2)
      {
            if (str[i] != str[i + 1])
                  return false;
      }
      return true;
}`;
const Q2 = rows => `
public static void Main(string[] args)
{
      DrawTopHalf(1, ${rows});
      DrawBottomHalf(${rows});
}
public static void DrawTopHalf(int Num, int Row)
{
      if (Num == Row) return;
      for (int i = 0; i < Num; i++)
            Console.Write("* ");
      Console.WriteLine();
      DrawTopHalf(Num + 1, Row);
}
public static void DrawBottomHalf(int Row)
{
      if (Row == 0) return;
      for (int i = 0; i < Row; i++)
            Console.Write("* ");
      Console.WriteLine();
      DrawBottomHalf(Row - 1);
}`;
const Q4 = `
public static int What(int k, int[] A, int s, int e)
{
    if (s == e)
        if (A[s] > k)
            return A[s];
        else
            return 0;
    else
    {
        int p1 = What(k, A, s, (s + e) / 2);
        int p2 = What(k, A, ((s + e) / 2)+1, e);
        return p1 + p2;
    }
}`;
const Q4_MAIN = `
static void Main(string[] args)
{
    int[] A = {2,8,4,14,5,18};
    Console.WriteLine(What(6,A,1,5));
}`;
const Q7 = `
static int What1(int num)
{
    if (num < 10)
        return 1;
    else if (num % 2 != num / 10 % 2)
        return -999;
    else
        return What1(num / 10) + 1;
}
static int What2(int[] a, int i)
{
    if (i < a.Length)
    {
        if (What1(a[i]) > 0)
            return Math.Max(a[i], What2(a, i + 1));
        else return What2(a, i + 1);
    }
    else
        return 0;
}`;
const Q7_USE = `
int[] A = {8145,13,425,228};
Console.WriteLine("What2(A, 0) = " + What2(A, 0));`;
const Q8 = `
static void Main(string[] args)
{
    // المصفوفة مرتبة ترتيبًا تصاعديًا
    int[] A = {-32, -25, -15, -5, 2, 7, 10, 17};
    int pos, a=0, b=A.Length-1;
    if (A[a] > 0)
        pos = 0;
    else
        pos = F(A, a, b);
    if (pos >= 0)
        Console.WriteLine("Pos is " +  pos);
    else
        Console.WriteLine ("Pos is between "+(-pos)+ " and "+(-pos+1));
}
public static int F(int[] A, int a, int b)
{
    int m = (a + b) / 2;
    if (A[m] == 0)
        return m;
    else if ((b - a) == 1)
        return -m;
    else if (A[a] * A[m] < 0)
        return F(A, a, m);
    else
        return F(A, m, b);
}`;

// ── أسئلة التتبّع: أسئلة جديدة وتمارين الكتاب 3 و 5 و 6 و 15 و 16 ─────────────────────────────────────────────────────
const HOP = `
public static int Hop(int a, int b)
{
    if (a > b) return 0;
    return a + Hop(a + 2, b);
}`;
const Q3 = `
public static bool What1(int x, int num)
{
      if (num == 0)
            return false;
      else
            if (num % 10 == x)
                  return true;
            else
                  return What1(x , num/10);
}

public static int What2(int[] a, int k)
{
      if (k == (a.Length -1))
            return 0;
      else
            if (What1(a[k] % 10 , a[k+1]) == true)
                  return 1 + What2 (a , k+1);
            else
                  return What2 (a , k +1);
}`;
const Q3_ARRAY = "int[] a = {400, 200, 100, 25, 351, 33, 34, 4};";
const LINES = `
public static void Lines(int n)
{
    if (n == 0) return;
    Console.Write(n);
    Lines(n - 1);
    Console.Write(n);
}`;
const Q5 = `
public static string What(string str, int n, string newStr)
{
    if (n == 0 || n > str.Length)
        return newStr;

    if (char.IsLower(str[0]))
        newStr += str[0];

    return What(str.Substring(1), n - 1, newStr);
}
public static void Test_What()
{
    string str = "AbCdEfGhIjAbCdEfGhIj";
    Console.WriteLine(What(str, 3, ""));
    Console.WriteLine(What(str, 5, ""));
    Console.WriteLine(What(str, 7, ""));
    Console.WriteLine(What(str, str.Length, ""));
}`;
const Q6 = `
public static int What1(int a, int b)
{
    if (b == 0) return a;
    else
        return What1(b, a % b);
}
public static int What2(int[] A, int i)
{
    if (i == A.Length - 2) return What1(A[i], A[i + 1]);
    else
    {
        int temp = What2(A, i + 1);
        int s = What1(A[i], A[i + 1]);
        if (s > temp) return s;
        else return temp;
    }
}`;
const Q6_USE = `
int[] A = {18, 3, 15, 90, 1071,1029};
Console.WriteLine(What2(A, 0));`;
const Q15 = `
public static int What1(int[] A, int b, int e)
{
    if (b == e) return b;
    else
    {
        int m = (b + e) / 2;
        int x = What1(A, b, m);
        int y = What1(A, m + 1, e);
        if (A[x] > A[y]) return x;
        return y;
    }
}
public static void What2(int[] A, int b, int e)
{
    if (b == e) return;
    int i = What1(A, b, e);
    Swap(A, i, e);
    What2(A, b, e - 1);
}
public static void Swap(int[] A, int a, int b)
{
    int temp = A[a];
    A[a] = A[b];
    A[b] = temp;
}`;
const Q15_USE_1 = `
int[] A = { 5, 1, 8, 3, 4, 7 };
int i = What1(A, 0, A.Length - 1);`;
const Q15_USE_2 = `
int[] A = { 5, 1, 8, 3, 4, 7 };
What2(A, 0, A.Length - 1);`;
const Q16 = `
public static int What1(int m, int n)
{
    if (n == 0) return 1;
    if (n % 2 == 0)
    {
        int y = What1(m, n / 2);
        return y * y;
    }
    else return m * What1(m, n - 1);
}
public static int What2(int[] A, int i)
{
    if (i == A.Length - 2)
        return What1(A[i], A[i + 1]);
    else
    {
        int temp = What2(A, i + 1);
        int s = What1(A[i], A[i + 1]);
        if (s > temp)  return s;
        else  return temp;
    }
}`;
const Q16_USE = `
int[] A = { 2, 3, 4, 3, 1, 2 };
Console.WriteLine(What2(A, 0));`;

// ── أسئلة الكتابة الجديدة (من المعلّم) ─────────────────────────────────────────────────────────────────────────────────
const COUNT_CHAR = `
public static int CountChar(string str, char ch)
{
    if (str.Length == 0) return 0;
    int rest = CountChar(str.Substring(1), ch);
    if (str[0] == ch) return 1 + rest;
    return rest;
}`;
const SUM_EVEN_DIGITS = `
public static int SumEvenDigits(int n)
{
    if (n == 0) return 0;
    if (n % 2 == 0) return n % 10 + SumEvenDigits(n / 10);
    return SumEvenDigits(n / 10);
}`;
const IS_SORTED = `
public static bool IsSorted(int[] A, int i)
{
    if (i >= A.Length - 1) return true;
    if (A[i] > A[i + 1]) return false;
    return IsSorted(A, i + 1);
}`;
const REMOVE_CHAR = `
public static string RemoveChar(string str, char ch)
{
    if (str == "") return "";
    string rest = RemoveChar(str.Substring(1), ch);
    if (str[0] == ch) return rest;
    return str[0].ToString() + rest;
}`;
const MAX_OF = `
public static int MaxOf(int[] A, int s, int e)
{
    if (s == e) return A[s];
    int m = (s + e) / 2;
    int m1 = MaxOf(A, s, m);
    int m2 = MaxOf(A, m + 1, e);
    if (m1 > m2) return m1;
    return m2;
}`;

// ── حلول سؤال 1 من الكتاب والعملية Mult (من المعلّم) ────────────────────────────────────────────────────────────────────────────────────
const F1_REC = `
public static int F1(int Low, int High)
{
    if (Low == High) return Low;
    return Low + F1(Low + 1, High);
}`;
const F2_REC = `
public static int F2(int[] A, int i)
{
    if (i == A.Length - 1) return i;
    int Index = F2(A, i + 1);
    if (A[i] >= A[Index]) return i;
    return Index;
}`;
const F3_REC = `
public static bool F3(string str)
{
    if (str.Length == 0) return true;
    if (str.Length == 1) return false;
    if (str[0] != str[1]) return false;
    return F3(str.Substring(2));
}`;
const MULT = `
public static int Mult(int m, int n)
{
    if (n == 0) return 0;
    return Mult(m, n - 1) + m;
}`;

// ── تدريبات الوحدة (من المعلّم) ────────────────────────────────────────────────────────────────────────────────────────
const MYSTERY = `
public static int Mystery(int n)
{
    if (n < 10) return n;
    return Mystery(n / 10);
}`;
const PRINT_UP = `
public static void Show(int n)
{
    if (n == 0) return;
    Show(n - 1);
    Console.Write(n);
}`;
const PRINT_DOWN = `
public static void Show(int n)
{
    if (n == 0) return;
    Console.Write(n);
    Show(n - 1);
}`;
const SKIPS_ZERO = `
public static int G(int n)
{
    if (n == 0) return 0;
    return n + G(n - 2);
}`;

export default {
  n: 1,
  title: "العمليات التراجعية",
  short: "التراجعية",
  description: "العملية التي تستدعي نفسها وشرط التوقّف، الراصّة المخفية، شروط صحة العملية التراجعية وأنواعها، التراجعية على منازل عدد وعلى المصفوفات بطريقة «قسّم تسد» وعلى النصوص، وأسئلة تتبّع وكتابة.",
  src: "7",
  lessons: [
    {
      title: "ما التراجعية؟",
      pages: [
        {
          title: "عملية تستدعي نفسها",
          src: "8–10",
          keywords: ["تراجعية", "استدعاء ذاتي", "شرط التوقّف", "متوالية"],
          objective: "أن تعرف ما العملية التراجعية، وأن تميّز فيها شرط التوقّف والاستدعاء الذاتي.",
          blocks: [
            H("مقدّمة", 2),
            DEF("العملية التراجعية", "**العمليات التراجعية** هي عمليات تستدعي نفسها بنفسها على الأقل مرّة واحدة."),
            P("خير مثال على هذه العمليات نجده في الرياضيات، في مواضيع مثل المتواليات. لنأخذ مثلًا المتوالية الحسابية البسيطة التالية:"),
            OUT("0,3,6,9,12,..."),
            P("قيمة كل حدّ، ابتداءً من الحدّ الثاني، تساوي قيمة الحدّ الذي قبله مباشرة + 3. أي نجد القانونية التالية:"),
            OUT("a1 = 0\nan = an-1 + 3  n>1"),
            P("حساب قيمة الحدّ الخامس وفق هذه القانونية يكون كالتالي. حتى تنتهي عملية الحساب يجب معرفة قيمة الحدّ الأول، وهي 0:"),
            OUT("a5 = a4+ 3 = a3+ 3 + 3 = a2+ 3 + 3 + 3 = a1+ 3 + 3 + 3 + 3 = 0 + 3 + 3 + 3 + 3 = 12"),
            P("بإمكاننا فعل ذلك أيضًا من خلال استعمال شجرة: ننزل من `a5` حتى نصل إلى `a1`، ثم نقوم وبشكل تراجعي (أي من أسفل إلى أعلى) بجمع القيم لنحصل على القيمة 12 التي تمثّل قيمة الحدّ الخامس."),
            FIG("شجرة حساب الحدّ الخامس", [{ kind: "tree", tree: ["a5", ["a4", ["a3", ["a2", ["a1", "0", null], "3"], "3"], "3"], "3"], label: "كل حدّ = الحدّ الذي تحته + 3، والقيم تعود من الأسفل" }]),
            P("دعونا الآن نكتب هذه القانونية على شكل دالّة تتلقّى رقم الحدّ وتُعيد قيمته:"),
            OUT("F(1) = 0\nF(n) = F(n-1) + 3  n > 1"),
            NOTE("انتبه", "نستدعي الدالّة `F` في الجهة اليمنى من المعادلة. الحسابات لن تتوقّف إذا لم يكن الحدّ الأول مُعطى. في مثل هذه الحالة نحصل على ما يُسمّى __تراجعية لانهائية__ (`Endless or Infinite Recursion`)."),
            P("والآن إذا حوّلنا هذه الدالّة إلى دالّة بلغة `C#` نحصل على الدالّة التالية:"),
            CS(F_SEQ),
            LIST([
              ["شرط التوقّف", "الشرط `if (n == 1)`. عند تحقّقه تتوقّف الاستدعاءات الذاتية وتتوقّف الدالّة عن العمل."],
              ["الاستدعاء الذاتي", "في السطر `return F(n - 1) + 3;` تستدعي الدالّة نفسها."],
            ]),
            TRACE({
              title: "تتبّع `F(5)`: الحدّ الخامس", code: F_SEQ, run: "Console.WriteLine(F(5));",
              given: "الاستدعاء `F(5)`، ثم طباعة القيمة المُعادة.",
              description: "راقب «مكدّس الاستدعاءات»: يُفتح إطار جديد لكل استدعاء، ثم تُغلق الإطارات من الأخير إلى الأول.",
            }),
            XTIP("كيف تقرأ التتبّع؟", "كل استدعاء له إطار خاص به، وفيه نسخته من البارامتر `n`. الاستدعاء `F(5)` لا يستطيع أن يجمع 3 قبل أن يعرف قيمة `F(4)`، فينتظر. وهكذا ينتظر كل استدعاء الاستدعاء الذي بعده، حتى نصل إلى `F(1)` الذي يعيد 0 دون أن يستدعي أحدًا."),
            proved(SHORT("ما القيمة التي تعيدها `F(7)`؟", "18", "من `F(1) = 0` نضيف 3 ست مرّات: `0 + 6 * 3 = 18`. وهو الحدّ السابع في المتوالية: 0، 3، 6، 9، 12، 15، 18."),
              { code: F_SEQ, run: "Console.Write(F(7));", out: "18" }),
            provedCount(SHORT("كم مرّة تُستدعى العملية `F` عند تنفيذ `F(5)` (يشمل الاستدعاء الأول)؟", "5", "الاستدعاءات هي `F(5)` ثم `F(4)` ثم `F(3)` ثم `F(2)` ثم `F(1)`: خمسة استدعاءات، وآخرها يحقّق شرط التوقّف."),
              { code: F_SEQ, run: "Console.Write(F(5));" }, "public static int F(int n)", 5),
            MC("ماذا يحدث لو حذفنا من العملية `F` السطرين `if (n == 1)` و `return 0;`؟", ["تعيد العملية 0 دائمًا", "*تستدعي العملية نفسها بلا توقّف: تراجعية لانهائية", "تعيد العملية القيمة نفسها كما كانت", "لا يتغيّر شيء لأن `n` تنقص في كل استدعاء"], "بدون شرط التوقّف لا يوجد استدعاء يعيد قيمة دون أن يستدعي غيره: بعد `F(1)` يأتي `F(0)` ثم `F(-1)` وهكذا بلا نهاية."),
          ],
        },
        {
          title: "المضروب والراصّة المخفية",
          src: "10–11",
          keywords: ["مضروب", "Factorial", "راصّة مخفية", "LIFO", "أوامر مؤجّلة"],
          objective: "أن تفهم أين تُحفظ الأوامر المؤجّلة، ولماذا تُنفَّذ بترتيب معكوس.",
          blocks: [
            P("مثال آخر نأخذه أيضًا من عالم الرياضيات، وهو __المضروب__ (`Factorial`). المضروب لعدد طبيعي `n`، والذي يُكتب `n!`، هو حاصل ضرب الأعداد الطبيعية من 1 ولغاية `n` (يشمل). أي:"),
            OUT("n! = 1 * 2 * 3 * ... * n"),
            P("بإمكاننا إعادة كتابة هذه المعادلة: الجزء `1 * 2 * 3 * ... * (n-1)` هو نفسه `(n-1)!`، ولذلك:"),
            OUT("n! = 1 * 2 * 3 * ... * (n-1) * n\nn! = (n - 1)! * n"),
            P("وعلى شكل دالّة تتلقّى `n` وتُعيد قيمة `n!` نحصل على ما يلي:"),
            OUT("F(n) = 1             n=1\nF(n) = F(n-1) * n    n>1"),
            P("تحويل هذه الدالّة إلى دالّة بلغة `C#` مسألة سهلة جدًا:"),
            CS(FACT),
            LIST([
              ["شرط التوقّف", "`if (n == 1)`."],
              ["الاستدعاء الذاتي", "`return F(n - 1) * n;`."],
            ]),
            H("مثال لكيفية حساب `5!` أو `F(5)`", 3),
            TABLE(["الاستدعاء", "`n`", "`n == 1`", "القيمة التي تعود إليه من الاستدعاء الذي تحته", "القيمة التي يعيدها"], [
              ["`F(5)`", "5", "F", "24", "`24 * 5 = 120`"],
              ["`F(4)`", "4", "F", "6", "`6 * 4 = 24`"],
              ["`F(3)`", "3", "F", "2", "`2 * 3 = 6`"],
              ["`F(2)`", "2", "F", "1", "`1 * 2 = 2`"],
              ["`F(1)`", "1", "T", "—", "1"],
            ], { caption: "الاستدعاءات تنزل من أعلى إلى أسفل، والقيم تعود من أسفل إلى أعلى", ltr: [0, 4] }),
            P("لاحظ أنّنا غير قادرين على حساب عملية الضرب في كل المراحل حتى يتحقّق شرط التوقّف. بعدها نعود، من أسفل الشجرة إلى أعلى، لننفّذ كل العمليات التي تأجّل تنفيذها، ونحصل في النهاية على القيمة النهائية."),
            DEF("الراصّة المخفية", "والسؤال هنا: أين يتمّ حفظ هذه الأوامر التي يتأجّل تنفيذها؟ تستعين العمليات التراجعية لهذا الغرض بـ__راصّة مخفية__، مما يفسّر أنّ **آخر عملية تأجّل تنفيذها تكون الأولى التي ستُنفَّذ**. وهذا هو بالضبط منهج عمل الراصّة `LIFO - Last In First Out` كما سيأتي لاحقًا."),
            FIG("الراصّة المخفية لحظة الوصول إلى `F(1)`", [{ kind: "stack", items: ["* 2", "* 3", "* 4", "* 5"], label: "أربع عمليات ضرب مؤجّلة: الرأس آخر ما تأجّل وأول ما يُنفَّذ" }]),
            TRACE({
              title: "تتبّع `F(5)`: المضروب", code: FACT, run: "Console.WriteLine(F(5));",
              given: "الاستدعاء `F(5)`، ثم طباعة القيمة المُعادة.",
              description: "في الذهاب تتراكم الإطارات، وفي الإياب تُنفَّذ عمليات الضرب المؤجّلة: في 2 ثم في 3 ثم في 4 ثم في 5.",
            }),
            ORDER("رتّب عمليات الضرب بحسب ترتيب **تنفيذها** عند حساب `F(4)`:", ["`1 * 2`", "`2 * 3`", "`6 * 4`"], "آخر ضرب تأجّل هو الضرب في 2 (في الاستدعاء `F(2)`)، فهو أول ما يُنفَّذ. ثم الضرب في 3، وأخيرًا الضرب في 4 الذي تأجّل أولًا."),
            proved(SHORT("ما القيمة التي تعيدها `F(6)` (المضروب)؟", "720", "`F(6) = F(5) * 6 = 120 * 6 = 720`."),
              { code: FACT, run: "Console.Write(F(6));", out: "720" }),
            TF("عند حساب `F(5)` تُنفَّذ عملية الضرب في 5 قبل عملية الضرب في 2.", false, "الضرب في 5 هو أول ما تأجّل، فهو في قاع الراصّة المخفية ويُنفَّذ **آخرًا**. الضرب في 2 آخر ما تأجّل ويُنفَّذ أولًا."),
          ],
        },
        {
          title: "فيبوناتشي وشروط صحة العملية التراجعية",
          src: "11–13",
          keywords: ["فيبوناتشي", "شروط الصحة", "تراجعية لانهائية", "خطوات الكتابة"],
          objective: "أن تعدّد الأجزاء التي تحتاجها كل عملية تراجعية، وأن تكتشف التراجعية اللانهائية.",
          blocks: [
            H("متوالية فيبوناتشي", 2),
            LIST(["قيمة الحدّ الأول 0", "قيمة الحدّ الثاني 1", "قيمة كل حدّ إضافي = مجموع قيم الحدّين السابقين له"], { title: "في هذه المتوالية" }),
            P("نستطيع كتابة قانونية هذه المتوالية على النحو التالي:"),
            OUT("Fib(n) = 0                     if n=1\nFib(n) = 1                     if n=2\nFib(n) = Fib(n-1)+Fib(n-2)     if n>2"),
            P("لاحظ أنّ لدينا هنا **شرطَي توقّف** و**استدعاءين ذاتيين**. بلغة `C#` تكون البرمجة كالتالي:"),
            CS(FIB),
            FIG("شجرة استدعاءات `Fib(4)`", [{ kind: "tree", tree: ["Fib(4)", ["Fib(3)", "Fib(2)", "Fib(1)"], "Fib(2)"], label: "خمسة استدعاءات، والاستدعاء `Fib(2)` يتكرّر مرّتين" }]),
            TRACE({
              title: "تتبّع `Fib(4)`", code: FIB, run: "Console.WriteLine(Fib(4));",
              given: "الاستدعاء `Fib(4)`، ثم طباعة القيمة المُعادة.",
              description: "الاستدعاء الأيسر `Fib(n - 1)` ينتهي كله قبل أن يبدأ الاستدعاء الأيمن `Fib(n - 2)`.",
            }),
            H("شروط صحة مبنى العمليات التراجعية", 2),
            P("يجب على كل عملية، حتى تكون تراجعية، أن توفّر الأجزاء التالية:"),
            OL([
              ["شرط / شروط توقّف", "`Base Case or Halting Case`."],
              ["استدعاء / استدعاءات ذاتية", "`General Case or Recursive Call(s)`."],
              ["تغيير يحصل في العملية", "مثلًا للبارامترات، بحيث يتحقّق أحد شروط التوقّف بعد عدد نهائي من الاستدعاءات الذاتية. هذا واضح في متوالية فيبوناتشي عندما ننقص قيمة البارامتر `n` عند الاستدعاءات الذاتية: إذا اشترطنا أن تكون `n` أكبر من 0 عند الاستدعاء الأول، فإنّ إنقاصها يضمن وصولها إلى شرط التوقّف بعد عدد نهائي من الاستدعاءات."],
              ["كود ينفّذ المطلوب من العملية", "هذا الشرط مطلوب فقط كي تحقّق العملية المطلوب منها. مثال لذلك عملية الجمع في متوالية فيبوناتشي، فبدونها لا تحقّق العملية الحل المطلوب."],
            ]),
            H("أمثلة لتراجعية لا نهائية", 3),
            P("**1.** لا يوجد في العملية التالية أيّة شروط توقّف، أي أنّ الشرط رقم 1 المذكور أعلاه غير متوفّر. ولذلك إذا حاولنا تتبّع تنفيذ هذه العملية لن نتوقّف عن التتبّع مطلقًا."),
            CS(ENDLESS_1),
            XP("جرّب ذهنيًا الاستدعاء `F(25)`: يُطبع 5، ثم 2، ثم 0، ثم 0، ثم 0 ... بلا نهاية، لأن `0 / 10` تساوي 0 دائمًا. في الحاسوب تمتلئ الراصّة المخفية في النهاية ويتوقّف البرنامج بالخطأ `StackOverflowException`."),
            P("**2.** أمّا في العملية التالية فإنّ الشرط رقم 2 غير متوفّر. أي أنّه لا يحصل أي تغيير لقيمة البارامتر `n` بحيث يتحقّق شرط التوقّف بعد عدد نهائي من الاستدعاءات الذاتية."),
            CS(ENDLESS_2),
            CLAR("في الكتاب", "كُتب في الكتاب «الشرط رقم 2 غير متوفّر». لكن الوصف (لا يحصل أي تغيير لقيمة البارامتر `n`) يطابق الشرط رقم **3** في القائمة أعلاه. الاستدعاء الذاتي (الشرط رقم 2) موجود في العملية: `F(n);`."),
            XP("لتصحيح العملية الثانية يكفي أن نغيّر البارامتر في الاستدعاء الذاتي: `F(n / 10)` بدل `F(n)`. هكذا يفقد العدد منزلة في كل استدعاء حتى يصبح 0:"),
            XCS(DIGITS_DOWN),
            TRACE({
              title: "العملية بعد التصحيح: `F(253)`", code: DIGITS_DOWN, run: "F(253);",
              given: "الاستدعاء `F(253)`.",
              description: "في كل استدعاء تُطبع منزلة الآحاد ثم تُحذف. راقب قيمة `n` في كل إطار.",
            }),
            H("خطوات كتابة عملية تراجعية", 3),
            P("نأخذ من هذه الشروط الخطوات التي نسير وفقها عادة عند كتابة عملية تراجعية:"),
            OL([
              ["الخطوة الأولى", "شرط / شروط التوقّف، وهي الأجوبة على السؤال: ما هي الحالات الأساسية البسيطة التي لا نحتاج فيها إلى استدعاءات ذاتية؟ كأن يكون العدد مكوّنًا من منزلة واحدة، أو أن يكون النص فارغًا، أو أن يكون مجال معالجة المصفوفة مكوّنًا من خلية واحدة."],
              ["الخطوة الثانية", "افترض أنّ العملية التي نريد كتابتها تعمل للحالات التي هي أسهل من الحالة العامة، ثم استعملها كأنّها جاهزة وتعمل كما يجب. مثلًا: عملية جمع منازل عدد مكوّن من `n` منزلة قادرة على جمع منازل عدد مكوّن من `n - 1` منزلة."],
              ["الخطوة الثالثة", "نفحص ما الذي يجب أن نضيفه إلى الاستدعاءات الذاتية أو إلى الكود بشكل عام حتى تتمكّن العملية من إنجاز المطلوب منها. مثلًا: عند جمع منازل عدد طبيعي، نضيف المنزلة الحالية إلى الاستدعاء الذاتي الذي نجريه على ما تبقّى من منازل العدد."],
            ]),
            MATCH("صِل كل جزء من العملية `Fib` بالشرط الذي يحقّقه:", [
              ["`if (n == 1) return 0;`", "شرط توقّف"],
              ["`Fib(n - 1)`", "استدعاء ذاتي"],
              ["البارامتر `n - 2` بدل `n`", "تغيير يقرّبنا من شرط التوقّف"],
              ["عملية الجمع `+`", "كود ينفّذ المطلوب من العملية"],
            ], "في `Fib` شرطا توقّف واستدعاءان ذاتيان، والبارامتر ينقص في كل استدعاء، وعملية الجمع هي التي تحسب قيمة الحدّ."),
            proved(SHORT("ما القيمة التي تعيدها `Fib(6)`؟", "5", "الحدود الستة الأولى: 0، 1، 1، 2، 3، 5. الحدّ السادس هو 5."),
              { code: FIB, run: "Console.Write(Fib(6));", out: "5" }),
            provedCount(SHORT("كم مرّة تُستدعى العملية `Fib` عند تنفيذ `Fib(5)` (يشمل الاستدعاء الأول)؟", "9", "`Fib(5)` يستدعي `Fib(4)` و `Fib(3)`. شجرة `Fib(4)` فيها 5 استدعاءات (كما في الرسم)، وشجرة `Fib(3)` فيها 3 استدعاءات، ومعها الاستدعاء الأول: `1 + 5 + 3 = 9`."),
              { code: FIB, run: "Console.Write(Fib(5));" }, "public static int Fib(int n)", 9),
          ],
        },
        {
          title: "أمثلة من الرياضيات",
          src: "13–15",
          keywords: ["Add", "Pow", "Gcd", "أقليدس", "أكبر قاسم مشترك"],
          objective: "أن تكتب عمليات حسابية بسيطة بشكل تراجعي: الجمع والقوّة وأكبر قاسم مشترك.",
          blocks: [
            P("أمثلة إضافية من عالم الرياضيات تكمن في حساب عملية الجمع والضرب والقوّة، وحساب أكبر قاسم مشترك بين عددين صحيحين (`Greatest Common Divisor`) بشكل تراجعي."),
            H("عملية الجمع", 3),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا صحيحًا `a` وآخر طبيعيًا `b` (يشمل 0) ومن ثمّ تُعيد `a + b`.", steps: ["الحل التراجعي يكمن في تقطيع العدد الطبيعي `b` إلى آحاد وجمع هذه الآحاد إلى العدد `a`.", "شرط التوقّف أن يكون (أو يصبح) `b` صفرًا. عندها تكون النتيجة `a`."] }),
            CS(ADD),
            TRACE({
              title: "تتبّع `Add(5, 3)`", code: ADD, run: "Console.WriteLine(Add(5, 3));",
              given: "الاستدعاء `Add(5, 3)`، ثم طباعة القيمة المُعادة.",
              description: "في كل استدعاء تنقص `b` بواحد ويتأجّل جمع واحد. كم جمعًا يتأجّل؟",
            }),
            H("عملية القوّة", 3),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا صحيحًا `m` وآخر طبيعيًا `n` (يشمل 0) ومن ثمّ تُعيد `m` مرفوعًا للقوّة `n`.", steps: ["شرط التوقّف أن يكون (أو يصبح) `n` صفرًا. عندها تكون النتيجة 1 لأنّ `m⁰ = 1`.", "خلاف ذلك: ضرب `m` في نفسه `n` مرّة يساوي (ضرب `m` في نفسه `n-1` مرّة) مضروبًا في `m`."] }),
            OUT("mⁿ = mⁿ⁻¹ * m"),
            P("أي أنّنا نستعمل في الحل ما نريد حسابه، وهو التعبير `mⁿ`، مرّتين: فهو يظهر في الجهة اليسرى وأيضًا في الجهة اليمنى. لكنّ الاستعمال في الجهة اليمنى يكون لعدد أصغر من الأصلي، لأنّنا نصغّر قيمة `n` بواحد:"),
            CS(POW),
            H("عملية الضرب", 3),
            P("اكتب عملية تراجعية تتلقّى عددًا صحيحًا `m` وآخر طبيعيًا `n` (يشمل 0) ومن ثمّ تُعيد `m.n`. كتابة هذه العملية بشكل تراجعي شبيهة جدًا بعملية القوّة. **شرط التوقّف** أن يكون (أو يصبح) `n` صفرًا، وعندها تكون النتيجة 0. من الممكن أيضًا اعتبار شرط التوقّف أن يكون (أو يصبح) `n` واحدًا، وعندها تكون النتيجة `m` لأنّ `m.1 = m`. خلاف ذلك نطبّق الملاحظة التالية:"),
            OUT("m.n = m.(n-1) + m"),
            CLAR("في الكتاب", "الكتاب يكتب حاصل الضرب بنقطة: `m.n` أي `m * n`. والكتاب لا يطبع كود هذه العملية بلغة `C#`. هي أول سؤال في صفحة «أسئلة كتابة محلولة»: حاول أن تكتبها قبل أن تقرأ الحل هناك."),
            H("أكبر قاسم مشترك بين عددين طبيعيين", 3),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددين صحيحين `a` و `b` ومن ثمّ تُعيد أكبر قاسم مشترك بينهما.", steps: ["شرط التوقّف أن يكون (أو يصبح) العددان متساويين. عندها تكون النتيجة أحدهما.", "خلاف ذلك: إذا كان أحدهما أكبر من الثاني، نحذف الصغير من الكبير ونبحث، بشكل تراجعي، في الأعداد المتبقّية عن أكبر قاسم مشترك بينهما."] }),
            CS(GCD),
            TRACE({
              title: "تتبّع `Gcd(12, 18)`", code: GCD, run: "Console.WriteLine(Gcd(12, 18));",
              given: "الاستدعاء `Gcd(12, 18)`، ثم طباعة القيمة المُعادة.",
              description: "لا يتأجّل هنا أي حساب: القيمة التي يعيدها آخر استدعاء تعود كما هي إلى الأعلى.",
            }),
            P("صيغة أخرى لإيجاد أكبر قاسم مشترك بين عددين تكمن في الألغوريثم المشهور باسم **ألغوريثم أقليدس**. **شرط التوقّف** أن يكون (أو يصبح) أحد العددين صفرًا، وعندها تكون النتيجة العدد الثاني. خلاف ذلك نقوم بتصغير الأعداد، مع ضمان نفس النتيجة الصحيحة، من خلال تبديل أحد العددين بباقي قسمة أحدهما على الآخر. نكرّر هذه الفكرة إلى أن يصبح الباقي 0. هنالك إثباتات رياضية دقيقة لصحة هذه الخطوات نجدها في الموضوع الرياضي المسمّى «نظرية الأعداد»."),
            CS(EUCLID),
            GUIDED({
              title: "نحلّ معًا: `EuclideanAlgorithm(48, 18)`",
              prompt: "تتبّع الاستدعاء `EuclideanAlgorithm(48, 18)`. ما قيمة البارامترين في كل استدعاء؟",
              steps: [
                "`EuclideanAlgorithm(48, 18)`: `b` ليست 0. الباقي `48 % 18` يساوي 12، فنستدعي `EuclideanAlgorithm(18, 12)`.",
                "`EuclideanAlgorithm(18, 12)`: الباقي `18 % 12` يساوي 6، فنستدعي `EuclideanAlgorithm(12, 6)`.",
                "`EuclideanAlgorithm(12, 6)`: الباقي `12 % 6` يساوي 0، فنستدعي `EuclideanAlgorithm(6, 0)`.",
                "`EuclideanAlgorithm(6, 0)`: تحقّق شرط التوقّف `b == 0`، فتُعاد `a` أي 6.",
              ],
              result: "أكبر قاسم مشترك للعددين 48 و 18 هو `6`. لا توجد أوامر مؤجّلة: القيمة 6 تعود كما هي عبر كل الاستدعاءات.",
            }),
            proved(SHORT("ما القيمة التي تعيدها `Pow(2, 5)`؟", "32", "`Pow(2, 5) = Pow(2, 4) * 2`، وهكذا حتى `Pow(2, 0) = 1`. النتيجة: 2 مضروبة في نفسها خمس مرّات، أي 32."),
              { code: POW, run: "Console.Write(Pow(2, 5));", out: "32" }),
            proved(SHORT("ما القيمة التي تعيدها `EuclideanAlgorithm(1071, 1029)`؟", "21", "`1071 % 1029 = 42`، ثم `1029 % 42 = 21`، ثم `42 % 21 = 0`. عند `b == 0` تُعاد `a = 21`."),
              { code: EUCLID, run: "Console.Write(EuclideanAlgorithm(1071, 1029));", out: "21" }),
            provedCount(SHORT("كم مرّة تُستدعى العملية `Add` عند تنفيذ `Add(7, 4)` (يشمل الاستدعاء الأول)؟", "5", "قيمة `b` في الاستدعاءات: 4 ثم 3 ثم 2 ثم 1 ثم 0. خمسة استدعاءات، وآخرها يعيد `a`."),
              { code: ADD, run: "Console.Write(Add(7, 4));" }, "public static int Add(int a, int b)", 5),
            MC("ماذا يحدث عند الاستدعاء `Gcd(5, 0)` بصيغة الطرح (العملية `Gcd`)؟", ["تُعاد القيمة 5", "تُعاد القيمة 0", "*تراجعية لانهائية: الاستدعاء التالي هو `Gcd(5, 0)` نفسه", "خطأ قسمة على صفر"], "`a > b` صحيح، فيُستدعى `Gcd(5 - 0, 0)` أي `Gcd(5, 0)` مرّة أخرى: البارامترات لا تتغيّر، فلا يتحقّق شرط التوقّف أبدًا (الشرط رقم 3 غير متوفّر). لذلك تصلح هذه الصيغة لعددين **طبيعيين** أكبر من 0 فقط."),
          ],
        },
      ],
    },
    {
      title: "أنواع العمليات التراجعية",
      pages: [
        {
          title: "أنواع العمليات التراجعية",
          src: "16–17",
          keywords: ["Linear", "Tail", "Non-Tail", "Binary", "Mutual", "تراجعية متبادلة"],
          objective: "أن تصنّف عملية تراجعية: خطّية (ذيل أو غير ذيل)، ثنائية، أو متبادلة.",
          blocks: [
            H("أنواع العمليات التراجعية", 2),
            LIST([
              ["تراجعية خطّية – `Linear Recursion`", "وهي العمليات التراجعية التي فيها استدعاء ذاتي واحد فقط."],
              ["تراجعية الذيل – `Tail Recursion`", "وتسمّى أيضًا تراجعية باتجاه واحد أو تراجعية ذهاب. وهي العمليات التراجعية الخطّية التي **لا توجد** فيها أوامر يؤجَّل تنفيذها حتى يتحقّق شرط من شروط التوقّف."],
              ["تراجعية باتجاهين – `Non-Tail Recursion`", "وتسمّى أيضًا تراجعية ذهاب وإياب. وهي العمليات التراجعية الخطّية التي **توجد** فيها أوامر يؤجَّل تنفيذها حتى يتحقّق شرط من شروط التوقّف."],
              ["تراجعية ثنائية – `Binary Recursive`", "وهي العمليات التراجعية التي فيها أكثر من استدعاء ذاتي واحد. مثال على ذلك متوالية فيبوناتشي التي شُرحت سابقًا."],
              ["تراجعية متبادلة – `Mutual Recursion`", "وهي مجموعة من العمليات التي تستدعي بعضها بشكل متبادل لإنجاز المهمّة المطلوبة. مثلًا: العملية `F1` تستدعي العملية `F2`، والعملية `F2` تستدعي العملية `F1`."],
            ]),
            XTIP("كيف تميّز بين `Tail` و `Non-Tail`؟", "انظر إلى سطر الاستدعاء الذاتي واسأل: هل يبقى شيء يُنفَّذ **بعد** أن يعود الاستدعاء؟ في `return F(n - 1) * n;` يبقى الضرب، فالعملية `Non-Tail`. في `return Gcd(a - b, b);` لا يبقى شيء: القيمة العائدة تُعاد كما هي، فالعملية `Tail`."),
            XLIST([
              ["`Tail`", "`Gcd` و `EuclideanAlgorithm`: الاستدعاء الذاتي هو آخر ما يحدث."],
              ["`Non-Tail`", "`F` للمتوالية (يتأجّل جمع 3)، `F` للمضروب (يتأجّل الضرب)، `Add` (يتأجّل جمع 1)، `Pow` (يتأجّل الضرب في `m`)."],
              ["ثنائية", "`Fib`: استدعاءان ذاتيان في السطر نفسه."],
            ], { title: "تصنيف العمليات التي رأيناها حتى الآن" }),
            H("مثال لتراجعية تبادلية", 3),
            P("فحص هل عدد طبيعي ما زوجي أم لا. **الفكرة:** 0 عدد زوجي. وإذا كان `n` زوجيًا فإنّ `n-1` يجب أن يكون فرديًا. ومتى يكون العدد فرديًا؟ إذا لم يكن زوجيًا."),
            CS(IS_EVEN),
            TRACE({
              title: "تتبّع `IsEven(2)`", code: IS_EVEN, run: "Console.WriteLine(IsEven(2));",
              given: "الاستدعاء `IsEven(2)`، ثم طباعة القيمة المُعادة.",
              description: "راقب أسماء الإطارات في «مكدّس الاستدعاءات»: `IsEven` و `IsOdd` تتناوبان.",
            }),
            P("سنصنّف معظم الأمثلة القادمة وفق هذه الأنواع."),
            CLASSIFY("صنّف كل عملية بحسب نوعها:", ["`Tail`", "`Non-Tail`", "ثنائية"], [["`Gcd`", 0], ["`Add`", 1], ["`Fib`", 2], ["`EuclideanAlgorithm`", 0], ["`Pow`", 1]], "في `Gcd` و `EuclideanAlgorithm` لا يبقى شيء بعد الاستدعاء الذاتي. في `Add` و `Pow` تتأجّل عملية حسابية. في `Fib` استدعاءان ذاتيان."),
            proved(MC("ما الذي يطبعه الأمر `Console.WriteLine(IsEven(3));`؟", ["`True`", "*`False`", "`3`", "لا يُطبع شيء: تراجعية لانهائية"], "العدد 3 فردي. الاستدعاءات تنزل حتى `IsEven(0)` التي تعيد `true`، وكل `IsOdd` في طريق العودة تقلب القيمة: ثلاث مرّات قلب تعطي `false`. ولغة `C#` تطبع القيمة المنطقية بحرف كبير: `False`."),
              { code: IS_EVEN, run: "Console.WriteLine(IsEven(3));", out: "False\n" }),
            TF("في العملية `IsOdd` لا يوجد أي أمر مؤجّل، لأن فيها سطرًا واحدًا فقط.", false, "في `return (!IsEven(n));` تبقى عملية النفي `!` مؤجّلة حتى يعود الاستدعاء `IsEven(n)`. عدد الأسطر لا يدلّ على شيء؛ المهم: هل يبقى ما يُنفَّذ بعد عودة الاستدعاء؟"),
          ],
        },
      ],
    },
    {
      title: "التراجعية على منازل عدد",
      pages: [
        {
          title: "المباني التراجعية ومجموع المنازل",
          src: "18–20",
          keywords: ["مبنى تراجعي", "SumOfDigits", "NumOfDigits", "NumOfOddDigits", "منزلة الآحاد"],
          objective: "أن تمشّط منازل عدد بشكل تراجعي باستعمال `n % 10` و `n / 10`.",
          blocks: [
            H("المباني التراجعية", 2),
            DEF("المبنى التراجعي", "المبنى التراجعي هو مبنى يحقّق الشرط التالي: **كل جزء منه يشبه الكل**."),
            LIST([
              "الأعداد: كل جزء من العدد هو عدد",
              "النصوص: كل جزء من النص هو نص",
              "المصفوفات: كل جزء من المصفوفة هو مصفوفة",
              "القوائم: كل جزء من القائمة هو قائمة",
              "الأشجار: كل جزء من الشجرة هو شجرة",
            ], { title: "أمثلة لمبانٍ تراجعية" }),
            P("ولذلك ستكون معظم الأمثلة في هذا الفصل عن هذه المباني. أمثلة على القائمة والشجرة ستأتي في الفصول الخاصة بهذه المباني."),
            EX({
              title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا وتعيد مجموع منازله.",
              steps: ["حاصل جمع منازل عدد طبيعي يساوي العدد نفسه إذا كان مكوّنًا من منزلة واحدة.", "خلاف ذلك، يساوي منزلة الآحاد + حاصل جمع منازل العدد المتبقّي بعد حذف منزلة الآحاد."],
              explanation: "لاحظ أنّنا نستعمل في الحل ما نريد حسابه، وهو التعبير «حاصل جمع منازل»، مرّتين: في الجهة اليسرى وأيضًا في الجهة اليمنى. لكنّ الاستعمال في الجهة اليمنى يكون لعدد أصغر من الأصلي، لأنّنا نحذف منه منزلة الآحاد بعد أن أُضيفت إلى عملية الجمع.",
            }),
            OUT("SumOfDigits(n) = n % 10 + SumOfDigits(n/10);"),
            XTIP("أداتان لتمشيط المنازل", "`n % 10` تعطي منزلة الآحاد، و `n / 10` تحذفها (قسمة أعداد صحيحة). مثلًا: `123 % 10` تساوي 3، و `123 / 10` تساوي 12."),
            P("**مثال لتنفيذ هذه العملية للعدد 123:**"),
            OUT("SumOfDigits(123) = 3 + SumOfDigits(12)\n                 = 3 + 2 + SumOfDigits(1)\n                 = 3 + 2 + 1= 6"),
            P("لاحظ أنّنا في كل استدعاء نفصل منزلة الآحاد ونضيفها إلى عملية الجمع، إلى أن يصبح العدد مكوّنًا من منزلة واحدة فقط. حينها نُعيد هذه المنزلة ويتحقّق شرط التوقّف، ونعود إلى جميع عمليات الجمع لننفّذها ونحصل على المجموع النهائي للمنازل."),
            P("الآن نكتب الحل على شكل دالّة رياضية ثم دالّة بلغة `C#`:"),
            OUT("SumOfDigits(n) = n                              if 0 ≤ n ≤ 9\nSumOfDigits(n) = n % 10 + SumOfDigits(n/10)     if n > 9"),
            CS(SUM_DIGITS),
            NOTE("لاحظ", "لم نستعمل أيّة متغيّرات للجمع، وإنّما الجمع يتمّ بمساعدة الراصّة الخفية. **النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب الجمع لغاية تحقّق شرط التوقّف."),
            TRACE({
              title: "تتبّع `SumOfDigits(123)`", code: SUM_DIGITS, run: "Console.WriteLine(SumOfDigits(123));",
              given: "الاستدعاء `SumOfDigits(123)`، ثم طباعة القيمة المُعادة.",
              description: "ثلاثة إطارات: `n = 123` ثم `n = 12` ثم `n = 1`. الجمع يُنفَّذ في طريق العودة.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا وتعيد عدد منازله.", steps: ["عدد منازل عدد طبيعي يساوي 1 إذا كان العدد مكوّنًا من منزلة واحدة.", "خلاف ذلك يساوي 1 + عدد منازل العدد المتبقّي بعد حذف منزلة الآحاد."] }),
            CS(NUM_DIGITS),
            P("لاحظ أنّنا هنا أيضًا لم نستعمل أيّة متغيّرات للعدّ، وإنّما العدّ يتمّ بمساعدة الراصّة الخفية. **النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب الجمع لغاية تحقّق شرط التوقّف."),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا وتعيد عدد منازله الفردية.", steps: ["نستعمل نفس القالب الذي استعملناه في المثالين السابقين لتمشيط منازل عدد طبيعي: نمرّ على كل المنازل ونعدّ بطريقة تراجعية عدد المنازل الفردية.", "شرط التوقّف هو ألا تبقى في العدد أيّة منازل.", "العدّ مشروط بأن تكون منزلة الآحاد الحالية فردية."] }),
            CS(ODD_DIGITS_1),
            P("بإمكاننا أيضًا التنازل عن أحد الاستدعاءين بالطريقة التالية:"),
            CS(ODD_DIGITS_2),
            P("وذلك لأنّ العملية `n % 2` تُعيد 0 إذا كان `n` زوجيًا وتُعيد 1 إذا كان فرديًا. **النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب الجمع لغاية تحقّق شرط التوقّف."),
            XTIP("لماذا `n % 2` وليس `(n % 10) % 2`؟", "العدد فردي بالضبط حين تكون منزلة آحاده فردية. لذلك يكفي أن نفحص العدد كله: `n % 2`."),
            proved(SHORT("ما القيمة التي تعيدها `SumOfDigits(4072)`؟", "13", "`2 + 7 + 0 + 4 = 13`. المنازل تُفصل من اليمين: 2 ثم 7 ثم 0، والمنزلة الأخيرة 4 يعيدها شرط التوقّف."),
              { code: SUM_DIGITS, run: "Console.Write(SumOfDigits(4072));", out: "13" }),
            proved(SHORT("ما القيمة التي تعيدها `NumOfOddDigits(5231)`؟", "3", "المنازل الفردية هي 1 و 3 و 5. المنزلة 2 زوجية فتضيف 0."),
              { code: ODD_DIGITS_2, run: "Console.Write(NumOfOddDigits(5231));", out: "3" }),
            MC("لو بدّلنا شرط التوقّف في `NumOfDigits` بالشرط `if (n == 0) return 0;`، فماذا يعيد الاستدعاء `NumOfDigits(0)`؟", ["1، كما كان", "*0، مع أنّ العدد 0 مكوّن من منزلة واحدة", "لا يعيد شيئًا: تراجعية لانهائية", "خطأ في التشغيل بسبب `0 / 10`"], "بهذا الشرط يبقى عدّ المنازل صحيحًا للأعداد الأخرى (مثلًا 123 تعطي `1 + 1 + 1 + 0`)، لكنّ العدد 0 نفسه يعطي 0 بدل 1. الشرط `n >= 0 && n <= 9` يعامل 0 مثل أي عدد من منزلة واحدة. اختيار شرط التوقّف يحدّد ما تعيده العملية في الحالات البسيطة."),
          ],
        },
        {
          title: "البحث والفحص في المنازل",
          src: "21–24",
          keywords: ["Exists", "Count", "Check", "||", "&&", "Tail", "Non-Tail"],
          objective: "أن تكتب عمليات تراجعية تبحث عن منزلة أو تفحص كل المنازل، وأن تحدّد نوعها.",
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا `n` ورقمًا `d`. العملية تُعيد `true` إذا وجدت `d` داخل `n`. خلاف ذلك تُعيد `false`.", steps: ["شرط توقّف: إذا كانت `d` مساوية لمنزلة الآحاد.", "شرط توقّف: إذا لم تبقَ أيّة منازل في العدد، أي أصبح العدد 0.", "إذا لم تكن `d` مساوية لمنزلة الآحاد، نحذف منزلة الآحاد ونكمل البحث في العدد المتبقّي."] }),
            CS(EXISTS_TAIL),
            P("**النوع: `Tail Recursion`** لأنّه لا توجد أيّة أوامر يتمّ تأجيلها بسبب الاستدعاء الذاتي."),
            P("إمكانية أخرى للحل تكمن في استعمال المعامل المنطقي `||` الذي يكفيه، حتى يُعيد `true`، تحقّق طرف واحد من طرفيه:"),
            CS(EXISTS_OR),
            P("**النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب المعامل المنطقي `||` لغاية تحقّق شرط التوقّف."),
            H("مثال لكيفية تتبّع الاستدعاء `Exists(1023, 2)`", 3),
            TRACE({
              title: "تتبّع `Exists(1023, 2)` بصيغة المعامل `||`", code: EXISTS_OR, run: "Console.WriteLine(Exists(1023, 2));",
              given: "الاستدعاء `Exists(1023, 2)`، ثم طباعة القيمة المُعادة.",
              description: "عند `n = 1023` منزلة الآحاد 3 لا تساوي 2، فيُستدعى `Exists(102, 2)`. وهناك `102 % 10 == 2`.",
            }),
            CLAR("في الكتاب", "شكل التتبّع في الكتاب (ص 22) يكمل الاستدعاءات حتى `Exists(0, 2)`. في لغة `C#` المعامل `||` لا يحسب طرفه الأيمن إذا كان طرفه الأيسر `true`. لذلك تتوقّف الاستدعاءات فعليًا عند `Exists(102, 2)`، كما يُظهر التتبّع أعلاه. القيمة النهائية `true` في الحالتين."),
            XNOTE("انتبه: البحث عن الرقم 0", "في الصيغة الأولى يُفحص الشرط `n % 10 == d` **قبل** الشرط `n == 0`. حين تنتهي المنازل يصبح `n` صفرًا، و `0 % 10` تساوي 0. فإذا كانت `d` تساوي 0 تُعاد `true` حتى لو لم يكن في العدد أي صفر: مثلًا `Exists(123, 0)` تعيد `true`. الصيغة الثانية تفحص `n == 0` أولًا، فلا تقع في هذا الخطأ."),
            proved(TF("بالصيغة الأولى (صيغة `Tail`) الاستدعاء `Exists(123, 0)` يعيد `false`.", false, "بعد حذف المنازل 3 و 2 و 1 نصل إلى `Exists(0, 0)`. الشرط الأول `0 % 10 == 0` صحيح، فتُعاد `true` مع أنّ العدد 123 لا يحتوي على الرقم 0."),
              { code: EXISTS_TAIL, run: "Console.Write(Exists(123, 0));", out: "True" }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا `n` ورقمًا `d` ثمّ تُعيد عدد مرّات ظهور `d` في العدد `n`.", steps: ["شرط التوقّف: إذا كان العدد (أو أصبح) مكوّنًا من منزلة واحدة وكانت هذه المنزلة مساوية لـ `d` نُعيد 1. أمّا إذا لم تكن مساوية لـ `d` نُعيد 0.", "نستعين بالمتغيّر المساعد `c` لمعرفة هل علينا أن نضيف 1 أم 0، بناءً على: هل منزلة الآحاد مساوية لـ `d` أم لا.", "بعدها نستدعي العملية لنعدّ عدد مرّات ظهور `d` فيما تبقّى من العدد بعد أن نحذف منزلة الآحاد."] }),
            CS(COUNT_C),
            P("**النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب الجمع لغاية تحقّق شرط التوقّف. بدون الاستعانة بالمتغيّر `c` يبدو الحل كالتالي:"),
            CS(COUNT_2),
            TRACE({
              title: "تتبّع `Count(2325, 2)`", code: COUNT_C, run: "Console.WriteLine(Count(2325, 2));",
              given: "الاستدعاء `Count(2325, 2)`، ثم طباعة القيمة المُعادة.",
              description: "لكل استدعاء متغيّره `c` الخاص به في إطاره. راقب قيمته في كل إطار.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا `n>0` ثمّ تعيد `true` إذا كانت جميع منازله فردية.", steps: ["شرط توقّف: إذا لم تبقَ أيّة منازل في العدد، أي أصبح العدد 0، نُعيد `true`.", "شرط توقّف: إذا كانت منزلة الآحاد زوجية نُعيد `false`. هنا نفحص الحالة العكسية للمطلوب (أي زوجي بدلًا من فردي).", "بعدها نستدعي العملية لفحص المنازل المتبقّية في العدد بعد حذف منزلة الآحاد."] }),
            CS(CHECK_TAIL),
            NOTE("لاحظ", "في حل مثل هذه الأسئلة، التي تطلب فحص **جميع** المنازل، يكفي أن نجد منزلة واحدة لا تحقّق المطلوب وننهي عندها الفحص. **النوع: `Tail Recursion`** لأنّه لا توجد أيّة أوامر يتمّ تأجيلها بسبب الاستدعاء الذاتي."),
            P("إمكانية أخرى للحل تكمن في استعمال المعامل المنطقي `&&` الذي يلزمه، حتى يُعيد `true`، تحقّق طرفيه:"),
            CS(CHECK_AND("n % 2 == 0")),
            P("**النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع حساب المعامل المنطقي `&&` لغاية تحقّق شرط التوقّف."),
            CLAR("خطأ مطبعي في الكتاب", "في الصيغة المطبوعة كُتب الشرط `(n % 2 == 0)`، ومعه الجملة «يكفي عدم تحقّق التعبير المنطقي `n % 2 == 0` مرّة واحدة لتُعيد العملية `false`». بهذا الشرط تعيد العملية `true` حين تكون جميع المنازل **زوجية**، وهو عكس المطلوب. الصحيح للمطلوب (جميع المنازل فردية): `return (n % 2 == 1) && Check(n / 10);`."),
            proved(TF("بالصيغة المطبوعة في الكتاب (الشرط `n % 2 == 0` مع `&&`)، الاستدعاء `Check(135)` يعيد `true`.", false, "منزلة الآحاد 5 فردية، فالتعبير `135 % 2 == 0` خطأ، والمعامل `&&` يعيد `false` فورًا. مع أنّ كل منازل 135 فردية والمطلوب أن تُعاد `true`."),
              { code: CHECK_AND("n % 2 == 0"), run: "Console.Write(Check(135));", out: "False" }),
            proved(SHORT("ما القيمة التي تعيدها `Count(70707, 7)`؟", "3", "الرقم 7 يظهر في العدد ثلاث مرّات: في الآحاد وفي المئات وفي عشرات الألوف."),
              { code: COUNT_2, run: "Console.Write(Count(70707, 7));", out: "3" }),
            provedCount(SHORT("كم مرّة تُستدعى العملية `Check` (الصيغة الأولى) عند تنفيذ `Check(1357)` (يشمل الاستدعاء الأول)؟", "5", "كل المنازل فردية، فلا يتحقّق شرط «منزلة زوجية» أبدًا. قيم `n` في الاستدعاءات: 1357 ثم 135 ثم 13 ثم 1 ثم 0، وعند 0 تُعاد `true`. لو كانت في العدد منزلة زوجية لتوقّفت الاستدعاءات عندها."),
              { code: CHECK_TAIL, run: "Console.Write(Check(1357));" }, "public static bool Check(int n)", 5),
          ],
        },
        {
          title: "أكبر منزلة، وتتبّع عملية تطبع",
          src: "24–27",
          keywords: ["MaxDigit", "Tr", "جدول تتبّع", "Write", "WriteLine"],
          objective: "أن تتتبّع عملية تراجعية فيها أوامر مؤجّلة، وأن تحدّد ترتيب الطباعة.",
          blocks: [
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى عددًا طبيعيًا `n>0` ثم تُعيد أكبر منزلة من منازله.", steps: ["شرط التوقّف: إذا كان العدد مكوّنًا من منزلة واحدة فهي الأكبر.", "خلاف ذلك: المنزلة الأكبر هي الأكبر من بين منزلة الآحاد وأكبر منزلة في العدد المتبقّي بعد حذف منزلة الآحاد."] }),
            CS(MAX_DIGIT),
            NOTE("انتبه", "أمر الـ `if` الأخير يُعيد المنزلة الأكبر من بين منزلة الآحاد وأكبر منزلة في العدد المتبقّي. تنفيذ هذا الأمر يُؤخَّر لحين تحقّق شرط التوقّف ومعرفة قيمة المتغيّر `y`. **النوع: `Non-Tail Recursion`** لأنّنا لا نستطيع تنفيذ أمر الـ `if` حتى نعرف قيمة `y`."),
            P("تتبّع تنفيذ العملية بالنسبة للاستدعاء `MaxDigit(1733)` وحدّد القيمة المُعادة:"),
            TABLE(["الاستدعاء", "`n < 10`", "`x`", "`y` (تعود من الاستدعاء التالي)", "القيمة المُعادة"], [
              ["`MaxDigit(1733)`", "F", "3", "7", "7"],
              ["`MaxDigit(173)`", "F", "3", "7", "7"],
              ["`MaxDigit(17)`", "F", "7", "1", "7"],
              ["`MaxDigit(1)`", "T", "—", "—", "1"],
            ], { caption: "تتبّع `MaxDigit(1733)`: القيمة المُعادة النهائية 7", ltr: [0] }),
            CLAR("في الكتاب", "في رسم التتبّع في الكتاب (ص 25) كُتب داخل مربّع الاستدعاء `MaxDigit(17)` الأمر `if(3>y) return 3;`. في هذا الاستدعاء `x = 7`، فالمقصود `if(7>y) return 7;`."),
            TRACE({
              title: "تتبّع `MaxDigit(1733)`", code: MAX_DIGIT, run: "Console.WriteLine(MaxDigit(1733));",
              given: "الاستدعاء `MaxDigit(1733)`، ثم طباعة القيمة المُعادة.",
              description: "كل إطار يحفظ `x` وينتظر `y`. المقارنة `x > y` تُنفَّذ في طريق العودة.",
            }),
            EX({ title: "مثال", prompt: "معطاة العملية التراجعية `Tr` ومقطع يستخدمها. تتبّع تنفيذ المقطع وحدّد المخرج." }),
            CS(TR_BOOK),
            NOTE("انتبه", "يجب الانتباه إلى الفرق بين `Write` و `WriteLine`."),
            P("**المخرج:**"),
            OUT("1\n121\n12321\n1234321\n123454321"),
            P("بداية جدول التتبّع في الكتاب (للقيم 1 و 2 و 3 من `i`؛ الجدول يستمرّ بالطريقة نفسها حتى 5):"),
            TABLE(["`i`", "`Tr(1, i)`", "`k`", "`n`", "`k==n`", "الأوامر التي يؤجَّل تنفيذها", "الطباعة"], [
              ["1", "`Tr(1, 1)`", "1", "1", "T", "—", "`1`"],
              ["2", "`Tr(1, 2)`", "1", "2", "F", "`Console.Write(1);`", "—"],
              ["", "`Tr(2, 2)`", "2", "2", "T", "هنا نطبع 2 ثم ننفّذ الأمر الذي تأجّل أي نطبع 1", "`121`"],
              ["3", "`Tr(1, 3)`", "1", "3", "F", "`Console.Write(1);`", "—"],
              ["", "`Tr(2, 3)`", "2", "3", "F", "`Console.Write(2);`", "—"],
              ["", "`Tr(3, 3)`", "3", "3", "T", "هنا نطبع 3 ثم ننفّذ الأوامر التي تأجّلت أي نطبع 2 ثم نطبع 1", "`12321`"],
            ], { caption: "جدول تتبّع المقطع" }),
            FIG("الراصّة لحظة الوصول إلى `Tr(3, 3)`", [{ kind: "stack", items: ["Write(2)", "Write(1)"], label: "آخر أمر تأجّل `Write(2)` هو أول ما يُنفَّذ" }]),
            LIST([
              "في عمود الطباعة كتبنا في سطر واحد النتيجة النهائية لكل الاستدعاءات التي نشأت من الاستدعاء الأصلي.",
              "تنفيذ الأوامر التي يؤجَّل تنفيذها يكون وفق طريقة الراصّة: آخر أمر تأجّل تنفيذه يكون الأول الذي يُنفَّذ بعد تحقّق شرط التوقّف.",
            ], { title: "لاحظ" }),
            CLAR("في الكتاب", "المقطع مطبوع في الكتاب كما هو أعلاه: الحلقة خارج أي عملية. لكي يعمل في `C#` يجب أن تكون الحلقة داخل `Main`. وفي جدول الكتاب، في سطرَي `Tr(4, 4)` و `Tr(5, 5)`، كُتب «هنا نطبع 3» والمقصود «نطبع 4» و«نطبع 5». التتبّع التالي يضع الحلقة داخل `Main` ويوقفها عند 3 ليبقى قصيرًا."),
            TRACE({
              title: "تتبّع المقطع حتى `i = 3`", code: TR_MAIN,
              description: "راقب عمود الناتج: الأرقام الصاعدة تُطبع في الذهاب، والأرقام النازلة تُطبع في الإياب.",
            }),
            proved(SHORT("ما القيمة التي تعيدها `MaxDigit(5291)`؟", "9", "في طريق العودة: أكبر منزلة في 5 هي 5، ثم في 52 هي 5، ثم في 529 هي 9، ثم في 5291 هي 9."),
              { code: MAX_DIGIT, run: "Console.Write(MaxDigit(5291));", out: "9" }),
            proved(SHORT("ماذا يطبع الاستدعاء `Tr(1, 4)`؟ اكتب الناتج كما يُطبع.", "1234321", "في الذهاب تُطبع 1 ثم 2 ثم 3، ثم يتحقّق `k == n` فتُطبع 4. في الإياب تُنفَّذ الأوامر المؤجّلة: 3 ثم 2 ثم 1."),
              { code: TR, run: "Tr(1, 4);", out: "1234321" }),
            proved(MC("ماذا يطبع الاستدعاء `Tr(2, 4)`؟", ["`234`", "*`23432`", "`1234321`", "`24342`"], "الاستدعاء يبدأ من `k = 2`: تُطبع 2 ثم 3، ثم 4 عند شرط التوقّف، ثم الأوامر المؤجّلة: 3 ثم 2."),
              { code: TR, run: "Tr(2, 4);", out: "23432" }),
          ],
        },
      ],
    },
    {
      title: "المصفوفات و«قسّم تسد»",
      pages: [
        {
          title: "المصفوفات وطريقة «قسّم تسد»",
          src: "35–37",
          keywords: ["مصفوفة", "قسّم تسد", "Divide and Conquer", "Sum", "Binary Recursion"],
          objective: "أن تتتبّع عملية تقسم مجال المصفوفة إلى نصفين وتجمع النتيجتين.",
          blocks: [
            CLAR("ناقص في النسخة الممسوحة من الكتاب", "صفحات الكتاب 28–34 (بند «المصفوفات الأحادية والعمليات التراجعية» وبداية بند «قسّم تسد») غير موجودة في النسخة الممسوحة التي بُنيت منها هذه الوحدة. الشرح التالي، حتى الفقرة التي تبدأ بكلمة «انتبه»، إضافة من المعلّم وليس نصّ الكتاب."),
            XH("المصفوفات والعمليات التراجعية", 2),
            XP("المصفوفة مبنى تراجعي: كل جزء من المصفوفة هو مصفوفة. لكننا لا نستطيع أن «نحذف» خلية من المصفوفة كما نحذف منزلة من عدد. لذلك نضيف إلى العملية بارامترًا هو __اندكس__ (رقم خلية) يحدّد من أين يبدأ الجزء الذي نعالجه."),
            XCS(SUM_FROM),
            XP("العملية `SumFrom(A, i)` تعيد مجموع القيم من الخلية `i` حتى نهاية المصفوفة. شرط التوقّف: الاندكس تجاوز آخر خلية، فلم يبقَ شيء نجمعه."),
            TRACE({
              title: "تتبّع `SumFrom(A, 0)`", code: SUM_FROM, run: "int[] A = { 2, -1, 3 };\nConsole.WriteLine(SumFrom(A, 0));",
              given: "المصفوفة `A = {2, -1, 3}`، والاستدعاء `SumFrom(A, 0)`.",
              description: "المصفوفة نفسها تُمرَّر إلى كل استدعاء. الذي يتغيّر هو الاندكس `i` فقط.",
            }),
            XH("قسّم تسد – Divide and Conquer", 2),
            XP("في طريقة __قسّم تسد__ نقسم المسألة إلى مسألتين أصغر من النوع نفسه، نحلّ كل واحدة بشكل تراجعي، ثم نركّب الحل من الحلّين الجزئيين. مثال: لجمع قيم مصفوفة نقسم مجالها إلى نصفين، نجمع كل نصف، ثم نجمع النتيجتين."),
            P("انتبه إلى أنّ استعمال هذه الطريقة يحتاج عادة إلى اندكسين مساعدين (أي رقمَي خليتين): الأول للبداية (ويُرمز له عادة بالحرف `s` اختصارًا للكلمة `start`)، والثاني للنهاية (ويُرمز له عادة بالحرف `e` اختصارًا للكلمة `end`)."),
            H("الحل", 3),
            CS(SUM_DC),
            NOTE("لاحظ", "كل الحلول وفق منهجية قسّم تسد تكون تراجعية `Binary Recursion`."),
            DEF("شرط التوقّف", "التقاء المؤشّرين: عندما تصبح قيمة `s` مساوية لقيمة `e`، أي أنّ المجال أصبح مكوّنًا من خلية واحدة فقط. حينها نُعيد قيمة هذه الخلية."),
            P("خلاف ذلك نجد وسط المصفوفة، ثمّ نجمع القيم في كل نصف من النصفين بشكل تراجعي. بعدها نُعيد حاصل جمع هاتين النتيجتين الجزئيتين."),
            P("دعونا نتتبّع تنفيذ هذه العملية للمصفوفة التالية بحيث نجمع جميع قيم المصفوفة، أي أنّ `s=0` و `e=A.Length-1`:"),
            TABLE(["0", "1", "2", "3", "4"], [["2", "-1", "3", "0", "4"]], { caption: "المصفوفة `A`: في السطر العلوي أرقام الخلايا", ltr: [0, 1, 2, 3, 4] }),
            P("في مرحلة التقسيم نقسم المصفوفة في كل استدعاء إلى مصفوفتين. المقصود بالتقسيم هو تحديد مجال المصفوفة الذي نريد أن نجمع قيمه، من خلال حساب قيم البارامترين: بداية المجال `s` ونهايته `e`. يتوقّف هذا التقسيم عندما يلتقي المؤشّران: المجال أصبح يحتوي على خلية واحدة فقط، ولذلك يُعيد الاستدعاء عندها قيمة تلك الخلية. بعدها تبدأ عملية جمع القيم."),
            FIG("شجرة التقسيم للاستدعاء `Sum(A, 0, 4)`", [
              { kind: "tree", tree: ["0..4", ["0..2", ["0..1", "0..0", "1..1"], "2..2"], ["3..4", "3..3", "4..4"]], label: "مجال كل استدعاء: من `s` إلى `e`" },
              { kind: "tree", tree: [8, [4, [1, 2, -1], 3], [4, 0, 4]], label: "القيمة التي يعيدها كل استدعاء" },
            ]),
            TRACE({
              title: "تتبّع `Sum(A, 0, 4)`", code: SUM_DC, run: BOOK_ARRAY + "\nConsole.WriteLine(Sum(A, 0, A.Length - 1));",
              given: "المصفوفة `A = {2, -1, 3, 0, 4}`، والاستدعاء `Sum(A, 0, A.Length - 1)`.",
              description: "قارن مع شجرة التقسيم: النصف الأيسر كله يُحسب قبل أن يبدأ النصف الأيمن.",
            }),
            CLAR("في الكتاب", "في صورة التتبّع التفصيلية في الكتاب (ص 37) كُتب داخل مربّع الاستدعاء `Sum(A, 3, 4)` السطر `s = 0`. الصحيح `s = 3`، كما يظهر في التتبّع أعلاه."),
            provedCount(SHORT("كم مرّة تُستدعى العملية `Sum` عند جمع المصفوفة `A` كلها بالاستدعاء `Sum(A, 0, 4)` (يشمل الاستدعاء الأول)؟", "9", "في شجرة التقسيم 9 خلايا: 5 أوراق (خلية واحدة من المصفوفة لكل ورقة) و 4 استدعاءات تقسم مجالها."),
              { code: SUM_DC, run: BOOK_ARRAY + "\nConsole.Write(Sum(A, 0, 4));" }, "public static int Sum(int[] A, int s, int e)", 9),
            proved(SHORT("للمصفوفة `A` نفسها: ما القيمة التي يعيدها الاستدعاء `Sum(A, 1, 3)`؟", "2", "المجال من الخلية 1 إلى الخلية 3: `-1 + 3 + 0 = 2`."),
              { code: SUM_DC, run: BOOK_ARRAY + "\nConsole.Write(Sum(A, 1, 3));", out: "2" }),
            MC("ما قيمة `m` داخل الاستدعاء `Sum(A, 3, 4)`، وإلى أي استدعاءين ينقسم؟", ["`m = 4`، وينقسم إلى `Sum(A, 3, 4)` و `Sum(A, 5, 4)`", "*`m = 3`، وينقسم إلى `Sum(A, 3, 3)` و `Sum(A, 4, 4)`", "`m = 3`، وينقسم إلى `Sum(A, 0, 3)` و `Sum(A, 4, 4)`", "لا ينقسم: تحقّق شرط التوقّف"], "`m = (3 + 4) / 2` وهي قسمة أعداد صحيحة تساوي 3. النصف الأول من `s` إلى `m` والنصف الثاني من `m + 1` إلى `e`."),
          ],
        },
      ],
    },
    {
      title: "التراجعية والنصوص",
      pages: [
        {
          title: "العمليات التراجعية والنصوص",
          src: "41–45",
          keywords: ["نص", "Substring", "Contains", "IsPal", "Reverse", "بالندروم"],
          objective: "أن تكتب عمليات تراجعية على النصوص تتقدّم نحو شرط التوقّف بحذف رموز من النص.",
          blocks: [
            H("العمليات التراجعية والنصوص", 2),
            P("النصوص حالة خاصة للمصفوفات الأحادية (النص عبارة عن مصفوفة من نوع `char`). لذلك فإنّ مبنى النصوص مبنى تراجعي: كل نص جزئي هو أيضًا نص (`Each substring is a string`). لكن، وبخلاف المصفوفات، بإمكاننا **حذف أجزاء من النص**، مما يساعدنا على التقدّم باتجاه تحقيق شرط التوقّف بدون أيّة حاجة لأي اندكس مساعد."),
            XTIP("العملية `Substring`", "`str.Substring(1)` تعيد النص بدون رمزه الأول. `str.Substring(1, str.Length - 2)` تعيد النص بدون رمزه الأول وبدون رمزه الأخير (البارامتر الثاني هو **طول** الجزء المطلوب). `str.Substring(0, str.Length - 1)` تعيد النص بدون رمزه الأخير."),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى نصًّا `str` ورمزًا `ch` وتعيد `true` إذا وُجد هذا الرمز في النص. خلاف ذلك تعيد `false`.", steps: ["شرط توقّف: إذا كان (أو أصبح) النص فارغًا نُعيد `false`، لأنّ معنى ذلك أنّنا مشّطنا كل النص ولم نجد الرمز `ch`.", "شرط توقّف: إذا وجدنا الرمز `ch` في الخلية الأولى نُعيد `true`.", "خلاف ذلك نبحث عن الرمز `ch` بشكل تراجعي فيما تبقّى من النص بعد حذف الرمز الأول منه."] }),
            CS(CONTAINS),
            NOTE("لاحظ", "هذا الحل يمثّل نوعًا من التراجعية يُسمّى «تراجعية باتجاه واحد»، لأنّه لا توجد أوامر يؤجَّل تنفيذها لحين تحقّق شرط توقّف. ولذلك لا توجد في التتبّع أيّة أسهم تراجعية."),
            TRACE({
              title: "تتبّع `Contains(\"Hallo\", 'o')`", code: CONTAINS, run: "Console.WriteLine(Contains(\"Hallo\", 'o'));",
              given: "الاستدعاء `Contains(\"Hallo\", 'o')`، ثم طباعة القيمة المُعادة.",
              description: "النص يقصر برمز في كل استدعاء: `\"Hallo\"` ثم `\"allo\"` ثم `\"llo\"` ثم `\"lo\"` ثم `\"o\"`.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى نصًّا `str` وتعيد `true` إذا كان النص عبارة عن «بالندروم». خلاف ذلك تعيد `false`. البالندروم هو نص قراءته من اليمين إلى اليسار تعطي نفس نتيجة قراءته من اليسار إلى اليمين. أمثلة لبالندرومات: `a` و `aa` و `aba` و `abcba` و `aabbaa`.", steps: ["شرط توقّف: إذا كان (أو أصبح) النص فارغًا نُعيد `true`. كل نص فارغ عبارة عن بالندروم.", "شرط توقّف: إذا كان (أو أصبح) النص مكوّنًا من رمز واحد نُعيد `true`. كل نص مكوّن من رمز واحد عبارة عن بالندروم.", "شرط توقّف: إذا كان الرمز الأول في النص غير مساوٍ للرمز الأخير في النص نُعيد `false`.", "خلاف ذلك نفحص النص المتبقّي بعد حذف الرمز الأول والرمز الأخير من النص."] }),
            CS(IS_PAL),
            TRACE({
              title: "تتبّع `IsPal(\"abcba\")`", code: IS_PAL, run: "Console.WriteLine(IsPal(\"abcba\"));",
              given: "الاستدعاء `IsPal(\"abcba\")`، ثم طباعة القيمة المُعادة.",
              description: "في كل استدعاء يُحذف رمزان: الأول والأخير.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى نصًّا وتعيد معكوسه.", steps: ["شرط التوقّف: إذا كان (أو أصبح) النص فارغًا نُعيده هو، لأنّ معكوس النص الفارغ هو النص الفارغ.", "خلاف ذلك نُعيد بشكل تراجعي معكوس النص بدون الرمز الأول، ونضيف إلى نهايته الرمز الأول."] }),
            CS(REVERSE),
            TRACE({
              title: "تتبّع `Reverse(\"abc\")`", code: REVERSE, run: "Console.WriteLine(Reverse(\"abc\"));",
              given: "الاستدعاء `Reverse(\"abc\")`، ثم طباعة القيمة المُعادة.",
              description: "إضافة الرمز الأول إلى النهاية أمر مؤجّل. لذلك يُضاف `c` أولًا ثم `b` ثم `a`.",
            }),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى نصّين `str1` و `str2` وتعيد `true` إذا كان النص `str1` معكوس `str2`. خلاف ذلك تعيد `false`. أمثلة: النص `a` معكوس النص `a`، النص `ab` معكوس النص `ba`، النص `abbca` معكوس النص `acbba`.", steps: ["شرط توقّف: إذا كانت الأطوال مختلفة نُعيد `false`. لا يمكن لنصّين أطوالهما مختلفة أن يكون أحدهما معكوس الآخر.", "شرط توقّف: إذا كان (أو أصبح) النصّان فارغين نُعيد `true`، لأنّ معكوس النص الفارغ هو النص الفارغ.", "شرط توقّف: إذا كان (أو أصبح) النصّان مكوّنين من رمز واحد نُعيد `true` إذا كان الرمزان متساويين.", "شرط توقّف: إذا كان الرمز الأول في النص الأول غير مساوٍ للرمز الأخير في النص الثاني نُعيد `false`.", "خلاف ذلك نفحص، بشكل تراجعي، النصّين المتبقّيين بعد حذف الرمز الأول من النص الأول والرمز الأخير من النص الثاني."] }),
            CS(IS_REVERSED),
            EX({ title: "مثال", prompt: "اكتب عملية تراجعية تتلقّى نصّين `str1` و `str2` وتعيد `true` إذا كان النصّان متساويين. خلاف ذلك تعيد `false`.", steps: ["شروط التوقّف مثل شروط المثال السابق، مع فرق واحد: نقارن الرمز الأول في النص الأول بالرمز **الأول** في النص الثاني.", "خلاف ذلك نفحص، بشكل تراجعي، النصّين المتبقّيين بعد حذف الرمز الأول من النص الأول والرمز الأول من النص الثاني."] }),
            CS(ARE_EQUAL),
            CLAR("في الكتاب", "في شرح المثال الأخير كُتب: «لا يمكن لنصّين أطوالهما مختلفة، أن يكون أحدهما متساويين». المقصود: لا يمكن لنصّين أطوالهما مختلفة أن يكونا متساويين."),
            proved(SHORT("ما النص الذي تعيده `Reverse(\"stack\")`؟ اكتبه بدون علامتَي الاقتباس.", "kcats", "الرمز الأول `s` يُضاف آخرًا، فيصير في نهاية النص المعكوس: `kcats`."),
              { code: REVERSE, run: "Console.Write(Reverse(\"stack\"));", out: "kcats" }),
            proved(MC("ما الذي يحدث عند الاستدعاء `IsPal(\"abca\")`؟", ["يُعاد `True` بعد استدعاء واحد", "يُعاد `True` بعد ثلاثة استدعاءات", "*يُعاد `False` في الاستدعاء الثاني، عند النص `\"bc\"`", "يُعاد `False` في الاستدعاء الأول"], "في الاستدعاء الأول الرمز الأول `a` يساوي الرمز الأخير `a`، فنفحص `\"bc\"`. هناك `b` لا تساوي `c`، فتُعاد `false`."),
              { code: IS_PAL, run: "Console.Write(IsPal(\"abca\"));", out: "False", loose: true }),
            CLASSIFY("صنّف العمليات الثلاث التي تتبّعتها في هذه الصفحة:", ["`Tail`", "`Non-Tail`"], [["`Contains`", 0], ["`IsPal`", 0], ["`Reverse`", 1]], "في `Contains` و `IsPal` القيمة العائدة تُعاد كما هي. في `Reverse` يتأجّل ضمّ الرمز الأول إلى نهاية النص."),
          ],
        },
      ],
    },
    {
      title: "أسئلة وتمارين",
      pages: [
        {
          title: "أسئلة تتبّع محلولة",
          keywords: ["تتبّع", "أسئلة محلولة", "شجرة متابعة", "تمارين الكتاب"],
          blocks: [
            XP("خمسة أسئلة تتبّع محلولة، مرتّبة من الأسهل إلى الأصعب. اقرأ السؤال وحاول أن تحلّه وحدك أولًا: ارسم لكل استدعاء مربّعًا واكتب فيه قيم البارامترات. ثم اقرأ الحل، وافتح «تتبّع الحل» لترى مكدّس الاستدعاءات إطارًا إطارًا."),
            CLAR("في الكتاب", "بعض مقاطع تمارين الكتاب مطبوعة بإزاحة غير منتظمة، ومع قوس إغلاق إضافي `}` في آخر الإطار (قوس الفئة). رتّبنا الإزاحة وحذفنا القوس الزائد. وفي سؤال 3 من الكتاب طُبعت العمليتان بلا `public static` في أولهما، فأضفناها ليعمل المقطع. الأوامر نفسها لم تتغيّر."),

            QH(1, "سهل", "`Hop`: استدعاء ذاتي واحد"),
            XCS(HOP),
            XP("**السؤال:** ما القيمة التي يعيدها الاستدعاء `Hop(3, 9)`؟ وما مهمّة العملية `Hop`؟"),
            XEX({ title: "الحل", steps: [
              "`Hop(3, 9)`: الشرط `a > b` خطأ، فتُعاد `3 + Hop(5, 9)`. الجمع يتأجّل حتى يعود الاستدعاء.",
              "بالطريقة نفسها: `Hop(5, 9)` تنتظر `Hop(7, 9)`، و `Hop(7, 9)` تنتظر `Hop(9, 9)`، و `Hop(9, 9)` تنتظر `Hop(11, 9)`.",
              "`Hop(11, 9)`: الشرط `a > b` صحيح، فتُعاد 0 دون استدعاء ذاتي. هذا شرط التوقّف.",
              "في طريق العودة تُنفَّذ عمليات الجمع المؤجّلة: `9 + 0 = 9`، ثم `7 + 9 = 16`، ثم `5 + 16 = 21`، ثم `3 + 21 = 24`.",
            ], result: "تعيد العملية `24`. مهمّتها: مجموع الأعداد من `a` إلى `b` بقفزات من 2، أي `3 + 5 + 7 + 9`. النوع: `Non-Tail Recursion`." }),
            TRACE({ title: "تتبّع الحل: `Hop(3, 9)`", code: HOP, run: "Console.WriteLine(Hop(3, 9));", given: "الاستدعاء `Hop(3, 9)`، ثم طباعة القيمة المُعادة." }),

            QH(2, "سهل", "رسم بالنجوم"),
            XEX({ mode: "practice", title: "سؤال 2 من الكتاب (ص 47)", prompt: "تتبّع المقطع التالي وحدّد المخرج." }),
            XCS(Q2(5)),
            XEX({ title: "الحل", steps: [
              "`DrawTopHalf(1, 5)`: `Num` لا تساوي `Row`، فتُرسم نجمة واحدة في سطر، ثم يُستدعى `DrawTopHalf(2, 5)`.",
              "هكذا تُرسم أسطر فيها نجمتان ثم 3 ثم 4 نجوم. عند `DrawTopHalf(5, 5)` يتحقّق شرط التوقّف **قبل** الرسم: السطر الذي فيه 5 نجوم لا يُرسم هنا.",
              "`DrawBottomHalf(5)` ترسم سطرًا فيه 5 نجوم ثم تستدعي `DrawBottomHalf(4)`، وهكذا حتى `DrawBottomHalf(0)` التي تتوقّف.",
              "في العمليتين يأتي الرسم **قبل** الاستدعاء الذاتي، فلا يتأجّل أي أمر: `Tail Recursion`. لذلك تُرسم الأسطر بترتيب الاستدعاءات نفسه.",
            ], result: "المخرج 9 أسطر: تكبر من نجمة إلى 4 نجوم (`DrawTopHalf`)، ثم تصغر من 5 نجوم إلى نجمة (`DrawBottomHalf`)." }),
            XOUT("* \n* * \n* * * \n* * * * \n* * * * * \n* * * * \n* * * \n* * \n* "),
            TRACE({
              title: "تتبّع الحل (نسخة مصغّرة)", code: Q2(3),
              description: "حتى يبقى التتبّع قصيرًا استُبدل العدد 5 بالعدد 3 في `Main`. الفكرة نفسها: سطران يكبران ثم ثلاثة أسطر تصغر.",
            }),

            QH(3, "متوسط", "عملية تستعين بعملية: منازل ومصفوفة"),
            XEX({ mode: "practice", title: "سؤال 3 من الكتاب (ص 48)", prompt: "معطاة العمليتان التاليتان والمصفوفة `a` بحجم 8. (1) ما هي مهمّة العملية `What1`؟ (2) تتبّع بواسطة شجرة متابعة الاستدعاء `What2(a, 4)` وحدّد ما الذي يعيده. لا حاجة لتتبّع استدعاءات العملية `What1`. (3) ما هي مهمّة العملية `What2`؟" }),
            XCS(Q3),
            XTABLE(["0", "1", "2", "3", "4", "5", "6", "7"], [["400", "200", "100", "25", "351", "33", "34", "4"]], { caption: "المصفوفة `a`: في السطر العلوي أرقام الخلايا", ltr: [0, 1, 2, 3, 4, 5, 6, 7] }),
            XEX({ title: "الحل", steps: [
              "مهمّة `What1`: تفحص هل الرقم `x` يظهر بين منازل العدد `num`. في كل استدعاء تُحذف منزلة الآحاد؛ تُعاد `true` عند أول منزلة تساوي `x`، و `false` إذا انتهت المنازل. (هي العملية `Exists` من صفحة «البحث والفحص في المنازل».)",
              "`What2(a, 4)`: منزلة آحاد العدد 351 هي 1، والعدد التالي 33 لا يحتوي على 1. تُعاد `What2(a, 5)` كما هي.",
              "`What2(a, 5)`: منزلة آحاد 33 هي 3، والعدد التالي 34 يحتوي على 3. تُعاد `1 + What2(a, 6)`.",
              "`What2(a, 6)`: منزلة آحاد 34 هي 4، والعدد التالي 4 يحتوي على 4. تُعاد `1 + What2(a, 7)`.",
              "`What2(a, 7)`: `k` تساوي `a.Length - 1`، أي وصلنا إلى الخلية الأخيرة ولا جار بعدها: تُعاد 0. في العودة: `1 + 0 = 1`، ثم `1 + 1 = 2`.",
            ], result: "`What2(a, 4)` تعيد `2`. مهمّة `What2`: تعدّ، من الخلية `k` حتى الخلية قبل الأخيرة، الخلايا التي تظهر منزلة آحادها في العدد الموجود في الخلية التالية." }),
            TRACE({ title: "تتبّع الحل: `What2(a, 4)`", code: Q3, quiet: ["What1"], run: Q3_ARRAY + "\nConsole.WriteLine(What2(a, 4));", given: "المصفوفة `a` من السؤال، والاستدعاء `What2(a, 4)`. استدعاءات `What1` تُنفَّذ دون خطوات خاصة بها." }),

            QH(4, "متوسط", "«قسّم تسد» مع شرط"),
            XEX({ mode: "practice", title: "سؤال 4 من الكتاب (ص 49)", prompt: "أمامك العملية التراجعية `What` التي تتلقّى عددًا صحيحًا `k`، ومصفوفة `A` حدودها من نمط صحيح، وعددين صحيحين إضافيين `s` و `e`، بحيث `s<=e`. (1) تتبّع تنفيذ المقطع الذي تحت العملية واكتب ماذا يكون المخرج. (2) بالنسبة للمصفوفة `int[] B = {2,2,2,2,2,2};` أعطِ مثالًا لاستدعاء العملية `What` تُعاد بالنسبة له القيمة 6. (3) ما الذي تنفّذه العملية `What`؟" }),
            XCS(Q4),
            XCS(Q4_MAIN),
            XEX({ title: "الحل", steps: [
              "`What(6, A, 1, 5)`: المجال من الخلية 1 إلى الخلية 5. الوسط `(1 + 5) / 2` يساوي 3، فينقسم المجال إلى `What(6, A, 1, 3)` و `What(6, A, 4, 5)`.",
              "`What(6, A, 1, 3)` ينقسم إلى `What(6, A, 1, 2)` و `What(6, A, 3, 3)`. و `What(6, A, 1, 2)` ينقسم إلى الورقتين `What(6, A, 1, 1)` و `What(6, A, 2, 2)`.",
              "كل ورقة (مجال من خلية واحدة) تعيد قيمة الخلية إذا كانت أكبر من `k` (هنا 6)، وإلا تعيد 0. الخلايا 1 و 3 و 5 (القيم 8 و 14 و 18) تعيد قيمها، والخليتان 2 و 4 (القيمتان 4 و 5) تعيدان 0.",
              "في طريق العودة تُجمع النتائج الجزئية: `8 + 0 = 8`، ثم `8 + 14 = 22`. وفي النصف الثاني `0 + 18 = 18`. وأخيرًا `22 + 18 = 40`.",
              "للمصفوفة `B`: نحتاج ثلاث خلايا قيمتها 2، وعددًا `k` أصغر من 2. مثلًا `What(1, B, 0, 2)` يعيد `2 + 2 + 2 = 6`.",
            ], result: "المخرج `40`. العملية تعيد مجموع القيم الأكبر من `k` في المجال من `s` إلى `e`." }),
            FIG("شجرة التقسيم للاستدعاء `What(6, A, 1, 5)`", [
              { kind: "tree", tree: ["1..5", ["1..3", ["1..2", "1..1", "2..2"], "3..3"], ["4..5", "4..4", "5..5"]], label: "مجال كل استدعاء: من `s` إلى `e`" },
              { kind: "tree", tree: [40, [22, [8, 8, 0], 14], [18, 0, 18]], label: "القيمة التي يعيدها كل استدعاء" },
            ]),
            TRACE({ title: "تتبّع الحل: `What(6, A, 1, 5)`", code: Q4 + Q4_MAIN, description: "تسعة استدعاءات، كما في شجرة التقسيم: خمس أوراق وأربعة استدعاءات تقسم مجالها." }),

            QH(5, "متقدّم", "قيمة سالبة كإشارة: منازل من الزوجية نفسها"),
            XEX({ mode: "practice", title: "سؤال 7 من الكتاب (ص 52)", prompt: "معطاة العمليتان التراجعيتان التاليتان. (1) تتبّع بواسطة شجرة متابعة الاستدعاء `What1(6413)` وحدّد القيمة المُرجعة. (2) تتبّع بواسطة شجرة متابعة الاستدعاء `What1(208)` وحدّد القيمة المُرجعة. (3) ما هي مهمّة العملية `What1`؟ (4) تتبّع الاستدعاءات في المقطع الذي تحت العمليتين وحدّد المخرج (لا حاجة هنا لتتبّع استدعاءات العملية `What1`). (5) ما هي مهمّة العملية `What2`؟" }),
            XCS(Q7),
            XCS(Q7_USE),
            XEX({ title: "الحل", steps: [
              "الشرط `num % 2 != num / 10 % 2` يقارن زوجية منزلة الآحاد بزوجية منزلة العشرات.",
              "`What1(208)`: 8 و 0 زوجيتان، فتُعاد `What1(20) + 1`. في `What1(20)`: 0 و 2 زوجيتان، فتُعاد `What1(2) + 1`. و `What1(2)` تعيد 1 لأنّ العدد من منزلة واحدة. في العودة: `1 + 1 = 2`، ثم `2 + 1 = 3`.",
              "`What1(6413)`: 3 و 1 فرديتان، فتُعاد `What1(641) + 1`. في `What1(641)`: 1 فردية و 4 زوجية، فتُعاد `-999` فورًا. في العودة: `-999 + 1 = -998`.",
              "مهمّة `What1`: إذا كانت كل منازل العدد من الزوجية نفسها (كلها زوجية أو كلها فردية) تعيد عدد المنازل. وإلا تعيد عددًا سالبًا: القيمة `-999` إشارة، وما يُضاف إليها في طريق العودة لا يكفي لتصير موجبة.",
              "`What2(A, 0)`: نتيجة `What1` موجبة للعددين 13 (منازله فردية) و 228 (منازله زوجية) فقط. هذان يدخلان المقارنة `Math.Max`، والعددان 8145 و 425 يُتخطّيان. نهاية المصفوفة تعيد 0.",
            ], result: "`What1(208)` تعيد `3`، و `What1(6413)` تعيد `-998`، والمقطع يطبع `What2(A, 0) = 228`. مهمّة `What2`: أكبر قيمة، من الخلية `i` حتى نهاية المصفوفة، كل منازلها من الزوجية نفسها (أو 0 إذا لم توجد قيمة كهذه)." }),
            TRACE({ title: "تتبّع الحل: `What1(208)` ثم `What1(6413)`", code: Q7, run: "Console.WriteLine(What1(208));\nConsole.WriteLine(What1(6413));", given: "الاستدعاءان `What1(208)` و `What1(6413)`، وطباعة القيمتين المُعادتين." }),
            TRACE({ title: "تتبّع الحل: `What2(A, 0)`", code: Q7, quiet: ["What1"], run: Q7_USE, given: "المصفوفة `A = {8145, 13, 425, 228}`، والاستدعاء `What2(A, 0)`. استدعاءات `What1` تُنفَّذ دون خطوات خاصة بها." }),
          ],
        },
        {
          title: "وظيفة: أسئلة تتبّع",
          keywords: ["وظيفة", "تتبّع", "تمارين الكتاب", "شجرة متابعة"],
          blocks: [
            XP("ستة أسئلة تتبّع للبيت، مرتّبة من الأسهل إلى الأصعب. تتبّع كل مقطع **بدون** حاسوب وأجب عن الأسئلة، ثم اضغط «الحل»: تفتح نافذة فيها الشرح وتتبّع البرنامج خطوة بخطوة مع مكدّس الاستدعاءات. مقاطع تمارين الكتاب رُتّبت إزاحتها فقط."),

            QH(1, "سهل", "`Lines`: طباعة قبل الاستدعاء وبعده"),
            XCS(LINES),
            proved(SHORT("ماذا يطبع الاستدعاء `Lines(3)`؟ اكتب الناتج كما يُطبع.", "321123", "الطباعة الأولى تُنفَّذ في الذهاب: 3 ثم 2 ثم 1. الطباعة الثانية أمر مؤجّل يُنفَّذ في الإياب: 1 ثم 2 ثم 3."),
              { code: LINES, run: "Lines(3);", out: "321123" }),
            SOLUTION({ title: "حل سؤال 1 — `Lines`", answer: "يُطبع `321123`.", steps: [
              "في كل استدعاء أمرا طباعة: واحد **قبل** الاستدعاء الذاتي وواحد **بعده**.",
              "في الذهاب يُنفَّذ الأمر الأول في كل استدعاء: تُطبع 3 ثم 2 ثم 1.",
              "`Lines(0)` تتوقّف دون أن تطبع شيئًا.",
              "في الإياب تُنفَّذ الأوامر المؤجّلة، وآخر ما تأجّل يُنفَّذ أولًا: تُطبع 1 ثم 2 ثم 3.",
            ], trace: { code: LINES, run: "Lines(3);", given: "الاستدعاء `Lines(3)`." } }),

            QH(2, "متوسط", "نتيجة تتراكم في بارامتر"),
            XEX({ mode: "practice", title: "سؤال 5 من الكتاب (ص 50)", prompt: "معطاة العمليتان التاليتان. (1) تتبّع بواسطة شجرة متابعة الاستدعاء `Test_What()` وحدّد المُخرَج. (2) اكتب ادّعاء دخول وادّعاء خروج للعملية `What`." }),
            XCS(Q5),
            proved(SHORT("ما السطر **الأول** الذي يطبعه `Test_What()`؟", "b", "الاستدعاء الأول يعالج أول 3 رموز فقط: `AbC`. بينها حرف صغير واحد هو `b`."),
              { code: Q5, run: "Console.Write(What(\"AbCdEfGhIjAbCdEfGhIj\", 3, \"\"));", out: "b" }),
            proved(MC("ما السطر **الأخير** الذي يطبعه `Test_What()`؟", ["`bdfhj`", "*`bdfhjbdfhj`", "`ACEGIACEGI`", "`AbCdEfGhIjAbCdEfGhIj`"], "الاستدعاء الأخير يعالج النص كله (`n` تساوي طول النص). الحروف الصغيرة `bdfhj` تظهر في النص مرّتين."),
              { code: Q5, run: "string str = \"AbCdEfGhIjAbCdEfGhIj\";\nConsole.Write(What(str, str.Length, \"\"));", out: "bdfhjbdfhj" }),
            MC("أي وصف يصلح ادّعاء خروج للعملية `What`؟", ["تعيد أول `n` رموز من النص `str`", "*تعيد `newStr` وبعده الحروف الصغيرة الموجودة بين أول `n` رموز من `str`، بترتيبها", "تعيد عدد الحروف الصغيرة في أول `n` رموز من `str`", "تعيد النص `str` بعد حذف أول `n` رموز منه"], "العملية تمرّ على أول `n` رموز، وتضيف كل حرف صغير إلى نهاية `newStr`. ادّعاء الدخول: `n` بين 0 وطول النص."),
            SOLUTION({ title: "حل سؤال 2 — سؤال 5 من الكتاب", answer: "المخرج أربعة أسطر: `b` ثم `bd` ثم `bdf` ثم `bdfhjbdfhj`.", steps: [
              "في كل استدعاء نفحص الرمز الأول `str[0]`: إذا كان حرفًا صغيرًا (`char.IsLower`) يُضاف إلى نهاية `newStr`.",
              "ثم تُستدعى `What` على النص بدون رمزه الأول، مع `n - 1`. هكذا نعالج أول `n` رموز فقط.",
              "حين تصير `n` صفرًا تُعاد `newStr` كما هي. النتيجة تتراكم في البارامتر `newStr` في **الذهاب**، فلا يتأجّل أي أمر: `Tail Recursion`.",
              "مع `n` تساوي 3 نعالج `AbC` فنحصل على `b`. مع 5 نعالج `AbCdE` فنحصل على `bd`. مع 7 نحصل على `bdf`.",
              "مع `n` تساوي طول النص (20 رمزًا) نعالج النص كله: الحروف الصغيرة `bdfhj` مرّتين.",
              "ادّعاء الدخول: `str` نص، و `n` عدد بين 0 وطول النص، و `newStr` نص (فارغ في الاستدعاء الأول). ادّعاء الخروج: تعيد `newStr` وبعده الحروف الصغيرة الموجودة بين أول `n` رموز من `str`، بترتيبها.",
            ], trace: { code: Q5, run: "Console.WriteLine(What(\"AbCdEfGhIj\", 5, \"\"));", given: "الاستدعاء `What(\"AbCdEfGhIj\", 5, \"\")`: نص أقصر من نص السؤال، ليبقى التتبّع قصيرًا." } }),

            QH(3, "متوسط", "أكبر قاسم مشترك بين الجيران"),
            XEX({ mode: "practice", title: "سؤال 6 من الكتاب (ص 51)", prompt: "معطاة العمليتان التاليتان. (1) ما هي مهمّة العملية `What1`؟ (2) تتبّع بواسطة شجرة متابعة المقطع الذي تحت العمليتين وحدّد ماذا يطبع. لا حاجة لتتبّع استدعاءات العملية `What1`. (3) ما هي مهمّة العملية `What2`؟" }),
            XCS(Q6),
            XCS(Q6_USE),
            MC("ما مهمّة العملية `What1`؟", ["تعيد باقي قسمة `a` على `b`", "*تعيد أكبر قاسم مشترك للعددين `a` و `b`", "تعيد الأصغر بين `a` و `b`", "تعيد عدد مرّات قسمة `a` على `b`"], "هذه هي العملية `EuclideanAlgorithm` من صفحة «أمثلة من الرياضيات» باسم آخر: ألغوريثم أقليدس."),
            proved(SHORT("ماذا يطبع المقطع؟", "21", "أكبر قاسم مشترك لكل خليتين متجاورتين، من أول المصفوفة: 3 ثم 3 ثم 15 ثم 9 ثم 21. أكبر هذه القيم 21."),
              { code: Q6, run: "int[] A = {18, 3, 15, 90, 1071,1029};\nConsole.Write(What2(A, 0));", out: "21" }),
            SOLUTION({ title: "حل سؤال 3 — سؤال 6 من الكتاب", answer: "يُطبع `21`. مهمّة `What2`: أكبر قيمة لأكبر قاسم مشترك بين كل خليتين متجاورتين، من الخلية `i` حتى نهاية المصفوفة.", steps: [
              "`What1` هي ألغوريثم أقليدس: تعيد أكبر قاسم مشترك للعددين.",
              "`What2(A, 0)` تنزل أولًا حتى `i == A.Length - 2`، أي حتى آخر خليتين متجاورتين، وتعيد أكبر قاسم مشترك لهما: للعددين 1071 و 1029 هو 21.",
              "في طريق العودة يحسب كل استدعاء `s`، وهو أكبر قاسم مشترك للخليتين `A[i]` و `A[i + 1]`، ثم يعيد الأكبر بين `s` و `temp`.",
              "قيم `s` في العودة: 9 (للعددين 90 و 1071)، ثم 15 (للعددين 15 و 90)، ثم 3 (للعددين 3 و 15)، ثم 3 (للعددين 18 و 3). لا واحدة منها أكبر من 21.",
              "المقارنة مؤجّلة حتى يعود الاستدعاء الذاتي: `Non-Tail Recursion`.",
            ], trace: { code: Q6, quiet: ["What1"], run: Q6_USE, given: "المصفوفة `A = {18, 3, 15, 90, 1071, 1029}`، والاستدعاء `What2(A, 0)`. استدعاءات `What1` تُنفَّذ دون خطوات خاصة بها." } }),

            QH(4, "متقدّم", "بحث في مصفوفة مرتّبة: أين تتغيّر الإشارة؟"),
            XEX({ mode: "practice", title: "سؤال 8 من الكتاب (ص 53)", prompt: "معطاة العملية التراجعية التالية `F` واستعمالها في العملية `Main`. (1) تتبّع تنفيذ العملية `Main` بواسطة جدول أو شجرة متابعة وحدّد المخرج. (2) ما هي مهمّة العملية `F`؟" }),
            XCS(Q8),
            proved(MC("ما المخرج الذي تطبعه العملية `Main`؟", ["`Pos is 4`", "`Pos is 0`", "*`Pos is between 3 and 4`", "`Pos is between 4 and 5`"], "آخر استدعاء هو `F(A, 3, 4)`: بقيت خليتان متجاورتان، فتُعاد `-3`. القيمة السالبة تعني أنّ الصفر غير موجود، وأنّ مكانه بين الخليتين 3 و 4."),
              { code: Q8, out: "Pos is between 3 and 4\n" }),
            MC("ما مهمّة العملية `F`؟", ["تعيد رقم الخلية التي فيها أصغر قيمة", "تعيد عدد القيم السالبة في المصفوفة", "*تبحث في مصفوفة مرتّبة عن مكان الانتقال من القيم السالبة إلى الموجبة: رقم خلية الصفر، أو بقيمة سالبة رقم الخلية التي قبل الانتقال", "تعيد مجموع القيم بين الخليتين `a` و `b`"], "في كل استدعاء نفحص الوسط `m`. إذا كانت إشارة `A[a]` تخالف إشارة `A[m]` (حاصل ضربهما سالب) فالانتقال في النصف الأول، وإلا ففي النصف الثاني."),
            SOLUTION({ title: "حل سؤال 4 — سؤال 8 من الكتاب", answer: "يُطبع `Pos is between 3 and 4`. مهمّة `F`: البحث في مصفوفة مرتّبة عن مكان الانتقال من القيم السالبة إلى الموجبة.", steps: [
              "`A[0]` سالبة، فتُستدعى `F(A, 0, 7)`. الوسط `m` يساوي 3. `A[3]` ليست 0، والمجال أطول من خليتين. `A[0]` و `A[3]` سالبتان، فحاصل ضربهما موجب: الانتقال ليس بينهما، ونكمل في `F(A, 3, 7)`.",
              "`F(A, 3, 7)`: `m` يساوي 5. `A[3]` سالبة و `A[5]` موجبة، فحاصل ضربهما سالب: الانتقال بينهما، ونكمل في `F(A, 3, 5)`.",
              "`F(A, 3, 5)`: `m` يساوي 4. `A[3]` سالبة و `A[4]` موجبة: نكمل في `F(A, 3, 4)`.",
              "`F(A, 3, 4)`: `m` يساوي 3، و `b - a` تساوي 1. بقيت خليتان متجاورتان، فتُعاد `-m` أي `-3`.",
              "في `Main` قيمة `pos` سالبة، فيُطبع أنّ الموضع بين الخليتين 3 و 4. القيمة السالبة إشارة إلى أنّ الصفر نفسه غير موجود.",
              "المجال ينقص إلى النصف في كل استدعاء، والقيمة العائدة تُعاد كما هي: `Tail Recursion`.",
            ], trace: { code: Q8, given: "المقطع كما هو: `Main` تستدعي `F(A, 0, 7)`." } }),

            QH(5, "متقدّم", "قوّة بعدد أقل من عمليات الضرب"),
            XEX({ mode: "practice", title: "سؤال 16 من الكتاب (ص 59)", prompt: "معطاة العمليتان التاليتان. (1) تتبّع تنفيذ الاستدعاءين `What1(2,3)` و `What1(3,4)` وحدّد المخرج. (2) ما هي مهمّة العملية `What1`؟ (3) تتبّع تنفيذ المقطع الذي تحت العمليتين وحدّد المخرج. (4) ما هي مهمّة العملية `What2`؟ افترض أنّ المصفوفة تحتوي فقط على أعداد طبيعية. لا حاجة لتتبّع استدعاءات العملية `What1`." }),
            XCS(Q16),
            XCS(Q16_USE),
            proved(SHORT("ما القيمة التي يعيدها الاستدعاء `What1(2,3)`؟", "8", "`n` فردية، فتُعاد `2 * What1(2, 2)`. و `What1(2, 2)` تحسب `y = What1(2, 1)` أي 2، وتعيد `y * y` أي 4. النتيجة `2 * 4 = 8`."),
              { code: Q16, run: "Console.Write(What1(2,3));", out: "8" }),
            proved(SHORT("ما القيمة التي يعيدها الاستدعاء `What1(3,4)`؟", "81", "`y = What1(3, 2)`، وهناك `y = What1(3, 1)` أي 3. في العودة: `3 * 3 = 9`، ثم `9 * 9 = 81`."),
              { code: Q16, run: "Console.Write(What1(3,4));", out: "81" }),
            MC("ما مهمّة العملية `What1`؟", ["تعيد حاصل ضرب `m` في `n`", "*تعيد `m` مرفوعًا للقوّة `n`", "تعيد مربّع العدد `m`", "تعيد `n` مرفوعًا للقوّة `m`"], "حين تكون `n` زوجية تحسب العملية نصف القوّة مرّة واحدة ثم تربّعها. وحين تكون فردية تضرب في `m` مرّة واحدة وتنقص `n` بواحد."),
            proved(SHORT("ماذا يطبع المقطع الذي يستدعي `What2(A, 0)`؟", "81", "لكل خليتين متجاورتين تُحسب القوّة: 8 ثم 81 ثم 64 ثم 3 ثم 1. أكبرها 81."),
              { code: Q16, run: "int[] A = { 2, 3, 4, 3, 1, 2 };\nConsole.Write(What2(A, 0));", out: "81" }),
            SOLUTION({ title: "حل سؤال 5 — سؤال 16 من الكتاب", answer: "`What1(2,3)` تعيد `8`، و `What1(3,4)` تعيد `81`، والمقطع يطبع `81`. مهمّة `What2`: أكبر قيمة للقوّة `A[i]` مرفوعًا إلى `A[i + 1]` بين كل خليتين متجاورتين.", steps: [
              "`What1(2, 3)`: `n` فردية، فتُعاد `2 * What1(2, 2)`. في `What1(2, 2)`: `n` زوجية، فنحسب `y = What1(2, 1)` ثم نعيد `y * y`.",
              "`What1(2, 1)` تعيد `2 * What1(2, 0)`، و `What1(2, 0)` تعيد 1. في العودة: `2 * 1 = 2`، ثم `y * y = 4`، ثم `2 * 4 = 8`.",
              "`What1(3, 4)`: `y = What1(3, 2)`، وهناك `y = What1(3, 1)` التي تعيد 3. في العودة: `3 * 3 = 9`، ثم `9 * 9 = 81`.",
              "مهمّة `What1`: تعيد `m` مرفوعًا للقوّة `n`. حين تكون `n` زوجية تُحسب نصف القوّة مرّة واحدة وتُربَّع، فتحتاج العملية إلى استدعاءات أقل من `Pow`.",
              "`What2` مبنيّة مثل `What2` في السؤال 3 من هذه الصفحة: لكل خليتين متجاورتين تحسب `What1(A[i], A[i + 1])` وتعيد الأكبر. القيم من أول المصفوفة: 8 ثم 81 ثم 64 ثم 3 ثم 1.",
            ], trace: { code: Q16, run: "Console.WriteLine(What1(3, 4));", given: "الاستدعاء `What1(3, 4)`، ثم طباعة القيمة المُعادة." } }),

            QH(6, "متقدّم", "أكبر قيمة بطريقة «قسّم تسد»، ثم ترتيب"),
            XEX({ mode: "practice", title: "سؤال 15 من الكتاب (ص 58)", prompt: "معطاة العمليات التالية. (1) تتبّع المقطع الأول الذي تحت العمليات وحدّد القيمة المُرجعة. (2) ما هي مهمّة العملية `What1`؟ (3) تتبّع المقطع الثاني وحدّد محتوى المصفوفة بعد كل استدعاء تراجعي. لا حاجة لتتبّع استدعاءات العملية `What1`. (4) ما هي مهمّة العملية `What2`؟ (5) ما هي درجة نجاعة زمن تشغيل العملية `What2`؟" }),
            XCS(Q15),
            XCS(Q15_USE_1),
            XCS(Q15_USE_2),
            proved(SHORT("ما القيمة التي تُخزَّن في `i` في المقطع الأول؟", "2", "`What1` تعيد **رقم الخلية** التي فيها أكبر قيمة. أكبر قيمة 8، وهي في الخلية 2."),
              { code: Q15, run: "int[] A = { 5, 1, 8, 3, 4, 7 };\nint i = What1(A, 0, A.Length - 1);\nConsole.Write(i);", out: "2" }),
            proved(MC("كيف تبدو المصفوفة `A` بعد انتهاء المقطع الثاني؟", ["`{8,7,5,4,3,1}`", "*`{1,3,4,5,7,8}`", "`{5,1,7,3,4,8}`", "`{5,1,8,3,4,7}`"], "في كل استدعاء تنتقل أكبر قيمة في المجال إلى آخره، ثم يقصر المجال بخلية. في النهاية المصفوفة مرتّبة ترتيبًا تصاعديًا."),
              { code: Q15, run: "int[] A = { 5, 1, 8, 3, 4, 7 };\nWhat2(A, 0, A.Length - 1);\nfor (int k = 0; k < A.Length; k++) Console.Write(A[k] + \" \");", out: "1 3 4 5 7 8 ", loose: true }),
            SOLUTION({ title: "حل سؤال 6 — سؤال 15 من الكتاب", answer: "`i` تساوي `2`، والمصفوفة تصير `{1,3,4,5,7,8}`. مهمّة `What1`: رقم خلية أكبر قيمة في المجال. مهمّة `What2`: ترتيب المجال ترتيبًا تصاعديًا.", steps: [
              "`What1(A, b, e)` تقسم المجال إلى نصفين، وتأخذ من كل نصف **رقم الخلية** التي فيها أكبر قيمة (`x` و `y`)، وتعيد رقم الأكبر بينهما. للمصفوفة كلها: أكبر قيمة 8 في الخلية 2.",
              "`What2(A, 0, 5)`: `i` تساوي 2، فتُبدَّل الخليتان 2 و 5. المصفوفة تصير `{5,1,7,3,4,8}`: أكبر قيمة صارت في آخر المجال.",
              "`What2(A, 0, 4)`: أكبر قيمة في المجال 7 (الخلية 2)، تُبدَّل مع الخلية 4: `{5,1,4,3,7,8}`.",
              "`What2(A, 0, 3)`: أكبر قيمة 5 (الخلية 0)، تُبدَّل مع الخلية 3: `{3,1,4,5,7,8}`.",
              "`What2(A, 0, 2)`: أكبر قيمة 4 في آخر المجال أصلًا، فلا تغيير. `What2(A, 0, 1)`: تُبدَّل الخليتان 0 و 1: `{1,3,4,5,7,8}`. و `What2(A, 0, 0)` تتوقّف.",
              "درجة النجاعة (موضوع الوحدة التالية): `What2` تُستدعى نحو `n` مرّة، وفي كل مرّة تمرّ `What1` على المجال كله. لذلك درجة النجاعة `O(n²)`.",
            ], trace: { code: Q15, quiet: ["What1", "Swap"], run: Q15_USE_2, given: "المصفوفة `A = {5, 1, 8, 3, 4, 7}`، والاستدعاء `What2(A, 0, A.Length - 1)`. العمليتان `What1` و `Swap` تُنفَّذان دون خطوات خاصة بهما: راقب المصفوفة بعد كل تبديل." } }),
          ],
        },
        {
          title: "أسئلة كتابة محلولة",
          keywords: ["كتابة عملية", "أسئلة محلولة", "صيغة تراجعية", "Iterative"],
          blocks: [
            XP("خمسة أسئلة كتابة محلولة، مرتّبة من الأسهل إلى الأصعب. اكتب كل عملية في دفترك أو في محرّر الكود **قبل** أن تقرأ الحل. تذكّر الخطوات الثلاث: شرط التوقّف، ثم «افترض أنّ العملية تعمل لحالة أسهل»، ثم ما الذي نضيفه. الكتاب لا يعطي حلولًا لتمارينه: الحلول هنا من المعلّم، وكل حل جُرّب بالتتبّع. قد يكون حلّك مختلفًا وصحيحًا."),

            QH(1, "سهل", "`Mult`: الضرب بواسطة الجمع"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "في صفحة «أمثلة من الرياضيات» شرح الكتاب (ص 14–15) عملية الضرب التراجعية دون أن يطبع كودها. اكتب العملية `Mult` التي تتلقّى عددًا صحيحًا `m` وعددًا طبيعيًا `n` (يشمل 0) وتعيد حاصل ضربهما باستعمال الجمع فقط، دون المعامل `*`." }),
            XCS(MULT),
            XLIST([
              "شرط التوقّف `n == 0` يعيد 0.",
              "الاستدعاء الذاتي مع `n - 1`: البارامتر ينقص حتى يصل إلى 0.",
              "إضافة `m` إلى ما يعيده الاستدعاء الذاتي.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("الحل يطبّق ملاحظة الكتاب: `m.n = m.(n-1) + m`. العملية شبيهة جدًا بالعملية `Pow`: الجمع مكان الضرب، و 0 مكان 1. الجمع أمر مؤجّل، فالنوع `Non-Tail Recursion`."),
            TRACE({ title: "تتبّع الحل: `Mult(4, 3)`", code: MULT, run: "Console.WriteLine(Mult(4, 3));", given: "الاستدعاء `Mult(4, 3)`، ثم طباعة القيمة المُعادة." }),

            QH(2, "سهل", "`F1`: من حلقة إلى تراجعية"),
            XEX({ mode: "practice", title: "سؤال 1 من الكتاب (ص 46) — البند 1", prompt: "بالنسبة للعملية التكرارية (`Iterative Method`) التالية حدّد: (1) ما هي مهمّة هذه العملية؟ (2) اكتب الصيغة التراجعية لهذه العملية (`Recursive Method`). ادّعاء الدخول: تتلقّى عددين صحيحين `Low` و `High` بحيث أنّ `Low ≤ High`." }),
            XCS(F1_ITERATIVE),
            XP("**المهمّة:** الحلقة تمرّ على كل `i` من `Low` إلى `High` وتضيفه إلى `Total`. العملية تعيد مجموع الأعداد الصحيحة من `Low` إلى `High` (يشمل الطرفين). **الصيغة التراجعية:**"),
            XCS(F1_REC),
            XLIST([
              "شرط التوقّف `Low == High`: في المجال عدد واحد، فهو المجموع.",
              "الاستدعاء الذاتي على مجال أصغر: `Low + 1` بدل `Low`.",
              "إضافة `Low` إلى ما يعيده الاستدعاء الذاتي (أمر مؤجّل: `Non-Tail`).",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("الفكرة: مجموع الأعداد من `Low` إلى `High` يساوي `Low` + مجموع الأعداد من `Low + 1` إلى `High`. التتبّع يحسب `3 + 4 + 5 + 6`."),
            TRACE({ title: "تتبّع الحل: `F1(3, 6)`", code: F1_REC, run: "Console.WriteLine(F1(3, 6));", given: "الاستدعاء `F1(3, 6)`، ثم طباعة القيمة المُعادة." }),

            QH(3, "سهل", "`CountChar`: عدّ رمز في نص"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب عملية تراجعية `CountChar` تتلقّى نصًّا `str` ورمزًا `ch` وتعيد عدد مرّات ظهور الرمز `ch` في النص. مثال: للنص `banana` والرمز `a` تعيد العملية 3." }),
            XCS(COUNT_CHAR),
            XLIST([
              "شرط التوقّف: النص فارغ، فيه 0 ظهور.",
              "الاستدعاء الذاتي على النص بدون رمزه الأول: `str.Substring(1)`.",
              "إضافة 1 فقط إذا كان الرمز الأول `str[0]` يساوي `ch`.",
              "إعادة قيمة في المسارين: الرمز الأول يساوي `ch`، أو لا يساويه.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("هذا قالب الكتاب لعدّ منزلة في عدد (العملية `Count`) منقولًا إلى النصوص: الرمز الأول مكان منزلة الآحاد، و `Substring(1)` مكان `n / 10`. المتغيّر `rest` يحفظ ما عدّه الاستدعاء الذاتي في بقية النص."),
            TRACE({ title: "تتبّع الحل: `CountChar(\"abca\", 'a')`", code: COUNT_CHAR, run: "Console.WriteLine(CountChar(\"abca\", 'a'));", given: "الاستدعاء `CountChar(\"abca\", 'a')`، ثم طباعة القيمة المُعادة." }),

            QH(4, "متوسط", "`F3`: أزواج من رموز متساوية"),
            XEX({ mode: "practice", title: "سؤال 1 من الكتاب (ص 46) — البند 3", prompt: "بالنسبة للعملية التكرارية التالية حدّد: (1) ما هي مهمّة هذه العملية؟ (2) اكتب الصيغة التراجعية لهذه العملية. ادّعاء الدخول: تتلقّى نصًّا." }),
            XCS(F3_ITERATIVE),
            XP("**المهمّة:** طول النص يجب أن يكون زوجيًا، ثم يُقارن كل رمز في مكان زوجي بالرمز الذي بعده: الخليتان 0 و 1، ثم 2 و 3، وهكذا. العملية تفحص هل النص مكوّن من أزواج متتالية من رمزين متساويين، مثل `aabbcc`. **الصيغة التراجعية:**"),
            XCS(F3_REC),
            XLIST([
              "شرط توقّف: النص فارغ، فكل الأزواج سليمة ونعيد `true`.",
              "شرط توقّف: بقي رمز واحد بلا شريك (طول النص فردي)، فنعيد `false`.",
              "شرط توقّف: الرمزان الأولان مختلفان، فنعيد `false`.",
              "الاستدعاء الذاتي بعد حذف **رمزين**: `str.Substring(2)`.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("ترتيب شروط التوقّف مهم: فحص «بقي رمز واحد» يأتي **قبل** قراءة `str[1]`. للنص `aabbc` يبقى بعد استدعاءين النص `c` وحده، فتُعاد `false` دون خطأ في التشغيل. لا يتأجّل أي أمر: `Tail Recursion`."),
            TRACE({ title: "تتبّع الحل: `F3(\"aabb\")`", code: F3_REC, run: "Console.WriteLine(F3(\"aabb\"));", given: "الاستدعاء `F3(\"aabb\")`، ثم طباعة القيمة المُعادة." }),

            QH(5, "متقدّم", "`F2`: رقم خلية أكبر قيمة"),
            XEX({ mode: "practice", title: "سؤال 1 من الكتاب (ص 46) — البند 2", prompt: "بالنسبة للعملية التكرارية التالية حدّد: (1) ما هي مهمّة هذه العملية؟ (2) اكتب الصيغة التراجعية لهذه العملية. ادّعاء الدخول: تتلقّى مصفوفة أحادية لأعداد صحيحة." }),
            XCS(F2_ITERATIVE),
            XP("**المهمّة:** `Index` يحفظ **رقم خلية** لا قيمة، ويتغيّر فقط حين نجد قيمة أكبر **تمامًا**. العملية تعيد رقم الخلية التي فيها أكبر قيمة؛ وإذا تكرّرت القيمة الكبرى تعيد رقم ظهورها الأول. **الصيغة التراجعية:** المصفوفة لا تقصر، فنضيف البارامتر `i`. العملية تعيد رقم خلية أكبر قيمة من الخلية `i` حتى نهاية المصفوفة، والاستدعاء الأول `F2(A, 0)`."),
            XCS(F2_REC),
            XLIST([
              "شرط التوقّف: بقيت خلية واحدة (`i == A.Length - 1`)، فرقمها هو الجواب.",
              "الاستدعاء الذاتي يعيد **رقم خلية** لا قيمة، ولذلك نقارن `A[i]` مع `A[Index]`.",
              "المقارنة `>=` وليست `>`: عند تساوي القيمتين نختار الخلية الأقرب إلى البداية، كما تفعل الصيغة التكرارية.",
            ], { title: "ما يُفحص في الحل", variant: "checklist" }),
            XP("التتبّع يستعمل مصفوفة تتكرّر فيها القيمة الكبرى 9 في الخليتين 1 و 3. الصيغة التكرارية لا تبدّل `Index` عند التساوي فتعيد 1، والصيغة التراجعية تختار `i` عند التساوي فتعيد 1 أيضًا. لو كتبنا `>` لأعادت 3."),
            TRACE({ title: "تتبّع الحل: `F2(A, 0)`", code: F2_REC, run: "int[] A = { 4, 9, 2, 9 };\nConsole.WriteLine(F2(A, 0));", given: "المصفوفة `A = {4, 9, 2, 9}`، والاستدعاء `F2(A, 0)`." }),
          ],
        },
        {
          title: "وظيفة: أسئلة كتابة",
          keywords: ["وظيفة", "كتابة عملية", "SumEvenDigits", "IsSorted", "RemoveChar", "MaxOf"],
          blocks: [
            XP("أربعة أسئلة كتابة للبيت، مرتّبة من الأسهل إلى الأصعب، على المباني الأربعة التي عرفتها: عدد، مصفوفة، نص، و«قسّم تسد». اكتب كل عملية في دفترك أو في محرّر الكود، ثم اضغط «الحل» وقارن: في النافذة كود الحل وما يُفحص فيه وتتبّعه."),

            QH(1, "سهل", "`SumEvenDigits`: مجموع المنازل الزوجية"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب عملية تراجعية `SumEvenDigits` تتلقّى عددًا طبيعيًا `n` وتعيد مجموع منازله الزوجية. مثال: للعدد 4836 تعيد العملية 18، لأنّ `4 + 8 + 6 = 18`." }),
            XCS("public static int SumEvenDigits(int n)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 1 — `SumEvenDigits`", code: SUM_EVEN_DIGITS, steps: [
              "نستعمل قالب تمشيط المنازل: `n % 10` منزلة الآحاد، و `n / 10` العدد بدونها.",
              "شرط التوقّف: لم تبقَ منازل (`n == 0`)، فالمجموع 0.",
              "إذا كانت منزلة الآحاد زوجية (`n % 2 == 0`) نضيفها إلى مجموع بقية المنازل. وإلا نعيد مجموع بقية المنازل كما هو.",
            ], checklist: [
              "شرط التوقّف `n == 0` يعيد 0.",
              "فحص الزوجية بالشرط `n % 2 == 0`.",
              "إضافة **المنزلة** `n % 10` وليس العدد `n` كله.",
              "استدعاء ذاتي مع `n / 10` في المسارين.",
            ], trace: { run: "Console.WriteLine(SumEvenDigits(4836));", given: "الاستدعاء `SumEvenDigits(4836)`، ثم طباعة القيمة المُعادة." } }),
            proved(SHORT("ماذا تعيد `SumEvenDigits(2507)` في الحل؟", "2", "المنازل الزوجية هي 0 و 2، ومجموعهما 2. المنزلتان 7 و 5 فرديتان."),
              { code: SUM_EVEN_DIGITS, run: "Console.Write(SumEvenDigits(2507));", out: "2" }),

            QH(2, "متوسط", "`IsSorted`: هل المصفوفة مرتّبة؟"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب عملية تراجعية `IsSorted` تتلقّى مصفوفة أعداد صحيحة `A` ورقم خلية `i`، وتعيد `true` إذا كانت القيم من الخلية `i` حتى نهاية المصفوفة مرتّبة ترتيبًا تصاعديًا (كل قيمة أصغر من التي بعدها أو تساويها). وإلا تعيد `false`. الاستدعاء الأول `IsSorted(A, 0)`." }),
            XCS("public static bool IsSorted(int[] A, int i)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 2 — `IsSorted`", code: IS_SORTED, steps: [
              "المصفوفة لا تقصر، فالبارامتر `i` هو الذي يتقدّم: في كل استدعاء نقارن الخلية `i` بالخلية التي بعدها.",
              "شرط توقّف: وصلنا إلى الخلية الأخيرة (أو المصفوفة فارغة)، فلا توجد خلية بعدها نقارن بها: نعيد `true`.",
              "شرط توقّف: وجدنا خلية أكبر من التي بعدها: نعيد `false` فورًا. يكفي خلل واحد.",
              "خلاف ذلك نفحص بقية المصفوفة. القيمة العائدة تُعاد كما هي: `Tail Recursion`.",
            ], checklist: [
              "شرط التوقّف `i >= A.Length - 1` يأتي **قبل** قراءة `A[i + 1]`.",
              "المقارنة `>` وليست `>=`: قيمتان متساويتان متجاورتان لا تخالفان الترتيب.",
              "استدعاء ذاتي مع `i + 1`.",
            ], trace: { run: "int[] A = { 2, 5, 5, 9 };\nConsole.WriteLine(IsSorted(A, 0));", given: "المصفوفة `A = {2, 5, 5, 9}`، والاستدعاء `IsSorted(A, 0)`." } }),
            proved(SHORT("ماذا تعيد `IsSorted(A, 0)` للمصفوفة `{3, 8, 6, 9}`؟ اكتب `true` أو `false`.", "false", "عند `i` تساوي 1 القيمة 8 أكبر من القيمة 6 التي بعدها، فتُعاد `false` دون فحص بقية المصفوفة."),
              { code: IS_SORTED, run: "int[] A = { 3, 8, 6, 9 };\nConsole.Write(IsSorted(A, 0) ? \"true\" : \"false\");", out: "false" }),

            QH(3, "متوسط", "`RemoveChar`: نص بدون رمز"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب عملية تراجعية `RemoveChar` تتلقّى نصًّا `str` ورمزًا `ch` وتعيد نصًّا جديدًا فيه رموز `str` بترتيبها، بدون الرمز `ch`. مثال: للنص `abcab` والرمز `b` تعيد العملية `aca`." }),
            XCS("public static string RemoveChar(string str, char ch)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 3 — `RemoveChar`", code: REMOVE_CHAR, steps: [
              "شرط التوقّف: النص فارغ، فنعيد نصًّا فارغًا.",
              "نفترض أنّ العملية تعمل لنص أقصر: `rest` هو بقية النص (بدون الرمز الأول) بعد حذف `ch` منها.",
              "إذا كان الرمز الأول هو `ch` نعيد `rest` فقط. وإلا نضع الرمز الأول **قبل** `rest`.",
              "ضمّ الرمز الأول أمر مؤجّل: `Non-Tail Recursion`. قارن مع `Reverse` في الكتاب: هناك يُضاف الرمز الأول **بعد** ما يعيده الاستدعاء، فينقلب النص.",
            ], checklist: [
              "شرط التوقّف يعيد نصًّا فارغًا `\"\"`.",
              "الاستدعاء الذاتي على `str.Substring(1)`.",
              "الرمز الأول يُضمّ **قبل** `rest` ليبقى الترتيب.",
              "تحويل الرمز إلى نص قبل الضمّ: `str[0].ToString()`.",
            ], trace: { run: "Console.WriteLine(RemoveChar(\"abcab\", 'b'));", given: "الاستدعاء `RemoveChar(\"abcab\", 'b')`، ثم طباعة النص المُعاد." } }),
            proved(SHORT("ماذا تعيد `RemoveChar(\"banana\", 'a')` في الحل؟ اكتب النص بدون علامتَي الاقتباس.", "bnn", "تُحذف الرموز `a` الثلاثة، وتبقى الرموز الأخرى بترتيبها: `bnn`."),
              { code: REMOVE_CHAR, run: "Console.Write(RemoveChar(\"banana\", 'a'));", out: "bnn" }),

            QH(4, "متقدّم", "`MaxOf`: أكبر قيمة بطريقة «قسّم تسد»"),
            XEX({ mode: "practice", title: "المطلوب", prompt: "اكتب عملية تراجعية `MaxOf` بطريقة «قسّم تسد» تتلقّى مصفوفة أعداد صحيحة `A` واندكسين `s` و `e` بحيث `s<=e`، وتعيد أكبر قيمة في المجال من الخلية `s` إلى الخلية `e`. ابدأ من العملية `Sum` في صفحة «المصفوفات وطريقة قسّم تسد»." }),
            XCS("public static int MaxOf(int[] A, int s, int e)\n{\n    // اكتب هنا\n}"),
            SOLUTION({ title: "حل سؤال 4 — `MaxOf`", code: MAX_OF, steps: [
              "شرط التوقّف مثل `Sum`: التقاء المؤشّرين. المجال خلية واحدة، وقيمتها هي الأكبر.",
              "خلاف ذلك نجد الوسط `m`، ونطلب أكبر قيمة في كل نصف: `m1` للمجال من `s` إلى `m`، و `m2` للمجال من `m + 1` إلى `e`.",
              "الفرق الوحيد عن `Sum` في تركيب الحل: بدل جمع النتيجتين نعيد **الأكبر** بينهما.",
              "في كل استدعاء استدعاءان ذاتيان: تراجعية ثنائية، كما في كل حلول «قسّم تسد».",
            ], checklist: [
              "شرط التوقّف `s == e` يعيد `A[s]`.",
              "الوسط `(s + e) / 2`، والنصف الثاني يبدأ من `m + 1`.",
              "حفظ نتيجتَي الاستدعاءين في متغيّرين، ثم مقارنتهما.",
              "إعادة قيمة في المسارين: `m1` أو `m2`.",
            ], trace: { run: "int[] A = { 3, 9, -2, 7 };\nConsole.WriteLine(MaxOf(A, 0, A.Length - 1));", given: "المصفوفة `A = {3, 9, -2, 7}`، والاستدعاء `MaxOf(A, 0, A.Length - 1)`." } }),
            provedCount(SHORT("كم مرّة تُستدعى `MaxOf` في الحل لمصفوفة من 5 خلايا بالاستدعاء `MaxOf(A, 0, 4)` (يشمل الاستدعاء الأول)؟", "9", "كما في `Sum`: 5 أوراق (خلية لكل ورقة) و 4 استدعاءات تقسم مجالها. المجموع 9."),
              { code: MAX_OF, run: "int[] A = { 4, 1, 8, 6, 2 };\nConsole.Write(MaxOf(A, 0, 4));" }, "public static int MaxOf(int[] A, int s, int e)", 9),
          ],
        },
        {
          title: "تدريبات الوحدة",
          layout: "practice",
          keywords: ["تدريبات", "تراجعية"],
          blocks: [
            MC("ما وظيفة شرط التوقّف في العملية التراجعية؟", ["يجعل العملية أسرع", "*يحدّد الحالة البسيطة التي تُعاد فيها قيمة دون استدعاء ذاتي، فتتوقّف الاستدعاءات", "يمنع استدعاء العملية من `Main`", "يحفظ الأوامر المؤجّلة"], "بدون شرط توقّف (أو إذا لم نصل إليه أبدًا) نحصل على تراجعية لانهائية."),
            WORDS("أكمل الجمل:", "كل عملية تراجعية صحيحة فيها [[شرط توقّف]] واحد على الأقل، و[[استدعاء ذاتي]] واحد على الأقل، وتغيير في البارامترات يقرّبنا من شرط التوقّف. الأوامر المؤجّلة تُحفظ في [[راصّة]] مخفية، ولذلك يُنفَّذ [[آخر]] أمر تأجّل قبل غيره.", ["حلقة", "مصفوفة", "أول"], "الراصّة تعمل وفق `LIFO`: آخر ما دخل أول ما يخرج. لذلك تُنفَّذ الأوامر المؤجّلة بترتيب معكوس."),
            XCS(MYSTERY),
            proved(SHORT("ما القيمة التي تعيدها `Mystery(5283)` للعملية أعلاه؟", "5", "في كل استدعاء تُحذف منزلة الآحاد: 5283 ثم 528 ثم 52 ثم 5. عند منزلة واحدة تُعاد كما هي. العملية تعيد **المنزلة اليسرى** من العدد، وهي `Tail Recursion`."),
              { code: MYSTERY, run: "Console.Write(Mystery(5283));", out: "5" }),
            CLASSIFY("صنّف عمليات الكتاب بحسب نوعها:", ["`Tail`", "`Non-Tail`"], [["`Contains`", 0], ["`SumOfDigits`", 1], ["`MaxDigit`", 1], ["`EuclideanAlgorithm`", 0], ["`Reverse`", 1], ["`NumOfDigits`", 1]], "اسأل عن كل عملية: هل يبقى شيء يُنفَّذ بعد عودة الاستدعاء الذاتي؟ جمع، أو مقارنة، أو ضمّ نص: `Non-Tail`. لا شيء: `Tail`."),
            XCS(PRINT_UP),
            proved(SHORT("ماذا يطبع الاستدعاء `Show(4)` للعملية أعلاه؟ اكتب الناتج كما يُطبع.", "1234", "الطباعة تأتي **بعد** الاستدعاء الذاتي، فهي أمر مؤجّل. أول طباعة تُنفَّذ هي الأخيرة التي تأجّلت: 1، ثم 2، ثم 3، ثم 4."),
              { code: PRINT_UP, run: "Show(4);", out: "1234" }),
            proved(TF("لو بدّلنا ترتيب السطرين `Show(n - 1);` و `Console.Write(n);` في العملية أعلاه لطبع الاستدعاء `Show(4)` الناتج `4321`.", true, "حين تأتي الطباعة **قبل** الاستدعاء الذاتي لا يتأجّل شيء: تُطبع 4 ثم 3 ثم 2 ثم 1 في الذهاب."),
              { code: PRINT_DOWN, run: "Show(4);", out: "4321" }),
            ORDER("رتّب استدعاءات `SumOfDigits(472)` بحسب ترتيب **انتهائها** (من الذي يعيد قيمته أولًا):", ["`SumOfDigits(4)`", "`SumOfDigits(47)`", "`SumOfDigits(472)`"], "آخر استدعاء بدأ هو أول استدعاء ينتهي: `SumOfDigits(4)` يعيد 4، ثم `SumOfDigits(47)` يعيد 11، ثم `SumOfDigits(472)` يعيد 13."),
            XCS(SKIPS_ZERO),
            MC("ماذا يحدث عند الاستدعاء `G(5)` للعملية أعلاه؟", ["تُعاد القيمة 9", "تُعاد القيمة 15", "*تراجعية لانهائية: `n` تأخذ القيم 5 ثم 3 ثم 1 ثم `-1` ولا تساوي 0 أبدًا", "تُعاد القيمة 0"], "في العملية شرط توقّف واستدعاء ذاتي وتغيير في البارامتر، لكنّ التغيير **يتخطّى** شرط التوقّف. للأعداد الزوجية تعمل العملية كما يجب: `G(4)` تعيد `4 + 2 + 0`."),
            MATCH("صِل كل عملية بشرط توقّفها:", [
              ["`SumOfDigits`", "العدد مكوّن من منزلة واحدة"],
              ["`Contains`", "النص فارغ، أو رمزه الأول هو الرمز المطلوب"],
              ["`Sum(A, s, e)`", "التقاء المؤشّرين: المجال خلية واحدة"],
              ["`Add(a, b)`", "البارامتر الثاني يساوي 0"],
              ["`Fib`", "رقم الحدّ 1 أو 2"],
            ], "شرط التوقّف هو أبسط حالة للمبنى: منزلة واحدة، نص فارغ، خلية واحدة، صفر."),
            XCS(SUM_DC),
            provedCount(SHORT("كم مرّة تُستدعى العملية `Sum` أعلاه عند جمع مصفوفة من 4 خلايا بالاستدعاء `Sum(A, 0, 3)` (يشمل الاستدعاء الأول)؟", "7", "الشجرة: `Sum(A, 0, 3)` ينقسم إلى `Sum(A, 0, 1)` و `Sum(A, 2, 3)`، وكل واحد منهما ينقسم إلى ورقتين. المجموع: `1 + 2 + 4 = 7`."),
              { code: SUM_DC, run: "int[] A = { 5, 1, 4, 2 };\nConsole.Write(Sum(A, 0, 3));" }, "public static int Sum(int[] A, int s, int e)", 7),
            TF("كل الحلول وفق منهجية «قسّم تسد» تكون تراجعية ثنائية (`Binary Recursion`).", true, "في كل استدعاء (غير شرط التوقّف) استدعاءان ذاتيان: واحد لكل نصف من المجال."),
            proved(SHORT("ما القيمة التي تعيدها `Count(2025, 2)` (عدد مرّات ظهور الرقم 2 في العدد)؟", "2", "الرقم 2 يظهر في منزلة العشرات وفي منزلة الألوف."),
              { code: COUNT_2, run: "Console.Write(Count(2025, 2));", out: "2" }),
          ],
        },
      ],
    },
  ],
};
