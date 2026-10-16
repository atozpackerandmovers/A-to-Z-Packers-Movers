package com.atozpackersmovers.drivertrackerv5.command

import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.firebase.FirebaseRepository
import com.atozpackersmovers.drivertrackerv5.location.LocationSample
import com.atozpackersmovers.drivertrackerv5.security.AuthSessionProvider
import com.atozpackersmovers.drivertrackerv5.security.DeviceIdentityProvider
import com.atozpackersmovers.drivertrackerv5.trip.TripStateMachine
import com.atozpackersmovers.drivertrackerv5.trip.TripTransitionResult
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val commandMutex = Mutex()

    suspend fun consume(command: TripCommand): CommandAcknowledgement = commandMutex.withLock {
        val now = clock()
        val auth = authSessionProvider.current()
        val assignment = auth.assignment
        val validation = validator.validate(command, auth, now)
        if (validation != null || assignment == null) {
            return@withLock acknowledgement(command, CommandApplyStatus.REJECTED, null, null,
                validation?.code ?: "ASSIGNMENT_REQUIRED", validation?.reason ?: "Assignment missing", now)
                .also { if (assignment != null) acknowledgeSafely(assignment, it) }
        }

        val previous = idempotencyStore.previous(command.commandId)
        if (previous != null) {
            val stored = previous.acknowledgementJson?.let(CommandAcknowledgementCodec::decode)
                ?: acknowledgement(command, CommandApplyStatus.REJECTED, previous.resultingTripId, previous.resultingTripStatus,
                    "COMMAND_ALREADY_PROCESSING", "The same command ID is already processing", now)
            acknowledgeSafely(assignment, stored)
            return@withLock stored
        }

        val latest = idempotencyStore.latest(command.driverId, command.vehicleId)
        if (latest != null && command.issuedAtMs < latest.issuedAtMs) {
            val rejected = acknowledgement(command, CommandApplyStatus.REJECTED, latest.resultingTripId, latest.resultingTripStatus,
                "OUT_OF_ORDER_COMMAND", "A newer command was already received for this assignment", now)
            acknowledgeSafely(assignment, rejected)
            return@withLock rejected
        }

        /*
         * Reject duplicate START before reserving a command record, acquiring a
         * GPS fix, starting the foreground service, or touching trip/queue data.
         * The mutex makes this check atomic with the rest of command handling.
         */
        if (command.type == TripCommandType.START) {
            val active = stateMachine.activeTrip()
            if (active != null) {
                val rejected = acknowledgement(
                    command,
                    CommandApplyStatus.REJECTED,
                    active.tripId,
                    active.status,
                    "ACTIVE_TRIP_EXISTS",
                    "Trip is already running.",
                    now,
                )
                acknowledgeSafely(assignment, rejected)
                return@withLock rejected
            }
        }

        if (!idempotencyStore.begin(command, now)) {
            val winner = idempotencyStore.previous(command.commandId)
            val stored = winner?.acknowledgementJson?.let(CommandAcknowledgementCodec::decode)
                ?: acknowledgement(command, CommandApplyStatus.REJECTED, winner?.resultingTripId, winner?.resultingTripStatus,
                    "COMMAND_ALREADY_PROCESSING", "The same command ID is already processing", now)
            acknowledgeSafely(assignment, stored)
            return@withLock stored
        }

        val transition = try {
            when (command.type) {
                TripCommandType.START -> {
                    val fix = trackingController.acquireFirstAcceptedFix().getOrElse {
                        return@withLock finish(command, assignment, CommandApplyStatus.FAILED, null, null,
                            "FIRST_FIX_FAILED", it.message ?: "Unable to obtain an accepted first GPS fix", now)
                    }
                    when (val started = stateMachine.start(command, assignment, fix, now)) {
                        is TripTransitionResult.Applied -> {
                            val service = trackingController.startExactlyOnce(started.session.tripId)
                            if (service.isFailure) {
                                stateMachine.failStart(started.session.tripId, command.commandId, clock())
                                TripTransitionResult.Failed("SERVICE_START_FAILED", service.exceptionOrNull()?.message ?: "Foreground service did not start")
                            } else started
                        }
                        else -> started
                    }
                }
                TripCommandType.STOP -> when (val stopped = stateMachine.stop(command, assignment, now)) {
                    is TripTransitionResult.Applied -> trackingController.stopSafely().fold(
                        onSuccess = { stopped },
                        onFailure = { TripTransitionResult.Failed("SERVICE_STOP_FAILED", it.message ?: "Foreground service did not stop cleanly") },
                    )
                    else -> stopped
                }
                TripCommandType.RESET -> when (val reset = stateMachine.resetForIsolatedTest(command, assignment, now)) {
                    is TripTransitionResult.Applied -> trackingController.stopSafely().fold(
                        onSuccess = { reset },
                        onFailure = { TripTransitionResult.Failed("SERVICE_STOP_FAILED", it.message ?: "Foreground service did not stop cleanly") },
                    )
                    else -> reset
                }
            }
        } catch (error: Throwable) {
            TripTransitionResult.Failed("UNEXPECTED_ERROR", error.message ?: error::class.java.simpleName)
        }

        when (transition) {
            is TripTransitionResult.Applied -> {
                runCatching { repository.uploadTripSummary(assignment, transition.session) }
                finish(command, assignment, CommandApplyStatus.APPLIED,
                    transition.session.tripId, transition.session.status, null, null, clock())
            }
            is TripTransitionResult.Rejected -> finish(command, assignment, CommandApplyStatus.REJECTED,
                transition.session?.tripId, transition.session?.status, transition.code, transition.reason, clock())
            is TripTransitionResult.Failed -> finish(command, assignment, CommandApplyStatus.FAILED,
                null, null, transition.code, transition.reason, clock())
        }
    }

    private suspend fun finish(
        command: TripCommand,
        assignment: com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment,
        status: CommandApplyStatus,
        tripId: String?,
        tripStatus: String?,
        errorCode: String?,
        errorReason: String?,
        now: Long,
    ): CommandAcknowledgement {
        val ack = acknowledgement(command, status, tripId, tripStatus, errorCode, errorReason, now)
        val existing = idempotencyStore.previous(command.commandId)!!
        idempotencyStore.finish(existing.copy(
            processingStatus = status.name,
            appliedAtMs = now,
            resultingTripId = tripId,
            resultingTripStatus = tripStatus,
            failureReason = errorReason,
            acknowledgementJson = CommandAcknowledgementCodec.encode(ack),
        ))
        acknowledgeSafely(assignment, ack)
        return ack
    }

    /**
     * Command application is a local operation and must not crash or roll back
     * when the isolated TEST emulator is temporarily unreachable.
     *
     * The completed acknowledgement remains in CommandIdempotencyStore and can
     * be returned for the same command ID after reconnect.
     */
    private suspend fun acknowledgeSafely(
        assignment: com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment,
        acknowledgement: CommandAcknowledgement,
    ) {
        runCatching { repository.acknowledge(assignment, acknowledgement) }
    }

    private fun acknowledgement(
        command: TripCommand,
        status: CommandApplyStatus,
        tripId: String?,
        tripStatus: String?,
        errorCode: String?,
        errorReason: String?,
        now: Long,
    ) = CommandAcknowledgement(
        appliedTripCommandId = command.commandId,
        appliedTripCommandType = command.type.name,
        tripCommandApplyStatus = status.name,
        tripCommandReceiverAtMs = now,
        tripCommandResultTripId = tripId,
        tripCommandResultStatus = tripStatus,
        tripCommandReceiverDeviceId = deviceIdentityProvider.stableId(),
        tripCommandReceiverBuild = BuildConfig.VERSION_NAME,
        tripCommandReceiverSource = command.source.name,
        tripCommandErrorCode = errorCode,
        tripCommandErrorReason = errorReason,
    )
}
