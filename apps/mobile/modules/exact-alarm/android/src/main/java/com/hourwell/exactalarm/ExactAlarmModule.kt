package com.hourwell.exactalarm

import android.app.AlarmManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * FR-50 exact reminders on Android 12+. SCHEDULE_EXACT_ALARM is a special app-op the user grants
 * on the system "Alarms & reminders" screen, and Android 13+ starts it DENIED for a fresh install;
 * expo-notifications then falls back to inexact alarms silently (+31–60 min on the Pixel 7a,
 * hardware pass day 4 item 8). The app must read the state itself and route the user to the
 * screen — expo-notifications exposes neither. Two calls; the policy lives in the domain layer.
 */
class ExactAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("HourwellExactAlarm")

    /** Below API 31 every alarm is exact; from 31 the OS decides per app. */
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function true
      }
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarms.canScheduleExactAlarms()
    }

    /** Opens the system screen for this app; false where the platform has no such screen. */
    Function("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function false
      }
      val intent = Intent(
        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
        Uri.parse("package:" + context.packageName)
      )
      try {
        val activity = appContext.currentActivity
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
        true
      } catch (e: ActivityNotFoundException) {
        false // an OEM without the screen: the JS side falls back to the app's settings page
      }
    }
  }
}
