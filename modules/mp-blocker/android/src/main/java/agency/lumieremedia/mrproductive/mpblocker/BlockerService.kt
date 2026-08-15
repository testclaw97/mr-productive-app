package agency.lumieremedia.mrproductive.mpblocker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The always-on part of the blocker: a foreground service that polls the current
 * foreground app once per second and, when that app is blocked AND has no active grant,
 * slaps a full-screen overlay over it. The service — never the JS layer — owns the grant
 * countdown (see [BlockerStore]): the overlay reappears the instant a grant expires
 * because the very next tick re-evaluates `now < expiry` and finds it false.
 *
 * Foreground-app detection uses UsageStatsManager (queryEvents), NOT an
 * AccessibilityService, to stay clear of Play's accessibility-API policy — see the
 * module AndroidManifest for the full rationale.
 */
class BlockerService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayForPackage: String? = null

    private val ticker = object : Runnable {
        override fun run() {
            // Guard every tick: a thrown exception must never kill the polling loop.
            try {
                tick()
            } catch (_: Throwable) {
                // Best-effort: swallow and keep polling.
            }
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        handler.removeCallbacks(ticker)
        handler.post(ticker)
        // START_STICKY: if Android kills us under memory pressure, restart when it can —
        // the blocker should be self-healing.
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        hideOverlay()
        super.onDestroy()
    }

    // --- the poll ---------------------------------------------------------------------

    private fun tick() {
        val pkg = currentForegroundPackage()
        // Never block ourselves (the coach negotiation UI must always be reachable), and
        // hide the overlay whenever we can't identify the foreground app.
        if (pkg == null || pkg == packageName) {
            hideOverlay(); return
        }
        if (!BlockerStore.isBlocked(this, pkg)) {
            hideOverlay(); return
        }
        // Active grant → let them through; the SERVICE decided this, purely from the
        // stored expiry timestamp. When it lapses, the next tick falls through to block.
        if (BlockerStore.hasActiveGrant(this, pkg)) {
            hideOverlay(); return
        }
        showOverlay(pkg)
    }

    /**
     * Newest foreground app in the last [FOREGROUND_WINDOW_MS] window. We scan RESUMED
     * events and keep the most recent one; on API 29+ ACTIVITY_RESUMED is the reliable
     * signal, older devices use the deprecated MOVE_TO_FOREGROUND alias (same value).
     */
    private fun currentForegroundPackage(): String? {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
        val end = System.currentTimeMillis()
        val begin = end - FOREGROUND_WINDOW_MS
        val events = usm.queryEvents(begin, end)
        val event = UsageEvents.Event()
        var latestPkg: String? = null
        var latestTime = 0L
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val isResume = event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                    event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)
            if (isResume && event.timeStamp >= latestTime) {
                latestTime = event.timeStamp
                latestPkg = event.packageName
            }
        }
        return latestPkg
    }

    // --- overlay ----------------------------------------------------------------------

    private fun showOverlay(pkg: String) {
        // Already showing for this exact app → nothing to do (avoid re-adding every tick).
        if (overlayView != null && overlayForPackage == pkg) return
        // Lost the overlay permission mid-run? We simply can't draw — bail quietly.
        if (!Settings.canDrawOverlays(this)) return

        hideOverlay() // clear any stale overlay (e.g. it was up for a different app)

        val wm = windowManager ?: return
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // Focusable + touchable (no NOT_FOCUSABLE / NOT_TOUCHABLE flags) so our buttons
            // work AND the covered app can't be interacted with underneath. KEEP_SCREEN_ON
            // stops the block screen dimming out mid-standoff.
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.OPAQUE
        )
        params.gravity = Gravity.CENTER

        val view = buildOverlayView()
        try {
            wm.addView(view, params)
            overlayView = view
            overlayForPackage = pkg
        } catch (_: Throwable) {
            overlayView = null
            overlayForPackage = null
        }
    }

    private fun hideOverlay() {
        val v = overlayView ?: return
        try {
            windowManager?.removeView(v)
        } catch (_: Throwable) {
            // Already detached — ignore.
        }
        overlayView = null
        overlayForPackage = null
    }

    /** A simple native block screen. No XML layout — built in code so the module stays self-contained. */
    private fun buildOverlayView(): View {
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.gravity = Gravity.CENTER
        root.setBackgroundColor(Color.parseColor("#0d0d12")) // matches the app's colors.bg
        root.setPadding(dp(32), dp(32), dp(32), dp(32))

        val title = TextView(this)
        title.text = "Blocked"
        title.setTextColor(Color.parseColor("#f3f3f6"))
        title.textSize = 32f
        title.gravity = Gravity.CENTER

        val body = TextView(this)
        body.text = "You asked Mr. Productive to guard this app.\nTalk to your coach to earn time."
        body.setTextColor(Color.parseColor("#c8c8d4"))
        body.textSize = 16f
        body.gravity = Gravity.CENTER
        (body.layoutParams as? LinearLayout.LayoutParams
            ?: LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )).also {
            it.topMargin = dp(16)
            it.bottomMargin = dp(28)
            body.layoutParams = it
        }

        val talk = Button(this)
        talk.text = "Talk to your coach"
        talk.setOnClickListener { openApp() }

        val home = Button(this)
        home.text = "Go to home screen"
        (LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )).also { it.topMargin = dp(12); home.layoutParams = it }
        home.setOnClickListener { goHome() }

        root.addView(title)
        root.addView(body)
        root.addView(talk)
        root.addView(home)
        return root
    }

    /** Launch the Mr. Productive app (its launcher activity) so the user can negotiate. */
    private fun openApp() {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(launch)
            } catch (_: Throwable) {
            }
        }
        // Drop the overlay; if the user comes back to the blocked app, the next tick re-arms it.
        hideOverlay()
    }

    /** Send the user to the launcher — the minimum "get out of the blocked app" escape. */
    private fun goHome() {
        val home = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(home)
        } catch (_: Throwable) {
        }
        hideOverlay()
    }

    // --- foreground-service plumbing --------------------------------------------------

    private fun startAsForeground() {
        val channelId = CHANNEL_ID
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm != null && nm.getNotificationChannel(channelId) == null) {
                val channel = NotificationChannel(
                    channelId,
                    "App blocking",
                    NotificationManager.IMPORTANCE_LOW // silent, no heads-up
                )
                channel.description = "Keeps the self-control blocker running in the background."
                nm.createNotificationChannel(channel)
            }
        }

        val open = packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val contentIntent = if (open != null) {
            PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        } else null

        val notification: Notification =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, channelId)
                    .setContentTitle("Mr. Productive is protecting you")
                    .setContentText("Guarding your blocked apps.")
                    .setSmallIcon(android.R.drawable.ic_lock_lock)
                    .setOngoing(true)
                    .also { if (contentIntent != null) it.setContentIntent(contentIntent) }
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setContentTitle("Mr. Productive is protecting you")
                    .setContentText("Guarding your blocked apps.")
                    .setSmallIcon(android.R.drawable.ic_lock_lock)
                    .setOngoing(true)
                    .also { if (contentIntent != null) it.setContentIntent(contentIntent) }
                    .build()
            }

        // API 34+ requires the FGS type to be declared at start-time AND match the manifest.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val POLL_MS = 1000L
        private const val FOREGROUND_WINDOW_MS = 10_000L
        private const val CHANNEL_ID = "mp_blocker"
        private const val NOTIF_ID = 4022 // arbitrary, stable
    }
}
