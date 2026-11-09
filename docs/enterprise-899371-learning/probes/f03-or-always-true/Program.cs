public class Program
{

static void Main()
{
int[] xs = { -50, -1, 0, 5, 10, 500 };
foreach (int x in xs) Console.WriteLine(x > 0 || x < 10);
}
}
