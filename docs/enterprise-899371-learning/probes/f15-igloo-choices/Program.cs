// F15 (plan §18): the teacher's choices for chapter 9, programming question 5.2 / 5.3, checked against Igloo exactly as the book
// specifies it, over 4000 arrays of 20 distinct values and every num from 0 to 61. Prints «OK» per question only when the one
// intended choice describes EVERY case and each other choice is contradicted by at least one case.
using System;
public class Program
{
    public static int Igloo(int[] a, int num)
    {
        int at = Array.IndexOf(a, num), count = 0;
        for (int i = 0; i < a.Length; i++)
            if (a[i] < num && (at < 0 || i < at)) count++;
        return count;
    }
    static void Main()
    {
        Random rnd = new Random(899371);
        bool q2 = true, q2a = false, q2b = false, q2d = false, seen20 = false;
        bool q3 = true, q3a = false, q3c = false, q3d = false, seen0 = false;
        for (int t = 0; t < 4000; t++)
        {
            int[] pool = new int[60];
            for (int i = 0; i < 60; i++) pool[i] = i + 1;
            for (int i = 59; i > 0; i--) { int j = rnd.Next(i + 1); int x = pool[i]; pool[i] = pool[j]; pool[j] = x; }
            int[] a = new int[20];
            Array.Copy(pool, a, 20);
            int max = int.MinValue, min = int.MaxValue;
            foreach (int v in a) { if (v > max) max = v; if (v < min) min = v; }
            for (int num = 0; num <= 61; num++)
            {
                int r = Igloo(a, num), at = Array.IndexOf(a, num);
                bool present = at >= 0;
                // 5.2 — choices as the course shows them: أ present and the largest · ب present in the last cell · ج absent and larger than all · د smaller than all
                bool c52a = present && num == max, c52b = present && at == 19, c52c = !present && num > max, c52d = num < min;
                if (r == 20) { seen20 = true; if (!c52c) q2 = false; if (!c52a) q2a = true; if (!c52b) q2b = true; if (!c52d) q2d = true; }
                if (c52c && r != 20) q2 = false;
                // 5.3 — أ only when num is the first element · ب no smaller value before it, or absent and smaller than all · ج only absent and smaller than all · د only an empty array
                bool noSmallerBefore = true;
                for (int i = 0; i < (present ? at : 0); i++) if (a[i] < num) noSmallerBefore = false;
                bool c53b = (present && noSmallerBefore) || (!present && num < min);
                if ((r == 0) != c53b) q3 = false;
                if (r == 0) { seen0 = true; if (!(present && at == 0)) q3a = true; if (!(!present && num < min)) q3c = true; q3d = true; }
            }
        }
        Console.WriteLine(q2 && seen20 && q2a && q2b && q2d ? "5.2 OK" : "5.2 FAIL");
        Console.WriteLine(q3 && seen0 && q3a && q3c && q3d ? "5.3 OK" : "5.3 FAIL");
    }
}
