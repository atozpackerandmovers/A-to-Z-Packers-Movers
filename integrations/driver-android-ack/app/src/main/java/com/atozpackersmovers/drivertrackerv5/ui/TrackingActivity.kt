package com.atozpackersmovers.drivertrackerv5.ui

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication
import com.atozpackersmovers.drivertrackerv5.command.CommandSource
import com.atozpackersmovers.drivertrackerv5.command.TripCommand
import com.atozpackersmovers.drivertrackerv5.command.TripCommandType
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.util.UUID

class TrackingActivity : AppCompatActivity() {
    private val graph by lazy { (application as TrackerApplication).graph }
    private lateinit var stateText: TextView
    private lateinit var commandText: TextView
    private lateinit var gpsText: TextView
    private lateinit var queueText: TextView
    private lateinit var identityText: TextView
    private lateinit var networkText: TextView
    private lateinit var recoveryText: TextView
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { renderSession() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!graph.authSessionProvider.current().authenticated) {
            startActivity(Intent(this, LoginActivity::class.java)); finish(); return
        }
        graph.commandSource.startAfterAuthenticatedAssignment()
        setContentView(buildUi())
        observeNetwork()
        requestCorePermissions()
        lifecycleScope.launch { graph.diagnostics.state.collectLatest { d ->
            gpsText.text = TrackingStatusFormatter.gps(
                tracking = d.tracking,
                accuracyM = d.lastAccuracyM,
                speedMps = d.lastSpeedMps,
            )
            recoveryText.text = TrackingStatusFormatter.recovery(d.recoveryMessage)
            renderSession()
        } }
        lifecycleScope.launch {
            combine(graph.offlineQueue.pendingCount(), graph.offlineQueue.failedCount()) { unsynced, failed -> unsynced to failed }
                .collectLatest { (unsynced, _) -> queueText.text = TrackingStatusFormatter.queue(unsynced) }
        }
        renderSession()
    }

    private fun buildUi(): ScrollView {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 36, 36, 36)
        }
        fun text(value: String, size: Float = 16f) = TextView(this).apply { this.text = value; textSize = size; setPadding(0, 10, 0, 10) }
        content.addView(text(BuildConfig.BUILD_LABEL, 22f).apply { setTextColor(Color.RED); gravity = Gravity.CENTER })
        content.addView(text("Mode: ${graph.firebaseRepository.modeName} • one-driver controlled pilot", 14f))
        identityText = text(""); content.addView(identityText)
        networkText = text("Network: checking"); content.addView(networkText)
        stateText = text(""); content.addView(stateText)
        commandText = text("Command: ready"); content.addView(commandText)
        gpsText = text(TrackingStatusFormatter.gps(tracking = false)); content.addView(gpsText)
        queueText = text(TrackingStatusFormatter.queue(pendingCount = 0)); content.addView(queueText)
        recoveryText = text(TrackingStatusFormatter.recovery(message = null)); content.addView(recoveryText)
        content.addView(Button(this).apply { text = "START is controlled by Production Admin"; isEnabled = false })
        content.addView(Button(this).apply { text = "STOP is controlled by Production Admin"; isEnabled = false })
        content.addView(Button(this).apply {
            text = "RESET disabled — separate approval required"
            isEnabled = BuildConfig.REMOTE_RESET_ENABLED
            setOnClickListener { submit(TripCommandType.RESET) }
        })
        content.addView(Button(this).apply {
            text = "Background location settings"
            setOnClickListener { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
        })
        content.addView(Button(this).apply {
            text = "Battery optimization guidance"
            setOnClickListener { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        })
        content.addView(Button(this).apply {
            text = "Logout and stop service"
            setOnClickListener {
                lifecycleScope.launch {
                    val assignment = graph.authSessionProvider.current().assignment
                    val active = graph.tripStore.active()
                    if (assignment != null && active != null) {
                        val now = System.currentTimeMillis()
                        graph.commandConsumer.consume(TripCommand(
                            commandId = "LOCAL_LOGOUT_STOP_${UUID.randomUUID()}",
                            type = TripCommandType.STOP,
                            driverId = assignment.driverId,
                            vehicleId = assignment.vehicleId,
                            issuedAtMs = now,
                            expiresAtMs = now + 60_000,
                            requestedTripId = active.tripId,
                            source = CommandSource.LOCAL,
                        ))
                    }
                    graph.commandSource.stop()
                    com.atozpackersmovers.drivertrackerv5.location.TrackingService.stop(this@TrackingActivity)
                    graph.authSessionProvider.logout()
                    startActivity(Intent(this@TrackingActivity, LoginActivity::class.java)); finish()
                }
            }
        })
        return ScrollView(this).apply { addView(content) }
    }

    private fun submit(type: TripCommandType) {
        val auth = graph.authSessionProvider.current()
        val assignment = auth.assignment ?: run {
            commandText.text = "Command unavailable: driver assignment is missing."
            return
        }
        val now = System.currentTimeMillis()
        lifecycleScope.launch {
            runCatching {
                val active = graph.tripStore.active()
                if (type == TripCommandType.START && active != null) {
                    commandText.text = "Trip is already running."
                    return@launch
                }
                if (type == TripCommandType.START) {
                    commandText.text = "Acquiring GPS location…"
                }
                graph.commandConsumer.consume(TripCommand(
                    commandId = "LOCAL_${UUID.randomUUID()}",
                    type = type,
                    driverId = assignment.driverId,
                    vehicleId = assignment.vehicleId,
                    issuedAtMs = now,
                    expiresAtMs = now + 60_000,
                    requestedTripId = active?.tripId,
                    source = CommandSource.LOCAL,
                ))
            }.onSuccess { ack ->
                commandText.text = when {
                    ack.tripCommandErrorCode == "ACTIVE_TRIP_EXISTS" -> "Trip is already running."
                    ack.tripCommandErrorCode == "NO_ACTIVE_TRIP" -> "No trip is currently running."
                    ack.tripCommandErrorCode == "FIRST_FIX_FAILED" ->
                        "Unable to get an accurate GPS location. Please move to an open area and try again."
                    else -> "${ack.appliedTripCommandType}: ${ack.tripCommandApplyStatus}\n${ack.tripCommandErrorReason ?: ack.tripCommandResultStatus.orEmpty()}"
                }
            }.onFailure { error ->
                commandText.text = if (type == TripCommandType.START) {
                    "Unable to get an accurate GPS location. Please move to an open area and try again."
                } else {
                    "Unable to stop the trip safely. Please try again."
                }
            }
            renderSession()
        }
    }

    private fun renderSession() {
        val assignment = graph.authSessionProvider.current().assignment
        identityText.text = "Driver: ${assignment?.driverName ?: "—"}\nVehicle: ${assignment?.vehicleNumber ?: "—"}"
        lifecycleScope.launch {
            val active = graph.tripStore.active()
            stateText.text = if (active == null) "Trip: none active" else
                "Trip: ${active.tripId}\nStatus: ${active.status}\nGPS tracked: %.3f km\nSwitch-off estimate: %.3f km\nEstimated total: %.3f km".format(
                    active.trackedDistanceM / 1000, active.switchOffGapEstimateM / 1000, active.estimatedTotalDistanceM / 1000,
                )
        }
    }

    private fun requestCorePermissions() {
        val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) permissions += Manifest.permission.POST_NOTIFICATIONS
        permissionLauncher.launch(permissions.toTypedArray())
    }

    private fun observeNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java)
        connectivityManager = manager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { runOnUiThread { networkText.text = "Network: online • Production pilot connected" } }
            override fun onLost(network: Network) { runOnUiThread { networkText.text = "Network: offline • points remain queued" } }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                runOnUiThread { networkText.text = if (validated) "Network: online • Production pilot connected" else "Network: unavailable/unvalidated" }
            }
        }
        networkCallback = callback
        manager.registerDefaultNetworkCallback(callback)
    }

    override fun onDestroy() {
        networkCallback?.let { runCatching { connectivityManager?.unregisterNetworkCallback(it) } }
        networkCallback = null
        super.onDestroy()
    }
}
