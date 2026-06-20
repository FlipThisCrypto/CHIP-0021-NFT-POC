import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "CLAUDE.md",
  "specs/tree-nft-metadata.md",
  "specs/device-registration.md",
  "specs/oracle-api.md",
  "specs/growth-rules.md",
  "lib/growth.js",
  "prototypes/living-tree-renderer/index.html",
  "prototypes/device-binding-demo/binding-demo.mjs",
];

let failures = 0;

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail = "") {
  failures += 1;
  console.error(`FAIL ${label}${detail ? `\n     ${detail}` : ""}`);
}

function run(label, command, args, expectedText) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    fail(label, `exit ${result.status}\n${output.trim()}`);
    return;
  }
  if (expectedText && !output.includes(expectedText)) {
    fail(label, `expected output to include: ${expectedText}\n${output.trim()}`);
    return;
  }
  pass(label);
}

function checkRequiredFiles() {
  const missing = requiredFiles.filter((file) => !existsSync(resolve(root, file)));
  if (missing.length) fail("required files exist", `missing: ${missing.join(", ")}`);
  else pass("required files exist");
}

function checkDocsReferenceCanonicalGrowth() {
  const files = [
    "README.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "specs/growth-rules.md",
    "specs/tree-nft-metadata.md",
  ];
  const missing = files.filter(
    (file) => !readFileSync(resolve(root, file), "utf8").includes("lib/growth.js")
  );
  if (missing.length) fail("docs point to canonical growth rules", `missing reference: ${missing.join(", ")}`);
  else pass("docs point to canonical growth rules");
}

async function checkGrowthDeterminism() {
  const growth = await import(pathToFileURL(resolve(root, "lib/growth.js")).href);
  const input = {
    dna_seed: "TREE-demo",
    species: "oak",
    shape_variant: "wide",
    state: {
      uptimeDays: 120,
      verifiedSensors: ["gps", "temperature", "humidity", "pressure"],
      healthScore: 96,
      consistentReporting: true,
      uptimeScore: 98,
      seasons: 7,
      season: 1,
      badges: ["genesis"],
    },
  };
  const a = growth.buildRecipe(input);
  const b = growth.buildRecipe(input);
  const expectedFruit = ["orange", "blueberry", "apple"];
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail("growth recipe is deterministic", "same input produced different recipes");
    return;
  }
  if (a.growth_stage !== "fruiting_tree" || JSON.stringify(a.fruit) !== JSON.stringify(expectedFruit)) {
    fail("growth recipe matches canonical fixture", JSON.stringify(a));
    return;
  }
  pass("growth recipe is deterministic");
}

checkRequiredFiles();
checkDocsReferenceCanonicalGrowth();
run("growth self-test", "node", ["lib/growth.js"], "6/6 stages as expected");
run("device binding demo", "node", ["prototypes/device-binding-demo/binding-demo.mjs"], "10 passed, 0 failed");
await checkGrowthDeterminism();

if (failures) {
  console.error(`\n${failures} consistency check(s) failed.`);
  process.exit(1);
}

console.log("\nAll consistency checks passed.");
