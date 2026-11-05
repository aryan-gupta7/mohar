#!/bin/sh
# Starts a fresh local ethrex node on 127.0.0.1:18545 (RPC) and 127.0.0.1:18551 (Engine API).
# Chain state is thrown away on every run. Run `node devnet/producer.ts` afterwards to make blocks.
set -e
cd "$(dirname "$0")/.."
docker rm -f mohar-ethrex >/dev/null 2>&1 || true
mkdir -p .secrets .state/devnet-secrets
[ -f .secrets/jwt.hex ] || node -e "require('fs').writeFileSync('.secrets/jwt.hex', require('crypto').randomBytes(32).toString('hex'),{mode:0o600})"
cp .secrets/jwt.hex .state/devnet-secrets/jwt.hex
chmod 644 .state/devnet-secrets/jwt.hex
node devnet/make-genesis.ts
docker run -d --name mohar-ethrex \
  -p 127.0.0.1:18545:8545 -p 127.0.0.1:18551:8551 \
  -v "$PWD/devnet:/genesis:ro" -v "$PWD/.state/devnet-secrets:/jwt:ro" \
  ghcr.io/forshtat/ethrex:eip8141-tracer-latest \
  --network=/genesis/genesis.local.json --datadir=/tmp/data \
  --http.addr=0.0.0.0 --http.port=8545 --http.api=eth,net,web3,ethrex,debug,admin,txpool \
  --authrpc.addr=0.0.0.0 --authrpc.port=8551 --authrpc.jwtsecret=/jwt/jwt.hex \
  --syncmode=full --log.level=info
