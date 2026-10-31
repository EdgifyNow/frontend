// The website chat shows the assistant's reply formatted - **bold**, links
// that open - and never as markup of its own. Real public/js/widget.js.
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "public", "js", "widget.js"), "utf8");
const pick = (name) => {
  const from = source.indexOf("function " + name + "(");
  return source.slice(from, source.indexOf("\n  }", from) + 4);
};
const formatReply = new Function(pick("esc") + "\n" + pick("formatReply") + "\nreturn formatReply;")();

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error("FAIL: " + msg); failures++; } else { console.log("pass: " + msg); } }

assert(formatReply("We're open **9 to 5**.") === "We're open <b>9 to 5</b>.", "bold");
assert(formatReply("Book at [our site](https://glow.example.com/book)").includes('<a href="https://glow.example.com/book" target="_blank" rel="noopener noreferrer">our site</a>'), "a markdown link opens");
assert(formatReply("See https://glow.example.com today").includes('>https://glow.example.com</a> today'), "a bare address is a link");
assert(formatReply("line one\nline two") === "line one<br>line two", "line breaks kept");
assert(formatReply('<img src=x onerror="alert(1)">') === "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;", "a reply can never inject markup");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
