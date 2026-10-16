package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.command.TripCommandConsumer
import com.atozpackersmovers.drivertrackerv5.security.AuthSessionProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.CancellationException

class FirebaseCommandSource(
    private val repository: FirebaseRepository,
    private val authSessionProvider: AuthSessionProvider,
    private val consumer: TripCommandConsumer,
    private val scope: CoroutineScope,
) {
    private var listenerJob: Job? = null
    private var acknowledgementRetryJob: Job? = null

    fun startAfterAuthenticatedAssignment(): Boolean {
        if (listenerJob?.isActive == true) return false
        val session = authSessionProvider.current()
        val assignment = session.assignment ?: return false
        if (!session.authenticated || session.role != "Driver") return false
        if (acknowledgementRetryJob?.isActive != true) acknowledgementRetryJob = scope.launch {
            while (isActive) {
                try { consumer.retryPendingAcknowledgements() }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* Durable outbox remains available for the next attempt. */ }
                delay(15_000)
            }
        }
        listenerJob = scope.launch {
            repository.scopedCommands(assignment).collect { consumer.consume(it) }
        }
        return true
    }

    fun stop() {
        listenerJob?.cancel()
        listenerJob = null
        acknowledgementRetryJob?.cancel()
        acknowledgementRetryJob = null
    }

    fun isRunning(): Boolean = listenerJob?.isActive == true
}
