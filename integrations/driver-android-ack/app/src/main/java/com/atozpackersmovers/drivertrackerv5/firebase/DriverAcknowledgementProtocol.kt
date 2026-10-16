package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.command.CommandAcknowledgement
import com.atozpackersmovers.drivertrackerv5.command.TerminalCommandException

/** Only reads the driver's own command; rules intentionally deny Driver acknowledgement reads. */
interface CommandAckWire {
    suspend fun readCommand(commandId: String): Map<String, Any?>
    suspend fun update(updates: Map<String, Any?>)
}

class DriverAcknowledgementProtocol(
    private val wire: CommandAckWire,
    private val driverId: String,
    private val driverUid: String,
    private val vehicleId: String,
    private val serverTimestamp: Any = mapOf(".sv" to "timestamp"),
) {
    private suspend fun status(id: String, type: String): String? {
        require(type == "START" || type == "STOP")
        val command = wire.readCommand(id)
        check(command["commandId"] == id && command["type"] == type &&
            command["driverId"] == driverId && command["vehicleId"] == vehicleId) { "COMMAND_IDENTITY_MISMATCH" }
        val value = command["status"] as? String
        check(value == null || value in setOf("PENDING", "RECEIVED", "EXECUTED", "FAILED")) { "UNKNOWN_COMMAND_STATUS" }
        return value
    }

    suspend fun received(id: String, type: String) {
        when (val state = status(id, type)) {
            "RECEIVED" -> return
            "EXECUTED", "FAILED" -> throw TerminalCommandException(state)
        }
        wire.update(mapOf(
            "acknowledgements/$id" to mapOf(
                "commandId" to id, "commandType" to type, "status" to "RECEIVED",
                "receivedAt" to serverTimestamp, "driverId" to driverId,
                "driverUid" to driverUid, "vehicleId" to vehicleId,
                "errorCode" to "", "errorMessage" to "",
            ),
            "commands/$id/status" to "RECEIVED",
        ))
    }

    suspend fun deliver(ack: CommandAcknowledgement) {
        val id = ack.appliedTripCommandId
        val type = ack.appliedTripCommandType
        val executed = ack.tripCommandApplyStatus == "APPLIED"
        val expected = if (executed) "EXECUTED" else "FAILED"
        when (val current = status(id, type)) {
            expected -> return // A previous atomic write succeeded but its response/local receipt was lost.
            "EXECUTED", "FAILED" -> throw TerminalCommandException(current)
            "RECEIVED" -> Unit
            else -> received(id, type)
        }
        val fields = mutableMapOf<String, Any?>(
            "acknowledgements/$id/status" to expected,
            "acknowledgements/$id/${if (executed) "executedAt" else "failedAt"}" to serverTimestamp,
            "acknowledgements/$id/errorCode" to if (executed) "" else ack.tripCommandErrorCode.orEmpty().ifBlank { "COMMAND_REJECTED" },
            "acknowledgements/$id/errorMessage" to if (executed) "" else ack.tripCommandErrorReason.orEmpty().ifBlank { "Command was not applied" },
            "commands/$id/status" to expected,
        )
        if (executed) {
            check(!ack.tripCommandResultTripId.isNullOrBlank()) { "MISSING_RESULT_TRIP" }
            fields["acknowledgements/$id/${if (type == "START") "tripId" else "stoppedTripId"}"] = ack.tripCommandResultTripId
        }
        wire.update(fields)
    }
}
