public class Program
{
static void Main(string[] args)
{
int num = 0, count = 0;
int a, b, c;
for (int i = 1; i <= 5; i++)
{
Console.WriteLine("Enter a three-digit integer : ");
num = int.Parse(Console.ReadLine());
a = num % 10;
b = num / 10 % 10;
c = num / 100;
if (num % 100 == a + b + c)
count++;
}
Console.WriteLine("count := " + count);
}
}
