public class Program
{
static void Main(string[] args)
{
int number = int.Parse(Console.ReadLine());
int tens = number / 10;
int ones = number % 10;
if (tens == ones)
Console.WriteLine("Equal");
else
Console.WriteLine("Not Equal");
}
}
