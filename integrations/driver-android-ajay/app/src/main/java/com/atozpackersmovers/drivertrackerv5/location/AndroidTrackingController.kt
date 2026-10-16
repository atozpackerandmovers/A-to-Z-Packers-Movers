package com.atozpackersmovers.drivertrackerv5.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.atozpackersmovers.drivertrackerv5.command.TrackingController
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.atozpackersmovers.drivertrackerv5.offline.UploadWorker
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class AndroidTrackingController(private val context: Context) : TrackingController {
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(context) }

    @SuppressLint("MissingPermission")
    override suspend fun acquireFirstAcceptedFix(): Result<LocationSample> {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return Result.failure(AccurateLocationUnavailableException())
        }

        val sample = runCatching {
            withTimeoutOrNull(ACQUISITION_TIMEOUT_MS) {
                suspendCancellableCoroutine<LocationSample> { continuation ->
                val callback = object : LocationCallback() {
                    override fun onLocationResult(result: LocationResult) {
                        val location = result.locations
                            .asReversed()
                            .firstOrNull {
                                it.accuracy > 0f &&
                                    it.accuracy <= LocationValidationPolicy.PROVISIONAL_TEST.maximumAcceptedAccuracyM
                            } ?: return

                        fused.removeLocationUpdates(this)
                        if (continuation.isActive) {
                            continuation.resume(
                                LocationSample(
                                    location.latitude,
                                    location.longitude,
                                    location.time,
                                    location.accuracy,
                                    location.speed,
                                    location.bearing,
                                ),
                            )
                        }
                    }
                }

                val request = LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    ACQUISITION_INTERVAL_MS,
                )
                    .setMinUpdateIntervalMillis(ACQUISITION_INTERVAL_MS)
                    .setMaxUpdateDelayMillis(ACQUISITION_INTERVAL_MS)
                    .build()

                    continuation.invokeOnCancellation { fused.removeLocationUpdates(callback) }
                    fused.requestLocationUpdates(request, callback, context.mainLooper)
                        .addOnFailureListener { error ->
                            fused.removeLocationUpdates(callback)
                            if (continuation.isActive) continuation.resumeWith(Result.failure(error))
                        }
                }
            }
        }.getOrNull()

        return sample?.let(Result.Companion::success)
            ?: Result.failure(AccurateLocationUnavailableException())
    }

    override suspend fun startExactlyOnce(tripId: String): Result<Unit> = runCatching {
        TrackingService.start(context, TrackingService.ACTION_START, tripId)
    }

    override suspend fun stopSafely(): Result<Unit> = runCatching {
        TrackingService.stop(context)
        UploadWorker.enqueue(context)
    }

    private companion object {
        const val ACQUISITION_TIMEOUT_MS = 60_000L
        const val ACQUISITION_INTERVAL_MS = 1_000L
    }
}

class AccurateLocationUnavailableException : IllegalStateException(
    "Unable to get an accurate GPS location. Please move to an open area and try again.",
)
