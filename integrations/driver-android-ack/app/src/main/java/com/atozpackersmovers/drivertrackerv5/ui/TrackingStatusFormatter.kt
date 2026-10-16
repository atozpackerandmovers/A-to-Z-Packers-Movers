package com.atozpackersmovers.drivertrackerv5.ui

import java.util.Locale

internal object TrackingStatusFormatter {
    fun gps(
        tracking: Boolean,
        accuracyM: Float? = null,
        speedMps: Float? = null,
    ): String = buildString {
        append("GPS Status: ")
        append(if (tracking) "Running" else "Stopped")
        append("\nAccuracy: ")
        append(accuracyM?.let { String.format(Locale.US, "%.1f m", it) } ?: "Waiting")
        append("\nSpeed: ")
        append(speedMps?.let { String.format(Locale.US, "%.1f m/s", it) } ?: "Waiting")
    }

    fun queue(pendingCount: Int): String {
        val safePendingCount = pendingCount.coerceAtLeast(0)
        val syncStatus = if (safePendingCount == 0) "Synced" else "Pending"
        return "Queue: $safePendingCount pending\nLast sync: $syncStatus"
    }

    fun recovery(message: String?): String =
        message?.let { "Recovery: $it" } ?: "Recovery: No pending gap"
}
