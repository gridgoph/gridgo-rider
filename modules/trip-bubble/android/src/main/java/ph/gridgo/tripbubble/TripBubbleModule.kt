package ph.gridgo.tripbubble

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript side of the delivery bubble.
 *
 * `hooks/useTripBubble.ts` decides when a bubble is wanted and what it says;
 * this module only carries that to `TripBubbleService`, reads the "Display
 * over other apps" permission, opens the phone's screen for it, and reports a
 * tap on the bubble back as `onOpen`.
 */
class TripBubbleModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("TripBubble")

    Events("onOpen")

    Function("canDrawOverlays") {
      canDrawOverlays(context)
    }

    // The phone's own screen for it; Android has no dialog. From Android 11 the
    // package is ignored and the list of apps opens (seen on the Motorola).
    AsyncFunction("openOverlaySettings") {
      val packageUri = Uri.parse("package:${context.packageName}")
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (_: Exception) {
        // A phone without that screen: GRIDGO's own settings page always exists.
        context.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }

    // Start the bubble, or change what it says. Resolves false when the phone
    // will not run it (no permission, or Android refused the start).
    Function("show") { count: Int, label: String, title: String, body: String, channel: String ->
      TripBubbleService.content = BubbleContent(count, label, title, body, channel)
      val running = TripBubbleService.instance
      if (running != null) {
        running.post { running.render() }
        return@Function true
      }
      if (!canDrawOverlays(context)) return@Function false
      try {
        val intent = Intent(context, TripBubbleService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (_: Exception) {
        // Android refuses a foreground service started from the background.
        // The next time GRIDGO is on screen the hook asks again.
        false
      }
    }

    Function("hide") {
      context.stopService(Intent(context, TripBubbleService::class.java))
    }

    OnNewIntent { intent ->
      if (intent.getBooleanExtra(TripBubbleService.EXTRA_OPEN, false)) {
        intent.removeExtra(TripBubbleService.EXTRA_OPEN)
        sendEvent("onOpen", emptyMap<String, Any>())
      }
    }
  }

  private fun canDrawOverlays(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
}
