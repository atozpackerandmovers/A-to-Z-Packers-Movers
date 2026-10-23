package com.atozpackersmovers.drivertrackerv5.offline

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.Constraints
import androidx.work.BackoffPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication
import com.atozpackersmovers.drivertrackerv5.firebase.FirebaseGpsUploader
import java.util.concurrent.TimeUnit

class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as TrackerApplication).graph
        val auth = graph.authSessionProvider.current()
        val assignment = auth.assignment ?: return Result.failure()
        if (!auth.authenticated) return Result.failure()
        val uploader = FirebaseGpsUploader(graph.firebaseRepository)
        var retryNeeded = false
        graph.offlineQueue.nextBatch().forEach { point ->
            val session = graph.tripStore.find(point.tripId)
            if (session == null || session.driverId != assignment.driverId || session.vehicleId != assignment.vehicleId) {
                graph.offlineQueue.update(point.copy(syncStatus = PointSyncStatus.FAILED.name, failureReason = "Trip or assignment mismatch"))
                return@forEach
            }
            val uploading = point.copy(syncStatus = PointSyncStatus.UPLOADING.name)
            graph.offlineQueue.update(uploading)
            runCatching { uploader.upload(assignment, session, uploading) }
                .onSuccess { graph.offlineQueue.update(uploading.copy(syncStatus = PointSyncStatus.SYNCED.name, syncedAtMs = System.currentTimeMillis(), failureReason = null)) }
                .onFailure {
                    val retries = point.retryCount + 1
                    val status = if (retries >= OfflineQueueRepository.MAX_RETRIES) PointSyncStatus.FAILED else PointSyncStatus.PENDING
                    graph.offlineQueue.update(point.copy(syncStatus = status.name, retryCount = retries, failureReason = it.message?.take(200)))
                    retryNeeded = retryNeeded || retries < OfflineQueueRepository.MAX_RETRIES
                }
        }
        graph.offlineQueue.purgeSynced(System.currentTimeMillis())
        return if (retryNeeded) Result.retry() else Result.success()
    }

    companion object {
        private const val UNIQUE_WORK = "driver-v5-ordered-offline-upload"
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, request)
        }
    }
}
