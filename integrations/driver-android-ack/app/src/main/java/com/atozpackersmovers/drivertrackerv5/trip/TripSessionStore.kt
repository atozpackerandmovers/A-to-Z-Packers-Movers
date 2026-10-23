package com.atozpackersmovers.drivertrackerv5.trip

import com.atozpackersmovers.drivertrackerv5.offline.TripSessionDao

class TripSessionStore(private val dao: TripSessionDao) {
    suspend fun active(): TripSessionEntity? = dao.active()
    suspend fun find(tripId: String): TripSessionEntity? = dao.find(tripId)
    suspend fun insert(session: TripSessionEntity) = dao.insert(session)
    suspend fun update(session: TripSessionEntity) = dao.update(session)
}

