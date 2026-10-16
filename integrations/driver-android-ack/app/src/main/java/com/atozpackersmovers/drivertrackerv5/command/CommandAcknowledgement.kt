package com.atozpackersmovers.drivertrackerv5.command

data class CommandAcknowledgement(
    val appliedTripCommandId: String,
    val appliedTripCommandType: String,
    val tripCommandApplyStatus: String,
    val tripCommandReceiverAtMs: Long,
    val tripCommandReceiverServerAt: String = "SERVER_TIMESTAMP_PLACEHOLDER",
    val tripCommandResultTripId: String?,
    val tripCommandResultStatus: String?,
    val tripCommandReceiverDeviceId: String,
    val tripCommandReceiverBuild: String,
    val tripCommandReceiverSource: String,
    val tripCommandErrorCode: String? = null,
    val tripCommandErrorReason: String? = null,
) {
    fun asCompatibilityFields(): Map<String, Any?> = mapOf(
        "applied_trip_command_id" to appliedTripCommandId,
        "applied_trip_command_type" to appliedTripCommandType,
        "trip_command_apply_status" to tripCommandApplyStatus,
        "trip_command_receiver_at_ms" to tripCommandReceiverAtMs,
        "trip_command_receiver_server_at" to tripCommandReceiverServerAt,
        "trip_command_result_trip_id" to tripCommandResultTripId,
        "trip_command_result_status" to tripCommandResultStatus,
        "trip_command_receiver_device_id" to tripCommandReceiverDeviceId,
        "trip_command_receiver_build" to tripCommandReceiverBuild,
        "trip_command_receiver_source" to tripCommandReceiverSource,
        "trip_command_error_code" to tripCommandErrorCode,
        "trip_command_error_reason" to tripCommandErrorReason,
    )
}

