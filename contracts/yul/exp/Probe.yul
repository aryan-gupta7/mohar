// Experiment contract: reports what the frame opcodes really return on this client.
// A VERIFY frame runs as a static call, so results come back as revert data, which simulation exposes.
//
// VERIFY frame data, first byte:
//   0x00 or empty : approve the scope allowed by this frame
//   0x01          : revert with a dump of TXPARAM, SIGPARAM and FRAMEPARAM values
//   0x02          : revert with the first 64 bytes copied by SIGDATACOPY
object "Probe" {
    code {
        let size := datasize("runtime")
        datacopy(0, dataoffset("runtime"), size)
        return(0, size)
    }
    object "runtime" {
        code {
            function txparam(p) -> v { v := verbatim_1i_1o(hex"b0", p) }
            function sigparam(i, p) -> v { v := verbatim_2i_1o(hex"b4", i, p) }
            function frameparam(i, p) -> v { v := verbatim_2i_1o(hex"b3", i, p) }

            let cur := txparam(0x0a)
            let mode := byte(0, verbatim_2i_1o(hex"b1", 0, cur)) // FRAMEDATALOAD(offset 0, this frame)

            if eq(mode, 1) {
                mstore(0x000, txparam(0x00))       // TYPE
                mstore(0x020, txparam(0x01))       // NONCE
                mstore(0x040, txparam(0x02))       // SENDER
                mstore(0x060, txparam(0x03))       // MAX_PRIORITY_FEE_PER_GAS
                mstore(0x080, txparam(0x04))       // MAX_FEE
                mstore(0x0a0, txparam(0x06))       // MAX_COST (not in the EIP text)
                mstore(0x0c0, txparam(0x08))       // SIG_HASH
                mstore(0x0e0, txparam(0x09))       // FRAME_COUNT
                mstore(0x100, cur)                 // CURRENT_FRAME_INDEX
                mstore(0x120, txparam(0x0b))       // SIGNATURE_COUNT
                mstore(0x140, txparam(0x0d))       // LEGACY_NONCE
                mstore(0x160, txparam(0x0e))       // NONCE_KEY_COUNT
                mstore(0x180, txparam(0x0f))       // NONCE_KEYS_HASH
                mstore(0x1a0, txparam(0x10))       // NONCE_KEY_0
                mstore(0x1c0, sigparam(0, 0x01))   // SCHEME
                mstore(0x1e0, sigparam(0, 0x03))   // SIGNATURE_LENGTH
                mstore(0x200, frameparam(cur, 0x00)) // RESOLVED_TARGET
                mstore(0x220, frameparam(cur, 0x01)) // EXECUTION_GAS_LIMIT
                mstore(0x240, frameparam(cur, 0x02)) // MODE
                mstore(0x260, frameparam(cur, 0x03)) // FLAGS
                mstore(0x280, frameparam(cur, 0x06)) // ALLOWED_SCOPE
                revert(0, 0x2a0)
            }
            if eq(mode, 2) {
                verbatim_4i_0o(hex"b5", 0, 0, 64, 0)  // SIGDATACOPY(mem, dataOffset, length, signature)
                revert(0, 64)
            }
            // APPROVE(offset, length, scope), using the scope this frame allows
            verbatim_3i_0o(hex"aa", 0, 0, frameparam(cur, 0x06))
        }
    }
}
