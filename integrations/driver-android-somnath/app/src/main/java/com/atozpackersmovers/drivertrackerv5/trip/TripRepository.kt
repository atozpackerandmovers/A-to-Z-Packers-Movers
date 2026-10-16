package com.atozpackersmovers.drivertrackerv5.trip

/** Read-only façade used by UI and diagnostics; state changes stay in TripStateMachine. */
class TripRepository(private val store: TripSessionStore) {
    suspend fun activeTrip(): TripSessionEntity? = store.active()
    suspend fun trip(tripId: String): TripSessionEntity? = store.find(tripId)
}
