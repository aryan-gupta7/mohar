// 0G Storage wrappers: upload bytes, download with proof verification. Galileo testnet.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { deployerKey } from "../signer/src/devnet.ts";

export const EVM_RPC = process.env.ZEROG_EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
export const INDEXER_RPC = process.env.ZEROG_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai";
export const CHAIN_ID_GALILEO = 16602;

const indexer = () => new Indexer(INDEXER_RPC);
export const provider = () => new ethers.JsonRpcProvider(EVM_RPC);
const wallet = () => new ethers.Wallet(deployerKey(), provider());

export const walletAddress = () => wallet().address;
export const balance = async (): Promise<bigint> => provider().getBalance(wallet().address);

/** Root hash the SDK would give these bytes, without uploading. */
export async function rootOf(bytes: Uint8Array): Promise<string> {
  const file = new MemData(Array.from(bytes) as any);
  const [tree, err] = await file.merkleTree();
  if (err !== null || !tree) throw new Error(`merkle tree: ${err}`);
  return tree.rootHash() as string;
}

export async function uploadBytes(bytes: Uint8Array): Promise<{ root: string; txHash: string; txSeq: number }> {
  const file = new MemData(Array.from(bytes) as any);
  const [res, err] = await indexer().upload(file, EVM_RPC, wallet() as any);
  if (err !== null) throw new Error(`upload failed: ${err}`);
  const r = res as any;
  return { root: r.rootHash, txHash: r.txHash, txSeq: r.txSeq };
}

/** Downloads by root with proof verification on. Returns the bytes. */
export async function downloadBytes(root: string): Promise<Uint8Array> {
  const tmp = path.join(os.tmpdir(), `mohar-dl-${process.pid}-${Date.now()}.bin`);
  const err = await indexer().download(root, tmp, true);
  if (err !== null) throw new Error(`download failed: ${err}`);
  const data = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return new Uint8Array(data);
}
