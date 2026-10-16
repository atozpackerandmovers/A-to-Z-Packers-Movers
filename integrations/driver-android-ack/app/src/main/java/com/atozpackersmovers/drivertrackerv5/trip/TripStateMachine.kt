package com.atozpackersmovers.drivertrackerv5.trip

import androidx.room.withTransaction
import com.atozpackersmovers.drivertrackerv5.command.TripCommand
import com.atozpackersmovers.drivertrackerv5.location.LocationSample
import com.atozpackersmovers.drivertrackerv5.location.LocationPointIdentity
import com.atozpackersmovers.drivertrackerv5.location.LocationValidationPolicy
import com.atozpackersmovers.drivertrackerv5.offline.TrackerDatabase
import com.atozpackersmovers.drivertrackerv5.offline.OfflinePointEntity
import com.atozpackersmovers.drivertrackerv5.offline.PointSyncStatus
import com.atozpackersmovers.drivertrackerv5.offline.OfflineQueueRepository
import java.util.UUID

sealed class TripTransitionResult {
    data class Applied(val session: TripSessionEntity) : TripTransitionResult()
    data class Rejected(val code: String, val reason: String, val session: TripSessionEntity? = null) : TripTransitionResult()
    data class Failed(val code: String, val reason: String) : TripTransitionResult()
}

class TripStateMachine(
    private val database: TrackerDatabase,
    private val policy: LocationValidationPolicy = LocationValidationPolicy.PROVISIONAL_TEST,
) {
    suspend fun activeTrip(): TripSessionEntity? = database.tripSessionDao().active()

    suspend fun start(
        command: TripCommand,
        assignment: DriverAssignment,
        firstPoint: LocationSample,
        nowMs: Long,
    ): TripTransitionResult = database.withTransaction {
        val dao = database.tripSessionDao()
        if (dao.active() != null) return@withTransaction TripTransitionResult.Rejected("ACTIVE_TRIP_EXISTS", "A trip is already active", dao.active())
        if (database.offlinePointDao().totalCount() >= OfflineQueueRepository.MAX_QUEUE_POINTS) {
            return@withTransaction TripTransitionResult.Rejected("QUEUE_FULL", "Offline queue must be reconciled before START")
        }
        if (!firstPoint.latitude.isFinite() || !firstPoint.longitude.isFinite() ||
            firstPoint.latitude !in -90.0..90.0 || firstPoint.longitude !in -180.0..180.0 ||
            firstPoint.accuracyM <= 0f || firstPoint.accuracyM > policy.maximumAcceptedAccuracyM ||
            nowMs - firstPoint.timestampMs > policy.stalePointAgeMs || firstPoint.timestampMs > nowMs + 30_000) {
            return@withTransaction TripTransitionResult.Rejected("INVALID_FIRST_FIX", "First GPS fix does not satisfy the provisional acceptance policy")
        }
        val tripId = "TEST_TRIP_${UUID.randomUUID()}"
        val session = TripSessionEntity(
            tripId = tripId,
            driverId = assignment.driverId,
            driverName = assignment.driverName,
            vehicleId = assignment.vehicleId,
            vehicleNumber = assignment.vehicleNumber,
            status = TripStatus.RUNNING.name,
            startedAtMs = nowMs,
            firstLatitude = firstPoint.latitude,
            firstLongitude = firstPoint.longitude,
            lastLatitude = firstPoint.latitude,
            lastLongitude = firstPoint.longitude,
            lastLocationAtMs = firstPoint.timestampMs,
            lastAccuracyM = firstPoint.accuracyM,
            lastAppliedCommandId = command.commandId,
            serviceExpected = true,
            updatedAtMs = nowMs,
        )
        dao.insert(session)
        database.offlinePointDao().insert(OfflinePointEntity(
            pointId = LocationPointIdentity.create(tripId, firstPoint.timestampMs),
            sequenceNumber = 1,
            tripId = tripId,
            driverId = assignment.driverId,
            vehicleId = assignment.vehicleId,
            latitude = firstPoint.latitude,
            longitude = firstPoint.longitude,
            timestampMs = firstPoint.timestampMs,
            accuracyM = firstPoint.accuracyM,
            speedMps = firstPoint.speedMps,
            bearingDegrees = firstPoint.bearingDegrees,
            distanceIncrementM = 0.0,
            accumulatedDistanceM = 0.0,
            syncStatus = PointSyncStatus.PENDING.name,
            createdAtMs = nowMs,
        ))
        TripTransitionResult.Applied(session)
    }

    suspend fun failStart(tripId: String, reasonCommandId: String, nowMs: Long): TripSessionEntity? = database.withTransaction {
        val dao = database.tripSessionDao()
        val session = dao.find(tripId) ?: return@withTransaction null
        val failed = session.copy(
            status = TripStatus.FAILED.name,
            stoppedAtMs = nowMs,
            serviceExpected = false,
            lastAppliedCommandId = reasonCommandId,
            updatedAtMs = nowMs,
        )
        dao.update(failed)
        failed
    }

    suspend fun stop(command: TripCommand, assignment: DriverAssignment, nowMs: Long): TripTransitionResult = database.withTransaction {
        val dao = database.tripSessionDao()
        val active = dao.active() ?: return@withTransaction TripTransitionResult.Rejected("NO_ACTIVE_TRIP", "No active trip exists")
        if (active.driverId != assignment.driverId || active.vehicleId != assignment.vehicleId) {
            return@withTransaction TripTransitionResult.Rejected("TRIP_OWNERSHIP_MISMATCH", "Active trip belongs to another assignment")
        }
        if (command.requestedTripId != null && command.requestedTripId != active.tripId) {
            return@withTransaction TripTransitionResult.Rejected("TRIP_ID_MISMATCH", "STOP trip ID does not match active trip")
        }
        val completed = active.copy(
            status = TripStatus.COMPLETED.name,
            stoppedAtMs = nowMs,
            lastAppliedCommandId = command.commandId,
            serviceExpected = false,
            updatedAtMs = nowMs,
        )
        dao.update(completed)
        TripTransitionResult.Applied(completed)
    }

    suspend fun resetForIsolatedTest(command: TripCommand, assignment: DriverAssignment, nowMs: Long): TripTransitionResult = database.withTransaction {
        val dao = database.tripSessionDao()
        val active = dao.active() ?: return@withTransaction TripTransitionResult.Rejected("NO_ACTIVE_TRIP", "No active trip exists")
        if (active.driverId != assignment.driverId || active.vehicleId != assignment.vehicleId) {
            return@withTransaction TripTransitionResult.Rejected("TRIP_OWNERSHIP_MISMATCH", "Active trip belongs to another assignment")
        }
        val reset = active.copy(
            status = TripStatus.RESET_TEST.name,
            stoppedAtMs = nowMs,
            firstLatitude = null,
            firstLongitude = null,
            lastLatitude = null,
            lastLongitude = null,
            lastLocationAtMs = null,
            lastAccuracyM = null,
            trackedDistanceM = 0.0,
            switchOffGapEstimateM = 0.0,
            lastAppliedCommandId = command.commandId,
            serviceExpected = false,
            resetGeneration = active.resetGeneration + 1,
            updatedAtMs = nowMs,
        )
        dao.update(reset)
        TripTransitionResult.Applied(reset)
    }
}
