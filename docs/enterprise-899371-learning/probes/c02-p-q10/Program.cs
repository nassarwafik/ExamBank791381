public class Program
{
static void Main(string[] args)
{
int a = 5, b = 8, c = 2;
a += b; // a = ?
b -= c; // b = ?
c++;
Console.WriteLine((a > b) || (b == c));
}
}
