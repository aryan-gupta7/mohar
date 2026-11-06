export const toHex: (b: Uint8Array) => string;
export const fromHex: (h: string) => Uint8Array;
export const keccak: (x: string | Uint8Array) => string;
export const selector: (sig: string) => string;
export const namehash: (name: string) => string;
export const dnsEncode: (name: string) => string;
export const encodeCall: (sig: string, values?: any[]) => string;
export const decodeArgs: (types: string[], data: string) => any[];
export const explainRevert: (data?: string) => string;
export class RpcDead extends Error {}
export class RpcError extends Error { code?: number; data?: any }
export function rpc(url: string, method: string, params?: any[], timeoutMs?: number): Promise<any>;
export function ethCall(url: string, to: string, data: string, from?: string, value?: bigint): Promise<string>;
