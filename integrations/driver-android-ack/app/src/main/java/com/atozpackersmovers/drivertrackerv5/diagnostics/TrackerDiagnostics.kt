package com.atozpackersmovers.drivertrackerv5.diagnostics

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class DiagnosticState(
    val tracking: Boolean = false,
    val lastAccuracyM: Float? = null,
    val lastSpeedMps: Float? = null,
    val lastUpdatedAtMs: Long? = null,
    val recoveryMessage: String? = null,
)

class TrackerDiagnostics {
    private val mutable = MutableStateFlow(DiagnosticState())
    val state: StateFlow<DiagnosticState> = mutable
    fun update(transform: (DiagnosticState) -> DiagnosticState) { mutable.value = transform(mutable.value) }
}
