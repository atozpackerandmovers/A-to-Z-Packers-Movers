package com.atozpackersmovers.drivertrackerv5.location

import androidx.room.withTransaction
import com.atozpackersmovers.drivertrackerv5.offline.TrackerDatabase
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity

class SwitchOffGapHandler(
    private val database: TrackerDatabase,
    private val policy: LocationValidationPolicy,
) {
    private val evaluator = RecoveryGapEvaluator(policy)

    fun evaluate(
        session: TripSessionEntity,
        firstAfterRestart: LocationSample,
        nowMs: Long,
    ): RecoveryGapDecision = evaluator.evaluate(session, firstAfterRestart, nowMs)

    suspend fun recover(session: TripSessionEntity, firstAfterRestart: LocationSample, nowMs: Long): TripSessionEntity = database.withTransaction {
        val decision = evaluate(session, firstAfterRestart, nowMs)
        if (decision !is RecoveryGapDecision.Accepted) return@withTransaction session
        if (database.recoveryGapDao().insert(decision.gap) == -1L) return@withTransaction session
        database.tripSessionDao().update(decision.updatedSession)
        decision.updatedSession
    }
}
