package com.atozpackersmovers.drivertrackerv5.security

import android.content.Context
import java.util.UUID

class DeviceIdentityProvider(context: Context) {
    private val prefs = context.getSharedPreferences("v5_test_device", Context.MODE_PRIVATE)
    fun stableId(): String = prefs.getString("device_id", null) ?: "TEST_DEVICE_${UUID.randomUUID()}".also {
        prefs.edit().putString("device_id", it).apply()
    }
}
