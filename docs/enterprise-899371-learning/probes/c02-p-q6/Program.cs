public class Program
{
static void Main(string[] args)
{
bool result = (5 > 3 && 4 < 6) || (2 == 3) && !(7 <= 8) || (10 != 2 && 3 >= 1);
Console.WriteLine(result);
}
}
