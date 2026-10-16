package com.atozpackersmovers.drivertrackerv5.location

import androidx.room.withTransaction
import com.atozpackersmovers.drivertrackerv5.offline.OfflinePointEntity
import com.atozpackersmovers.drivertrackerv5.offline.OfflineQueueRepository
import com.atozpackersmovers.drivertrackerv5.offline.PointSyncStatus
import com.atozpackersmovers.drivertrackerv5.offline.TrackerDatabase

sealed class PointProcessingResult {
    abstract val recoveryDiagnostic: RecoveryDiagnostic?

    data class RecoveryDiagnostic(
        val status: String,
        val reason: String? = null,
        val userMessage: String,
    )

    data class Queued(
        val point: OfflinePointEntity,
        override val recoveryDiagnostic: RecoveryDiagnostic? = null,
    ) : PointProcessingResult()

    data class Rejected(
        val code: String,
        val reason: String,
        val retryRecovery: Boolean = false,
        override val recoveryDiagnostic: RecoveryDiagnostic? = null,
    ) : PointProcessingResult()
}

class LocationProcessor(
    private val database: TrackerDatabase,
    private val validator: LocationValidator,
    private val policy: LocationValidationPolicy = LocationValidationPolicy.PROVISIONAL_TEST,
) {
    suspend fun process(point: LocationSample, nowMs: Long): PointProcessingResult = database.withTransaction {
        val sessionDao = database.tripSessionDao()
        val pointDao = database.offlinePointDao()
        val session = sessionDao.active() ?: return@withTransaction PointProcessingResult.Rejected("NO_ACTIVE_TRIP", "No active trip")
        val assignedPoint = point.copy(tripId = point.tripId ?: session.tripId)
        val pointId = LocationPointIdentity.create(session.tripId, assignedPoint.timestampMs)
        if (pointDao.findByPointId(pointId) != null) {
            return@withTransaction PointProcessingResult.Rejected("DUPLICATE_POINT_ID", "Point identity was already processed")
        }
        if (pointDao.findByTimestamp(session.tripId, assignedPoint.timestampMs) != null) {
            return@withTransaction PointProcessingResult.Rejected("DUPLICATE_TIMESTAMP", "Point timestamp was already processed")
        }
        when (val decision = validator.validate(session, assignedPoint, nowMs)) {
            is LocationDecision.Rejected -> PointProcessingResult.Rejected(decision.code, decision.reason)
            is LocationDecision.Accepted -> {
                if (pointDao.totalCount() >= OfflineQueueRepository.MAX_QUEUE_POINTS) {
                    return@withTransaction PointProcessingResult.Rejected("QUEUE_FULL", "Offline queue reached its retention limit")
                }
                if (!decision.incrementM.isFinite() || decision.incrementM < 0.0) {
                    return@withTransaction PointProcessingResult.Rejected("INVALID_DISTANCE_INCREMENT", "Distance increment is invalid")
                }
                val sequence = pointDao.maxSequence(session.tripId) + 1
                val totals = PostRecoveryDistanceAccumulator.addLiveSegment(
                    trackedDistanceM = session.trackedDistanceM,
                    switchOffGapEstimateM = session.switchOffGapEstimateM,
                    segmentDistanceM = decision.incrementM,
                )
                val entity = OfflinePointEntity(
                    pointId = pointId,
                    sequenceNumber = sequence,
                    tripId = session.tripId,
                    driverId = session.driverId,
                    vehicleId = session.vehicleId,
                    latitude = assignedPoint.latitude,
                    longitude = assignedPoint.longitude,
                    timestampMs = assignedPoint.timestampMs,
                    accuracyM = assignedPoint.accuracyM,
                    speedMps = assignedPoint.speedMps,
                    bearingDegrees = assignedPoint.bearingDegrees,
                    distanceIncrementM = decision.incrementM,
                    accumulatedDistanceM = totals.publishedCumulativeDistanceM,
                    syncStatus = PointSyncStatus.PENDING.name,
                    createdAtMs = nowMs,
                )
                pointDao.insert(entity)
                sessionDao.update(session.copy(
                    firstLatitude = session.firstLatitude ?: assignedPoint.latitude,
                    firstLongitude = session.firstLongitude ?: assignedPoint.longitude,
                    lastLatitude = assignedPoint.latitude,
                    lastLongitude = assignedPoint.longitude,
                    lastLocationAtMs = assignedPoint.timestampMs,
                    lastAccuracyM = assignedPoint.accuracyM,
                    trackedDistanceM = totals.trackedDistanceM,
                    updatedAtMs = nowMs,
                ))
                PointProcessingResult.Queued(entity)
            }
        }
    }

    suspend fun processRecoveryPoint(
        point: LocationSample,
        gapHandler: SwitchOffGapHandler,
        nowMs: Long,
    ): PointProcessingResult {
        return database.withTransaction {
            val pointDao = database.offlinePointDao()
            val sessionDao = database.tripSessionDao()
            val before = sessionDao.active()
                ?: return@withTransaction recoveryRejected("NO_ACTIVE_TRIP", "No active trip", false)
            if (point.tripId != null && point.tripId != before.tripId) {
                return@withTransaction recoveryRejected(
                    "WRONG_TRIP_ID",
                    "The recovery fix belongs to another trip",
                    false,
                )
            }
            val assignedPoint = point.copy(tripId = before.tripId)
            val pointId = LocationPointIdentity.create(before.tripId, assignedPoint.timestampMs)
            if (pointDao.findByPointId(pointId) != null) {
                return@withTransaction recoveryRejected(
                    "DUPLICATE_POINT_ID",
                    "Recovery point identity was already processed",
                    false,
                )
            }
            if (pointDao.findByTimestamp(before.tripId, assignedPoint.timestampMs) != null) {
                return@withTransaction recoveryRejected(
                    "DUPLICATE_TIMESTAMP",
                    "Recovery timestamp was already processed",
                    false,
                )
            }
            if (pointDao.totalCount() >= OfflineQueueRepository.MAX_QUEUE_POINTS) {
                return@withTransaction recoveryRejected(
                    "QUEUE_FULL",
                    "Offline queue reached its retention limit",
                    true,
                )
            }
            val anchorTimestampMs = before.lastLocationAtMs
            if (anchorTimestampMs != null &&
                assignedPoint.timestampMs > anchorTimestampMs &&
                pointDao.countBetween(before.tripId, anchorTimestampMs, assignedPoint.timestampMs) > 0) {
                return@withTransaction recoveryRejected(
                    "INTERMEDIATE_POINTS_EXIST",
                    "Intermediate GPS points already exist for this interval",
                    false,
                )
            }
            when (val decision = gapHandler.evaluate(before, assignedPoint, nowMs)) {
                is RecoveryGapDecision.Rejected -> {
                    if (decision.code == "GAP_TOO_SHORT") {
                        return@withTransaction processNormallyInTransaction(before, assignedPoint, nowMs)
                    }
                    if (decision.anchorValidPoint) {
                        return@withTransaction queueRecoveryAnchor(
                            session = before,
                            point = assignedPoint,
                            pointId = pointId,
                            nowMs = nowMs,
                            diagnostic = PointProcessingResult.RecoveryDiagnostic(
                                status = "REJECTED",
                                reason = decision.reason,
                                userMessage = "Recovery checked — no gap added",
                            ),
                        )
                    }
                    return@withTransaction recoveryRejected(
                        decision.code,
                        decision.reason,
                        decision.retryWithNextFix,
                    )
                }
                is RecoveryGapDecision.Accepted -> {
                    if (database.recoveryGapDao().insert(decision.gap) == -1L) {
                        return@withTransaction recoveryRejected(
                            "GAP_ALREADY_PROCESSED",
                            "This recovery gap was already processed",
                            false,
                        )
                    }
                    return@withTransaction queueRecoveryAnchor(
                        session = decision.updatedSession,
                        point = assignedPoint,
                        pointId = pointId,
                        nowMs = nowMs,
                        diagnostic = PointProcessingResult.RecoveryDiagnostic(
                            status = "ACCEPTED",
                            userMessage = "Recovery gap added to switch-off estimate",
                        ),
                    )
                }
            }
        }
    }

    private suspend fun processNormallyInTransaction(
        session: com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity,
        point: LocationSample,
        nowMs: Long,
    ): PointProcessingResult {
        val pointDao = database.offlinePointDao()
        return when (val decision = validator.validate(session, point, nowMs)) {
            is LocationDecision.Rejected -> PointProcessingResult.Rejected(decision.code, decision.reason)
            is LocationDecision.Accepted -> {
                if (!decision.incrementM.isFinite() || decision.incrementM < 0.0) {
                    return PointProcessingResult.Rejected(
                        "INVALID_DISTANCE_INCREMENT",
                        "Distance increment is invalid",
                    )
                }
                val totals = PostRecoveryDistanceAccumulator.addLiveSegment(
                    trackedDistanceM = session.trackedDistanceM,
                    switchOffGapEstimateM = session.switchOffGapEstimateM,
                    segmentDistanceM = decision.incrementM,
                )
                val entity = OfflinePointEntity(
                    pointId = LocationPointIdentity.create(session.tripId, point.timestampMs),
                    sequenceNumber = pointDao.maxSequence(session.tripId) + 1,
                    tripId = session.tripId,
                    driverId = session.driverId,
                    vehicleId = session.vehicleId,
                    latitude = point.latitude,
                    longitude = point.longitude,
                    timestampMs = point.timestampMs,
                    accuracyM = point.accuracyM,
                    speedMps = point.speedMps,
                    bearingDegrees = point.bearingDegrees,
                    distanceIncrementM = decision.incrementM,
                    accumulatedDistanceM = totals.publishedCumulativeDistanceM,
                    syncStatus = PointSyncStatus.PENDING.name,
                    createdAtMs = nowMs,
                )
                pointDao.insert(entity)
                database.tripSessionDao().update(session.copy(
                    firstLatitude = session.firstLatitude ?: point.latitude,
                    firstLongitude = session.firstLongitude ?: point.longitude,
                    lastLatitude = point.latitude,
                    lastLongitude = point.longitude,
                    lastLocationAtMs = point.timestampMs,
                    lastAccuracyM = point.accuracyM,
                    trackedDistanceM = totals.trackedDistanceM,
                    updatedAtMs = nowMs,
                ))
                PointProcessingResult.Queued(entity)
            }
        }
    }

    private suspend fun queueRecoveryAnchor(
        session: com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity,
        point: LocationSample,
        pointId: String,
        nowMs: Long,
        diagnostic: PointProcessingResult.RecoveryDiagnostic,
    ): PointProcessingResult {
        val pointDao = database.offlinePointDao()
        val sequence = pointDao.maxSequence(session.tripId) + 1
        val entity = OfflinePointEntity(
            pointId = pointId,
            sequenceNumber = sequence,
            tripId = session.tripId,
            driverId = session.driverId,
            vehicleId = session.vehicleId,
            latitude = point.latitude,
            longitude = point.longitude,
            timestampMs = point.timestampMs,
            accuracyM = point.accuracyM,
            speedMps = point.speedMps,
            bearingDegrees = point.bearingDegrees,
            distanceIncrementM = 0.0,
            accumulatedDistanceM = PostRecoveryDistanceAccumulator.recoveryBaseline(
                session.trackedDistanceM,
                session.switchOffGapEstimateM,
            ),
            syncStatus = PointSyncStatus.PENDING.name,
            createdAtMs = nowMs,
        )
        pointDao.insert(entity)
        database.tripSessionDao().update(session.copy(
            lastLatitude = point.latitude,
            lastLongitude = point.longitude,
            lastLocationAtMs = point.timestampMs,
            lastAccuracyM = point.accuracyM,
            updatedAtMs = nowMs,
        ))
        return PointProcessingResult.Queued(entity, diagnostic)
    }

    private fun recoveryRejected(
        code: String,
        reason: String,
        retryRecovery: Boolean,
    ): PointProcessingResult.Rejected = PointProcessingResult.Rejected(
        code = code,
        reason = reason,
        retryRecovery = retryRecovery,
        recoveryDiagnostic = PointProcessingResult.RecoveryDiagnostic(
            status = "REJECTED",
            reason = reason,
            userMessage = if (retryRecovery) {
                "Recovery waiting for a valid GPS fix"
            } else {
                "Recovery checked — gap not added"
            },
        ),
    )
}
