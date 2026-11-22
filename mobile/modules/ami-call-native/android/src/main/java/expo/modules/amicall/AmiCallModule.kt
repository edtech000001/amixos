package expo.modules.amicall

import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/** Lets the notification's buttons reach JS (service → module → "onAction"). */
object AmiCallBus {
  @Volatile var listener: ((String) -> Unit)? = null
  fun emit(action: String) { listener?.invoke(action) }
}

// Android side of modules/ami-call-native: the ongoing Ami call notification
// (iOS: Live Activity) and the "Hablar con Ami" launcher shortcut.
class AmiCallModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("AmiCall")
    Events("onAction")

    OnCreate {
      AmiCallBus.listener = { action -> sendEvent("onAction", mapOf("action" to action)) }
      publishShortcut()
    }
    OnDestroy { AmiCallBus.listener = null }

    // Android starts calls through the amixos://ami/call link (tile, shortcut,
    // widget), handled in JS — nothing pending natively.
    Function("consumePendingStart") { false }

    AsyncFunction("startActivity") { args: Map<String, Any?> ->
      AmiCallService.start(
        context,
        AmiCallService.State(
          title = args["title"] as? String ?: "Ami",
          label = args["label"] as? String ?: "",
          muteLabel = args["muteLabel"] as? String ?: "Mute",
          unmuteLabel = args["unmuteLabel"] as? String ?: "Unmute",
          endLabel = args["endLabel"] as? String ?: "End",
          muted = args["muted"] as? Boolean ?: false,
        ),
      )
    }

    AsyncFunction("updateActivity") { _: String, label: String, muted: Boolean ->
      AmiCallService.update(context, label, muted)
    }

    AsyncFunction("endActivity") {
      AmiCallService.stop(context)
    }
  }

  private fun publishShortcut() {
    val ctx = appContext.reactContext ?: return
    val es = Locale.getDefault().language == "es"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("amixos://ami/call")).setPackage(ctx.packageName)
    val shortcut = ShortcutInfoCompat.Builder(ctx, "ami_call")
      .setShortLabel(if (es) "Hablar con Ami" else "Talk to Ami")
      .setLongLabel(if (es) "Hablar con Ami" else "Talk to Ami")
      .setIcon(IconCompat.createWithResource(ctx, R.drawable.ami_tile))
      .setIntent(intent)
      .build()
    try { ShortcutManagerCompat.pushDynamicShortcut(ctx, shortcut) } catch (_: Exception) {}
  }
}
