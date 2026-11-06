#!/usr/bin/env bash
# Runs the ERC-8421 alt mempool sidecar against the LOCAL chain, with the public devnet's rules:
# minimum stake 0.01 ETH, staking registry 0xd51c…2d2f, admission reports on.
# Start ./devnet/up.sh and the producer first. RPC: http://127.0.0.1:14337/rpc
# Then use MOHAR_NET=local-alt to submit through it.
#
# Source: the sidecar at a pinned commit. Set SIDECAR_SRC to reuse an existing build; otherwise it's
# cloned into .state/sidecar-src (git-ignored, about 1 GB with dependencies).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO=https://github.com/forshtat/mempool-workshop-sidecar
COMMIT=2e22ff0a2898e69ea4bf5275bce1be8581a8582a
SRC=${SIDECAR_SRC:-$ROOT/.state/sidecar-src}
STATE=$ROOT/.state/sidecar
KEY_FILE=$ROOT/.secrets/sidecar-relayer.key
CHAIN_RPC=http://127.0.0.1:18545

if [ ! -f "$SRC/packages/cli/bin/skandha.js" ] || [ ! -d "$SRC/packages/node/lib" ]; then
  echo "building the sidecar at $COMMIT in $SRC"
  [ -d "$SRC/.git" ] || git clone "$REPO" "$SRC"
  git -C "$SRC" checkout --quiet "$COMMIT"
  (cd "$SRC" && bun install --frozen-lockfile && bun run build)
fi
HEAD=$(git -C "$SRC" rev-parse HEAD)
[ "$HEAD" = "$COMMIT" ] || echo "warning: sidecar source is at $HEAD, not the pinned $COMMIT" >&2

cast chain-id --rpc-url "$CHAIN_RPC" >/dev/null 2>&1 || { echo "local chain not reachable at $CHAIN_RPC: run ./devnet/up.sh and the producer" >&2; exit 1; }

# A local-only relayer key. Never the devnet's published keys.
mkdir -p "$ROOT/.secrets" "$STATE"
chmod 700 "$ROOT/.secrets"
if [ ! -f "$KEY_FILE" ]; then
  (umask 077 && printf '0x%s\n' "$(openssl rand -hex 32)" > "$KEY_FILE")
fi
RELAYER=$(cd "$ROOT" && MOHAR_NET=local node devnet/fund.ts "$KEY_FILE" 10)
echo "relayer $RELAYER funded on the local chain"

(umask 077 && cat > "$STATE/config.json" <<EOF
{
  "entryPoints": ["0x00000000000000000000000000000000000000aa"],
  "canonicalEntryPoint": "0x00000000000000000000000000000000000000aa",
  "standardMempoolId": "QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk",
  "supportedMempools": [
    { "mempoolId": "QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk", "entryPoint": "0x00000000000000000000000000000000000000aa" }
  ],
  "relayers": ["$(tr -d '\n' < "$KEY_FILE")"],
  "rpcEndpoint": "$CHAIN_RPC",
  "stakingRegistryAddress": "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f",
  "minStake": "10000000000000000"
}
EOF
)

rm -rf "$STATE/data"
echo "sidecar starting on http://127.0.0.1:14337/rpc"
cd "$SRC"
exec bun --bun ./packages/cli/bin/skandha.js standalone \
  --configFile "$STATE/config.json" \
  --dataDir "$STATE/data" \
  --redirectRpc \
  --executor.bundlingMode auto \
  --explorer.enable \
  --api.address 127.0.0.1 \
  --api.port 14337
