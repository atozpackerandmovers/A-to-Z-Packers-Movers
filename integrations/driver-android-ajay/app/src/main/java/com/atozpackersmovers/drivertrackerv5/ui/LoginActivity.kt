package com.atozpackersmovers.drivertrackerv5.ui

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.application.TrackerApplication
import com.atozpackersmovers.drivertrackerv5.security.ProductionApprovalGate
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class LoginActivity : AppCompatActivity() {
    private val graph by lazy { (application as TrackerApplication).graph }
    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var signIn: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        box.addView(TextView(this).apply {
            text = BuildConfig.BUILD_LABEL
            textSize = 22f
            setTextColor(Color.rgb(0, 100, 0))
            gravity = Gravity.CENTER
        })
        box.addView(TextView(this).apply {
            text = "Driver: ${BuildConfig.DRIVER_NAME}\nVehicle: ${BuildConfig.VEHICLE_NUMBER}\nRESET: Permanently disabled"
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 24)
        })
        email = EditText(this).apply {
            hint = "${BuildConfig.DRIVER_NAME} Firebase email"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        password = EditText(this).apply {
            hint = "Password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        signIn = Button(this).apply {
            text = "Sign in and check pilot approval"
            setOnClickListener { authenticateAndCheck() }
        }
        status = TextView(this).apply {
            text = "Sign in to verify Production pilot approval."
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 0)
        }
        box.addView(email)
        box.addView(password)
        box.addView(signIn)
        box.addView(status)
        setContentView(box)

        if (FirebaseAuth.getInstance().currentUser?.uid == BuildConfig.DRIVER_UID) checkApproval()
    }

    private fun authenticateAndCheck() {
        val enteredEmail = email.text.toString().trim()
        val enteredPassword = password.text.toString()
        if (enteredEmail.isBlank() || enteredPassword.isBlank()) {
            status.text = "Enter ${BuildConfig.DRIVER_NAME}'s Firebase email and password."
            return
        }
        signIn.isEnabled = false
        status.text = "Authenticating…"
        lifecycleScope.launch {
            runCatching {
                val result = FirebaseAuth.getInstance()
                    .signInWithEmailAndPassword(enteredEmail, enteredPassword).await()
                check(result.user?.uid == BuildConfig.DRIVER_UID) {
                    "This account is not approved for ${BuildConfig.DRIVER_NAME}."
                }
            }.onSuccess {
                password.text.clear()
                checkApproval()
            }.onFailure {
                FirebaseAuth.getInstance().signOut()
                graph.authSessionProvider.setPilotApproved(false)
                signIn.isEnabled = true
                status.text = "Authentication failed: ${it.message ?: "unknown error"}"
            }
        }
    }

    private fun checkApproval() {
        signIn.isEnabled = false
        status.text = "Reading Production pilot approval…"
        lifecycleScope.launch {
            runCatching { ProductionApprovalGate().read() }
                .onSuccess { approval ->
                    graph.authSessionProvider.setPilotApproved(approval.approved)
                    if (approval.approved) {
                        startActivity(Intent(this@LoginActivity, TrackingActivity::class.java))
                        finish()
                    } else {
                        signIn.isEnabled = true
                        status.text = buildString {
                            append("ACCESS DISABLED — required pilot flags are not approved.\n")
                            append("Production: ${approval.environmentEnabled}\n")
                            append("Pilot mode: ${approval.pilotMode}\n")
                            append("${BuildConfig.DRIVER_NAME} access: ${approval.accessEnabled}\n")
                            append("${BuildConfig.DRIVER_NAME} profile pilot: ${approval.profilePilotEnabled}\n")
                            append("Full rollout approved: ${approval.fullRolloutApproved} (must remain false)")
                        }
                    }
                }
                .onFailure {
                    graph.authSessionProvider.setPilotApproved(false)
                    signIn.isEnabled = true
                    status.text = "Approval check failed: ${it.message ?: "network/database error"}"
                }
        }
    }
}
