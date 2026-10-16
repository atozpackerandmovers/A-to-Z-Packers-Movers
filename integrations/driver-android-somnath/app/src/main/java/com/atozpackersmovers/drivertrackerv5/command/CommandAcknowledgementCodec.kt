package com.atozpackersmovers.drivertrackerv5.command

import java.nio.charset.StandardCharsets
import java.util.Base64

object CommandAcknowledgementCodec {
    private fun encodePart(value: String?): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString((value ?: "").toByteArray(StandardCharsets.UTF_8))
    private fun decodePart(value: String): String? = String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).ifEmpty { null }

    fun encode(ack: CommandAcknowledgement): String = listOf(
        ack.appliedTripCommandId, ack.appliedTripCommandType, ack.tripCommandApplyStatus,
        ack.tripCommandReceiverAtMs.toString(), ack.tripCommandReceiverServerAt,
        ack.tripCommandResultTripId, ack.tripCommandResultStatus,
        ack.tripCommandReceiverDeviceId, ack.tripCommandReceiverBuild,
        ack.tripCommandReceiverSource, ack.tripCommandErrorCode, ack.tripCommandErrorReason,
    ).joinToString(".") { encodePart(it) }

    fun decode(encoded: String): CommandAcknowledgement {
        val parts = encoded.split('.')
        require(parts.size == 12) { "Invalid acknowledgement record" }
        return CommandAcknowledgement(
            appliedTripCommandId = decodePart(parts[0])!!,
            appliedTripCommandType = decodePart(parts[1])!!,
            tripCommandApplyStatus = decodePart(parts[2])!!,
            tripCommandReceiverAtMs = decodePart(parts[3])!!.toLong(),
            tripCommandReceiverServerAt = decodePart(parts[4])!!,
            tripCommandResultTripId = decodePart(parts[5]),
            tripCommandResultStatus = decodePart(parts[6]),
            tripCommandReceiverDeviceId = decodePart(parts[7])!!,
            tripCommandReceiverBuild = decodePart(parts[8])!!,
            tripCommandReceiverSource = decodePart(parts[9])!!,
            tripCommandErrorCode = decodePart(parts[10]),
            tripCommandErrorReason = decodePart(parts[11]),
        )
    }
}
