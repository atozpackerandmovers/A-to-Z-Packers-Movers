package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.command.CommandAcknowledgement
import com.atozpackersmovers.drivertrackerv5.command.CommandSource
import com.atozpackersmovers.drivertrackerv5.command.TripCommand
import com.atozpackersmovers.drivertrackerv5.command.TripCommandParser
import com.atozpackersmovers.drivertrackerv5.offline.OfflinePointEntity
import com.atozpackersmovers.drivertrackerv5.offline.TripSessionDao
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.ChildEventListener
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

class ProductionFirebaseRepository(private val tripSessions: TripSessionDao) : FirebaseRepository {
    override val modeName: String = "PRODUCTION_PILOT"
    private val auth = FirebaseAuth.getInstance()
    private val root = FirebaseDatabase.getInstance(BuildConfig.DATABASE_URL).reference.child(BuildConfig.DATABASE_ROOT)
    private val driverRoot get() = root.child("drivers").child(BuildConfig.DRIVER_ID)

    private fun requirePilot(assignment: DriverAssignment) {
        check(BuildConfig.PRODUCTION_FIREBASE_ENABLED && BuildConfig.PILOT_ENABLED)
        check(!BuildConfig.REMOTE_RESET_ENABLED)
        check(auth.currentUser?.uid == BuildConfig.DRIVER_UID) { "AUTH_UID_MISMATCH" }
        check(assignment.driverId == BuildConfig.DRIVER_ID && assignment.vehicleId == BuildConfig.VEHICLE_ID) {
            "ASSIGNMENT_MISMATCH"
        }
    }

    override fun scopedCommands(assignment: DriverAssignment): Flow<TripCommand> = callbackFlow {
        requirePilot(assignment)
        val reference = driverRoot.child("commands")
        val listener = object : ChildEventListener {
            override fun onChildAdded(snapshot: DataSnapshot, previousChildName: String?) {
                val fields = snapshot.children.associate { it.key.orEmpty() to it.value }.toMutableMap()
                fields.putIfAbsent("commandId", snapshot.key)
                TripCommandParser.parse(fields, CommandSource.PRODUCTION_REMOTE).getOrNull()?.let { command ->
                    if (command.type.name != "RESET") trySend(command)
                }
            }
            override fun onChildChanged(snapshot: DataSnapshot, previousChildName: String?) = Unit
            override fun onChildRemoved(snapshot: DataSnapshot) = Unit
            override fun onChildMoved(snapshot: DataSnapshot, previousChildName: String?) = Unit
            override fun onCancelled(error: DatabaseError) { close(error.toException()) }
        }
        reference.addChildEventListener(listener)
        awaitClose { reference.removeEventListener(listener) }
    }

    private fun acknowledgementProtocol(assignment: DriverAssignment) = DriverAcknowledgementProtocol(
        object : CommandAckWire {
            override suspend fun readServerCommand(commandId: String): Map<String, Any?> {
                requirePilot(assignment)
                val user = checkNotNull(auth.currentUser)
                val token = checkNotNull(user.getIdToken(false).await().token) { "AUTH_TOKEN_UNAVAILABLE" }
                requirePilot(assignment)
                check(auth.currentUser === user) { "AUTH_SESSION_CHANGED" }
                val body = ServerCommandReader().read(BuildConfig.DATABASE_URL, BuildConfig.DATABASE_ROOT,
                    BuildConfig.DRIVER_ID, commandId, token)
                requirePilot(assignment)
                val json = JSONObject(body)
                return json.keys().asSequence().associateWith { key -> json.opt(key).takeUnless { it == JSONObject.NULL } }
            }
            override suspend fun update(updates: Map<String, Any?>) {
                requirePilot(assignment)
                driverRoot.updateChildren(updates).await()
            }
        }, BuildConfig.DRIVER_ID, BuildConfig.DRIVER_UID, BuildConfig.VEHICLE_ID, ServerValue.TIMESTAMP,
    )

    override suspend fun markCommandReceived(assignment: DriverAssignment, command: TripCommand) {
        requirePilot(assignment)
        acknowledgementProtocol(assignment).received(command.commandId, command.type.name)
    }

    override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
        requirePilot(assignment)
        acknowledgementProtocol(assignment).deliver(acknowledgement)
    }

    override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
        requirePilot(assignment)
        CommandTripSummaryDelivery(tripSessions::find, tripSessions::completedByCommand) { session ->
            uploadTripSummary(assignment, session)
        }.deliver(assignment, acknowledgement)
    }

    override suspend fun uploadLive(assignment: DriverAssignment, session: TripSessionEntity, point: OfflinePointEntity) {
        requirePilot(assignment)
        driverRoot.child("live").setValue(mapOf(
            "driverId" to BuildConfig.DRIVER_ID, "vehicleId" to BuildConfig.VEHICLE_ID,
            "status" to session.status, "activeTripId" to session.tripId,
            "distanceMeters" to session.estimatedTotalDistanceM,
            "latitude" to point.latitude, "longitude" to point.longitude,
            "accuracyMeters" to point.accuracyM, "speedMps" to point.speedMps,
            "queuePending" to 0, "lastSyncAt" to ServerValue.TIMESTAMP,
        )).await()
    }

    override suspend fun uploadRoutePoint(assignment: DriverAssignment, point: OfflinePointEntity) {
        requirePilot(assignment)
        driverRoot.child("trips").child(point.tripId).child("routePoints").child(point.pointId).setValue(mapOf(
            "pointId" to point.pointId, "tripId" to point.tripId,
            "driverId" to BuildConfig.DRIVER_ID, "vehicleId" to BuildConfig.VEHICLE_ID,
            "latitude" to point.latitude, "longitude" to point.longitude,
            "timestampMs" to point.timestampMs, "accuracyMeters" to point.accuracyM,
            "speedMps" to point.speedMps, "accumulatedDistanceMeters" to point.accumulatedDistanceM,
        )).await()
    }

    override suspend fun uploadTripSummary(assignment: DriverAssignment, session: TripSessionEntity) {
        requirePilot(assignment)
        driverRoot.child("trips").child(session.tripId).updateChildren(mapOf(
            "tripId" to session.tripId, "driverId" to BuildConfig.DRIVER_ID,
            "vehicleId" to BuildConfig.VEHICLE_ID, "driverName" to BuildConfig.DRIVER_NAME,
            "vehicleNumber" to BuildConfig.VEHICLE_NUMBER, "status" to session.status,
            "startedAtMs" to session.startedAtMs, "stoppedAtMs" to session.stoppedAtMs,
            "distanceMeters" to session.estimatedTotalDistanceM, "updatedAtMs" to session.updatedAtMs,
        )).await()
    }
}
