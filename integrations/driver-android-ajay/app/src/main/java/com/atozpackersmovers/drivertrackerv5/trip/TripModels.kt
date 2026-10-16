package com.atozpackersmovers.drivertrackerv5.trip

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class TripStatus { STARTING, RUNNING, COMPLETED, RESET_TEST, FAILED }

data class DriverAssignment(
    val driverId: String,
    val driverName: String,
    val vehicleId: String,
    val vehicleNumber: String,
)

@Entity(tableName = "trip_sessions")
data class TripSessionEntity(
    @PrimaryKey val tripId: String,
    val driverId: String,
    val driverName: String,
    val vehicleId: String,
    val vehicleNumber: String,
    val status: String,
    val startedAtMs: Long,
    val stoppedAtMs: Long? = null,
    val firstLatitude: Double? = null,
    val firstLongitude: Double? = null,
    val lastLatitude: Double? = null,
    val lastLongitude: Double? = null,
    val lastLocationAtMs: Long? = null,
    val lastAccuracyM: Float? = null,
    val trackedDistanceM: Double = 0.0,
    val switchOffGapEstimateM: Double = 0.0,
    val lastAppliedCommandId: String? = null,
    val serviceExpected: Boolean = false,
    val resetGeneration: Int = 0,
    val updatedAtMs: Long,
) {
    val isActive: Boolean get() = status == TripStatus.STARTING.name || status == TripStatus.RUNNING.name
    val estimatedTotalDistanceM: Double get() = trackedDistanceM + switchOffGapEstimateM
}

@Entity(tableName = "recovery_gaps")
data class RecoveryGapEntity(
    @PrimaryKey val gapId: String,
    val tripId: String,
    val fromTimestampMs: Long,
    val toTimestampMs: Long,
    val fromLatitude: Double,
    val fromLongitude: Double,
    val toLatitude: Double,
    val toLongitude: Double,
    val estimatedDistanceM: Double,
    val reviewRequired: Boolean,
    val includedInEstimatedTotal: Boolean,
    val createdAtMs: Long,
)
