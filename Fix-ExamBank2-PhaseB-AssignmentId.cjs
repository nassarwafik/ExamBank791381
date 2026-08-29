const fs = require("fs");
const { execFileSync } = require("child_process");
const path = require("path");

const root = process.cwd();
const file = path.join(root, "api", "src", "functions", "student-assignment.js");

if (!fs.existsSync(file)) {
  console.error("ERROR: student-assignment.js not found.");
  process.exit(1);
}

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const oldHandler = 'handler:async(request,context)=>{';
const oldLine = 'const id=String(context.params.assignmentId||"");const c=getContainer();';

if (!text.includes(oldHandler) || !text.includes(oldLine)) {
  if (text.includes('request.params?.assignmentId')) {
    console.log("Fix already applied.");
    process.exit(0);
  }

  console.error("ERROR: Expected Phase B code was not found.");
  process.exit(1);
}

text = text.replace(oldHandler, 'handler:async(request)=>{');

text = text.replace(
  oldLine,
  'const id=String(request.params?.assignmentId||"");const c=getContainer();if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};'
);

fs.writeFileSync(file, text, "utf8");

console.log("Checking backend syntax...");
execFileSync(process.execPath, ["--check", file], {
  cwd: root,
  stdio: "inherit"
});

console.log("Running npm run build...");
execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
  cwd: root,
  stdio: "inherit"
});

console.log("");
console.log("PHASE B ASSIGNMENT ROUTE FIX PASSED.");
console.log("");
console.log('git add api/src/functions/student-assignment.js');
console.log('git commit -m "Fix student assignment route parameter"');
console.log("git push");
