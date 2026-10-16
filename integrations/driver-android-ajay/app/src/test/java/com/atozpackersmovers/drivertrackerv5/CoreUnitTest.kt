package com.atozpackersmovers.drivertrackerv5

import com.atozpackersmovers.drivertrackerv5.command.*
import com.atozpackersmovers.drivertrackerv5.location.*
import com.atozpackersmovers.drivertrackerv5.security.AuthSession
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import com.atozpackersmovers.drivertrackerv5.trip.TripStatus
import org.junit.Assert.*
import org.junit.Test

class CoreUnitTest {
    private val assignment = DriverAssignment("TEST_DRIVER_1", "Driver", "TEST_VEHICLE_1", "TEST-1")
    private val auth = AuthSession(true, "Driver", assignment, "MOCK_ONLY")
    private val now = 1_000_000L

    private fun command(type: TripCommandType = TripCommandType.START, id: String = "COMMAND_001") = TripCommand(
        id, type, assignment.driverId, assignment.vehicleId, now - 1_000, now + 60_000, source = CommandSource.MOCK_REMOTE,
    )

    private fun session(lastLat: Double = 20.0, lastLon: Double = 85.0, lastAt: Long = now - 10_000) = TripSessionEntity(
        tripId = "TEST_TRIP_1", driverId = assignment.driverId, driverName = assignment.driverName,
        vehicleId = assignment.vehicleId, vehicleNumber = assignment.vehicleNumber, status = TripStatus.RUNNING.name,
        startedAtMs = now - 60_000, firstLatitude = 20.0, firstLongitude = 85.0,
        lastLatitude = lastLat, lastLongitude = lastLon, lastLocationAtMs = lastAt,
        lastAccuracyM = 5f, serviceExpected = true, updatedAtMs = now - 10_000,
    )

    @Test fun `01 command parsing`() {
        val parsed = TripCommandParser.parse(mapOf(
            "trip_command_id" to "COMMAND_001", "trip_command" to "START",
            "driver_id" to assignment.driverId, "vehicle_id" to assignment.vehicleId,
            "issued_at_ms" to now, "expires_at_ms" to now + 10_000,
        ), CommandSource.MOCK_REMOTE).getOrThrow()
        assertEquals(TripCommandType.START, parsed.type)
        assertTrue(TripCommandParser.parse(emptyMap(), CommandSource.MOCK_REMOTE).isFailure)
    }

    @Test fun `07 reset disabled`() {
        val failure = TripCommandValidator(resetEnabled = false).validate(command(TripCommandType.RESET), auth, now)
        assertEquals("RESET_DISABLED", failure?.code)
    }

    @Test fun `09 acknowledgement success round trip`() {
        val original = CommandAcknowledgement("COMMAND_001", "START", "APPLIED", now,
            tripCommandResultTripId = "TEST_TRIP_1", tripCommandResultStatus = "RUNNING",
            tripCommandReceiverDeviceId = "TEST_DEVICE", tripCommandReceiverBuild = "5.0.4-test",
            tripCommandReceiverSource = "MOCK_REMOTE")
        assertEquals(original, CommandAcknowledgementCodec.decode(CommandAcknowledgementCodec.encode(original)))
        assertEquals("COMMAND_001", original.asCompatibilityFields()["applied_trip_command_id"])
    }

    @Test fun `12 stale command`() {
        val stale = command().copy(issuedAtMs = now - 600_000, expiresAtMs = now - 1)
        assertEquals("STALE_COMMAND", TripCommandValidator(resetEnabled = false).validate(stale, auth, now)?.code)
    }

    @Test fun `future command timestamp`() {
        val future = command().copy(issuedAtMs = now + 60_000)
        assertEquals("FUTURE_COMMAND", TripCommandValidator(resetEnabled = false).validate(future, auth, now)?.code)
    }

    @Test fun `14 duplicate service start`() {
        val guard = ServiceInstanceGuard()
        assertTrue(guard.acquire())
        assertFalse(guard.acquire())
        guard.release()
        assertTrue(guard.acquire())
    }

