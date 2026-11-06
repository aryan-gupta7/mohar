// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MachineLedger
/// @notice The shared record for one electricity meter: readings, prepaid credit, arrears and
///         inspection holds. Only the meter's own on-chain account can report readings.
/// @dev A reading is the meter's cumulative pulse count. Usage is charged against prepaid credit;
///      usage that credit can't cover becomes arrears, which the next top-up pays off first.
///      Nothing here disconnects a supply: running out of credit is recorded, not enforced.
contract MachineLedger {
    // Modes a device reports. When several apply, the device reports the first in this order:
    // SAFE_STOP, INSPECT, CREDIT_STOP, RUN.
    uint8 public constant RUN = 0;
    uint8 public constant INSPECT = 1;
    uint8 public constant CREDIT_STOP = 2;
    uint8 public constant SAFE_STOP = 3;

    uint256 public constant MAX_REQUEST_ID_BYTES = 64;

    address public immutable owner;
    uint256 public immutable tariffWeiPerPulse;

    // Storage is packed so a report only rewrites slots that already exist. On this devnet creating a
    // storage slot costs about 98,600 gas (measured), close to a report frame's whole state-gas limit.

    // Slot 0: written on every report. Non-zero from bindMachine onwards.
    address public machine;
    uint64 public lastSeq;
    uint8 public lastMode;
    bool public hold;

    // Slot 1: written on every report. Non-zero from the first top-up or the first non-zero reading.
    uint64 public lastTotal;
    int96 internal balance; // prepaid credit when positive, arrears when negative
    uint96 public earned; // charged and paid, not yet withdrawn

    address public operator;

    event MachineBound(address indexed machine);
    event OperatorSet(address indexed operator);
    /// @notice Carries every reported field plus what was charged, so the full history can be rebuilt
    ///         from logs alone.
    event Report(
        uint64 indexed seq,
        uint64 total,
        uint64 usage,
        uint256 charged,
        uint256 owed,
        uint8 mode,
        uint8 reason,
        uint8 confidence,
        uint8 model,
        uint32 salt,
        bytes32 sensors,
        string requestId
    );
    event HoldSet(uint64 indexed seq);
    event HoldCleared(address indexed by);
    event TopUp(address indexed from, uint256 amount, uint256 paidArrears, uint256 credit);
    event Withdrawn(address indexed to, uint256 amount);

    error NotOwner();
    error NotOperator();
    error NotMachine();
    error AlreadyBound();
    error ZeroAddress();
    error StaleSeq();
    error TotalWentDown();
    error BadMode();
    error BadConfidence();
    error RequestIdTooLong();
    error NoHold();
    error NothingSent();
    error OverEarned();
    error Overflow();
    error TransferFailed();

    constructor(address owner_, address operator_, uint256 tariffWeiPerPulse_) {
        if (owner_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        owner = owner_;
        operator = operator_;
        tariffWeiPerPulse = tariffWeiPerPulse_;
        emit OperatorSet(operator_);
    }

    /// @notice Binds the meter's account. Works once, so a meter can't be swapped for another later.
    function bindMachine(address account) external {
        if (msg.sender != owner) revert NotOwner();
        if (machine != address(0)) revert AlreadyBound();
        if (account == address(0)) revert ZeroAddress();
        machine = account;
        emit MachineBound(account);
    }

    /// @notice A meter reading. `total` is the cumulative pulse count and can't go down.
    /// @param mode RUN, INSPECT, CREDIT_STOP or SAFE_STOP. INSPECT sets the hold; nothing else changes it.
    /// @param reason Device reason code. @param confidence 0 to 100. @param model Decision model code.
    /// @param salt Changed by the device until its signature fits the gas limit. @param sensors Packed
    ///        meter statistics, described in mechanism.md. @param requestId 0G request ID, empty if none.
    function report(
        uint64 seq,
        uint64 total,
        uint8 mode,
        uint8 reason,
        uint8 confidence,
        uint8 model,
        uint32 salt,
        bytes32 sensors,
        string calldata requestId
    ) external {
        if (msg.sender != machine) revert NotMachine();
        if (seq <= lastSeq) revert StaleSeq();
        if (total < lastTotal) revert TotalWentDown();
        if (mode > SAFE_STOP) revert BadMode();
        if (confidence > 100) revert BadConfidence();
        if (bytes(requestId).length > MAX_REQUEST_ID_BYTES) revert RequestIdTooLong();

        uint64 usage = total - lastTotal;
        uint256 charge = uint256(usage) * tariffWeiPerPulse;
        if (charge > uint256(int256(type(int96).max))) revert Overflow();
        int256 before = balance;
        int256 after_ = before - int256(charge);
        if (after_ < type(int96).min) revert Overflow();
        uint256 available = before > 0 ? uint256(before) : 0;
        uint256 charged = charge < available ? charge : available;
        uint256 owed = charge - charged;
        uint256 newEarned = uint256(earned) + charged;
        if (newEarned > type(uint96).max) revert Overflow();

        lastSeq = seq;
        lastMode = mode;
        lastTotal = total;
        balance = int96(after_);
        earned = uint96(newEarned);
        if (mode == INSPECT && !hold) {
            hold = true;
            emit HoldSet(seq);
        }

        emit Report(seq, total, usage, charged, owed, mode, reason, confidence, model, salt, sensors, requestId);
    }

    /// @notice Adds prepaid credit. Arrears are paid off first. A top-up never clears a hold.
    function topUp() public payable {
        if (msg.value == 0) revert NothingSent();
        if (msg.value > uint256(int256(type(int96).max))) revert Overflow();
        int256 before = balance;
        uint256 owedNow = before < 0 ? uint256(-before) : 0;
        uint256 paid = msg.value < owedNow ? msg.value : owedNow;
        int256 after_ = before + int256(msg.value);
        uint256 newEarned = uint256(earned) + paid;
        if (after_ > type(int96).max || newEarned > type(uint96).max) revert Overflow();
        balance = int96(after_);
        earned = uint96(newEarned);
        emit TopUp(msg.sender, msg.value, paid, credit());
    }

    /// @notice Prepaid credit left, in wei.
    function credit() public view returns (uint256) {
        int256 b = balance;
        return b > 0 ? uint256(b) : 0;
    }

    /// @notice Usage not yet paid for, in wei. The next top-up pays this first.
    function arrears() public view returns (uint256) {
        int256 b = balance;
        return b < 0 ? uint256(-b) : 0;
    }

    /// @notice A plain transfer is a top-up.
    receive() external payable {
        topUp();
    }

    /// @notice Clears an inspection hold. Only the operator can, and AI decisions can't.
    function clearHold() external {
        if (msg.sender != operator) revert NotOperator();
        if (!hold) revert NoHold();
        hold = false;
        emit HoldCleared(msg.sender);
    }

    function setOperator(address operator_) external {
        if (msg.sender != owner) revert NotOwner();
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    /// @notice The owner takes what usage has earned, never more.
    function withdraw(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        if (amount > earned) revert OverEarned();
        earned -= uint96(amount);
        emit Withdrawn(to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice What the ledger alone says the mode should be: INSPECT while held, CREDIT_STOP when
    ///         credit can't cover one more pulse, otherwise RUN. The device can only add caution to this.
    function ledgerMode() public view returns (uint8) {
        if (hold) return INSPECT;
        if (credit() < tariffWeiPerPulse) return CREDIT_STOP;
        return RUN;
    }

    function status()
        external
        view
        returns (
            uint256 credit_,
            bool hold_,
            uint64 lastSeq_,
            uint64 lastTotal_,
            uint256 tariff_,
            uint256 earned_,
            uint256 arrears_,
            uint8 lastMode_,
            uint8 ledgerMode_
        )
    {
        return (credit(), hold, lastSeq, lastTotal, tariffWeiPerPulse, earned, arrears(), lastMode, ledgerMode());
    }
}
