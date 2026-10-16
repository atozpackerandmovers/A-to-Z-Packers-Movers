package com.atozpackersmovers.drivertrackerv5.location

data class LocationSample(
    val latitude: Double,
    val longitude: Double,
    val timestampMs: Long,
    val accuracyM: Float,
    val speedMps: Float,
    val bearingDegrees: Float,
    val tripId: String? = null,
)

object LocationPointIdentity {
    fun create(tripId: String, timestampMs: Long): String = "${tripId}_GPS_$timestampMs"
}
