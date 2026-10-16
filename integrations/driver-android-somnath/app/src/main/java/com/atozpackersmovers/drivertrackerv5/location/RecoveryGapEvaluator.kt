package com.atozpackersmovers.drivertrackerv5.location

import com.atozpackersmovers.drivertrackerv5.trip.RecoveryGapEntity
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import java.security.MessageDigest

sealed class RecoveryGapDecision {
    data class Accepted(
        val gap: RecoveryGapEntity,
        val updatedSession: TripSessionEntity,
    ) : RecoveryGapDecision()

    data class Rejected(
        val code: String,
        val reason: String,
        val retryWithNextFix: Boolean,
        val anchorValidPoint: Boolean = false,
    ) : RecoveryGapDecision()
}

class RecoveryGapEvaluator(
    private val policy: LocationValidationPolicy,
) {
    fun evaluate(
        session: TripSessionEntity,
        firstAfterRestart: LocationSample,
        nowMs: Long,
    ): RecoveryGapDecision {
        if (!session.isActive || !session.serviceExpected) {
            return RecoveryGapDecision.Rejected("TRIP_NOT_ACTIVE", "The same trip is not active", false)
        }
        if (firstAfterRestart.tripId != null && firstAfterRestart.tripId != session.tripId) {
            return RecoveryGapDecision.Rejected("WRONG_TRIP_ID", "The recovery fix belongs to another trip", false)
        }
        val fromAt = session.lastLocationAtMs
            ?: return RecoveryGapDecision.Rejected("MISSING_ANCHOR_TIME", "No pre-restart timestamp is available", false)
        val fromLat = session.lastLatitude
            ?: return RecoveryGapDecision.Rejected("MISSING_ANCHOR_LOCATION", "No pre-restart latitude is available", false)
        val fromLon = session.lastLongitude
            ?: return RecoveryGapDecision.Rejected("MISSING_ANCHOR_LOCATION", "No pre-restart longitude is available", false)
        if (fromAt <= 0L || firstAfterRestart.timestampMs <= fromAt ||
            firstAfterRestart.timestampMs > nowMs + FUTURE_TOLERANCE_MS) {
            return RecoveryGapDecision.Rejected("INVALID_TIMESTAMPS", "Recovery timestamps are invalid", true)
        }
        val gapDurationMs = firstAfterRestart.timestampMs - fromAt
        if (gapDurationMs < policy.minimumRecoveryGapMs) {
            return RecoveryGapDecision.Rejected("GAP_TOO_SHORT", "No significant recording gap was detected", false)
        }
        if (!firstAfterRestart.latitude.isFinite() || !firstAfterRestart.longitude.isFinite() ||
            firstAfterRestart.latitude !in -90.0..90.0 || firstAfterRestart.longitude !in -180.0..180.0) {
            return RecoveryGapDecision.Rejected("INVALID_COORDINATES", "Recovery coordinates are invalid", true)
        }
        if (firstAfterRestart.accuracyM <= 0f ||
            firstAfterRestart.accuracyM > policy.maximumAcceptedAccuracyM) {
            return RecoveryGapDecision.Rejected("POOR_FIRST_FIX_ACCURACY", "The first recovery fix is not accurate enough", true)
        }
        if (!firstAfterRestart.speedMps.isFinite() || firstAfterRestart.speedMps < 0f ||
            firstAfterRestart.speedMps.toDouble() > policy.maximumSpeedMps) {
            return RecoveryGapDecision.Rejected("INVALID_REPORTED_SPEED", "Reported recovery speed is invalid", true)
        }
        val estimate = DistanceCalculator.haversineM(
            fromLat,
            fromLon,
            firstAfterRestart.latitude,
            firstAfterRestart.longitude,
        )
        if (!estimate.isFinite() || estimate < 0.0) {
            return RecoveryGapDecision.Rejected("INVALID_GAP_DISTANCE", "Recovery distance is invalid", true)
        }
        if (estimate < policy.minimumReliableMovementM(session.lastAccuracyM, firstAfterRestart.accuracyM)) {
            return RecoveryGapDecision.Rejected(
                "SAME_LOCATION_RESTART",
                "The restart location is unchanged within GPS accuracy",
                retryWithNextFix = false,
                anchorValidPoint = true,
            )
        }
        val derivedSpeedMps = estimate / (gapDurationMs / 1000.0)
        if (!derivedSpeedMps.isFinite() || derivedSpeedMps > policy.maximumSpeedMps) {
            return RecoveryGapDecision.Rejected(
                "PHYSICALLY_IMPOSSIBLE_JUMP",
                "The recovery jump exceeds the physical speed limit",
                true,
            )
        }
        val raw = listOf(
            session.tripId,
            fromAt,
            firstAfterRestart.timestampMs,
            fromLat,
            fromLon,
            firstAfterRestart.latitude,
            firstAfterRestart.longitude,
        ).joinToString(":")
        val gapId = "GAP_" + MessageDigest.getInstance("SHA-256")
            .digest(raw.toByteArray())
            .take(12)
            .joinToString("") { "%02x".format(it) }
        val gap = RecoveryGapEntity(
            gapId = gapId,
            tripId = session.tripId,
            fromTimestampMs = fromAt,
            toTimestampMs = firstAfterRestart.timestampMs,
            fromLatitude = fromLat,
            fromLongitude = fromLon,
            toLatitude = firstAfterRestart.latitude,
            toLongitude = firstAfterRestart.longitude,
            estimatedDistanceM = estimate,
            reviewRequired = false,
            includedInEstimatedTotal = true,
            createdAtMs = nowMs,
        )
        return RecoveryGapDecision.Accepted(
            gap = gap,
            updatedSession = session.copy(
                lastLatitude = firstAfterRestart.latitude,
                lastLongitude = firstAfterRestart.longitude,
                lastLocationAtMs = firstAfterRestart.timestampMs,
                lastAccuracyM = firstAfterRestart.accuracyM,
                switchOffGapEstimateM = session.switchOffGapEstimateM + estimate,
                updatedAtMs = nowMs,
            ),
        )
    }

    companion object {
        private const val FUTURE_TOLERANCE_MS = 30_000L
    }
}
