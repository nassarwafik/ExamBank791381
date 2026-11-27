// DG3 — «ولّد من الكود» (docs/enterprise-diagram-editor-design.md §15): the two readers and the diagrams they draw.
//   • SQL: CREATE TABLE in SQL Server / Access / MySQL forms, keys on the column or the table, quoted names, comments and strings that
//     carry brackets; what cannot be read is named with its line (an unclosed table, a key to a missing table or field, a type mismatch);
//   • C#: classes, abstract classes, interfaces, enums, records; fields, properties, constructors, methods (bodies skipped, strings and
//     comments blanked); bases → inheritance / interface; members typed with the code's classes → associations («*» for a collection);
//   • every generated diagram is a valid diagram@1 (it reads back through the strict reader) and sits on the page.
import { describe, it, expect } from "vitest";
import { readSqlTables, sqlToDsd, unquote, SQL_LIMITS } from "./sqlToDsd";
import { readCSharpTypes, csharpToClass, CS_LIMITS } from "./csharpToClass";
import { DIAGRAM_LIMITS, parseDiagram, serializeDiagram, type DiagramDoc } from "./diagramDoc";

const valid = (d: DiagramDoc) => {
  const r = parseDiagram(serializeDiagram(d));
  expect(r.ok, JSON.stringify(r)).toBe(true);
  for (const n of d.nodes) { expect(n.x + n.w).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasW); expect(n.y + n.h).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasH); }
};

const SCHOOL = `
-- قاعدة بيانات المدرسة
CREATE TABLE Classes (
  ClassID INT IDENTITY(1,1) PRIMARY KEY,
  ClassName NVARCHAR(30) NOT NULL UNIQUE
);
GO
CREATE TABLE [dbo].[Students] (
  [StudentID] INT NOT NULL,
  [Name] NVARCHAR(50) NOT NULL,          /* الاسم (ثلاثي) */
  Gender CHAR(1) CHECK (Gender IN ('M', 'F')),
  Note NVARCHAR(100) DEFAULT 'لا (شيء), بعد;',
  ClassID INT NOT NULL,
  CONSTRAINT PK_Students PRIMARY KEY (StudentID),
  CONSTRAINT FK_Students_Classes FOREIGN KEY (ClassID) REFERENCES Classes(ClassID)
);
CREATE TABLE Courses (CourseID INT PRIMARY KEY, Title NVARCHAR(60));
CREATE TABLE Marks (
  StudentID INT REFERENCES Students(StudentID),
  CourseID INT REFERENCES Courses,
  Mark DECIMAL(5, 2),
  PRIMARY KEY (StudentID, CourseID)
);
INSERT INTO Classes (ClassName) VALUES ('11A');`;

