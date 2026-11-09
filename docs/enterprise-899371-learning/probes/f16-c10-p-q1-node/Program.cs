public class Program
{
static void Main()
{
// The 5×5 matrix of the figure of ف10 برمجة س1 (image6), transcribed row by row; the shaded cell is mat[1, 3].
int[,] mat = {
{ -4, 0, 7, 14, -3 },
{ 10, -2, 11, 9, 2 },
{ 1, 8, 6, 0, 10 },
{ -7, 4, 9, 2, 15 },
{ 2, 3, -1, 5, 0 }
};
int r = 1, c = 3, rowSum = 0, colSum = 0;
for (int j = 0; j < mat.GetLength(1); j++) rowSum += mat[r, j];
for (int i = 0; i < mat.GetLength(0); i++) colSum += mat[i, c];
Console.WriteLine(mat[r, c] + " " + rowSum + " " + colSum);
r = 3; c = 2; rowSum = 0; colSum = 0;
for (int j = 0; j < mat.GetLength(1); j++) rowSum += mat[r, j];
for (int i = 0; i < mat.GetLength(0); i++) colSum += mat[i, c];
Console.WriteLine(mat[r, c] + " " + rowSum + " " + colSum);
}
}
