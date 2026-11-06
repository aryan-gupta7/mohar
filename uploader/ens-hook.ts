// 0G4-T6 (out of scope for this module): after each upload, the newest root should be written to the ENS
// `mohar.log` text record, by the uploader key that holds only that record's setter role (ENS-2).
// Until ENS-2 exists this is a no-op that says so. Wire it up by implementing the body below.
export async function publishLogRoot(device: string, root: string): Promise<void> {
  console.log(`ENS hook: not configured. Would set mohar.log on ${device} to ${root}`);
}
