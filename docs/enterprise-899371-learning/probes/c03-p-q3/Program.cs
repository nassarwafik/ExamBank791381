public class Program
{
static void Main(string[] args)
{
int num = 938;
int ones = num % 10;
int tens = (num / 10) % 10;
int hundreds = num / 100;
double avg = (ones + tens + hundreds) / 3.0;
Console.WriteLine(Math.Round(avg));
}
}
