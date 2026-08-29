const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const file = path.join(process.cwd(), "src", "TeacherPlatform.tsx");

if (!fs.existsSync(file)) {
  console.error("ERROR: src/TeacherPlatform.tsx not found.");
  process.exit(1);
}

let text = fs.readFileSync(file, "utf8");

const oldText = '.filter(x=>x.firstName||x.familyName||x.identityNumber);';
const newText = '.filter((x:{firstName:string;familyName:string;identityNumber:string})=>x.firstName||x.familyName||x.identityNumber);';

if (!text.includes(oldText)) {
  console.error("ERROR: Expected PhaseF2 line was not found. No file was changed.");
  process.exit(1);
}

text = text.replace(oldText, newText);
fs.writeFileSync(file, text, "utf8");

console.log("Fixed TypeScript type in src/TeacherPlatform.tsx");
console.log("");
console.log("Running project build...");
console.log("");

execSync("npm run build", {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true
});

console.log("");
console.log("Phase 2.0F2 TypeScript fix completed successfully.");
