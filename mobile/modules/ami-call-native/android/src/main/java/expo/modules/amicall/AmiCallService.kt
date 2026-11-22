package expo.modules.amicall

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

// Foreground service shown as an ongoing "Ami" notification while a call runs.
// Type microphone: Android only lets the mic keep working in the background
// while a service like this is up. Mute / Hang up buttons → AmiCallBus → JS.
class AmiCallService : Service() {
  data class State(
    val title: String,
    val label: String,
    val muteLabel: String,
    val unmuteLabel: String,
    val endLabel: String,
    val muted: Boolean,
  )

  companion object {
    private const val CHANNEL = "ami_call"
    private const val NOTIFICATION_ID = 4711
    private const val ACTION_MUTE = "expo.modules.amicall.MUTE"
    private const val ACTION_END = "expo.modules.amicall.END"
    @Volatile private var state: State? = null
    @Volatile private var running = false

    fun start(ctx: Context, s: State) {
      state = s
      try {
        ContextCompat.startForegroundService(ctx, Intent(ctx, AmiCallService::class.java))
      } catch (_: Exception) {
        // Not allowed right now (e.g. app backgrounded) — the call still works
        // in the foreground; just no notification.
      }
    }

    fun update(ctx: Context, label: String, muted: Boolean) {
      val s = state ?: return
      state = s.copy(label = label, muted = muted)
      if (running) {
        try { NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, build(ctx, state!!)) } catch (_: SecurityException) {}
      }
    }

    fun stop(ctx: Context) {
      state = null
      ctx.stopService(Intent(ctx, AmiCallService::class.java))
    }

    private fun build(ctx: Context, s: State): android.app.Notification {
      ensureChannel(ctx)
      val action = { a: String, code: Int ->
        PendingIntent.getService(ctx, code, Intent(ctx, AmiCallService::class.java).setAction(a),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
        PendingIntent.getActivity(ctx, 3, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      return NotificationCompat.Builder(ctx, CHANNEL)
        .setSmallIcon(R.drawable.ami_tile)
        .setContentTitle(s.title)
        .setContentText(s.label)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setContentIntent(open)
        .addAction(0, if (s.muted) s.unmuteLabel else s.muteLabel, action(ACTION_MUTE, 1))
        .addAction(0, s.endLabel, action(ACTION_END, 2))
        .build()
    }

    private fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Ami", NotificationManager.IMPORTANCE_LOW))
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_MUTE -> { AmiCallBus.emit("mute"); return START_NOT_STICKY }
      ACTION_END -> { AmiCallBus.emit("end"); return START_NOT_STICKY }
    }
    val s = state ?: run { stopSelf(); return START_NOT_STICKY }
    try {
      ServiceCompat.startForeground(
        this, NOTIFICATION_ID, build(this, s),
        if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0,
      )
      running = true
    } catch (_: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }
}
