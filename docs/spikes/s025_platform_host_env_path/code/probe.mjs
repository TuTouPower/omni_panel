import os from "node:os";
import path from "node:path";

console.log("platform:", process.platform);
console.log("sep:", path.sep);
console.log("join:", path.join(os.homedir(), ".claude", "projects"));
console.log("win32 sep:", path.win32.sep);
console.log("win32 join:", path.win32.join("C:\\Users\\test", ".claude", "projects"));
console.log(
  "unc:",
  path.win32.join("\\\\wsl.localhost\\Ubuntu", "home", "testuser", ".claude", "projects"),
);
