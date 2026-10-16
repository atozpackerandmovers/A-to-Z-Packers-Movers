package com.atozpackersmovers.drivertrackerv5.location

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.R
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication
import com.atozpackersmovers.drivertrackerv5.offline.UploadWorker
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val processingMutex = Mutex()
    private lateinit var graph: com.atozpackersmovers.drivertrackerv5.application.AppGraph
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var callback: LocationCallback? = null
    private var recoveryPending = false

    override fun onCreate() {
        super.onCreate()
        graph = (application as TrackerApplication).graph
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, notification())
        recoveryPending = recoveryPending || intent == null || intent.action == ACTION_BOOT_RECOVERY
        if (!instanceGuard.acquire()) return START_STICKY
        scope.launch {
            val auth = graph.authSessionProvider.current()
            val active = graph.tripStore.active()
            if (!auth.authenticated || auth.assignment == null || active == null || !active.serviceExpected ||
                active.driverId != auth.assignment.driverId || active.vehicleId != auth.assignment.vehicleId) {
                stopSelf()
            } else {
                graph.commandSource.startAfterAuthenticatedAssignment()
                startLocationUpdates()
                UploadWorker.enqueue(this@TrackingService)
            }
        }
        return START_STICKY
    }

    private fun hasFineLocation(): Boolean = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @Suppress("MissingPermission")
    private fun startLocationUpdates() {
        if (!hasFineLocation() || callback != null) {
            if (!hasFineLocation()) stopSelf()
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 8_000)
            .setMinUpdateIntervalMillis(4_000)
            .setMinUpdateDistanceMeters(2f)
            .build()
        callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.sortedBy { it.time }.forEach { location ->
                    val sample = LocationSample(location.latitude, location.longitude, location.time, location.accuracy, location.speed, location.bearing)
                    scope.launch { processingMutex.withLock {
                        val recoveryAttempted = recoveryPending
                        if (recoveryAttempted) {
                            Log.d(TAG, "Recovery gap detected")
                            graph.diagnostics.update {
                                it.copy(recoveryMessage = "Recovery check in progress")
                            }
                        }
                        val processed = if (recoveryAttempted) {
                            graph.locationProcessor.processRecoveryPoint(sample, graph.switchOffGapHandler, System.currentTimeMillis())
                        } else graph.locationProcessor.process(sample, System.currentTimeMillis())
                        if (recoveryAttempted) {
                            when (processed) {
                                is PointProcessingResult.Queued -> recoveryPending = false
                                is PointProcessingResult.Rejected -> {
                                    recoveryPending = processed.retryRecovery
                                }
                            }
                        }
                        when (processed) {
                            is PointProcessingResult.Queued -> {
                                Log.d(
                                    TAG,
                                    "Point queued: id=${processed.point.pointId}, incrementM=${processed.point.distanceIncrementM}",
                                )
                                processed.recoveryDiagnostic?.let {
                                    Log.d(TAG, "Recovery gap ${it.status.lowercase()}: ${it.reason ?: "accepted"}")
                                }
                            }
                            is PointProcessingResult.Rejected -> {
                                Log.d(TAG, "Point rejected: code=${processed.code}, reason=${processed.reason}")
                                processed.recoveryDiagnostic?.let {
                                    Log.d(TAG, "Recovery gap rejected: ${it.reason ?: processed.reason}")
                                }
                            }
                        }
                        graph.diagnostics.update { current -> current.copy(
                            tracking = true,
                            lastAccuracyM = sample.accuracyM,
                            lastSpeedMps = sample.speedMps,
                            lastUpdatedAtMs = System.currentTimeMillis(),
                            recoveryMessage = processed.recoveryDiagnostic?.userMessage
                                ?: current.recoveryMessage,
                        ) }
                        if (processed is PointProcessingResult.Queued) UploadWorker.enqueue(this@TrackingService)
                    } }
                }
            }
        }
        fused.requestLocationUpdates(request, callback!!, mainLooper)
    }

    override fun onDestroy() {
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
        instanceGuard.release()
        graph.diagnostics.update { it.copy(tracking = false) }
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL_ID, getString(R.string.tracking_channel), NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun notification(): Notification = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle(getString(R.string.tracking_notification))
        .setContentText("${BuildConfig.BUILD_LABEL} • mock/emulator data only")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .build()

    companion object {
        const val ACTION_START = "com.atozpackersmovers.drivertrackerv5.action.START_TRACKING"
        const val ACTION_BOOT_RECOVERY = "com.atozpackersmovers.drivertrackerv5.action.BOOT_RECOVERY"
        private const val CHANNEL_ID = "driver_v5_test_tracking"
        private const val NOTIFICATION_ID = 8855
        private const val TAG = "DriverV5Tracking"
        private val instanceGuard = ServiceInstanceGuard()

        fun start(context: Context, action: String, tripId: String? = null) {
            val intent = Intent(context, TrackingService::class.java).setAction(action).putExtra("trip_id", tripId)
            ContextCompat.startForegroundService(context, intent)
        }
        fun stop(context: Context) { context.stopService(Intent(context, TrackingService::class.java)) }
    }
}
