package ph.gridgo.tripbubble

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import kotlin.math.abs

/** What the bubble says. Copy comes from `lib/tripBubble.ts`. */
data class BubbleContent(
  val count: Int,
  val label: String,
  val notificationTitle: String,
  val notificationBody: String,
  val channelName: String,
)

/**
 * The delivery bubble.
 *
 * A foreground service, because the bubble has to outlive GRIDGO leaving the
 * screen: that is the only moment it is drawn. While any GRIDGO screen is
 * visible the window is removed, and it comes back when the rider switches to
 * their navigation app. Dragging moves it and it settles against the nearer
 * edge; a tap brings GRIDGO to the front and the module reports `onOpen`.
 *
 * Nothing restarts it: `START_NOT_STICKY`, and closing GRIDGO from recent apps
 * stops it, so a bubble never outlives the app that decides when it is wanted.
 */
class TripBubbleService : Service() {
  companion object {
    const val EXTRA_OPEN = "ph.gridgo.tripbubble.OPEN"
    private const val CHANNEL_ID = "gridgo_trip_bubble"
    private const val NOTIFICATION_ID = 0x7B1B
    private const val BUBBLE_DP = 56
    private const val BADGE_DP = 22
    private const val EDGE_DP = 8

    @Volatile var instance: TripBubbleService? = null
    @Volatile var content = BubbleContent(0, "GRIDGO", "", "", "Delivery bubble")
  }

  private val main = Handler(Looper.getMainLooper())
  private lateinit var windowManager: WindowManager
  private var root: FrameLayout? = null
  private var badge: TextView? = null
  private var params: WindowManager.LayoutParams? = null
  private var attached = false

