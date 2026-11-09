public class Program
{
static void Main(string[] args)
{
int number = int.Parse(Console.ReadLine());
int tens = (number / 10) % 10;
int ones = number % 10;
if (tens + 1 == ones)
Console.WriteLine("Yes");
else
Console.WriteLine("No");
}
}
