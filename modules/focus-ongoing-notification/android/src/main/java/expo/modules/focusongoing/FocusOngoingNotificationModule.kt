package expo.modules.focusongoing

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The one ongoing notification shown while a focus session runs (owner, 2026-10-22). While the
 * session runs, Android itself counts down to its end with the notification's chronometer, so
 * the countdown stays live with the app in the background or killed. The notification owns
 * nothing: the timer stays the only truth, and the app shows, updates, or hides this from it.
 */
class FocusOngoingNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusOngoingNotification")

    // `countdownTo`: epoch ms the chronometer counts down to, or 0 for none (paused).
    // `timeoutAt`: epoch ms after which Android removes the notification by itself, so it never
    // outlives the session even when the app is not running.
    Function("show") { title: String, body: String, countdownTo: Double, timeoutAt: Double, url: String ->
      show(title, body, countdownTo.toLong(), timeoutAt.toLong(), url)
    }

    Function<Unit>("hide") {
      manager().cancel(NOTIFICATION_ID)
    }
  }

  private fun manager(): NotificationManager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  // Before Android 8 there are no channels: the builder without one, at low priority.
  @Suppress("DEPRECATION")
  @SuppressLint("MissingPermission")
  private fun show(title: String, body: String, countdownTo: Long, timeoutAt: Long, url: String) {
    if (!allowed()) return
    val manager = manager()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      channel.setSound(null, null)
      channel.enableVibration(false)
      manager.createNotificationChannel(channel)
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
    }
    builder
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setAutoCancel(false)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(openIntent(url))

    val now = System.currentTimeMillis()
    if (countdownTo > now) {
      builder
        .setWhen(countdownTo)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false).setUsesChronometer(false)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && timeoutAt > now) {
      builder.setTimeoutAfter(timeoutAt - now)
    }

    manager.notify(NOTIFICATION_ID, builder.build())
  }

  /** Android 13 asks for notifications; refused or turned off, nothing is shown. */
  private fun allowed(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    return manager().areNotificationsEnabled()
  }

  /** The notification icon expo-notifications adds to the app, else the app icon. */
  @SuppressLint("DiscouragedApi")
  private fun smallIcon(): Int {
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (icon != 0) icon else context.applicationInfo.icon
  }

  /** Opens the app on `url` (the Focus screen); the app's own launch if that cannot open. */
  private fun openIntent(url: String): PendingIntent {
    val view = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val intent = if (view.resolveActivity(context.packageManager) != null) {
      view
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: view
    }
    return PendingIntent.getActivity(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  companion object {
    private const val NOTIFICATION_ID = 7_201
    private const val REQUEST_CODE = 7_201
    private const val CHANNEL_ID = "focus-ongoing"
    private const val CHANNEL_NAME = "Focus in progress"
    private const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"
  }
}
