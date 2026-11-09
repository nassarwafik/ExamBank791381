public class Program
{
static int Sod1(int num)
{
int count = 0;
while (num > 0)
{
num /= 10;
count++;
}
return count;
}
static int Sod2(int num)
{
int x = Sod1(num);
int NewNum = 0;
for (int i = 1; i <= x; i++)
{
NewNum = (num % 10) + NewNum * 10;
num /= 10;
}
return NewNum;
}
static void Main(string[] args)
{
Console.WriteLine(Sod2(2786));
}
}
