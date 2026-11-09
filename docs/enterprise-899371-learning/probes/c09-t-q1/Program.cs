public class Program
{
static int Sod(int[] arr)
{
int sum = 0;
for (int i = 0; i < arr.Length; i++)
{
if (arr[i] % (i + 1) == 0)
sum += arr[i];
}
return sum;
}
static void Main(string[] args)
{
int[] arr = { 4, 8, 14, 45, 10, 11 };
int s = Sod(arr);
Console.WriteLine("s :=" + s);
}
}
