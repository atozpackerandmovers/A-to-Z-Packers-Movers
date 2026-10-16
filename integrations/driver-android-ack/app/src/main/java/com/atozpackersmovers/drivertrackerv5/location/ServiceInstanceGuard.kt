package com.atozpackersmovers.drivertrackerv5.location

import java.util.concurrent.atomic.AtomicBoolean

class ServiceInstanceGuard {
    private val held = AtomicBoolean(false)
    fun acquire(): Boolean = held.compareAndSet(false, true)
    fun release() = held.set(false)
    fun isHeld(): Boolean = held.get()
}
