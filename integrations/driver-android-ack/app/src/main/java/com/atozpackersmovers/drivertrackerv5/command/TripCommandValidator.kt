package com.atozpackersmovers.drivertrackerv5.command

import com.atozpackersmovers.drivertrackerv5.security.AuthSession

data class CommandValidationFailure(val code: String, val reason: String)

class TripCommandValidator(
    private val maximumClockSkewMs: Long = 30_000,
    private val maximumCommandAgeMs: Long = 5 * 60_000,
    private val resetEnabled: Boolean,
) {
    fun validate(command: TripCommand, auth: AuthSession, nowMs: Long): CommandValidationFailure? {
        if (!auth.authenticated || auth.role != "Driver") return CommandValidationFailure("AUTH_REQUIRED", "Authenticated Driver session is required")
        val assignment = auth.assignment ?: return CommandValidationFailure("ASSIGNMENT_REQUIRED", "Driver/vehicle assignment is missing")
        if (command.driverId != assignment.driverId) return CommandValidationFailure("WRONG_DRIVER", "Command driver does not match authenticated driver")
        if (command.vehicleId != assignment.vehicleId) return CommandValidationFailure("WRONG_VEHICLE", "Command vehicle does not match assigned vehicle")
        if (command.commandId.isBlank() || command.commandId.length > 128) return CommandValidationFailure("INVALID_COMMAND_ID", "Command ID is invalid")
        if (command.issuedAtMs > nowMs + maximumClockSkewMs) return CommandValidationFailure("FUTURE_COMMAND", "Command timestamp is in the future")
        if (nowMs - command.issuedAtMs > maximumCommandAgeMs || nowMs > command.expiresAtMs) return CommandValidationFailure("STALE_COMMAND", "Command has expired")
        if (command.type == TripCommandType.RESET && !resetEnabled) return CommandValidationFailure("RESET_DISABLED", "RESET is disabled outside isolated tests")
        return null
    }
}

