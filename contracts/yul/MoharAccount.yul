// MoharAccount: a machine's on-chain account, authorised only by the machine's own hash-based signature.
//
// Scheme: WOTS-like one-time signatures (w=16, 32-byte Keccak-256) under a fixed Merkle root of 256 keys.
// The transaction's nonce selects the key, so the protocol's nonce handling is also the one-time-use guard.
// This is a custom, unaudited construction. It is not LMS, XMSS or WOTS+.
//
// Written in Yul because Solidity can't emit the frame opcodes without calling helper contracts, and the
// public devnet caps all validation at 100,000 gas. Each helper would cost a 2,600 gas cold call.
//
// Frame opcodes used:
//   TXPARAM 0xb0, FRAMEDATALOAD 0xb1, FRAMEPARAM 0xb3, SIGPARAM 0xb4, SIGDATACOPY 0xb5, APPROVE 0xaa
//
// Signature layout (2,400 bytes): 67 chain values, then 8 Merkle siblings, 32 bytes each.
object "MoharAccount" {
    code {
        // constructor(bytes32 root, bytes32 pubSeedHigh, address target, uint256 selector,
        //             address registry, uint256 stake, uint256 unstakeDelay)
        // Encoded as seven words appended to the creation code.
        let argBytes := 224
        codecopy(0, sub(codesize(), argBytes), argBytes)
        let root := mload(0)
        let pubSeed := mload(32)
        let target := mload(64)
        let selector := mload(96)
        let registry := mload(128)
        let stake := mload(160)
        let unstakeDelay := mload(192)

        // Stake from the constructor: the registry keys on msg.sender, and the account can't pass validation
        // for a staking transaction until it already has whatever standing validation requires.
        if stake {
            mstore(0, shl(224, 0x0396cb60)) // addStake(uint32)
            mstore(4, unstakeDelay)
            if iszero(call(gas(), registry, stake, 0, 36, 0, 0)) { revert(0, 0) }
        }

        let size := datasize("runtime")
        datacopy(0, dataoffset("runtime"), size)
        setimmutable(0, "root", root)
        setimmutable(0, "pubSeed", pubSeed)
        setimmutable(0, "target", target)
        setimmutable(0, "selector", selector)
        return(0, size)
    }

    object "runtime" {
        code {
            function txparam(p) -> v { v := verbatim_1i_1o(hex"b0", p) }
            function frameparam(i, p) -> v { v := verbatim_2i_1o(hex"b3", i, p) }

            // Reject any malformed transaction. Everything below is also covered by SIG_HASH, except
            // the signature bytes, so these checks matter when the device key itself has been stolen.
            if iszero(eq(txparam(0x0b), 1)) { revert(0, 0) }                      // exactly one signature
            if iszero(eq(verbatim_2i_1o(hex"b4", 0, 3), 2400)) { revert(0, 0) }   // exact length; halts unless ARBITRARY
            if iszero(eq(txparam(0x0e), 1)) { revert(0, 0) }                      // exactly one nonce key
            if txparam(0x10) { revert(0, 0) }                                     // key 0: the account's linear nonce

            // A contract's nonce starts at 1, so the first transaction uses key 0.
            let leaf := sub(txparam(0x01), 1)
            if iszero(lt(leaf, 256)) { revert(0, 0) }

            // Every SENDER frame must be a zero-value call to the one allowed function.
            // This is what stops a stolen key from unstaking, moving funds or calling anything else.
            let target := loadimmutable("target")
            let selector := loadimmutable("selector")
            let frameCount := txparam(0x09)
            for { let i := 0 } lt(i, frameCount) { i := add(i, 1) } {
                if eq(frameparam(i, 0x02), 2) {
                    if iszero(eq(frameparam(i, 0x00), target)) { revert(0, 0) }
                    if frameparam(i, 0x08) { revert(0, 0) }
                    if iszero(eq(shr(224, verbatim_2i_1o(hex"b1", 0, i)), selector)) { revert(0, 0) }
                }
            }

            // Bring the signature into memory: SIGDATACOPY(memOffset, dataOffset, length, signatureIndex).
            verbatim_4i_0o(hex"b5", 0x80, 0, 2400, 0)

            // Walk each chain to its end, overwriting the signature with the public key in place.
            // Tweak word: pubSeed (high 16 bytes) | leaf (4 bytes) | chain (4 bytes) | step (8 bytes).
            let digest := txparam(0x08)
            let leafPrefix := or(loadimmutable("pubSeed"), shl(96, leaf))
            let csum := 0
            for { let i := 0 } lt(i, 67) { i := add(i, 1) } {
                let d
                switch lt(i, 64)
                case 1 {
                    d := and(shr(sub(252, shl(2, i)), digest), 15)
                    csum := add(csum, sub(15, d))
                }
                default {
                    d := and(shr(shl(2, sub(66, i)), csum), 15)
                }
                let p := add(0x80, shl(5, i))
                let v := mload(p)
                let chainPrefix := or(leafPrefix, shl(64, i))
                let t := or(chainPrefix, d)
                let end := or(chainPrefix, 15)
                for { } lt(t, end) { t := add(t, 1) } {
                    mstore(0, v)
                    mstore(0x20, t)
                    v := keccak256(0, 0x40)
                }
                mstore(p, v)
            }

            // Hash the 67 public values into a leaf, then climb the tree using the leaf index.
            let node := keccak256(0x80, 2144)
            let idx := leaf
            for { let j := 0 } lt(j, 8) { j := add(j, 1) } {
                let sibling := mload(add(2272, shl(5, j))) // siblings start at 0x80 + 2144
                switch and(idx, 1)
                case 0 {
                    mstore(0, node)
                    mstore(0x20, sibling)
                }
                default {
                    mstore(0, sibling)
                    mstore(0x20, node)
                }
                node := keccak256(0, 0x40)
                idx := shr(1, idx)
            }
            if iszero(eq(node, loadimmutable("root"))) { revert(0, 0) }

            // APPROVE(offset, length, scope): grants exactly what this frame is flagged for.
            verbatim_3i_0o(hex"aa", 0, 0, frameparam(txparam(0x0a), 0x06))
        }
    }
}
