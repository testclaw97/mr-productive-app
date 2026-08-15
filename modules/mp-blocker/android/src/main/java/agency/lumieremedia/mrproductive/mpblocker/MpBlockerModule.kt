package agency.lumieremedia.mrproductive.mpblocker

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS <-> native bridge for the Android blocker. Every method is thin: it either reads a
 * permission state, bounces the user into a Settings screen to grant a special-access
 * permission, enumerates launchable apps, or writes into [BlockerStore] (the blocked set
 * / grants that [BlockerService] enforces). The actual watching + overlay live in the
 * service; this class never draws or polls.
 *
 * The `Name("MpBlocker")` here is the handle JS looks up via
 * `requireOptionalNativeModule("MpBlocker")` — it must stay in sync with modules/mp-blocker/index.ts.
 */
class MpBlockerModule : Module() {

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("MpBlocker")

        // --- permission state -------------------------------------------------------
        AsyncFunction("hasUsageAccess") { hasUsageAccess() }

        AsyncFunction("requestUsageAccess") {
            // No runtime dialog exists for usage access — it's a Settings toggle only.
            launchSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }

        AsyncFunction("hasOverlayPermission") { Settings.canDrawOverlays(context) }

        AsyncFunction("requestOverlayPermission") {
            launchSettings(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
            )
        }

        // --- app catalogue ----------------------------------------------------------
        AsyncFunction("listInstalledApps") { listInstalledApps() }

        // --- blocked set + grants (enforced by the service) -------------------------
        AsyncFunction("setBlockedApps") { packages: List<String> ->
            BlockerStore.setBlocked(context, packages)
        }

        AsyncFunction("openFor") { pkg: String, minutes: Double ->
            // JS numbers arrive as Double; convert to an absolute expiry the service reads.
            val ms = (minutes * 60_000.0).toLong()
            BlockerStore.grant(context, pkg, System.currentTimeMillis() + ms)
        }

        // --- service lifecycle ------------------------------------------------------
        AsyncFunction("startService") {
            ContextCompat.startForegroundService(
                context, Intent(context, BlockerService::class.java)
            )
        }

        AsyncFunction("stopService") {
            context.stopService(Intent(context, BlockerService::class.java))
        }
    }

    // --- helpers -------------------------------------------------------------------

    /** True when the user has granted "Usage access" for us in Settings. */
    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun launchSettings(intent: Intent) {
        // A module Context is not an Activity, so NEW_TASK is required to start one.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /**
     * Launchable apps only (label + package), de-duped, our own app excluded, sorted by
     * label. Uses the LAUNCHER-category query — the same set the launcher shows — which is
     * what QUERY_ALL_PACKAGES exists to make fully visible.
     */
    private fun listInstalledApps(): List<Map<String, String>> {
        val pm = context.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = pm.queryIntentActivities(main, 0)
        val seen = HashSet<String>()
        val out = ArrayList<Map<String, String>>()
        for (ri in resolved) {
            val pkg = ri.activityInfo?.packageName ?: continue
            if (pkg == context.packageName) continue // never offer to block ourselves
            if (!seen.add(pkg)) continue
            val label = ri.loadLabel(pm)?.toString() ?: pkg
            out.add(mapOf("label" to label, "packageName" to pkg))
        }
        out.sortBy { it["label"]?.lowercase() }
        return out
    }
}
