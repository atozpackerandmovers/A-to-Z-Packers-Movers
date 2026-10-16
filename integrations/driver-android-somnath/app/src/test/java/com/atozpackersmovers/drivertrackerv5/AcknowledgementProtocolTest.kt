package com.atozpackersmovers.drivertrackerv5

import com.atozpackersmovers.drivertrackerv5.command.*
import com.atozpackersmovers.drivertrackerv5.firebase.*
import com.atozpackersmovers.drivertrackerv5.trip.DriverAssignment
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class AcknowledgementProtocolTest {
    private val assignment = DriverAssignment(BuildConfig.DRIVER_ID, "Fixture", BuildConfig.VEHICLE_ID, "FIXTURE")
    private val uid = BuildConfig.DRIVER_UID
    private val now = 1_800_000_000_000L
    private fun command(type: TripCommandType = TripCommandType.START) = TripCommand("OFFLINE_FIXTURE_001", type,
        assignment.driverId, assignment.vehicleId, now, now + 300_000, source = CommandSource.MOCK_REMOTE)
    private fun ack(c: TripCommand = command(), code: String? = null, reason: String? = null) = CommandAcknowledgement(
        c.commandId, c.type.name, if (code == null) "APPLIED" else "REJECTED", now,
        tripCommandResultTripId = if (code == null) "OFFLINE_TRIP_001" else null,
        tripCommandResultStatus = if (code == null) "RUNNING" else null,
        tripCommandReceiverDeviceId = "OFFLINE_DEVICE", tripCommandReceiverBuild = "STAGING",
        tripCommandReceiverSource = "MOCK_REMOTE", tripCommandErrorCode = code, tripCommandErrorReason = reason)

    private inner class Wire(val c: TripCommand = command()) : CommandAckWire {
        var remoteStatus: String? = null
        var offline = false
        var loseFinalResponse = false
        var receiveFails = false
        var foreign = false
        var optimisticStatus: String? = null
        var cacheFinalWithoutCommit = false
        val writes = mutableListOf<Map<String, Any?>>()
        override suspend fun readServerCommand(commandId: String): Map<String, Any?> {
            if (offline) error("OFFLINE")
            return mapOf("commandId" to c.commandId, "type" to c.type.name, "driverId" to if (foreign) "OTHER" else c.driverId,
                "vehicleId" to c.vehicleId, "status" to remoteStatus)
        }
        override suspend fun update(updates: Map<String, Any?>) {
            if (offline || receiveFails) error("OFFLINE")
            val next = updates["commands/${c.commandId}/status"] as String
            optimisticStatus = next
            if (cacheFinalWithoutCommit && next != "RECEIVED") { offline = true; error("CACHED_BUT_NOT_COMMITTED") }
            check((remoteStatus == null || remoteStatus == "PENDING") && next == "RECEIVED" ||
                remoteStatus == "RECEIVED" && next in setOf("EXECUTED", "FAILED")) { "ILLEGAL_TRANSITION" }
            writes += updates.toMap()
            remoteStatus = next
            if (loseFinalResponse && next != "RECEIVED") error("RESPONSE_LOST_AFTER_COMMIT")
        }
    }
    private fun channel(w: Wire) = object : AcknowledgementChannel {
        val protocol = DriverAcknowledgementProtocol(w, assignment.driverId, uid, assignment.vehicleId, now)
        override suspend fun markCommandReceived(assignment: DriverAssignment, command: TripCommand) = protocol.received(command.commandId, command.type.name)
        override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) = protocol.deliver(acknowledgement)
        override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) = Unit
    }
    private class Store : CommandRecordStore {
        val rows = linkedMapOf<String, CommandRecordEntity>()
        override suspend fun previous(commandId: String) = rows[commandId]
        override suspend fun latest(driverId: String, vehicleId: String) = rows.values.filter { it.driverId == driverId && it.vehicleId == vehicleId }.maxByOrNull { it.issuedAtMs }
        override suspend fun begin(command: TripCommand, nowMs: Long): Boolean {
            if (rows.containsKey(command.commandId)) return false
            rows[command.commandId] = CommandRecordEntity(command.commandId, command.type.name, command.driverId,
                command.vehicleId, nowMs, command.issuedAtMs, "PROCESSING")
            return true
        }
        override suspend fun finish(record: CommandRecordEntity) { rows[record.commandId] = record }
        override suspend fun pending(driverId: String, vehicleId: String) = rows.values.filter {
            it.driverId == driverId && it.vehicleId == vehicleId && it.processingStatus.startsWith("ACK_PENDING_") }
    }
    private suspend fun process(p: DurableCommandProcessor, c: TripCommand = command(), execute: suspend () -> CommandAcknowledgement) =
        p.process(c, assignment, now, { code, reason -> ack(c, code, reason) }, execute)

    @Test fun `START receives before execution then sends allowed terminal shape`() = runTest {
        val w = Wire(); val s = Store(); val p = DurableCommandProcessor(s, channel(w))
        process(p) { assertEquals("RECEIVED", w.remoteStatus); ack() }
        assertEquals("EXECUTED", w.remoteStatus)
        assertEquals("ACKED_APPLIED", s.rows[command().commandId]?.processingStatus)
        assertEquals("OFFLINE_TRIP_001", w.writes.last()["acknowledgements/${command().commandId}/tripId"])
        assertFalse(w.writes.toString().contains("trip_command_receiver"))
    }
    @Test fun `STOP produces stoppedTripId and no tripId`() = runTest {
        val c=command(TripCommandType.STOP); val w=Wire(c)
        process(DurableCommandProcessor(Store(),channel(w)),c) { ack(c) }
        assertTrue(w.writes.last().containsKey("acknowledgements/${c.commandId}/stoppedTripId"))
        assertFalse(w.writes.last().containsKey("acknowledgements/${c.commandId}/tripId"))
    }
    @Test fun `active trip rejection gets RECEIVED then FAILED without local START`() = runTest {
        val w=Wire(); val p=DurableCommandProcessor(Store(),channel(w))
        process(p) { assertEquals("RECEIVED",w.remoteStatus); ack(code="ACTIVE_TRIP_EXISTS",reason="Already running") }
        assertEquals(listOf("RECEIVED","FAILED"),w.writes.map { it["commands/${command().commandId}/status"] })
        assertFalse(w.writes.last().containsKey("acknowledgements/${command().commandId}/tripId"))
    }
    @Test fun `failed receive never executes and later only delivers failure`() = runTest {
        val w=Wire().apply { receiveFails=true }; val s=Store(); val p=DurableCommandProcessor(s,channel(w)); var executions=0
        process(p) { executions++; ack() }
        assertEquals(0,executions); assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_PENDING_"))
        w.receiveFails=false; p.retryPending(assignment)
        assertEquals("FAILED",w.remoteStatus); assertEquals(0,executions)
    }
    @Test fun `restart retries durable final result without executing again`() = runTest {
        val w=Wire(); val s=Store(); var executions=0
        process(DurableCommandProcessor(s,channel(w))) { executions++; w.offline=true; ack() }
        assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_PENDING_"))
        // Rehydrate stored strings/entities into a new store and processor, with no execution callback.
        val restored=Store().also { it.rows.putAll(s.rows.mapValues { row -> row.value.copy() }) }
        w.offline=false; val restarted=DurableCommandProcessor(restored,channel(w)); restarted.retryPending(assignment)
        process(restarted) { executions++; ack() }
        assertEquals(1,executions); assertEquals("EXECUTED",w.remoteStatus)
    }
    @Test fun `lost final response reconciles status without terminal rewrite`() = runTest {
        val w=Wire().apply { loseFinalResponse=true }; val s=Store(); val p=DurableCommandProcessor(s,channel(w))
        process(p) { ack() }; assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_PENDING_"))
        p.retryPending(assignment); assertEquals(2,w.writes.size)
        assertEquals("ACKED_APPLIED",s.rows.values.single().processingStatus)
    }
    @Test fun `concurrent duplicate calls execute only once`() = runTest {
        val w=Wire(); val p=DurableCommandProcessor(Store(),channel(w)); var executions=0
        coroutineScope { repeat(5) { launch { process(p) { executions++; yield(); ack() } } } }
        assertEquals(1,executions); assertEquals(2,w.writes.size)
    }
    @Test fun `interrupted PROCESSING record fails closed without repeating execution`() = runTest {
        val w=Wire(); val s=Store(); s.begin(command(),now); var executions=0
        val result=process(DurableCommandProcessor(s,channel(w))) { executions++; ack() }
        assertEquals("EXECUTION_OUTCOME_UNKNOWN",result.tripCommandErrorCode); assertEquals(0,executions)
        assertEquals("FAILED",w.remoteStatus)
    }
    @Test fun `remote terminal blocks execution from another local store`() = runTest {
        val w=Wire().apply { remoteStatus="EXECUTED" }; val s=Store(); var executions=0
        process(DurableCommandProcessor(s,channel(w))) { executions++; ack() }
        assertEquals(0,executions); assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_BLOCKED_")); assertTrue(w.writes.isEmpty())
    }
    @Test fun `foreign command identity never gets written or executed`() = runTest {
        val w=Wire().apply { foreign=true }; var executions=0
        process(DurableCommandProcessor(Store(),channel(w))) { executions++; ack() }
        assertEquals(0,executions); assertTrue(w.writes.isEmpty())
    }
    @Test fun `retry is scoped to assignment`() = runTest {
        val w=Wire(); val s=Store(); val p=DurableCommandProcessor(s,channel(w))
        process(p) { w.offline=true; ack() }; w.offline=false
        p.retryPending(assignment.copy(driverId="OTHER")); assertEquals("RECEIVED",w.remoteStatus)
    }
    @Test fun `cancellation leaves final result pending`() = runTest {
        val s=Store(); val w=Wire(); val delegate=channel(w)
        val cancelledChannel=object : AcknowledgementChannel by delegate {
            override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) { throw CancellationException("logout") }
        }
        try { process(DurableCommandProcessor(s,cancelledChannel)) { ack() }; fail("Expected cancellation") } catch (_: CancellationException) { }
        assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_PENDING_"))
        DurableCommandProcessor(s,delegate).retryPending(assignment); assertEquals("EXECUTED",w.remoteStatus)
    }
    @Test fun `existing legacy completed record is not executed or silently rewritten`() = runTest {
        val s=Store(); s.begin(command(),now); s.finish(s.rows.values.single().copy(processingStatus="APPLIED",acknowledgementJson=CommandAcknowledgementCodec.encode(ack())))
        val w=Wire(); var executions=0; process(DurableCommandProcessor(s,channel(w))) { executions++; ack() }
        assertEquals(0,executions); assertTrue(w.writes.isEmpty())
    }
    @Test fun `receive timeout never executes or loses durable failure`() = runTest {
        val w=Wire(); val s=Store(); val delegate=channel(w); var executions=0
        val delayed=object : AcknowledgementChannel by delegate {
            override suspend fun markCommandReceived(assignment: DriverAssignment, command: TripCommand) { delay(60_000) }
        }
        val result=process(DurableCommandProcessor(s,delayed)) { executions++; ack() }
        assertEquals(0,executions); assertEquals("ACK_RECEIVED_WRITE_FAILED",result.tripCommandErrorCode)
        assertEquals("FAILED",w.remoteStatus)
    }
    @Test fun `final timeout retains pending result for independent retry`() = runTest {
        val w=Wire(); val s=Store(); val delegate=channel(w)
        val delayed=object : AcknowledgementChannel by delegate {
            override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) { delay(60_000) }
        }
        process(DurableCommandProcessor(s,delayed)) { ack() }
        assertTrue(s.rows.values.single().processingStatus.startsWith("ACK_PENDING_"))
        DurableCommandProcessor(s,delegate).retryPending(assignment)
        assertEquals("EXECUTED",w.remoteStatus)
    }
    @Test fun `optimistic terminal cache cannot retire outbox before or after process death`() = runTest {
        val w = Wire().apply { cacheFinalWithoutCommit = true }; val s = Store(); var executions = 0
        val p = DurableCommandProcessor(s, channel(w))
        process(p) { executions++; ack() }
        assertEquals("EXECUTED", w.optimisticStatus)
        assertEquals("RECEIVED", w.remoteStatus)
        p.retryPending(assignment)
        assertEquals("ACK_PENDING_APPLIED", s.rows.values.single().processingStatus)
        val restored = Store().also { it.rows.putAll(s.rows.mapValues { row -> row.value.copy() }) }
        w.optimisticStatus = null // In-memory SDK queue disappears with process death.
        val restarted = DurableCommandProcessor(restored, channel(w))
        restarted.retryPending(assignment)
        assertEquals("ACK_PENDING_APPLIED", restored.rows.values.single().processingStatus)
        w.offline = false; w.cacheFinalWithoutCommit = false
        restarted.retryPending(assignment)
        process(restarted) { executions++; ack() }
        assertEquals(1, executions)
        assertEquals("EXECUTED", w.remoteStatus)
        assertEquals("ACKED_APPLIED", restored.rows.values.single().processingStatus)
    }

    private fun completed(c: TripCommand) = TripSessionEntity("OFFLINE_TRIP_001",
        assignment.driverId, assignment.driverName, assignment.vehicleId, assignment.vehicleNumber,
        "COMPLETED", now - 10_000, stoppedAtMs = now, lastAppliedCommandId = c.commandId, updatedAtMs = now)

    @Test fun `STOP with empty GPS queue retains summary through offline restart before terminal ack`() = runTest {
        val c = command(TripCommandType.STOP); val w = Wire(c); val s = Store()
        val localTrips = mapOf("OFFLINE_TRIP_001" to completed(c))
        val gpsQueue = emptyList<String>()
        var summaryOffline = true; val uploaded = mutableListOf<TripSessionEntity>(); var executions = 0
        fun delivery(store: Store): AcknowledgementChannel {
            val delegate = channel(w)
            return object : AcknowledgementChannel by delegate {
                override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
                    assertEquals("ACK_PENDING_APPLIED", store.rows.values.single().processingStatus)
                    CommandTripSummaryDelivery({ localTrips[it] }, { localTrips.values.find { t -> t.lastAppliedCommandId == it } }) {
                        if (summaryOffline) error("SUMMARY_OFFLINE")
                        uploaded += it
                    }.deliver(assignment, acknowledgement)
                }
                override suspend fun acknowledge(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
                    assertEquals("COMPLETED", uploaded.last().status)
                    delegate.acknowledge(assignment, acknowledgement)
                }
            }
        }
        process(DurableCommandProcessor(s, delivery(s)), c) { executions++; ack(c).copy(tripCommandResultStatus = "COMPLETED") }
        assertTrue(gpsQueue.isEmpty()); assertTrue(uploaded.isEmpty())
        assertEquals("RECEIVED", w.remoteStatus)
        assertEquals("ACK_PENDING_APPLIED", s.rows.values.single().processingStatus)
        val restored = Store().also { it.rows.putAll(s.rows.mapValues { row -> row.value.copy() }) }
        summaryOffline = false
        val restarted = DurableCommandProcessor(restored, delivery(restored))
        restarted.retryPending(assignment)
        process(restarted, c) { executions++; ack(c) }
        assertEquals(1, executions); assertEquals(1, uploaded.size)
        assertEquals("EXECUTED", w.remoteStatus)
        assertEquals("ACKED_APPLIED", restored.rows.values.single().processingStatus)
    }

    @Test fun `process death after local STOP commit recovers summary without executing STOP again`() = runTest {
        val c = command(TripCommandType.STOP); val w = Wire(c).apply { remoteStatus = "RECEIVED" }
        val s = Store(); s.begin(c, now)
        val session = completed(c); val uploaded = mutableListOf<TripSessionEntity>()
        val delegate = channel(w)
        val recovering = object : AcknowledgementChannel by delegate {
            override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
                CommandTripSummaryDelivery({ null }, { if (it == c.commandId) session else null }, { uploaded += it })
                    .deliver(assignment, acknowledgement)
            }
        }
        var executions = 0
        val result = process(DurableCommandProcessor(s, recovering), c) { executions++; ack(c) }
        assertEquals("EXECUTION_OUTCOME_UNKNOWN", result.tripCommandErrorCode)
        assertEquals(0, executions); assertEquals(listOf(session), uploaded)
        assertEquals("FAILED", w.remoteStatus)
    }

    @Test fun `summary timeout keeps STOP pending and retry uses current local trip`() = runTest {
        val c = command(TripCommandType.STOP); val w = Wire(c); val s = Store()
        val delegate = channel(w); var delayed = true; var delivered = 0
        val ch = object : AcknowledgementChannel by delegate {
            override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
                if (delayed) delay(60_000)
                delivered++
            }
        }
        process(DurableCommandProcessor(s, ch), c) { ack(c) }
        assertEquals("ACK_PENDING_APPLIED", s.rows.values.single().processingStatus)
        assertEquals("RECEIVED", w.remoteStatus); assertEquals(0, delivered)
        delayed = false
        DurableCommandProcessor(s, ch).retryPending(assignment)
        assertEquals(1, delivered); assertEquals("EXECUTED", w.remoteStatus)
    }

    @Test fun `delayed START summary uses current completed state and rejects foreign local trip`() = runTest {
        val c = command(); val session = completed(command(TripCommandType.STOP))
        val uploaded = mutableListOf<TripSessionEntity>()
        CommandTripSummaryDelivery({ session }, { null }, { uploaded += it }).deliver(assignment, ack(c))
        assertEquals("COMPLETED", uploaded.single().status)
        try {
            CommandTripSummaryDelivery({ session.copy(driverId = "OTHER") }, { null }, { fail("Foreign upload") })
                .deliver(assignment, ack(c))
            fail("Expected identity rejection")
        } catch (expected: IllegalStateException) { assertEquals("LOCAL_TRIP_IDENTITY_MISMATCH", expected.message) }
    }

    @Test fun `missing applied trip stays pending and rejected STOP never uploads unrelated history`() = runTest {
        val c = command(TripCommandType.STOP); val w = Wire(c); val s = Store()
        val delegate = channel(w)
        val ch = object : AcknowledgementChannel by delegate {
            override suspend fun deliverTripSummary(assignment: DriverAssignment, acknowledgement: CommandAcknowledgement) {
                CommandTripSummaryDelivery({ null }, { null }, { fail("Unexpected upload") }).deliver(assignment, acknowledgement)
            }
        }
        process(DurableCommandProcessor(s, ch), c) { ack(c) }
        assertEquals("ACK_PENDING_APPLIED", s.rows.values.single().processingStatus)
        assertEquals("RECEIVED", w.remoteStatus)
        CommandTripSummaryDelivery({ fail("Must not read unrelated trip"); null }, { null }, { fail("Unexpected upload") })
            .deliver(assignment, ack(c, "NO_ACTIVE_TRIP", "No active trip"))
    }

    @Test fun `emit actual protocol payloads for saved rule expression checks`() = runTest {
        val fixtures=mutableListOf<Map<String,Any?>>()
        for(type in listOf(TripCommandType.START,TripCommandType.STOP)) for(fail in listOf(false,true)) {
            val c=command(type);val w=Wire(c)
            process(DurableCommandProcessor(Store(),channel(w)),c) { if(fail) ack(c,"FIXTURE_FAILURE","Fixture rejected") else ack(c) }
            fixtures+=mapOf("type" to type.name,"writes" to w.writes)
        }
        fun json(v: Any?):String=when(v) { null->"null"; is String->"\""+v.replace("\\","\\\\").replace("\"","\\\"")+"\""; is Number,is Boolean->v.toString(); is Map<*,*>->v.entries.joinToString(",","{","}"){json(it.key.toString())+":"+json(it.value)}; is List<*>->v.joinToString(",","[","]"){json(it)}; else->error("unsupported") }
        File("build/protocol-wire-fixtures.json").apply { parentFile?.mkdirs(); writeText(json(fixtures)) }
        assertEquals(4,fixtures.size)
    }
}
