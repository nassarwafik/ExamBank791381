// DS-A1 — the course's library (the classes of the book «مقدّمة في مباني المعلومات بلغة C#»): Node, Node<T>, BinNode<T>, Stack<T>
// and Queue<T>, written as the book writes them. scripts/ds-course/prove-dotnet.mjs compiles every traced program of the course
// with this file and the real C# compiler, so the outputs the course shows are C#'s own.

public class Node
{
    private int Value;
    private Node Next;
    public Node(int Value) { this.Value = Value; this.Next = null; }
    public Node(int Value, Node Next) { this.Value = Value; this.Next = Next; }
    public int GetValue() { return this.Value; }
    public void SetValue(int Value) { this.Value = Value; }
    public Node GetNext() { return this.Next; }
    public void SetNext(Node Next) { this.Next = Next; }
    public bool HasNext() { return this.Next != null; }
    public override string ToString() { return this.Value.ToString(); }
}

public class Node<T>
{
    private T Value;
    private Node<T> Next;
    public Node(T Value) { this.Value = Value; this.Next = null; }
    public Node(T Value, Node<T> Next) { this.Value = Value; this.Next = Next; }
    public T GetValue() { return this.Value; }
    public void SetValue(T Value) { this.Value = Value; }
    public Node<T> GetNext() { return this.Next; }
    public void SetNext(Node<T> Next) { this.Next = Next; }
    public bool HasNext() { return this.Next != null; }
    public override string ToString() { return this.Value.ToString(); }
}

public class BinNode<T>
{
    private T Value;
    private BinNode<T> Left, Right;
    public BinNode(T Value) { this.Value = Value; this.Left = null; this.Right = null; }
    public BinNode(BinNode<T> Left, T Value, BinNode<T> Right) { this.Left = Left; this.Value = Value; this.Right = Right; }
    public T GetValue() { return this.Value; }
    public void SetValue(T Value) { this.Value = Value; }
    public BinNode<T> GetLeft() { return this.Left; }
    public void SetLeft(BinNode<T> Left) { this.Left = Left; }
    public BinNode<T> GetRight() { return this.Right; }
    public void SetRight(BinNode<T> Right) { this.Right = Right; }
    public bool HasLeft() { return this.Left != null; }
    public bool HasRight() { return this.Right != null; }
    public override string ToString() { return this.Value.ToString(); }
}

public class Stack<T>
{
    private Node<T> Head;
    public Stack()
    {
        this.Head = null;
    }
    public bool IsEmpty()
    {
        return this.Head == null;
    }
    public void Push(T x)
    {
        Node<T> Temp = new Node<T>(x);
        Temp.SetNext(Head);
        Head = Temp;
    }
    public T Top()
    {
        return Head.GetValue();
    }
    public T Pop()
    {
        T x = Head.GetValue();
        Head = Head.GetNext();
        return x;
    }
    public override string ToString()
    {
        string str = "[";
        Node<T> Pos = Head;
        while (Pos != null)
        {
            if (Pos.HasNext())
                str += Pos.GetValue() + ",";
            else
                str += Pos.GetValue();
            Pos = Pos.GetNext();
        }
        return str + "]";
    }
}

public class Queue<T>
{
    private Node<T> First, Last;
    public Queue()
    {
        this.First = null;
        this.Last = null;
    }
    public bool IsEmpty()
    {
        return this.First == null;
    }
    public T Head()
    {
        return this.First.GetValue();
    }
    public void Insert(T x)
    {
        Node<T> Temp = new Node<T>(x);
        if (First == null)
        {
            First = Temp;
            Last = First;
        }
        else
        {
            Last.SetNext(Temp);
            Last = Last.GetNext();
        }
    }
    public T Remove()
    {
        T x = this.First.GetValue();
        this.First = this.First.GetNext();
        return x;
    }
    public override string ToString()
    {
        string str = "[";
        Node<T> Pos = First;
        while (Pos != null)
        {
            if (Pos.HasNext())
                str += Pos.GetValue() + ",";
            else
                str += Pos.GetValue();
            Pos = Pos.GetNext();
        }
        return str + "]";
    }
}
