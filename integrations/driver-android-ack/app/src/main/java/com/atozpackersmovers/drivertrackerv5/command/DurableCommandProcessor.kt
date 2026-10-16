package com.atozpackersmovers.drivertrackerv5.command

import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout

interface CommandRecordStore {
    suspend fun previous(commandId: String): CommandRecordEntity?
    suspend fun latest(driverId: String, vehicleId: String): CommandRecordEntity?
    suspend fun begin(command: TripCommand, nowMs: Long): Boolean
    suspend fun finish(record: CommandRecordEntity)
    suspend fun pending(driverId: String, vehicleId: String): List<CommandRecordEntity>
}

/** Existing Room columns are the outbox: a final result is durable before any delivery attempt. */
class DurableCommandProcessor(private val store: CommandRecordStore, private val channel: AcknowledgementChannel) {
    private val mutex = Mutex()

    suspend fun process(
        command: TripCommand,
        assignment: DriverAssignment,
        now: Long,
        failure: (String, String) -> CommandAcknowledgement,
        execute: suspend () -> CommandAcknowledgement,
    ): CommandAcknowledgement = mutex.withLock {
        var previous = store.previous(command.commandId)
        if (previous == null && !store.begin(command, now)) previous = store.previous(command.commandId)
        if (previous != null) {
            check(previous.driverId == assignment.driverId && previous.vehicleId == assignment.vehicleId &&
                previous.commandType == command.type.name) { "LOCAL_COMMAND_IDENTITY_MISMATCH" }
            val saved = previous.acknowledgementJson?.let(CommandAcknowledgementCodec::decode)
            if (saved != null) {
                if (previous.processingStatus.startsWith("ACK_PENDING_")) deliver(assignment, previous, saved)
                return@withLock saved
            }
            // A process may have died after local execution and before saving its result.
            // Never acquire GPS or execute again; require reconciliation of this uncertain outcome.
            return@withLock persist(assignment, failure("EXECUTION_OUTCOME_UNKNOWN", "Interrupted command; inspect local trip before issuing another command"))
        }
        try {
            withTimeout(30_000) { channel.markCommandReceived(assignment, command) }
        } catch (timeout: TimeoutCancellationException) {
            return@withLock persist(assignment, failure("ACK_RECEIVED_WRITE_FAILED", "RECEIVED acknowledgement timed out"))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (terminal: TerminalCommandException) {
            return@withLock persist(assignment, failure("COMMAND_ALREADY_TERMINAL", terminal.message.orEmpty()), blocked = true)
        } catch (error: Exception) {
            return@withLock persist(assignment, failure("ACK_RECEIVED_WRITE_FAILED", error.message ?: "RECEIVED acknowledgement failed"))
        }
        persist(assignment, execute())
    }

    private suspend fun persist(assignment: DriverAssignment, ack: CommandAcknowledgement, blocked: Boolean = false): CommandAcknowledgement {
        val record = checkNotNull(store.previous(ack.appliedTripCommandId)).copy(
            processingStatus = "${if (blocked) "ACK_BLOCKED" else "ACK_PENDING"}_${ack.tripCommandApplyStatus}",
            appliedAtMs = ack.tripCommandReceiverAtMs,
            resultingTripId = ack.tripCommandResultTripId,
            resultingTripStatus = ack.tripCommandResultStatus,
            failureReason = ack.tripCommandErrorReason,
            acknowledgementJson = CommandAcknowledgementCodec.encode(ack),
        )
        store.finish(record)
        if (!blocked) deliver(assignment, record, ack)
        return ack
    }

    private suspend fun deliver(assignment: DriverAssignment, record: CommandRecordEntity, ack: CommandAcknowledgement) {
        try {
            withTimeout(30_000) { channel.acknowledge(assignment, ack) }
            store.finish(record.copy(processingStatus = "ACKED_${ack.tripCommandApplyStatus}"))
        } catch (_: TimeoutCancellationException) {
            // The write may still commit remotely. Retry reconciles command status first.
        } catch (cancelled: CancellationException) {
            throw cancelled // Keep the durable outbox entry intact, including on logout or process cancellation.
        } catch (terminal: TerminalCommandException) {
            store.finish(record.copy(processingStatus = "ACK_BLOCKED_${ack.tripCommandApplyStatus}", failureReason = terminal.message))
        } catch (_: Exception) {
            // Retry from the durable record; never call local execution from this path.
        }
    }

    suspend fun retryPending(assignment: DriverAssignment) = mutex.withLock {
        for (record in store.pending(assignment.driverId, assignment.vehicleId)) {
            val ack = record.acknowledgementJson?.let(CommandAcknowledgementCodec::decode) ?: continue
            deliver(assignment, record, ack)
        }
    }
}
