// Trial-only adapter: reuse the frozen legacy product assertions as data,
// while validating the active v2 normative locations. Never execute old code.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const includes = (file, pattern) => {
  if (!read(file).includes(pattern)) failures.push(`${file}: missing ${JSON.stringify(pattern)}`);
};

try {
  if (JSON.parse(read(".harness-v2.json")).mode !== "harness-v2-prototype") {
    throw new Error("design adapter requires a marked v2 trial");
  }
  const legacy = read(".harness-v2-legacy/check-design-contracts.mjs").replace(/\r\n/g, "\n");
  // This adapter covers the fixed #198 product base. New checker logic must be
  // explicitly adapted, not silently reduced to the subset recognized here.
  if (createHash("sha256").update(legacy).digest("hex") !== "30ac3c195708fb75cad9278ef77451833cde8f46989c555168145a9ac4a0d1e8") {
    throw new Error("unsupported legacy design guard revision; review the adapter");
  }
  const declaration = /^assertIncludes\(failures, ("(?:\\.|[^"\\])*"), ("(?:\\.|[^"\\])*")\);$/;
  let products = 0;
  for (const line of legacy.split("\n")) {
    if (!line.startsWith("assertIncludes(")) continue;
    const match = declaration.exec(line);
    if (!match) throw new Error("unrecognized design assertion");
    const file = JSON.parse(match[1]);
    if (file === "AGENTS.md" || file === "QUALITY.md") continue;
    includes(file, JSON.parse(match[2]));
    products++;
  }
  if (products !== 10) throw new Error("product assertion coverage drift");

  // Replace only the legacy governance checks; retain their source-I/O intent.
  includes("AGENTS.md", "docs/harness-v2/requirements.md");
  includes("docs/harness-v2/requirements.md", "../design/10_regression_guard_addendum.md");
  includes("docs/harness-v2/requirements.md", "Q09");
  includes("docs/design/06_source_io_spec.md", "daken_counter_v3");
  includes("docs/design/06_source_io_spec.md", "reflux");

  const screen = read("docs/design/05_screen_list.md");
  if ((screen.split(/\r?\n/, 1)[0] ?? "").startsWith("```")) {
    failures.push("docs/design/05_screen_list.md: must not start with a code fence");
  }
  if (screen.includes("## 11.4 主な操作")) {
    failures.push("docs/design/05_screen_list.md: section number drift (11.4) is not allowed");
  }
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error("V2 design contract check failed:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("V2 design contract check passed (10 product assertions + screen/source/v2 norms).");
}
