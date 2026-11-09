public class Program
{
static int inc(int t)
{
int minutes = t % 100;
int hours = t / 100;
minutes++;
if (minutes == 60)
{
minutes = 0;
hours++;
if (hours == 24)
hours = 0;
}
return minutes + hours * 100;
}
static int dec(int t)
{
int minutes = t % 100;
int hours = t / 100;
minutes--;
if (minutes == -1)
{
minutes = 59;
hours--;
if (hours == -1)
hours = 23;
}
return minutes + hours * 100;
}
static void Main(string[] args)
{
int t1 = 1959;
int t2 = 0;
int t3 = 3005;
int t4 = 1000;
Console.WriteLine("inc(1959): " + inc(t1));
Console.WriteLine("dec(0): " + dec(t2));
Console.WriteLine("inc(3095): " + inc(t3));
Console.WriteLine("dec(1090): " + dec(t4));
}
}
