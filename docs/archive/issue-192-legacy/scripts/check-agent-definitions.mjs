import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const agentsDir = path.join(repoRoot, ".codex", "agents");
const skillsDir = path.join(repoRoot, ".codex", "skills");
const projectConfigPath = path.join(repoRoot, ".codex", "config.toml");
const kebabNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const approvedModels = new Set([
  "gpt-6.1-sol",
  "gpt-5.6",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
]);

const expectedAgents = new Set([
  "strategy-orchestrator",
  "spec-designer",
  "execution-coordinator",
  "front-implementer",
  "server-implementer",
  "contract-auditor",
  "implementation-auditor",
  "improvement-analyst",
]);

const requiredTopLevelKeys = [
  "name",
  "description",
  "model_reasoning_effort",
  "developer_instructions",
];

const forbiddenTopLevelKeys = ["reasoning_effort"];

const requiredInstructionHeadings = [
  "Mission",
  "Scope",
  "Input contract",
  "Required outputs",
  "Prohibited behavior",
  "Success condition",
  "Escalation conditions",
];

const deprecatedAgentNames = [
  ["design", "facilitator"],
  ["spec", "normalizer"],
  ["contract", "design", "reviewer"],
].map((parts) => parts.join("-"));

const deprecatedAgentReferences = new Set([
  ...deprecatedAgentNames,
  ...deprecatedAgentNames.map((name) => name.replace(/-/g, "_")),
]);

/**
 * @param {string} targetPath
 * @returns {string}
 */
function readUtf8(targetPath) {
  return readFileSync(targetPath, "utf8");
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function extractTomlName(text) {
  const match = text.match(/^\s*name\s*=\s*"([^"\r\n]+)"\s*$/m);
  return match === null ? null : match[1];
}

/**
 * @param {string} text
 * @param {string} key
 * @returns {string | null}
 */
function extractTomlString(text, key) {
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*"([^"\\r\\n]+)"\\s*$`, "m");
  const match = text.match(pattern);
  return match === null ? null : match[1];
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function extractDeveloperInstructions(text) {
  const match = text.match(/developer_instructions\s*=\s*"""\r?\n([\s\S]*?)\r?\n"""/m);
  return match === null ? null : match[1];
}

/**
 * @param {string} text
 * @param {string} key
 * @returns {boolean}
 */
function hasTopLevelKey(text, key) {
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`, "m");
  return pattern.test(text);
}

/**
 * @param {string} input
 * @returns {string}
 */
function toPosix(input) {
  return input.replace(/\\/g, "/");
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} directory
 * @param {(fileName: string) => boolean} includeFile
 * @returns {string[]}
 */
function collectFilesRecursive(directory, includeFile) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(entryPath, includeFile));
    } else if (entry.isFile() && includeFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * @param {string} model
 * @param {string} source
 * @param {string[]} failures
 */
function validateModel(model, source, failures) {
  if (!approvedModels.has(model)) {
    failures.push(`${source}: unsupported repository model "${model}"`);
  }
}

const failures = [];

const projectConfigText = readUtf8(projectConfigPath);
const relativeProjectConfig = toPosix(path.relative(repoRoot, projectConfigPath));
const defaultModel = extractTomlString(projectConfigText, "model");
const defaultSubagentModel = extractTomlString(projectConfigText, "default_subagent_model");

if (defaultModel === null) {
  failures.push(`${relativeProjectConfig}: missing model`);
} else {
  validateModel(defaultModel, relativeProjectConfig, failures);
}

if (defaultSubagentModel === null) {
  failures.push(`${relativeProjectConfig}: missing agents.default_subagent_model`);
} else {
  validateModel(defaultSubagentModel, relativeProjectConfig, failures);
}

if (!/^\s*max_concurrent_threads_per_session\s*=\s*\d+\s*$/m.test(projectConfigText)) {
  failures.push(`${relativeProjectConfig}: missing agents.max_concurrent_threads_per_session`);
}

for (const legacyKey of ["max_threads", "max_depth"]) {
  const legacyPattern = new RegExp(`^\\s*${escapeRegex(legacyKey)}\\s*=`, "m");
  if (legacyPattern.test(projectConfigText)) {
    failures.push(`${relativeProjectConfig}: legacy or unsupported agents key "${legacyKey}" is not allowed`);
  }
}

const tomlFiles = readdirSync(agentsDir)
  .filter((entry) => entry.endsWith(".toml"))
  .sort((left, right) => left.localeCompare(right));

const skillFiles = collectFilesRecursive(
  skillsDir,
  (fileName) => fileName === "SKILL.md" || fileName === "openai.yaml",
).sort((left, right) => left.localeCompare(right));

if (tomlFiles.length === 0) {
  failures.push(".codex/agents: no TOML agent definitions found");
}

const discoveredNames = [];
const seenNames = new Set();

for (const fileName of tomlFiles) {
  const tomlPath = path.join(agentsDir, fileName);
  const tomlText = readUtf8(tomlPath);
  const relativeToml = toPosix(path.relative(repoRoot, tomlPath));
  const baseName = path.basename(fileName, ".toml");

  const tomlName = extractTomlName(tomlText);
  if (tomlName === null) {
    failures.push(`${relativeToml}: missing top-level name`);
    continue;
  }

  discoveredNames.push(tomlName);

  if (seenNames.has(tomlName)) {
    failures.push(`${relativeToml}: duplicated name \"${tomlName}\"`);
  }
  seenNames.add(tomlName);

  if (!kebabNamePattern.test(tomlName)) {
    failures.push(`${relativeToml}: name \"${tomlName}\" must be kebab-case`);
  }

  if (tomlName !== baseName) {
    failures.push(`${relativeToml}: name \"${tomlName}\" must match filename base \"${baseName}\"`);
  }

  for (const key of requiredTopLevelKeys) {
    if (!hasTopLevelKey(tomlText, key)) {
      failures.push(`${relativeToml}: missing required key \"${key}\"`);
    }
  }

  for (const key of forbiddenTopLevelKeys) {
    if (hasTopLevelKey(tomlText, key)) {
      failures.push(`${relativeToml}: forbidden key \"${key}\" is not allowed`);
    }
  }

  const agentModel = extractTomlString(tomlText, "model");
  if (agentModel !== null) {
    validateModel(agentModel, relativeToml, failures);
  }

  const developerInstructions = extractDeveloperInstructions(tomlText);
  if (developerInstructions === null) {
    failures.push(`${relativeToml}: developer_instructions must be a triple-quoted block`);
    continue;
  }

  for (const heading of requiredInstructionHeadings) {
    const headingPattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
    if (!headingPattern.test(developerInstructions)) {
      failures.push(`${relativeToml}: missing required heading \"## ${heading}\" in developer_instructions`);
    }
  }
}

