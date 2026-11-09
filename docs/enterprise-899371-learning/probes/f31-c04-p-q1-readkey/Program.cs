public class Program
{
static void Main(string[] args)
{
int number = 0, a, b, c;
Console.WriteLine("Enter number value : ");
number = int.Parse(Console.ReadLine());
a = number % 10;
b = number / 10 % 10;
c = number / 100;
Console.WriteLine(a * 100 + b * 10 + c);
Console.ReadKey();
}
}
