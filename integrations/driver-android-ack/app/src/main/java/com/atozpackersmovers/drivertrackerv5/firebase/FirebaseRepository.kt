package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.command.CommandAcknowledgement
import com.atozpackersmovers.drivertrackerv5.command.TripCommand
import com.atozpackersmovers.drivertrackerv5.offline.OfflinePointEntity
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import kotlinx.coroutines.flow.Flow

interface FirebaseRepository : com.atozpackersmovers.drivertrackerv5.command.AcknowledgementChannel {
    val modeName: String
    fun scopedCommands(assignment: DriverAssignment): Flow<TripCommand>
    override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement)
    suspend fun uploadLive(assignment: DriverAssignment, session: TripSessionEntity, point: OfflinePointEntity)
    suspend fun uploadRoutePoint(assignment: DriverAssignment, point: OfflinePointEntity)
    suspend fun uploadTripSummary(assignment: DriverAssignment, session: TripSessionEntity)
}

