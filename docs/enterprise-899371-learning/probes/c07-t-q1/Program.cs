public class Program
{
static int Sod(int a, int b)
{
if (a % 10 == b / 10)
return a % 10;
else
return (a % 10 + b / 10) / 2;
}
static void Main(string[] args)
{
int x = Sod(12, 22);
int y = Sod(28, 47);
Console.WriteLine("x := " + x + " and y := " + y);
}
}
