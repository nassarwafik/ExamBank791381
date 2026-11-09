public class Program
{
static void Main(string[] args)
{
int a = 7, b = 2, c = 5;
a += b;
c--;
Console.WriteLine((a > c) && (c + b == a));
}
}
