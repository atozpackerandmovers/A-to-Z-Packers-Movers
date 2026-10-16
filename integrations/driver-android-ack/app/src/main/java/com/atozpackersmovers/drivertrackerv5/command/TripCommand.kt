package com.atozpackersmovers.drivertrackerv5.command

enum class TripCommandType { START, STOP, RESET }
enum class CommandApplyStatus { APPLIED, FAILED, REJECTED }
enum class CommandProcessingStatus { RECEIVED, PROCESSING, APPLIED, FAILED, REJECTED }
enum class CommandSource { LOCAL, MOCK_REMOTE, EMULATOR_REMOTE, PRODUCTION_REMOTE }

data class TripCommand(
    val commandId: String,
    val type: TripCommandType,
    val driverId: String,
    val vehicleId: String,
    val issuedAtMs: Long,
    val expiresAtMs: Long,
    val requestedTripId: String? = null,
    val source: CommandSource,
)

object TripCommandParser {
    fun parse(fields: Map<String, Any?>, source: CommandSource): Result<TripCommand> = runCatching {
        val id = (fields["commandId"] ?: fields["trip_command_id"]) as? String ?: error("MISSING_COMMAND_ID")
        require(id.matches(Regex("[A-Za-z0-9._:-]{8,128}"))) { "INVALID_COMMAND_ID" }
        val type = TripCommandType.valueOf(((fields["type"] ?: fields["trip_command"]) as? String ?: error("MISSING_COMMAND")).uppercase())
        val driverId = (fields["driverId"] ?: fields["driver_id"]) as? String ?: error("MISSING_DRIVER_ID")
        val vehicleId = (fields["vehicleId"] ?: fields["vehicle_id"]) as? String ?: error("MISSING_VEHICLE_ID")
        val issued = ((fields["issuedAtMs"] ?: fields["issued_at_ms"]) as? Number)?.toLong() ?: error("MISSING_ISSUED_AT")
        val expires = ((fields["expiresAtMs"] ?: fields["expires_at_ms"]) as? Number)?.toLong() ?: (issued + 300_000)
        TripCommand(id, type, driverId, vehicleId, issued, expires, (fields["tripId"] ?: fields["trip_id"]) as? String, source)
    }
}
