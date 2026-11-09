public class Program
{
static bool IsValidKey(int key)
{
int a = key % 10;
int b = key / 10 % 10;
int c = key / 100 % 10;
int d = key / 1000 % 10;
int e = key / 10000 % 10;
return e == d - c + b - a;
}
static void Main(string[] args)
{
int count = 0;
int key;
Console.WriteLine("Enter 5-digit numbers. To stop, enter -1.");
Console.Write("Enter a number: ");
key = int.Parse(Console.ReadLine());
while (key != -1)
{
if (IsValidKey(key))
count++;
Console.Write("Enter a number: ");
key = int.Parse(Console.ReadLine());
}
Console.WriteLine("Number of valid keys: " + count);
}
}
