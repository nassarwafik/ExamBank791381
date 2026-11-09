public class Program
{
static void Main(string[] args)
{
int x = 5, y = 8;
x += 2;
y--;
Console.WriteLine((x * 2 > y) || (y % 2 == 0));
}
}
