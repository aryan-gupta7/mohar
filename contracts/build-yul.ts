// Compiles every Yul contract in contracts/yul/ with solc. Forge can only compile one Yul file per run,
// so Solidity goes through Forge and Yul through this script. Output: contracts/out/<Name>.yul/<Name>.json
// Usage: node contracts/build-yul.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.8.28";
const SOLC = [path.join(os.homedir(), ".local/share/svm"), path.join(os.homedir(), ".svm")]
  .map((dir) => path.join(dir, VERSION, `solc-${VERSION}`))
  .find((p) => fs.existsSync(p));
const ROOT = import.meta.dirname;
const SRC = path.join(ROOT, "yul");
const OUT = path.join(ROOT, "out");

function findYul(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? findYul(p) : e.name.endsWith(".yul") ? [p] : [];
  });
}

if (!SOLC) throw new Error(`solc ${VERSION} not found. Foundry installs it the first time it builds a project that uses this version.`);

for (const file of findYul(SRC)) {
  const name = path.basename(file, ".yul");
  const input = {
    language: "Yul",
    sources: { [`${name}.yul`]: { content: fs.readFileSync(file, "utf8") } },
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 100000, details: { yul: true } },
      outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
    },
  };
  const output = JSON.parse(execFileSync(SOLC, ["--standard-json"], { input: JSON.stringify(input), maxBuffer: 1 << 28 }).toString());
  const errors = (output.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  const contract = output.contracts[`${name}.yul`][name];
  const artifact = {
    contractName: name,
    bytecode: { object: "0x" + contract.evm.bytecode.object },
    deployedBytecode: { object: "0x" + contract.evm.deployedBytecode.object },
  };
  const dir = path.join(OUT, `${name}.yul`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(artifact, null, 2) + "\n");
  console.log(`${name}: creation ${contract.evm.bytecode.object.length / 2} bytes, runtime ${contract.evm.deployedBytecode.object.length / 2} bytes`);
}
