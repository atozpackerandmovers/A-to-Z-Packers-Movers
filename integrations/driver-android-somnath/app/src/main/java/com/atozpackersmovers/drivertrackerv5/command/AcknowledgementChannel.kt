package com.atozpackersmovers.drivertrackerv5.command

import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment

interface AcknowledgementChannel {
    suspend fun markCommandReceived(assignment: DriverAssignment, command: TripCommand)
    suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement)
    suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement)
}

class TerminalCommandException(status: String) : IllegalStateException("COMMAND_ALREADY_TERMINAL:$status")