for (const expectedName of expectedAgents) {
  if (!seenNames.has(expectedName)) {
    failures.push(`.codex/agents: missing expected agent \"${expectedName}\"`);
  }
}

for (const discoveredName of discoveredNames) {
  if (!expectedAgents.has(discoveredName)) {
    failures.push(`.codex/agents: unexpected agent \"${discoveredName}\"`);
  }
}

const filesToScan = [
  path.join(repoRoot, "AGENTS.md"),
  path.join(repoRoot, "WORKFLOW.md"),
  path.join(repoRoot, "QUALITY.md"),
  path.join(repoRoot, "apps", "client", "AGENTS.md"),
  path.join(repoRoot, "apps", "worker", "AGENTS.md"),
  path.join(repoRoot, "packages", "shared", "AGENTS.md"),
  ...tomlFiles.map((entry) => path.join(agentsDir, entry)),
  ...skillFiles,
];

for (const kebabName of discoveredNames) {
  const snakeAlias = kebabName.replace(/-/g, "_");
  const aliasPattern = new RegExp(`\\b${escapeRegex(snakeAlias)}\\b`, "g");

  for (const filePath of filesToScan) {
    const text = readUtf8(filePath);
    const relativePath = toPosix(path.relative(repoRoot, filePath));
    if (aliasPattern.test(text)) {
      failures.push(`${relativePath}: snake_case alias \"${snakeAlias}\" is not allowed`);
      aliasPattern.lastIndex = 0;
    }
  }
}

for (const deprecatedReference of deprecatedAgentReferences) {
  const deprecatedPattern = new RegExp(`\\b${escapeRegex(deprecatedReference)}\\b`, "g");
  for (const filePath of filesToScan) {
    const text = readUtf8(filePath);
    const relativePath = toPosix(path.relative(repoRoot, filePath));
    if (deprecatedPattern.test(text)) {
      failures.push(`${relativePath}: deprecated agent reference \"${deprecatedReference}\" is not allowed`);
      deprecatedPattern.lastIndex = 0;
    }
  }
}

const windowsAbsolutePathPattern = /\b[A-Za-z]:[\\/]/g;
for (const skillFile of skillFiles) {
  const text = readUtf8(skillFile);
  const relativePath = toPosix(path.relative(repoRoot, skillFile));
  if (windowsAbsolutePathPattern.test(text)) {
    failures.push(`${relativePath}: machine-specific absolute Windows path is not allowed`);
    windowsAbsolutePathPattern.lastIndex = 0;
  }
}

if (failures.length > 0) {
  console.error("Agent definition check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Agent definition check passed. (${discoveredNames.length} agents)`);
