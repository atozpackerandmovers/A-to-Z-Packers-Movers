package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.command.TripCommandConsumer
import com.atozpackersmovers.drivertrackerv5.security.AuthSessionProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

class FirebaseCommandSource(
    private val repository: FirebaseRepository,
    private val authSessionProvider: AuthSessionProvider,
    private val consumer: TripCommandConsumer,
    private val scope: CoroutineScope,
) {
    private var listenerJob: Job? = null

    fun startAfterAuthenticatedAssignment(): Boolean {
        if (listenerJob?.isActive == true) return false
        val session = authSessionProvider.current()
        val assignment = session.assignment ?: return false
        if (!session.authenticated || session.role != "Driver") return false
        listenerJob = scope.launch {
            repository.scopedCommands(assignment).collect { consumer.consume(it) }
        }
        return true
    }

    fun stop() {
        listenerJob?.cancel()
        listenerJob = null
    }

    fun isRunning(): Boolean = listenerJob?.isActive == true
}
