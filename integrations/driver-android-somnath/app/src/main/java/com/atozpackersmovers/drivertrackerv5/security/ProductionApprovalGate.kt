package com.atozpackersmovers.drivertrackerv5.security

import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import kotlinx.coroutines.tasks.await

data class ProductionApproval(
    val environmentEnabled: Boolean,
    val pilotMode: Boolean,
    val accessEnabled: Boolean,
    val profilePilotEnabled: Boolean,
    val fullRolloutApproved: Boolean,
) {
    val approved: Boolean get() = environmentEnabled && pilotMode && accessEnabled &&
        profilePilotEnabled && !fullRolloutApproved
}

class ProductionApprovalGate {
    private val auth = FirebaseAuth.getInstance()
    private val root = FirebaseDatabase.getInstance(BuildConfig.DATABASE_URL).reference.child(BuildConfig.DATABASE_ROOT)

    suspend fun read(): ProductionApproval {
        check(auth.currentUser?.uid == BuildConfig.DRIVER_UID) { "AUTH_UID_MISMATCH" }
        return ProductionApproval(
            environmentEnabled = root.child("environment/enabled").get().await().getValue(Boolean::class.java) == true,
            pilotMode = root.child("environment/pilotMode").get().await().getValue(Boolean::class.java) == true,
            accessEnabled = root.child("access/${BuildConfig.DRIVER_UID}/enabled").get().await().getValue(Boolean::class.java) == true,
            profilePilotEnabled = root.child("drivers/${BuildConfig.DRIVER_ID}/profile/pilotEnabled").get().await().getValue(Boolean::class.java) == true,
            fullRolloutApproved = root.child("environment/fullRolloutApproved").get().await().getValue(Boolean::class.java) == true,
        )
    }
}
