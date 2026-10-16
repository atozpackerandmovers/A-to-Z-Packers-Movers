package com.atozpackersmovers.drivertrackerv5.firebase

import com.atozpackersmovers.drivertrackerv5.offline.OfflinePointEntity
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity

class FirebaseGpsUploader(private val repository: FirebaseRepository) {
    suspend fun upload(assignment: DriverAssignment, session: TripSessionEntity, point: OfflinePointEntity) {
        require(point.tripId == session.tripId) { "Point/session trip mismatch" }
        require(point.driverId == assignment.driverId && point.vehicleId == assignment.vehicleId) { "Point ownership mismatch" }
        // Create/update the validated trip record before writing its routePoints child.
        repository.uploadTripSummary(assignment, session)
        repository.uploadRoutePoint(assignment, point)
        repository.uploadLive(assignment, session, point)
    }
}