    @Test fun `16 stationary GPS noise`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.00001, 85.00001, now, 5f, 0f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "STATIONARY_SPEED")
    }

    @Test fun `17 normal vehicle movement`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.0005, 85.0, now, 5f, 6f, 0f), now,
        )
        assertTrue(result is LocationDecision.Accepted && result.incrementM > 40)
    }

    @Test fun `18 impossible jump`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(21.0, 86.0, now, 5f, 1f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected)
    }

    @Test fun `19 poor accuracy`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.001, 85.0, now, 90f, 2f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "POOR_ACCURACY")
    }

    @Test fun `20 duplicate location and rejected anchor`() {
        val validator = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST)
        val duplicate = validator.validate(session(), LocationSample(20.0, 85.0, now, 5f, 2f, 0f), now)
        assertTrue(duplicate is LocationDecision.Rejected && duplicate.code == "DUPLICATE_COORDINATE")
        assertEquals(20.0, session().lastLatitude!!, 0.0)
    }

    @Test fun `duplicate point ID is deterministic`() {
        val first = LocationPointIdentity.create("TEST_TRIP_1", now)
        val repeated = LocationPointIdentity.create("TEST_TRIP_1", now)
        assertEquals(first, repeated)
    }

    @Test fun `duplicate timestamp is rejected`() {
        val current = session(lastAt = now)
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            current, LocationSample(20.001, 85.0, now, 5f, 6f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "OUT_OF_ORDER")
    }

    @Test fun `same coordinates are rejected`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.0, 85.0, now, 5f, 3f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "DUPLICATE_COORDINATE")
    }

    @Test fun `out of order point is rejected`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(lastAt = now), LocationSample(20.001, 85.0, now - 1, 5f, 6f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "OUT_OF_ORDER")
    }

    @Test fun `speed zero cannot increment distance`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.001, 85.0, now, 5.8f, 0f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "STATIONARY_SPEED")
    }

    @Test fun `accuracy uncertainty cannot increment distance`() {
        val result = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST).validate(
            session(), LocationSample(20.00008, 85.0, now, 5.8f, 2f, 0f), now,
        )
        assertTrue(result is LocationDecision.Rejected && result.code == "STATIONARY_NOISE")
    }

    @Test fun `stationary thirty minute simulation has exact zero drift`() {
        val validator = LocationValidator(LocationValidationPolicy.PROVISIONAL_TEST)
        var current = session(lastAt = now)
        var accumulatedM = 0.0

        repeat(450) { index ->
            val timestamp = now + (index + 1L) * 4_000L
            val latitude = 20.0 + if (index % 2 == 0) 0.00018 else -0.00018
            val point = LocationSample(latitude, 85.0, timestamp, 5.8f, 0f, 0f)
            when (val result = validator.validate(current, point, timestamp)) {
                is LocationDecision.Accepted -> {
                    accumulatedM += result.incrementM
                    current = current.copy(
                        lastLatitude = point.latitude,
                        lastLongitude = point.longitude,
                        lastLocationAtMs = point.timestampMs,
                        lastAccuracyM = point.accuracyM,
                        trackedDistanceM = accumulatedM,
                        updatedAtMs = timestamp,
                    )
                }
                is LocationDecision.Rejected -> Unit
            }
        }

        assertEquals(0.0, accumulatedM, 0.0)
        assertEquals(0.0, current.trackedDistanceM, 0.0)
    }

    private val recoveryEvaluator = RecoveryGapEvaluator(LocationValidationPolicy.PROVISIONAL_TEST)

    private fun recoveryPoint(
        durationMs: Long,
        latitude: Double = 20.018,
        accuracyM: Float = 5f,
        speedMps: Float = 0f,
        tripId: String? = "TEST_TRIP_1",
    ): LocationSample {
        val anchorAt = now - 10_000
        return LocationSample(
            latitude = latitude,
            longitude = 85.0,
            timestampMs = anchorAt + durationMs,
            accuracyM = accuracyM,
            speedMps = speedMps,
            bearingDegrees = 0f,
            tripId = tripId,
        )
    }

    @Test fun `recovery 2 minute switch off gap accepts zero reported speed`() {
        val point = recoveryPoint(durationMs = 120_000)
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Accepted)
        result as RecoveryGapDecision.Accepted
        assertTrue(result.gap.estimatedDistanceM > 1_900.0)
        assertEquals(0.0, result.updatedSession.trackedDistanceM, 0.0)
        assertEquals(
            result.gap.estimatedDistanceM,
            result.updatedSession.switchOffGapEstimateM,
            0.0,
        )
    }

    @Test fun `recovery 2 hour switch off gap is accepted separately`() {
        val point = recoveryPoint(durationMs = 7_200_000)
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Accepted)
        result as RecoveryGapDecision.Accepted
        assertEquals(0.0, result.updatedSession.trackedDistanceM, 0.0)
        assertTrue(result.updatedSession.switchOffGapEstimateM > 1_900.0)
    }

    @Test fun `recovery same location restart adds no gap`() {
        val point = recoveryPoint(durationMs = 120_000, latitude = 20.00001)
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Rejected)
        result as RecoveryGapDecision.Rejected
        assertEquals("SAME_LOCATION_RESTART", result.code)
        assertTrue(result.anchorValidPoint)
    }

    @Test fun `duplicate boot event produces identical recovery gap ID`() {
        val point = recoveryPoint(durationMs = 120_000)
        val first = recoveryEvaluator.evaluate(session(), point, point.timestampMs)
        val duplicateBoot = recoveryEvaluator.evaluate(session(), point, point.timestampMs + 1)

        assertTrue(first is RecoveryGapDecision.Accepted)
        assertTrue(duplicateBoot is RecoveryGapDecision.Accepted)
        assertEquals(
            (first as RecoveryGapDecision.Accepted).gap.gapId,
            (duplicateBoot as RecoveryGapDecision.Accepted).gap.gapId,
        )
    }

    @Test fun `repeated app opening cannot create a different ID for same gap`() {
        val point = recoveryPoint(durationMs = 7_200_000)
        val ids = (1..5).map {
            (recoveryEvaluator.evaluate(session(), point, point.timestampMs + it) as RecoveryGapDecision.Accepted)
                .gap.gapId
        }

        assertEquals(1, ids.distinct().size)
    }

    @Test fun `recovery wrong trip ID is rejected`() {
        val point = recoveryPoint(durationMs = 120_000, tripId = "TEST_OTHER_TRIP")
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Rejected)
        assertEquals("WRONG_TRIP_ID", (result as RecoveryGapDecision.Rejected).code)
    }

    @Test fun `recovery poor first fix accuracy is retryable`() {
        val point = recoveryPoint(durationMs = 120_000, accuracyM = 90f)
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Rejected)
        result as RecoveryGapDecision.Rejected
        assertEquals("POOR_FIRST_FIX_ACCURACY", result.code)
        assertTrue(result.retryWithNextFix)
    }

    @Test fun `recovery physically impossible jump is retryable`() {
        val point = recoveryPoint(durationMs = 120_000, latitude = 21.0)
        val result = recoveryEvaluator.evaluate(session(), point, point.timestampMs)

        assertTrue(result is RecoveryGapDecision.Rejected)
        result as RecoveryGapDecision.Rejected
        assertEquals("PHYSICALLY_IMPOSSIBLE_JUMP", result.code)
        assertTrue(result.retryWithNextFix)
    }

    @Test fun `re-evaluating accepted endpoint cannot add a second estimate`() {
        val point = recoveryPoint(durationMs = 120_000)
        val first = recoveryEvaluator.evaluate(session(), point, point.timestampMs)
            as RecoveryGapDecision.Accepted
        val repeated = recoveryEvaluator.evaluate(first.updatedSession, point, point.timestampMs + 1)

        assertTrue(repeated is RecoveryGapDecision.Rejected)
        assertEquals(
            first.gap.estimatedDistanceM,
            first.updatedSession.switchOffGapEstimateM,
            0.0,
        )
    }

    @Test fun `28 wrong vehicle command`() {
        assertEquals("WRONG_VEHICLE", TripCommandValidator(resetEnabled = false).validate(command().copy(vehicleId = "TEST_OTHER"), auth, now)?.code)
    }

    @Test fun `29 wrong driver command`() {
        assertEquals("WRONG_DRIVER", TripCommandValidator(resetEnabled = false).validate(command().copy(driverId = "TEST_OTHER"), auth, now)?.code)
    }
}
