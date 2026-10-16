package com.atozpackersmovers.drivertrackerv5.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.atozpackersmovers.drivertrackerv5.offline.UploadWorker

class ConnectivityReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { UploadWorker.enqueue(context) }
}
