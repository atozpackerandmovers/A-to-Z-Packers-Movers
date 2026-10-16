package com.atozpackersmovers.drivertrackerv5.location

/**
 * Keeps GPS-tracked distance and accepted switch-off estimates separate while
 * publishing one monotonic cumulative total to every downstream consumer.
 */
object PostRecoveryDistanceAccumulator {
    data class Totals(
        val trackedDistanceM: Double,
        val publishedCumulativeDistanceM: Double,
    )

    fun recoveryBaseline(trackedDistanceM: Double, switchOffGapEstimateM: Double): Double {
        requireValid(trackedDistanceM, "trackedDistanceM")
        requireValid(switchOffGapEstimateM, "switchOffGapEstimateM")
        return trackedDistanceM + switchOffGapEstimateM
    }

    fun addLiveSegment(
        trackedDistanceM: Double,
        switchOffGapEstimateM: Double,
        segmentDistanceM: Double,
    ): Totals {
        requireValid(trackedDistanceM, "trackedDistanceM")
        requireValid(switchOffGapEstimateM, "switchOffGapEstimateM")
        requireValid(segmentDistanceM, "segmentDistanceM")
        val updatedTracked = trackedDistanceM + segmentDistanceM
        return Totals(
            trackedDistanceM = updatedTracked,
            publishedCumulativeDistanceM = updatedTracked + switchOffGapEstimateM,
        )
    }

    private fun requireValid(value: Double, name: String) {
        require(value.isFinite() && value >= 0.0) { "$name must be finite and non-negative" }
    }
}
