package com.atozpackersmovers.drivertrackerv5.location

import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import kotlin.math.hypot
import kotlin.math.max

data class LocationValidationPolicy(
    val maximumAcceptedAccuracyM: Float = 50f,
    val minimumMovementM: Double = 7.0,
    val minimumReportedMovementSpeedMps: Float = 0.8f,
    val accuracyNoiseMultiplier: Double = 1.5,
    val maximumJumpM: Double = 500.0,
    val maximumSpeedMps: Double = 55.0,
    val stalePointAgeMs: Long = 120_000,
    val minimumRecoveryGapMs: Long = 120_000,
    val stationaryDwellMs: Long = 20_000,
    val routePointIntervalMs: Long = 15_000,
    val routePointMovementThresholdM: Double = 25.0,
) {
    fun minimumReliableMovementM(previousAccuracyM: Float?, currentAccuracyM: Float): Double =
        max(
            minimumMovementM,
            hypot(
                previousAccuracyM?.coerceAtLeast(0f)?.toDouble() ?: currentAccuracyM.toDouble(),
                currentAccuracyM.coerceAtLeast(0f).toDouble(),
            ) * accuracyNoiseMultiplier,
        )

    companion object { val PROVISIONAL_TEST = LocationValidationPolicy() }
}

sealed class LocationDecision {
    data class Accepted(val incrementM: Double) : LocationDecision()
    data class Rejected(val code: String, val reason: String) : LocationDecision()
}

class LocationValidator(private val policy: LocationValidationPolicy) {
    fun validate(session: TripSessionEntity, point: LocationSample, nowMs: Long): LocationDecision {
        if (!session.isActive) return LocationDecision.Rejected("TRIP_NOT_ACTIVE", "Trip is complete")
        if (point.tripId != null && point.tripId != session.tripId) return LocationDecision.Rejected("WRONG_TRIP", "Point belongs to another trip")
        if (!point.latitude.isFinite() || !point.longitude.isFinite() || point.latitude !in -90.0..90.0 || point.longitude !in -180.0..180.0) {
            return LocationDecision.Rejected("INVALID_COORDINATES", "Coordinates are invalid")
        }
        if (point.accuracyM <= 0f || point.accuracyM > policy.maximumAcceptedAccuracyM) {
            return LocationDecision.Rejected("POOR_ACCURACY", "Accuracy exceeds the provisional test threshold")
        }
        if (point.reportedSpeedAvailable &&
            (!point.speedMps.isFinite() || point.speedMps < 0f || point.speedMps.toDouble() > policy.maximumSpeedMps)) {
            return LocationDecision.Rejected("INVALID_REPORTED_SPEED", "Reported speed is outside the accepted range")
        }
        if (point.timestampMs > nowMs + 30_000 || nowMs - point.timestampMs > policy.stalePointAgeMs) {
            return LocationDecision.Rejected("STALE_TIMESTAMP", "Point timestamp is outside the accepted window")
        }
        val lastAt = session.lastLocationAtMs ?: return LocationDecision.Accepted(0.0)
        if (point.timestampMs <= lastAt) return LocationDecision.Rejected("OUT_OF_ORDER", "Timestamp is not newer than the accepted anchor")
        val lastLat = session.lastLatitude ?: return LocationDecision.Accepted(0.0)
        val lastLon = session.lastLongitude ?: return LocationDecision.Accepted(0.0)
        val distance = DistanceCalculator.haversineM(lastLat, lastLon, point.latitude, point.longitude)
        if (distance < 0.5) return LocationDecision.Rejected("DUPLICATE_COORDINATE", "Coordinate duplicates the accepted anchor")
        if (point.reportedSpeedAvailable && point.speedMps < policy.minimumReportedMovementSpeedMps) {
            return LocationDecision.Rejected("STATIONARY_SPEED", "Reported speed does not show vehicle movement")
        }
        if (distance < policy.minimumReliableMovementM(session.lastAccuracyM, point.accuracyM)) {
            return LocationDecision.Rejected("STATIONARY_NOISE", "Movement is within the GPS accuracy uncertainty")
        }
        val elapsedSeconds = (point.timestampMs - lastAt) / 1000.0
        val derivedSpeed = distance / elapsedSeconds
        if (derivedSpeed > policy.maximumSpeedMps) return LocationDecision.Rejected("IMPOSSIBLE_SPEED", "Derived speed exceeds the provisional threshold")
        if (!point.reportedSpeedAvailable && derivedSpeed < policy.minimumReportedMovementSpeedMps) {
            return LocationDecision.Rejected(
                "STATIONARY_DERIVED_SPEED",
                "Coordinate movement is too slow to prove vehicle movement without reported speed",
            )
        }
        return LocationDecision.Accepted(distance)
    }
}
