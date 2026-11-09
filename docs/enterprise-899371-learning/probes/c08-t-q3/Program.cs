public class Program
{
static string sod(string str, int n)
{
string result = "";
for (int i = 0; i < str.Length; i++)
{
char ch = str[i];
if (ch >= 'A' && ch <= 'Z')
{
ch = (char)((ch + n - 65) % 26 + 65);
}
else if (ch >= 'a' && ch <= 'z')
{
ch = (char)((ch + n - 97) % 26 + 97);
}
result += ch;
}
return result;
}
static void Main(string[] args)
{
Console.WriteLine(sod("XYZ", 2));
}
}
