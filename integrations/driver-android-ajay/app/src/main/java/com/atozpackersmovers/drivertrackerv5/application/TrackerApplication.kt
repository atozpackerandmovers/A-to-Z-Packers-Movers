package com.atozpackersmovers.drivertrackerv5.application

import android.app.Application
import com.atozpackersmovers.drivertrackerv5.BuildConfig
import com.atozpackersmovers.drivertrackerv5.command.CommandIdempotencyStore
import com.atozpackersmovers.drivertrackerv5.command.TripCommandConsumer
import com.atozpackersmovers.drivertrackerv5.command.TripCommandValidator
import com.atozpackersmovers.drivertrackerv5.diagnostics.TrackerDiagnostics
import com.atozpackersmovers.drivertrackerv5.firebase.FirebaseCommandSource
import com.atozpackersmovers.drivertrackerv5.firebase.FirebaseRepository
import com.atozpackersmovers.drivertrackerv5.firebase.ProductionFirebaseRepository
import com.atozpackersmovers.drivertrackerv5.location.AndroidTrackingController
import com.atozpackersmovers.drivertrackerv5.location.LocationProcessor
import com.atozpackersmovers.drivertrackerv5.location.LocationValidationPolicy
import com.atozpackersmovers.drivertrackerv5.location.LocationValidator
import com.atozpackersmovers.drivertrackerv5.location.SwitchOffGapHandler
import com.atozpackersmovers.drivertrackerv5.offline.OfflineQueueRepository
import com.atozpackersmovers.drivertrackerv5.offline.TrackerDatabase
import com.atozpackersmovers.drivertrackerv5.security.AuthSessionProvider
import com.atozpackersmovers.drivertrackerv5.security.DeviceIdentityProvider
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionStore
import com.atozpackersmovers.drivertrackerv5.trip.TripStateMachine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class TrackerApplication : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        check(BuildConfig.PRODUCTION_FIREBASE_ENABLED) { "Production Firebase must be compiled for the controlled pilot" }
        check(BuildConfig.PILOT_ENABLED) { "Pilot capability must be compiled for the controlled pilot" }
        check(!BuildConfig.REMOTE_RESET_ENABLED) { "RESET must remain disabled" }
        graph = AppGraph(this)
    }
}

class AppGraph(application: Application) {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val database = TrackerDatabase.get(application)
    val authSessionProvider = AuthSessionProvider(application)
    val deviceIdentityProvider = DeviceIdentityProvider(application)
    val firebaseRepository: FirebaseRepository = ProductionFirebaseRepository()
    val offlineQueue = OfflineQueueRepository(database.offlinePointDao())
    val tripStore = TripSessionStore(database.tripSessionDao())
    val diagnostics = TrackerDiagnostics()
    val policy = LocationValidationPolicy.PROVISIONAL_TEST
    val locationProcessor = LocationProcessor(database, LocationValidator(policy), policy)
    val switchOffGapHandler = SwitchOffGapHandler(database, policy)
    private val trackingController = AndroidTrackingController(application)
    val commandConsumer = TripCommandConsumer(
        validator = TripCommandValidator(resetEnabled = BuildConfig.REMOTE_RESET_ENABLED),
        idempotencyStore = CommandIdempotencyStore(database.commandRecordDao()),
        stateMachine = TripStateMachine(database),
        trackingController = trackingController,
        authSessionProvider = authSessionProvider,
        deviceIdentityProvider = deviceIdentityProvider,
        repository = firebaseRepository,
        diagnostics = diagnostics,
    )
    val commandSource = FirebaseCommandSource(firebaseRepository, authSessionProvider, commandConsumer, appScope)
}
