import path from "node:path";

console.log("1:", path.win32.join("\\\\wsl.localhost\\Ubuntu-22.04", "home", "testuser", ".claude", "projects"));
console.log("2:", path.join("/home/testuser", ".claude", "projects"));
console.log("3:", path.win32.join("C:\\Users\\Test", ".kimi-code", "sessions"));
console.log("4:", path.win32.join("\\\\wsl.localhost\\Ubuntu-22.04", "home", "", ".claude"));
