package com.atozpackersmovers.drivertrackerv5.offline

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.atozpackersmovers.drivertrackerv5.command.CommandRecordEntity
import com.atozpackersmovers.drivertrackerv5.trip.RecoveryGapEntity
import com.atozpackersmovers.drivertrackerv5.trip.TripSessionEntity

@Database(
    entities = [TripSessionEntity::class, OfflinePointEntity::class, CommandRecordEntity::class, RecoveryGapEntity::class],
    version = 2,
    exportSchema = true,
)
abstract class TrackerDatabase : RoomDatabase() {
    abstract fun tripSessionDao(): TripSessionDao
    abstract fun offlinePointDao(): OfflinePointDao
    abstract fun commandRecordDao(): CommandRecordDao
    abstract fun recoveryGapDao(): RecoveryGapDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_offline_points_tripId_timestampMs " +
                        "ON offline_points (tripId, timestampMs)",
                )
            }
        }

        @Volatile private var instance: TrackerDatabase? = null
        fun get(context: Context): TrackerDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                TrackerDatabase::class.java,
                "driver_tracker_v5_test.db",
            ).addMigrations(MIGRATION_1_2).build().also { instance = it }
        }
    }
}
