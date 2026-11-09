public class Program
{
public static int Airplane(int[,] mat)
{
int what = 0;
for (int k = 0; k < mat.GetLength(0); k++)
{
for (int j = 0; j < mat.GetLength(1); j++)
{
if (mat[k, j] % 10 == mat[k, j] / 100)
what++;
}
}
return what;
}
static void Main()
{
int[,] mat = {
{ 242, 105, 670, 898 },
{ 512, 970, 747, 412 },
{ 390, 272, 111, 290 }
};
Console.WriteLine(Airplane(mat));
}
}
