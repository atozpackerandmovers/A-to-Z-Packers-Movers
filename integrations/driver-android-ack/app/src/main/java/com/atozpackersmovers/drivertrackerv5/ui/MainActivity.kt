package com.atozpackersmovers.drivertrackerv5.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val graph = (application as TrackerApplication).graph
        val destination = if (graph.authSessionProvider.current().authenticated) TrackingActivity::class.java else LoginActivity::class.java
        startActivity(Intent(this, destination))
        finish()
    }
}

