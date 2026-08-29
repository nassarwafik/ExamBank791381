const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const file = path.join(root, "src", "AssignmentsPanel.tsx");

if (!fs.existsSync(file)) {
  console.error("ERROR: src/AssignmentsPanel.tsx not found.");
  process.exit(1);
}

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const oldText = "[loading,setLoading]=useState(false),";
const newText = "[,setLoading]=useState(false),";

if (!text.includes(oldText)) {
  if (text.includes(newText)) {
    console.log("Fix already applied.");
  } else {
    console.error("ERROR: Expected loading state pattern was not found.");
    process.exit(1);
  }
} else {
  text = text.replace(oldText, newText);
  fs.writeFileSync(file, text, "utf8");
  console.log("Fixed unused loading state in AssignmentsPanel.tsx");
}

console.log("");
console.log("Running npm run build...");

try {
  execFileSync(
    "cmd.exe",
    ["/d", "/s", "/c", "npm run build"],
    {
      cwd: root,
      stdio: "inherit"
    }
  );
} catch {
  console.error("");
  console.error("BUILD FAILED.");
  console.error("Send the first TypeScript/build error.");
  process.exit(1);
}

console.log("");
console.log("PHASE D BUILD FIX PASSED.");
console.log("");
console.log("Next:");
console.log("git status");
