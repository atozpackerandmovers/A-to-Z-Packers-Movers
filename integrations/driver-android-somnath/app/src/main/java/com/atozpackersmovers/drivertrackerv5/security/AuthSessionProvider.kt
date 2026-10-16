package com.atozpackersmovers.drivertrackerv5.security

import android.content.Context
import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.google.firebase.auth.FirebaseAuth

data class AuthSession(
    val authenticated: Boolean,
    val role: String,
    val assignment: DriverAssignment?,
    val mode: String,
)

class AuthSessionProvider(context: Context) {
    private val auth = FirebaseAuth.getInstance()
    private val preferences = context.getSharedPreferences("production_pilot_gate", Context.MODE_PRIVATE)

    fun setPilotApproved(approved: Boolean) {
        preferences.edit().putBoolean("approved", approved).apply()
    }

    fun current(): AuthSession {
        val assignment = DriverAssignment(
            driverId = BuildConfig.DRIVER_ID,
            driverName = BuildConfig.DRIVER_NAME,
            vehicleId = BuildConfig.VEHICLE_ID,
            vehicleNumber = BuildConfig.VEHICLE_NUMBER,
        )
        return AuthSession(
            authenticated = auth.currentUser?.uid == BuildConfig.DRIVER_UID &&
                preferences.getBoolean("approved", false),
            role = "Driver",
            assignment = assignment,
            mode = if (preferences.getBoolean("approved", false)) "PRODUCTION_PILOT" else "WAITING_FOR_APPROVAL",
        )
    }

    fun logout() {
        setPilotApproved(false)
        auth.signOut()
    }
}
