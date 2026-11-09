public class Program
{
static void Main(string[] args)
{
int number = int.Parse(Console.ReadLine());
int hundreds = number / 100;
int tens = (number / 10) % 10;
int ones = number % 10;
if (hundreds + 1 == tens && tens + 1 == ones)
Console.WriteLine("Yes");
else
Console.WriteLine("No");
}
}
