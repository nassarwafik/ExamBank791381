public class Program
{
static void Main(string[] args)
{
int number = int.Parse(Console.ReadLine());
int hundreds = number / 100;
int tens = (number / 10) % 10;
int ones = number % 10;
if (hundreds == tens && tens == ones)
Console.WriteLine("Equal");
else
Console.WriteLine("Not Equal");
}
}
