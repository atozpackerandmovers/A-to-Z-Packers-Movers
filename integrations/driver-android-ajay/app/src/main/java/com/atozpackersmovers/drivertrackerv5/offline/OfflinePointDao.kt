package com.atozpackersmovers.drivertrackerv5.offline

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.atozpackersmovers.drivertrackerv5.command.CommandRecordEntity
import com.atozpackersmovers.drivertrackerv5.trip.RecoveryGapEntity
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflinePointDao {
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun insert(point: OfflinePointEntity)
    @Update suspend fun update(point: OfflinePointEntity)
    @Query("SELECT * FROM offline_points WHERE pointId = :pointId LIMIT 1")
    suspend fun findByPointId(pointId: String): OfflinePointEntity?
    @Query("SELECT * FROM offline_points WHERE tripId = :tripId AND timestampMs = :timestampMs LIMIT 1")
    suspend fun findByTimestamp(tripId: String, timestampMs: Long): OfflinePointEntity?
    @Query(
        "SELECT COUNT(*) FROM offline_points " +
            "WHERE tripId = :tripId AND timestampMs > :afterTimestampMs AND timestampMs < :beforeTimestampMs",
    )
    suspend fun countBetween(
        tripId: String,
        afterTimestampMs: Long,
        beforeTimestampMs: Long,
    ): Int
    @Query("SELECT * FROM offline_points WHERE syncStatus IN ('PENDING','FAILED','UPLOADING') ORDER BY tripId, sequenceNumber LIMIT :limit")
    suspend fun pending(limit: Int): List<OfflinePointEntity>
    @Query("SELECT COALESCE(MAX(sequenceNumber), 0) FROM offline_points WHERE tripId = :tripId")
    suspend fun maxSequence(tripId: String): Long
    @Query("SELECT COUNT(*) FROM offline_points WHERE syncStatus IN ('PENDING','FAILED','UPLOADING')")
    fun pendingCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM offline_points WHERE syncStatus = 'FAILED'") fun failedCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM offline_points") suspend fun totalCount(): Int
    @Query("DELETE FROM offline_points WHERE syncStatus = 'SYNCED' AND syncedAtMs < :beforeMs")
    suspend fun purgeSynced(beforeMs: Long): Int
}

/**
 * Owns the offline queue and its retention limits.
 *
 * This class intentionally lives beside [OfflinePointDao] so Room, the queue
 * repository, and every queue consumer are compiled from the same Kotlin
 * source set. Its API and queue behaviour are unchanged.
 */
class OfflineQueueRepository(private val dao: OfflinePointDao) {
    companion object {
        const val MAX_QUEUE_POINTS = 50_000
        const val SYNCED_RETENTION_MS = 7L * 24 * 60 * 60 * 1000
        const val MAX_RETRIES = 10
    }

    fun pendingCount(): Flow<Int> = dao.pendingCount()
    fun failedCount(): Flow<Int> = dao.failedCount()
    suspend fun nextBatch(limit: Int = 100): List<OfflinePointEntity> = dao.pending(limit)
    suspend fun totalCount(): Int = dao.totalCount()
    suspend fun canAccept(): Boolean = totalCount() < MAX_QUEUE_POINTS
    suspend fun update(point: OfflinePointEntity) = dao.update(point)
    suspend fun purgeSynced(nowMs: Long): Int = dao.purgeSynced(nowMs - SYNCED_RETENTION_MS)
}

@Dao
interface TripSessionDao {
    @Query("SELECT * FROM trip_sessions WHERE status IN ('STARTING','RUNNING') ORDER BY startedAtMs DESC LIMIT 1")
    suspend fun active(): TripSessionEntity?
    @Query("SELECT * FROM trip_sessions WHERE tripId = :tripId LIMIT 1") suspend fun find(tripId: String): TripSessionEntity?
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun insert(session: TripSessionEntity)
    @Update suspend fun update(session: TripSessionEntity)
}

@Dao
interface CommandRecordDao {
    @Query("SELECT * FROM command_records WHERE commandId = :commandId LIMIT 1") suspend fun find(commandId: String): CommandRecordEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertIfAbsent(record: CommandRecordEntity): Long
    @Update suspend fun update(record: CommandRecordEntity)
    @Query("SELECT * FROM command_records WHERE driverId = :driverId AND vehicleId = :vehicleId ORDER BY issuedAtMs DESC LIMIT 1")
    suspend fun latest(driverId: String, vehicleId: String): CommandRecordEntity?
    @Query("SELECT COUNT(*) FROM command_records WHERE processingStatus = 'PROCESSING'") suspend fun processingCount(): Int
}

@Dao
interface RecoveryGapDao {
    @Query("SELECT * FROM recovery_gaps WHERE gapId = :gapId LIMIT 1") suspend fun find(gapId: String): RecoveryGapEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(gap: RecoveryGapEntity): Long
    @Query("SELECT COUNT(*) FROM recovery_gaps WHERE tripId = :tripId AND includedInEstimatedTotal = 1")
    suspend fun acceptedCount(tripId: String): Int
}
