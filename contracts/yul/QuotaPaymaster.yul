// QuotaPaymaster: pays gas for registered machine accounts, within a policy the fleet owner sets.
// A stolen device key can only spend what its policy allows, and the owner can revoke a device or pause everything.
//
// The public mempool can't accept this contract. Validation reads the paymaster's own storage, and the canonical
// rules only allow a validating frame to read the sender's storage. That storage read is what needs the alt mempool.
//
// Written in Yul so validation stays small. All validation shares a 100,000 gas budget with the signature check.
//
// Storage:
//   slot 0                     owner
//   slot 1                     paused flag (fleet-wide)
//   keccak(device . 2)         policy word, four 64-bit fields, high to low:
//                              remaining | dailyLimit | lastRefill | maxCostGwei
//
// Entry points:
//   empty calldata, VERIFY frame     validate and approve payment
//   settle()                         DEFAULT frame after payment: charge one transaction to the sender's quota
//   refill(address)                  anyone: restore a device's quota once 24 hours have passed
//   policyOf(address), paused(), owner()
//   setPolicy(address,uint64,uint64) owner: register or change a device, restoring its quota
//   revoke(address)                  owner
//   setPaused(bool)                  owner
//   withdraw(address,uint256)        owner
//   deposit()                        anyone: add funds. A plain transfer can't work, since empty calldata means VERIFY.
object "QuotaPaymaster" {
    code {
        // constructor(address registry, uint256 stake, uint256 unstakeDelay)
        let argBytes := 96
        codecopy(0, sub(codesize(), argBytes), argBytes)
        let registry := mload(0)
        let stake := mload(32)
        let unstakeDelay := mload(64)
        sstore(0, caller())
        if stake {
            mstore(0, shl(224, 0x0396cb60)) // addStake(uint32)
            mstore(4, unstakeDelay)
            if iszero(call(gas(), registry, stake, 0, 36, 0, 0)) { revert(0, 0) }
        }
        let size := datasize("runtime")
        datacopy(0, dataoffset("runtime"), size)
        return(0, size)
    }

    object "runtime" {
        code {
            function txparam(p) -> v { v := verbatim_1i_1o(hex"b0", p) }
            function frameparam(i, p) -> v { v := verbatim_2i_1o(hex"b3", i, p) }
            function policySlot(device) -> s {
                mstore(0, device)
                mstore(0x20, 2)
                s := keccak256(0, 0x40)
            }
            function onlyOwner() { if iszero(eq(caller(), sload(0))) { revert(0, 0) } }
            function u64(x) -> v { v := and(x, 0xffffffffffffffff) }

            if iszero(calldatasize()) {
                // VERIFY path: reads only. Frame layout is fixed, so nothing can skip settling or overspend.
                let self := address()
                if iszero(eq(txparam(0x09), 4)) { revert(0, 0) }                  // exactly four frames
                if iszero(eq(txparam(0x0a), 1)) { revert(0, 0) }                  // this is frame 1
                if iszero(eq(frameparam(3, 0x02), 0)) { revert(0, 0) }            // frame 3 is DEFAULT
                if iszero(eq(frameparam(3, 0x00), self)) { revert(0, 0) }         // and targets this paymaster
                if iszero(eq(shr(224, verbatim_2i_1o(hex"b1", 0, 3)), 0x11da60b4)) { revert(0, 0) } // settle()
                if lt(frameparam(3, 0x01), 40000) { revert(0, 0) }                // and has enough gas to finish
                if sload(1) { revert(0, 0) }                                      // fleet-wide pause
                let policy := sload(policySlot(txparam(0x02)))
                if iszero(shr(192, policy)) { revert(0, 0) }                      // quota left
                if gt(txparam(0x06), mul(u64(policy), 1000000000)) { revert(0, 0) } // MAX_COST within the cap
                verbatim_3i_0o(hex"aa", 0, 0, 1)                                  // APPROVE(PAYMENT)
            }

            let selector := shr(224, calldataload(0))
            switch selector
            case 0x11da60b4 { // settle()
                if iszero(eq(caller(), 0xaa)) { revert(0, 0) }
                let slot := policySlot(txparam(0x02))
                let policy := sload(slot)
                if shr(192, policy) { policy := sub(policy, shl(192, 1)) }
                sstore(slot, policy)
                log2(0, 0, 0xefb6205dbe155ded2c6cd1c00ae5941f650b076f7ea0823645364b1aa1b418a4, txparam(0x02)) // Settled(address)
                stop()
            }
            case 0x833f43c2 { // refill(address)
                let device := calldataload(4)
                let slot := policySlot(device)
                let policy := sload(slot)
                let dailyLimit := u64(shr(128, policy))
                if iszero(dailyLimit) { revert(0, 0) }
                let lastRefill := u64(shr(64, policy))
                if lt(timestamp(), add(lastRefill, 86400)) { revert(0, 0) }
                sstore(slot, or(or(or(shl(192, dailyLimit), shl(128, dailyLimit)), shl(64, timestamp())), u64(policy)))
                stop()
            }
            case 0xf514d6e5 { // policyOf(address)
                mstore(0, sload(policySlot(calldataload(4))))
                return(0, 32)
            }
            case 0x5c975abb { // paused()
                mstore(0, sload(1))
                return(0, 32)
            }
            case 0x8da5cb5b { // owner()
                mstore(0, sload(0))
                return(0, 32)
            }
            case 0xf0d0a614 { // setPolicy(address,uint64,uint64): device, dailyLimit, maxCostGwei
                onlyOwner()
                let dailyLimit := u64(calldataload(36))
                let word := or(or(or(shl(192, dailyLimit), shl(128, dailyLimit)), shl(64, timestamp())), u64(calldataload(68)))
                sstore(policySlot(calldataload(4)), word)
                stop()
            }
            case 0x74a8f103 { // revoke(address)
                onlyOwner()
                sstore(policySlot(calldataload(4)), 0)
                stop()
            }
            case 0x16c38b3c { // setPaused(bool)
                onlyOwner()
                sstore(1, iszero(iszero(calldataload(4))))
                stop()
            }
            case 0xf3fef3a3 { // withdraw(address,uint256)
                onlyOwner()
                if iszero(call(gas(), calldataload(4), calldataload(36), 0, 0, 0, 0)) { revert(0, 0) }
                stop()
            }
            case 0xd0e30db0 { // deposit()
                stop()
            }
            default { revert(0, 0) }
        }
    }
}
