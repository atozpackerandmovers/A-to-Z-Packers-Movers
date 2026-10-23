package com.atozpackersmovers.drivertrackerv5.offline

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

enum class PointSyncStatus { PENDING, UPLOADING, SYNCED, FAILED }

@Entity(
    tableName = "offline_points",
    indices = [
        Index(value = ["tripId", "sequenceNumber"], unique = true),
        Index(value = ["tripId", "timestampMs"], unique = true),
        Index(value = ["syncStatus", "createdAtMs"]),
    ],
)
data class OfflinePointEntity(
    @PrimaryKey val pointId: String,
    val sequenceNumber: Long,
    val tripId: String,
    val driverId: String,
    val vehicleId: String,
    val latitude: Double,
    val longitude: Double,
    val timestampMs: Long,
    val accuracyM: Float,
    val speedMps: Float,
    val bearingDegrees: Float,
    val distanceIncrementM: Double,
    val accumulatedDistanceM: Double,
    val syncStatus: String = PointSyncStatus.PENDING.name,
    val retryCount: Int = 0,
    val createdAtMs: Long,
    val syncedAtMs: Long? = null,
    val failureReason: String? = null,
)
