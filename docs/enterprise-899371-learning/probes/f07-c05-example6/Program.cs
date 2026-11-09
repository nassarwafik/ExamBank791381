public class Program
{

static void Main()
{
Console.Write("ادخل عدد: ");
int number = int.Parse(Console.ReadLine());
for (int i = 1; i <= 10; i++)
Console.WriteLine("number × i : = " + number * i);
}
}
