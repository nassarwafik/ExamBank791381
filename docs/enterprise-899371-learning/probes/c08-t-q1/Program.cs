public class Program
{
static string sod(string str)
{
string reversed = "";
for (int i = str.Length - 1; i >= 0; i--)
{
reversed += str[i];
}
return reversed;
}
static void Main(string[] args)
{
Console.WriteLine(sod("hello"));
}
}
