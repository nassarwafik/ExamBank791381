public class Program
{
static void Main(string[] args)
{
int x1 = 3, y1 = 4, x2 = 7, y2 = 8;
double dx = x2 - x1;
double dy = y2 - y1;
double distance = Math.Sqrt(Math.Pow(dx, 2) + Math.Pow(dy, 2));
Console.WriteLine(Math.Round(distance, 2));
}
}
