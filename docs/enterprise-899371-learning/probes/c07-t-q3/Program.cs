public class Program
{
static int sod(int m, int d)
{
d++;
if ((m == 1 || m == 3 || m == 5 || m == 7 || m == 8 || m == 10 || m == 12) && d > 31)
{
d = 1;
m++;
}
else if ((m == 4 || m == 6 || m == 9 || m == 11) && d > 30)
{
d = 1;
m++;
}
else if (m == 2 && d > 28)
{
d = 1;
m++;
}
if (m > 12)
m = 1;
return m * 100 + d;
}
static void Main(string[] args)
{
int result = sod(11, 31);
Console.WriteLine(result);
}
}
