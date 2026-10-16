package com.atozpackersmovers.drivertrackerv5.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication
import com.atozpackersmovers.drivertrackerv5.location.TrackingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val graph = (context.applicationContext as TrackerApplication).graph
                val auth = graph.authSessionProvider.current()
                val active = graph.tripStore.active()
                if (auth.authenticated && auth.assignment != null && active?.serviceExpected == true &&
                    active.driverId == auth.assignment.driverId && active.vehicleId == auth.assignment.vehicleId) {
                    TrackingService.start(context, TrackingService.ACTION_BOOT_RECOVERY, active.tripId)
                    graph.commandSource.startAfterAuthenticatedAssignment()
                }
            } finally { pending.finish() }
        }
    }
}
