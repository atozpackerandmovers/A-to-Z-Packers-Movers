plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.atozpackersmovers.drivertrackerv5"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.atozpackersmovers.drivertracker"
        minSdk = 26
        targetSdk = 35
        versionCode = 50015
        versionName = "5.0.15-production-somnath"
        buildConfigField("boolean", "PRODUCTION_FIREBASE_ENABLED", "true")
        buildConfigField("boolean", "PILOT_ENABLED", "true")
        buildConfigField("boolean", "REMOTE_RESET_ENABLED", "false")
        buildConfigField("String", "DATABASE_URL", "\"https://az-packers-quotation-default-rtdb.asia-southeast1.firebasedatabase.app\"")
        buildConfigField("String", "DATABASE_ROOT", "\"gpsProduction/v1\"")
        buildConfigField("String", "DRIVER_UID", "\"FCFwdn24rkMScoAdBXzfOF7c3rP2\"")
        buildConfigField("String", "DRIVER_ID", "\"DRIVER_SOMNATH_001\"")
        buildConfigField("String", "DRIVER_NAME", "\"Somnath\"")
        buildConfigField("String", "VEHICLE_ID", "\"VEHICLE_OD05AP9537\"")
        buildConfigField("String", "VEHICLE_NUMBER", "\"OD-05-AP-9537\"")
        buildConfigField("String", "BUILD_LABEL", "\"PRODUCTION DRIVER — SOMNATH\"")
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/kotlin-project-structure-metadata.json",
            "**/*.knm",
            "commonMain/**",
            "nonJvmMain/**",
        )
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
    arg("room.generateKotlin", "true")
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.1")
    implementation("androidx.lifecycle:lifecycle-process:2.4.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation(platform("com.google.firebase:firebase-bom:33.9.0"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-database-ktx")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
