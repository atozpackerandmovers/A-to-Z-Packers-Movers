package com.atozpackersmovers.drivertrackerv5.command

import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.firebase.FirebaseRepository
import com.atozpackersmovers.drivertrackerv5.location.LocationSample
import com.atozpackersmovers.drivertrackerv5.security.AuthSessionProvider
import com.atozpackersmovers.drivertrackerv5.security.DeviceIdentityProvider
import com.atozpackersmovers.drivertrackerv5.trip.TripStateMachine
import com.atozpackersmovers.drivertrackerv5.trip.TripTransitionResult
import com.atozpackersmovers.drivertrackerv5.diagnostics.TrackerDiagnostics
import kotlinx.coroutines.CancellationException

interface TrackingController {
    suspend fun acquireFirstAcceptedFix(): Result<LocationSample>
    suspend fun startExactlyOnce(tripId: String): Result<Unit>
    suspend fun stopSafely(): Result<Unit>
}

class TripCommandConsumer(
    private val validator: TripCommandValidator,
    private val idempotencyStore: CommandIdempotencyStore,
    private val stateMachine: TripStateMachine,
    private val trackingController: TrackingController,
    private val authSessionProvider: AuthSessionProvider,
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val repository: FirebaseRepository,
    private val diagnostics: TrackerDiagnostics,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val processor = DurableCommandProcessor(idempotencyStore, repository)

    suspend fun consume(command: TripCommand): CommandAcknowledgement {
        val now = clock()
        val auth = authSessionProvider.current()
        val assignment = auth.assignment
        val validation = validator.validate(command, auth, now)
        // Identity and unsupported operations never enter the production outbox.
        if (!auth.authenticated || auth.role != "Driver" || assignment == null ||
            command.driverId != assignment.driverId || command.vehicleId != assignment.vehicleId ||
            command.type == TripCommandType.RESET || command.commandId.isBlank() || command.commandId.length > 128) {
            return acknowledgement(command, CommandApplyStatus.REJECTED, null, null,
                validation?.code ?: "COMMAND_NOT_AUTHORIZED", validation?.reason ?: "Command not authorized", now)
        }
        // Attaching a Firebase child listener replays historical commands. Do not backfill or rewrite
        // expired/invalid-time history. Existing local pending results still bypass this filter.
        if (validation?.code in setOf("STALE_COMMAND", "FUTURE_COMMAND") &&
            idempotencyStore.previous(command.commandId) == null) {
            return acknowledgement(command, CommandApplyStatus.REJECTED, null, null,
                validation?.code, validation?.reason, now)
        }
        val result = processor.process(command, assignment, now,
            failure = { code, reason -> acknowledgement(command, CommandApplyStatus.FAILED, null, null, code, reason, clock()) },
        ) {
            // Replay is handled before freshness checks: an old pending result must still be delivered.
            val currentValidation = validator.validate(command, authSessionProvider.current(), clock())
            if (currentValidation != null) return@process acknowledgement(command, CommandApplyStatus.REJECTED,
                null, null, currentValidation.code, currentValidation.reason, clock())
            val latest = idempotencyStore.latest(command.driverId, command.vehicleId)
            if (latest != null && command.issuedAtMs < latest.issuedAtMs) {
                return@process acknowledgement(command, CommandApplyStatus.REJECTED, null, null,
                    "OUT_OF_ORDER_COMMAND", "A newer command was already received", now)
            }
            val active = if (command.type == TripCommandType.START) stateMachine.activeTrip() else null
            if (active != null) {
                return@process acknowledgement(command, CommandApplyStatus.REJECTED, active.tripId, active.status,
                    "ACTIVE_TRIP_EXISTS", "Trip is already running", now)
            }
            val transition = try {
                when (command.type) {
                    TripCommandType.START -> {
                        val fix = trackingController.acquireFirstAcceptedFix().getOrElse {
                            return@process acknowledgement(command, CommandApplyStatus.FAILED, null, null,
                                "FIRST_FIX_FAILED", it.message ?: "Unable to obtain first GPS fix", clock())
                        }
                        when (val started = stateMachine.start(command, assignment, fix, now)) {
                            is TripTransitionResult.Applied -> {
                                val service = trackingController.startExactlyOnce(started.session.tripId)
                                if (service.isFailure) {
                                    stateMachine.failStart(started.session.tripId, command.commandId, clock())
                                    TripTransitionResult.Failed("SERVICE_START_FAILED", service.exceptionOrNull()?.message ?: "Service failed")
                                } else started
                            }
                            else -> started
                        }
                    }
                    TripCommandType.STOP -> when (val stopped = stateMachine.stop(command, assignment, now)) {
                        is TripTransitionResult.Applied -> trackingController.stopSafely().fold(
                            onSuccess = { stopped },
                            onFailure = { TripTransitionResult.Failed("SERVICE_STOP_FAILED", it.message ?: "Service stop failed") },
                        )
                        else -> stopped
                    }
                    TripCommandType.RESET -> error("RESET_DISABLED")
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                TripTransitionResult.Failed("UNEXPECTED_ERROR", error.message ?: error::class.java.simpleName)
            }
            when (transition) {
                is TripTransitionResult.Applied -> {
                    acknowledgement(command, CommandApplyStatus.APPLIED, transition.session.tripId,
                        transition.session.status, null, null, clock())
                }
                is TripTransitionResult.Rejected -> acknowledgement(command, CommandApplyStatus.REJECTED,
                    transition.session?.tripId, transition.session?.status, transition.code, transition.reason, clock())
                is TripTransitionResult.Failed -> acknowledgement(command, CommandApplyStatus.FAILED,
                    null, null, transition.code, transition.reason, clock())
            }
        }
        diagnostics.update { it.copy(
            lastCommandId = command.commandId, lastCommandType = command.type.name,
            lastCommandStatus = "LOCAL_" + result.tripCommandApplyStatus,
            lastCommandError = result.tripCommandErrorReason,
        ) }
        return result
    }

    suspend fun retryPendingAcknowledgements() {
        val auth = authSessionProvider.current()
        val assignment = auth.assignment ?: return
        if (auth.authenticated && auth.role == "Driver") processor.retryPending(assignment)
    }

    private fun acknowledgement(command: TripCommand, status: CommandApplyStatus, tripId: String?,
        tripStatus: String?, errorCode: String?, errorReason: String?, now: Long) = CommandAcknowledgement(
        appliedTripCommandId = command.commandId, appliedTripCommandType = command.type.name,
        tripCommandApplyStatus = status.name, tripCommandReceiverAtMs = now,
        tripCommandResultTripId = tripId, tripCommandResultStatus = tripStatus,
        tripCommandReceiverDeviceId = deviceIdentityProvider.stableId(), tripCommandReceiverBuild = BuildConfig.VERSION_NAME,
        tripCommandReceiverSource = command.source.name, tripCommandErrorCode = errorCode, tripCommandErrorReason = errorReason,
    )
}