  private val appVisibility = LifecycleEventObserver { _, event ->
    when (event) {
      Lifecycle.Event.ON_START -> detach()
      Lifecycle.Event.ON_STOP -> attach()
      else -> Unit
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    ProcessLifecycleOwner.get().lifecycle.addObserver(appVisibility)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    goForeground()
    render()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
  }

  override fun onDestroy() {
    ProcessLifecycleOwner.get().lifecycle.removeObserver(appVisibility)
    detach()
    if (instance === this) instance = null
    super.onDestroy()
  }

  fun post(block: () -> Unit) {
    main.post(block)
  }

  /** Apply `content`: the badge, the spoken label, the notification. */
  fun render() {
    val view = root ?: buildBubble().also { root = it }
    val current = content
    badge?.apply {
      text = if (current.count > 9) "9+" else current.count.toString()
      visibility = if (current.count > 0) View.VISIBLE else View.GONE
    }
    view.contentDescription = current.label
    val appVisible = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    if (appVisible) detach() else attach()
  }

  private fun goForeground() {
    ensureChannel()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification())
    }
  }

  private fun attach() {
    val view = root ?: return
    if (attached) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return
    val layout = params ?: layoutParams().also { params = it }
    try {
      windowManager.addView(view, layout)
      attached = true
    } catch (_: Exception) {
      // Permission withdrawn while GRIDGO was away. The app re-reads it on return.
    }
  }

  private fun detach() {
    val view = root ?: return
    if (!attached) return
    try {
      windowManager.removeView(view)
    } catch (_: Exception) {
      // Already gone.
    }
    attached = false
  }

  private fun layoutParams(): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      // Right edge, a third of the way down: clear of the status bar and of
      // the turn instructions most navigation apps draw across the top.
      x = resources.displayMetrics.widthPixels - dp(BUBBLE_DP + EDGE_DP + BADGE_DP / 2)
      y = resources.displayMetrics.heightPixels / 3
    }
  }

  /** The app icon in a circle, with the unread count on its shoulder. */
  private fun buildBubble(): FrameLayout {
    val size = dp(BUBBLE_DP)
    val overhang = dp(BADGE_DP / 2)
    val frame = FrameLayout(this).apply {
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
      // Room for the badge above and right, and for the shadow below: the
      // window is only as large as this frame, and clips anything outside it.
      setPadding(dp(4), overhang, overhang, dp(8))
      clipChildren = false
      clipToPadding = false
    }

    val icon = ImageView(this).apply {
      setImageDrawable(packageManager.getApplicationIcon(applicationInfo))
      scaleType = ImageView.ScaleType.CENTER_CROP
      outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      clipToOutline = true
      elevation = dp(6).toFloat()
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    frame.addView(icon, FrameLayout.LayoutParams(size, size))

    val count = TextView(this).apply {
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      typeface = satoshiBold()
      gravity = Gravity.CENTER
      minWidth = dp(BADGE_DP)
      minHeight = dp(BADGE_DP)
      setPadding(dp(6), 0, dp(6), 0)
      includeFontPadding = false
      // `error` (#C62828): the count is a number in white, so the colour is
      // not what carries it, and the white ring parts it from any map.
      background = GradientDrawable().apply {
        cornerRadius = dp(BADGE_DP).toFloat()
        setColor(Color.parseColor("#C62828"))
        setStroke(dp(2), Color.WHITE)
      }
      elevation = dp(7).toFloat()
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      visibility = View.GONE
    }
    frame.addView(
      count,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(BADGE_DP)).apply {
        gravity = Gravity.TOP or Gravity.END
        topMargin = -overhang
        rightMargin = -overhang
      },
    )
    badge = count

    // TalkBack's double tap arrives as a click, not as a touch.
    frame.setOnClickListener { openGridgo() }
    frame.setOnTouchListener(DragOrTap())
    return frame
  }

  private fun satoshiBold(): Typeface =
    try {
      Typeface.createFromAsset(assets, "fonts/Satoshi-Bold.otf")
    } catch (_: Exception) {
      Typeface.DEFAULT_BOLD
    }

  /** A press that barely moves is a tap; anything else drags the window. */
  @SuppressLint("ClickableViewAccessibility")
  private inner class DragOrTap : View.OnTouchListener {
    private val slop = ViewConfiguration.get(this@TripBubbleService).scaledTouchSlop
    private var startX = 0
    private var startY = 0
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    override fun onTouch(view: View, event: MotionEvent): Boolean {
      val layout = params ?: return false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = layout.x
          startY = layout.y
          downX = event.rawX
          downY = event.rawY
          dragging = false
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) dragging = true
          if (dragging) {
            layout.x = startX + dx.toInt()
            layout.y = startY + dy.toInt()
            update(layout)
          }
        }
        MotionEvent.ACTION_UP -> {
          if (dragging) settle(view, layout) else view.performClick()
        }
        MotionEvent.ACTION_CANCEL -> if (dragging) settle(view, layout)
      }
      return true
    }
  }

  /** Rest against the nearer side, inside the screen. */
  private fun settle(view: View, layout: WindowManager.LayoutParams) {
    val metrics = resources.displayMetrics
    val edge = dp(EDGE_DP)
    val centre = layout.x + view.width / 2
    layout.x = if (centre < metrics.widthPixels / 2) edge else metrics.widthPixels - view.width - edge
    layout.y = layout.y.coerceIn(edge, (metrics.heightPixels - view.height - edge).coerceAtLeast(edge))
    update(layout)
  }

  private fun update(layout: WindowManager.LayoutParams) {
    val view = root ?: return
    if (!attached) return
    try {
      windowManager.updateViewLayout(view, layout)
    } catch (_: Exception) {
      // Removed between the touch and the move.
    }
  }

  private fun openGridgo() {
    try {
      startActivity(openIntent())
    } catch (_: Exception) {
      // Nothing to open: the launcher entry is missing, which a build cannot ship.
    }
  }

  private fun openIntent(): Intent {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    return launch
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      .putExtra(EXTRA_OPEN, true)
  }

  private fun notification(): Notification {
    val current = content
    val tap = PendingIntent.getActivity(
      this,
      0,
      openIntent(),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(smallIcon())
      .setContentTitle(current.notificationTitle)
      .setContentText(current.notificationBody)
      .setContentIntent(tap)
      .setOngoing(true)
      .setShowWhen(false)
      .build()
  }

  // The monochrome icon expo-notifications generates, when this build has one;
  // otherwise the launcher icon, as expo-location's service does.
  private fun smallIcon(): Int {
    val generated = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (generated != 0) generated else applicationInfo.icon
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, content.channelName, NotificationManager.IMPORTANCE_LOW).apply {
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    notificationManager().createNotificationChannel(channel)
  }

  private fun notificationManager(): NotificationManager =
    getSystemService(NOTIFICATION_SERVICE) as NotificationManager

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
