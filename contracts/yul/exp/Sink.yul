// Experiment contract: accepts any call and logs its calldata. Stands in for the ledger in early tests.
object "Sink" {
    code {
        let size := datasize("runtime")
        datacopy(0, dataoffset("runtime"), size)
        return(0, size)
    }
    object "runtime" {
        code {
            calldatacopy(0, 0, calldatasize())
            log1(0, calldatasize(), caller())
        }
    }
}
