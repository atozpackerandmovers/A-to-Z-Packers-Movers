package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.command.CommandAcknowledgement
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity

/** Uses the local trip and existing command outbox; never depends on GPS queue contents. */
class CommandTripSummaryDelivery(
    private val findTrip: suspend (String) -> TripSessionEntity?,
    private val completedByCommand: suspend (String) -> TripSessionEntity?,
    private val upload: suspend (TripSessionEntity) -> Unit,
) {
    suspend fun deliver(assignment: DriverAssignment, ack: CommandAcknowledgement) {
        val session = if (ack.tripCommandApplyStatus == "APPLIED") {
            val id = checkNotNull(ack.tripCommandResultTripId) { "MISSING_RESULT_TRIP" }
            checkNotNull(findTrip(id)) { "LOCAL_RESULT_TRIP_MISSING" }
        } else if (ack.appliedTripCommandType == "STOP") {
            // STOP may have committed locally before process death or a service-stop failure.
            completedByCommand(ack.appliedTripCommandId) ?: return
        } else return
        check(session.driverId == assignment.driverId && session.vehicleId == assignment.vehicleId) {
            "LOCAL_TRIP_IDENTITY_MISMATCH"
        }
        if (ack.appliedTripCommandType == "STOP") {
            check(session.status == "COMPLETED" && session.lastAppliedCommandId == ack.appliedTripCommandId) {
                "LOCAL_STOP_RESULT_MISMATCH"
            }
        }
        // Read the current durable trip, so a delayed START cannot republish an earlier RUNNING snapshot.
        upload(session)
    }
}
