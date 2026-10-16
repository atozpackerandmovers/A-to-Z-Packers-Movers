package com.atozpackersmovers.drivertrackerv5

import com.atozpackersmovers.drivertrackerv5.location.PostRecoveryDistanceAccumulator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PostRecoveryDistanceAccumulatorTest {
    @Test
    fun `5 km plus 20 km gap then 5 km live equals 30 km`() {
        var tracked = 5_000.0
        val gap = 20_000.0
        var published = PostRecoveryDistanceAccumulator.recoveryBaseline(tracked, gap)

        repeat(5) {
            val totals = PostRecoveryDistanceAccumulator.addLiveSegment(tracked, gap, 1_000.0)
            tracked = totals.trackedDistanceM
            published = totals.publishedCumulativeDistanceM
        }

        assertEquals(30_000.0, published, 0.0)
    }

    @Test
    fun `recovery baseline contains the accepted gap exactly once`() {
        val first = PostRecoveryDistanceAccumulator.recoveryBaseline(5_000.0, 20_000.0)
        val retry = PostRecoveryDistanceAccumulator.recoveryBaseline(5_000.0, 20_000.0)

        assertEquals(25_000.0, first, 0.0)
        assertEquals(first, retry, 0.0)
    }

    @Test
    fun `post recovery segments remain monotonic`() {
        var tracked = 5_000.0
        val gap = 20_000.0
        var previous = PostRecoveryDistanceAccumulator.recoveryBaseline(tracked, gap)

        repeat(20) {
            val totals = PostRecoveryDistanceAccumulator.addLiveSegment(tracked, gap, 250.0)
            tracked = totals.trackedDistanceM
            assertTrue(totals.publishedCumulativeDistanceM > previous)
            previous = totals.publishedCumulativeDistanceM
        }

        assertEquals(30_000.0, previous, 0.0)
    }

    @Test
    fun `tracked and estimated distances remain separate`() {
        val totals = PostRecoveryDistanceAccumulator.addLiveSegment(
            trackedDistanceM = 5_000.0,
            switchOffGapEstimateM = 20_000.0,
            segmentDistanceM = 1_000.0,
        )

        assertEquals(6_000.0, totals.trackedDistanceM, 0.0)
        assertEquals(26_000.0, totals.publishedCumulativeDistanceM, 0.0)
    }
}
