// Read-only. Confirms the Sepolia ENSv2 deployment is what config.ts expects, and prices the name. Spends nothing.
// Usage: node ens/00-check.ts [label=mohar]
import { client, ADDR, REGISTRAR_ABI } from "./config.ts";
const label = process.argv[2] ?? "mohar";
const code = async (a: string) => ((await client.getCode({ address: a as `0x${string}` })) ?? "0x").length > 2;

console.log("chain", await client.getChainId());
for (const [name, a] of Object.entries(ADDR)) console.log(`${(await code(a)) ? "code " : "NONE "} ${name} ${a}`);
const reg = ADDR.ETHRegistrar;
const read = (functionName: any, args: any[] = []) => client.readContract({ address: reg, abi: REGISTRAR_ABI, functionName, args } as any);
console.log("registrar's ETH_REGISTRY equals ours:", ((await read("ETH_REGISTRY")) as string).toLowerCase() === ADDR.ETHRegistry);
const [minAge, maxAge, minDur] = await Promise.all([read("MIN_COMMITMENT_AGE"), read("MAX_COMMITMENT_AGE"), read("MIN_REGISTER_DURATION")]);
console.log(`commit must age ${minAge}s, expires after ${maxAge}s; minimum registration ${minDur}s (${Number(minDur) / 86400} days)`);
for (const l of [label, `${label}fleet`, `${label}-meter`]) {
  const free = await read("isAvailable", [l]);
  let price = "n/a";
  if (free) {
    const [base, premium] = (await read("getRegisterPrice", [l, minDur, ADDR.MockUSDC])) as [bigint, bigint];
    price = `${Number(base + premium) / 1e6} test USDC for the minimum term`;
  }
  console.log(`${l}.eth: ${free ? "available" : "TAKEN"}  ${price}`);
}
