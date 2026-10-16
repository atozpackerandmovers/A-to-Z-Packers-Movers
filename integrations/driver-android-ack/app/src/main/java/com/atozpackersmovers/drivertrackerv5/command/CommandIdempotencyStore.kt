package com.atozpackersmovers.drivertrackerv5.command

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.atozpackersmovers.drivertrackerv5.offline.CommandRecordDao

@Entity(tableName = "command_records")
data class CommandRecordEntity(
    @PrimaryKey val commandId: String,
    val commandType: String,
    val driverId: String,
    val vehicleId: String,
    val receivedAtMs: Long,
    val issuedAtMs: Long,
    val processingStatus: String,
    val appliedAtMs: Long? = null,
    val resultingTripId: String? = null,
    val resultingTripStatus: String? = null,
    val failureReason: String? = null,
    val acknowledgementJson: String? = null,
)

class CommandIdempotencyStore(private val dao: CommandRecordDao) {
    suspend fun previous(commandId: String): CommandRecordEntity? = dao.find(commandId)
    suspend fun latest(driverId: String, vehicleId: String): CommandRecordEntity? = dao.latest(driverId, vehicleId)

    suspend fun begin(command: TripCommand, nowMs: Long): Boolean = dao.insertIfAbsent(
        CommandRecordEntity(
            commandId = command.commandId,
            commandType = command.type.name,
            driverId = command.driverId,
            vehicleId = command.vehicleId,
            receivedAtMs = nowMs,
            issuedAtMs = command.issuedAtMs,
            processingStatus = CommandProcessingStatus.PROCESSING.name,
        ),
    ) != -1L

    suspend fun finish(record: CommandRecordEntity) = dao.update(record)
}
