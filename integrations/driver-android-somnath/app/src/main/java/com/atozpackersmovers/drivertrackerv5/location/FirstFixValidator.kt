package com.atozpackersmovers.drivertrackerv5.location

/**
 * One shared gate for the location that anchors a new trip.
 *
 * The acquisition layer uses this to ignore cached/stale fused-location
 * results, and the transactional START path repeats the same validation before
 * persisting the trip. Movement and reported speed are deliberately not
 * required: a vehicle may be stationary when the Admin sends START.
 */
object FirstFixValidator {
    private const val MAX_FUTURE_SKEW_MS = 30_000L

    fun isAcceptable(
        sample: LocationSample,
        nowMs: Long,
        policy: LocationValidationPolicy,
    ): Boolean =
        sample.latitude.isFinite() &&
            sample.longitude.isFinite() &&
            sample.latitude in -90.0..90.0 &&
            sample.longitude in -180.0..180.0 &&
            sample.accuracyM.isFinite() &&
            sample.accuracyM > 0f &&
            sample.accuracyM <= policy.maximumAcceptedAccuracyM &&
            sample.timestampMs <= nowMs + MAX_FUTURE_SKEW_MS &&
            nowMs - sample.timestampMs <= policy.stalePointAgeMs
}
