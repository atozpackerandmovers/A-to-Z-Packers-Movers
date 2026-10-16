package com.atozpackersmovers.drivertrackerv5.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class TrackingStatusFormatterTest {
    @Test
    fun `queued point is represented without an entity dump`() {
        val status = TrackingStatusFormatter.queue(pendingCount = 1)

        assertEquals("Queue: 1 pending\nLast sync: Pending", status)
        listOf("OfflinePointEntity", "PointProcessingResult", "Rejected(", "Queued(").forEach {
            forbidden -> assertFalse(status.contains(forbidden))
        }
    }

    @Test
    fun `empty queue is shown as synced`() {
        assertEquals(
            "Queue: 0 pending\nLast sync: Synced",
            TrackingStatusFormatter.queue(pendingCount = 0),
        )
    }

    @Test
    fun `running GPS status is concise`() {
        assertEquals(
            "GPS Status: Running\nAccuracy: 4.3 m\nSpeed: 2.0 m/s",
            TrackingStatusFormatter.gps(tracking = true, accuracyM = 4.25f, speedMps = 2f),
        )
    }

    @Test
    fun `recovery status is clean and contains no internal dump`() {
        val status = TrackingStatusFormatter.recovery(
            "Recovery gap added to switch-off estimate",
        )

        assertEquals(
            "Recovery: Recovery gap added to switch-off estimate",
            status,
        )
        listOf("OfflinePointEntity", "PointProcessingResult", "Rejected(", "Queued(").forEach {
            forbidden -> assertFalse(status.contains(forbidden))
        }
    }
}