describe("SQL → DSD", () => {
  it("reads four tables, their keys and types, in every form a book uses", () => {
    const r = readSqlTables(SCHOOL);
    expect(r.problems).toEqual([]);
    expect(r.tables.map(t => t.name)).toEqual(["Classes", "Students", "Courses", "Marks"]);
    const students = r.tables[1];
    expect(students.columns.map(c => [c.name, c.type, c.pk, c.fk?.table ?? ""])).toEqual([
      ["StudentID", "INT", true, ""], ["Name", "NVARCHAR(50)", false, ""], ["Gender", "CHAR(1)", false, ""], ["Note", "NVARCHAR(100)", false, ""], ["ClassID", "INT", false, "Classes"],
    ]);
    expect(r.tables[0].columns[0]).toMatchObject({ name: "ClassID", type: "INT", pk: true });
    const marks = r.tables[3];
    expect(marks.columns.map(c => [c.name, c.pk, c.fk?.table, c.fk?.column])).toEqual([["StudentID", true, "Students", "StudentID"], ["CourseID", true, "Courses", "CourseID"], ["Mark", false, undefined, undefined]]);
    expect(marks.columns[2].type).toBe("DECIMAL(5,2)");
  });
  it("draws the DSD: a 1 — ∞ line from each referenced table to the table holding the key; columns by depth; a valid diagram", () => {
    const d = sqlToDsd(readSqlTables(SCHOOL));
    valid(d);
    expect(d.kind).toBe("dsd");
    const name = (id: string) => d.nodes.find(n => n.id === id)!.text.name;
    expect(d.edges.map(e => [name(e.from), name(e.to), e.type, e.fromLabel, e.toLabel])).toEqual([
      ["Classes", "Students", "oneMany", "1", "∞"], ["Students", "Marks", "oneMany", "1", "∞"], ["Courses", "Marks", "oneMany", "1", "∞"],
    ]);
    expect(d.nodes.find(n => n.text.name === "Students")!.text.fields).toBe("PK StudentID : INT\nName : NVARCHAR(50)\nGender : CHAR(1)\nNote : NVARCHAR(100)\nFK ClassID : INT");
    const x = (n: string) => d.nodes.find(v => v.text.name === n)!.x;
    expect(x("Classes")).toBeLessThan(x("Students"));
    expect(x("Students")).toBeLessThan(x("Marks"));
    // a table that points at nothing sits just before the first table that points at it: Courses beside Marks, not across Students
    expect(x("Courses")).toBe(x("Students"));
    expect(d.nodes.find(v => v.text.name === "Courses")!.y).toBeGreaterThan(d.nodes.find(v => v.text.name === "Students")!.y);
  });
  it("Access and MySQL forms; a key that is the table's only primary key is one to one", () => {
    const r = readSqlTables("CREATE TABLE `Person` (`ID` COUNTER PRIMARY KEY, `Name` TEXT(50));\nCREATE TABLE Passport (PersonID LONG PRIMARY KEY REFERENCES Person(ID), No TEXT(20)) ;");
    expect(r.tables.map(t => t.name)).toEqual(["Person", "Passport"]);
    expect(r.tables[0].columns[0]).toMatchObject({ name: "ID", type: "COUNTER", pk: true });
    expect(r.problems).toEqual([]);   // COUNTER (Access AutoNumber) against LONG is not a type mismatch
    const d = sqlToDsd(r);
    expect(d.edges[0]).toMatchObject({ type: "oneOne", fromLabel: "1", toLabel: "1" });
    valid(d);
  });
  it("names what it cannot read, with its line: an unclosed table, a missing table or field, a type mismatch, a duplicate field", () => {
    const broken = "CREATE TABLE A (\n  ID INT PRIMARY KEY,\n  Name VARCHAR(20)\n;\nCREATE TABLE B (ID INT PRIMARY KEY, AID INT REFERENCES A(ID), CID INT REFERENCES C(ID));";
    const r = readSqlTables(broken);
    expect(r.tables.map(t => t.name)).toEqual(["B"]);   // A never closed: not guessed, and it does not swallow B
    expect(r.problems.map(p => [p.line, p.message])).toEqual([
      [1, "الجدول «A» لم يُغلق: ينقصه القوس «)» في آخره."],
      [5, "الحقل «B.AID» يشير إلى جدول غير موجود في الكود: «A»."],
      [5, "الحقل «B.CID» يشير إلى جدول غير موجود في الكود: «C»."],
    ]);
    const types = readSqlTables("CREATE TABLE A (ID INT PRIMARY KEY);\nCREATE TABLE B (ID INT PRIMARY KEY, AID VARCHAR(5) REFERENCES A(ID), X INT, x INT, FOREIGN KEY (Nope) REFERENCES A(ID));");
    expect(types.problems.map(p => p.message)).toEqual([
      "في الجدول «B» الحقل «x» مكرّر.",
      "المفتاح الأجنبي للجدول «B» يذكر حقلًا غير موجود: «Nope».",
      "نوعان مختلفان: «B.AID» (VARCHAR(5)) و«A.ID» (INT).",
    ]);
    expect(readSqlTables("SELECT * FROM Students;").problems[0].message).toMatch(/لم أجد في الكود أي «CREATE TABLE»/);
    // an open table never borrows a later bracket: it ends where its statement ends
    const swallow = readSqlTables("CREATE TABLE A (ID INT PRIMARY KEY;\nCREATE TABLE B (ID INT PRIMARY KEY));");
    expect(swallow.tables.map(t => [t.name, t.columns.length])).toEqual([["B", 1]]);
    expect(swallow.problems[0].message).toBe("الجدول «A» لم يُغلق: ينقصه القوس «)» في آخره.");
  });
  it("bounds: a long code is refused; quoted names are read plainly", () => {
    expect(readSqlTables("x".repeat(SQL_LIMITS.chars + 1)).problems[0].message).toMatch(/أطول من الحد/);
    expect([unquote("[dbo].[Students]"), unquote("`Marks`"), unquote('"Courses"'), unquote("dbo.Classes")]).toEqual(["Students", "Marks", "Courses", "Classes"]);
  });
});

