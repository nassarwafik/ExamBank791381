public class Program
{
static void Main(string[] args)
{
int num = 3869;
int sum = 0;
sum = num % 10;
num = num / 10;
sum += num % 10;
Console.WriteLine(sum);
}
}
