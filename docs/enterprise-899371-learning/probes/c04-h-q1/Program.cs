public class Program
{
static void Main()
{
int a, b, c;
a = int.Parse(Console.ReadLine());
b = int.Parse(Console.ReadLine());
c = int.Parse(Console.ReadLine());
if (a > b)
c = a + b;
if ((a - b) < a)
Console.WriteLine(c);
}
}
