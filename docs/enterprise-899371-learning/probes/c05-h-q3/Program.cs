public class Program
{
static void Main(string[] args)
{
int mark = 0, units = 0, sum = 0, count = 0;
for (int i = 1; i <= 3; i++)
{
Console.WriteLine("Enter mark :");
mark = int.Parse(Console.ReadLine());
Console.WriteLine("Enter Units :");
units = int.Parse(Console.ReadLine());
if (units == 4)
sum += (mark + 10) * units;
else if (units == 5)
sum += (mark + 25) * units;
else
sum += mark * units;
count += units;
}
Console.WriteLine("Avg := " + (double)sum / count);
}
}
