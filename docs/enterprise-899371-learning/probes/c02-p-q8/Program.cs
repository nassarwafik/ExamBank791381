public class Program
{
static void Main(string[] args)
{
int a = 7, b = 3;
a++;
b *= 2;
int c = a + b;
Console.WriteLine((c > 15) && (a % 2 == 0));
}
}