const SCHOOL_CS = `
using System; using System.Collections.Generic;
namespace School {
  // a person of the school
  public abstract class Person {
    protected int id;
    public string Name { get; set; } = "{x}";
    public Person(int id) { this.id = id; if (id < 0) { throw new ArgumentException("bad { id"); } }
    public abstract string Describe();
  }
  public interface IPrintable { void Print(); string Title { get; } }
  public enum Grade { Excellent = 1, Good, Pass }
  public class Student : Person, IPrintable {
    private List<Course> courses = new List<Course>();
    private Grade grade;
    public Class? Section { get; set; }
    public Student(int id, string name) : base(id) { Name = name; }
    public override string Describe() => $"Student {Name} {{ }}";
    public double GetAverage(List<double> marks, bool round = false) { return 0; }
    public void Print() { Console.WriteLine('}'); }
    public string Title => Name;
    private int a, b = 2;
  }
  public class Course { public string Code { get; set; } internal static int Count; }
  public class Class { public List<Student> Students { get; } = new(); }
  public record Mark(Student Student, Course Course, decimal Value);
}`;

describe("C# → class diagram", () => {
  it("reads the types, their kinds, bases and members; bodies, strings and comments never confuse it", () => {
    const r = readCSharpTypes(SCHOOL_CS);
    expect(r.problems).toEqual([]);
    expect(r.types.map(t => [t.name, t.kind])).toEqual([["Person", "abstract"], ["IPrintable", "interface"], ["Grade", "enum"], ["Student", "class"], ["Course", "class"], ["Class", "class"], ["Mark", "class"]]);
    const [person, printable, grade, student, course] = r.types;
    expect(person.attrs).toEqual(["# id : int", "+ Name : string"]);
    expect(person.ops).toEqual(["+ Person(id : int)", "+ Describe() : string"]);
    expect(printable.ops).toEqual(["+ Print() : void"]);
    expect(printable.attrs).toEqual(["+ Title : string"]);
    expect(grade.values).toEqual(["Excellent", "Good", "Pass"]);
    expect(student.bases).toEqual(["Person", "IPrintable"]);
    expect(student.attrs).toEqual(["- courses : List<Course>", "- grade : Grade", "+ Section : Class?", "+ Title : string", "- a : int", "- b : int"]);
    expect(student.ops).toEqual(["+ Student(id : int, name : string)", "+ Describe() : string", "+ GetAverage(marks : List<double>, round : bool) : double", "+ Print() : void"]);
    expect(course.attrs).toEqual(["+ Code : string", "~ Count : int"]);
    expect(r.types[6].attrs).toEqual(["+ Student : Student", "+ Course : Course", "+ Value : decimal"]);
  });
  it("draws the class diagram: inheritance, interface, associations with their multiplicity; parents above children; valid", () => {
    const d = csharpToClass(readCSharpTypes(SCHOOL_CS));
    valid(d);
    expect(d.kind).toBe("class");
    const name = (id: string) => d.nodes.find(n => n.id === id)!.text.name;
    expect(d.edges.map(e => [name(e.from), name(e.to), e.type, e.toLabel])).toEqual([
      ["Student", "Person", "inherit", ""], ["Student", "IPrintable", "realize", ""], ["Student", "Course", "directed", "*"], ["Student", "Class", "directed", "0..1"],
      ["Class", "Student", "directed", "*"], ["Mark", "Student", "directed", "1"], ["Mark", "Course", "directed", "1"],
    ]);
    const node = (n: string) => d.nodes.find(v => v.text.name === n)!;
    expect(node("Person").type).toBe("abstract");
    expect(node("IPrintable")).toMatchObject({ type: "interface", text: { ops: "+ Title : string\n+ Print() : void" } });
    expect(node("Grade")).toMatchObject({ type: "enum", text: { values: "Excellent\nGood\nPass" } });
    expect(node("Person").y).toBeLessThan(node("Student").y);
    expect(node("IPrintable").y).toBeLessThan(node("Student").y);
  });
  it("names what it cannot read: unbalanced braces, an unclosed class, no type at all; a long code is refused", () => {
    const r = readCSharpTypes("public class A {\n  public void F() {\n    int x = 1;\n}\npublic class B { }");
    expect(r.problems.map(p => p.message)).toEqual(["الأقواس { } غير متوازنة في الكود (3 «{» و2 «}»): قد يكون صنف أو دالة لم يُغلق.", "الصنف «A» لم يُغلق: ينقصه «}» في آخره."]);
    expect(r.types.map(t => t.name)).toEqual(["B"]);
    expect(readCSharpTypes("int x = 1; Console.WriteLine(x);").problems[0].message).toMatch(/لم أجد في الكود أي صنف/);
    expect(readCSharpTypes("x".repeat(CS_LIMITS.chars + 1)).problems[0].message).toMatch(/أطول من الحد/);
  });
  it("an unknown base starting with I + capital is an interface; other unknown bases are left out (they are not in the code)", () => {
    const r = readCSharpTypes("class Repo : DbContext, IDisposable { public void Dispose() { } }\ninterface IShape : IDisposable { double Area(); }\nclass Circle : IShape { public double R; double area; public double Area() => 3.14 * R * R; }");
    const d = csharpToClass(r);
    const name = (id: string) => d.nodes.find(n => n.id === id)!.text.name;
    expect(d.edges.map(e => [name(e.from), name(e.to), e.type])).toEqual([["Circle", "IShape", "realize"]]);
    expect(r.types[2].attrs).toEqual(["+ R : double", "- area : double"]);   // a class member without a modifier is private
    valid(d);
  });
  it("C# has one parent class: of two class bases only the first is drawn as inheritance", () => {
    const d = csharpToClass(readCSharpTypes("class B { } class C { } class A : B, C { }"));
    const name = (id: string) => d.nodes.find(n => n.id === id)!.text.name;
    expect(d.edges.map(e => [name(e.from), name(e.to), e.type])).toEqual([["A", "B", "inherit"]]);
  });
  it("a method written without its return type is named, not drawn as a constructor", () => {
    const r = readCSharpTypes("public class Student {\n  public Student() { }\n  public Print() { }\n}");
    expect(r.types[0].ops).toEqual(["+ Student()"]);
    expect(r.problems.map(p => p.message)).toEqual(["في «Student»: الدالة «Print» بلا نوع إرجاع (void أو int …)، فلم تُرسم."]);
  });
});

describe("DG3 — a table with keys is wide enough for its fields", () => {
  it("the field names start after the PK / FK column (34 px), so the box is that much wider than its longest field", async () => {
    const { layoutNode, measureText, SMALL } = await import("./diagramLayout");
    const long = "ClassName : NVARCHAR(30) NOT NULL DEFAULT";
    const doc: DiagramDoc = { kind: "dsd", edges: [], nodes: [{ id: "n1", type: "table", x: 0, y: 0, w: 150, h: 70, color: "none", text: { name: "T", fields: "PK ID : INT\n" + long } }] };
    const b = layoutNode(doc, doc.nodes[0])!;
    expect(b.w).toBeGreaterThanOrEqual(measureText(long, SMALL) + 34 + 12);
  });
});
