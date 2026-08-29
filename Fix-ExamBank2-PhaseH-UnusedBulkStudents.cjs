const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const file = path.join(process.cwd(), "src", "TeacherPlatform.tsx");

if (!fs.existsSync(file)) {
  console.error("ERROR: src/TeacherPlatform.tsx not found.");
  process.exit(1);
}

let text = fs.readFileSync(file, "utf8");

const oldLine = 'const [bulkStudents,setBulkStudents]=useState<BulkStudent[]>([]);';
const newLine = 'const [,setBulkStudents]=useState<BulkStudent[]>([]);';

if (!text.includes(oldLine)) {
  console.error("ERROR: Expected Phase 2.0H bulkStudents line was not found. No changes made.");
  process.exit(1);
}

text = text.replace(oldLine, newLine);
fs.writeFileSync(file, text, "utf8");

console.log("Fixed unused bulkStudents state variable in src/TeacherPlatform.tsx");
console.log("");
console.log("Running project build...");
console.log("");

execSync("npm run build", {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true
});

console.log("");
console.log("Phase 2.0H TypeScript fix completed successfully.");
