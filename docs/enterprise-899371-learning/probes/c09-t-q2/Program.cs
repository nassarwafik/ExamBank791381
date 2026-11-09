public class Program
{
static int Sod(int[] arr, int a, int b)
{
int count = 0;
for (int i = 0; i < arr.Length; i++)
{
if (arr[i] >= a && arr[i] <= b)
count++;
}
return count;
}
static void Main(string[] args)
{
int[] arr = { 4, 8, 14, 45, 10, 11 };
int s = Sod(arr, 5, 12);
Console.WriteLine("s :=" + s);
}
}
