public class Program
{
static string CleanString(string input)
{
string result = "";
for (int i = 0; i < input.Length; i++)
{
char ch = input[i];
if (char.IsLetter(ch))
{
result += char.ToLower(ch);
}
else
{
result += '*';
}
}
return result;
}
static void Main(string[] args)
{
string test = "Ab3cD!";
string output = CleanString(test);
Console.WriteLine(output);
}
}
