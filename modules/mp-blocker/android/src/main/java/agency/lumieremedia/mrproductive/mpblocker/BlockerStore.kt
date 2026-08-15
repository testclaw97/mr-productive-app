package agency.lumieremedia.mrproductive.mpblocker

import android.content.Context

/**
 * Single source of truth for (a) the set of blocked app packages and (b) the active
 * "open" grants, shared between the JS-facing [MpBlockerModule] (which WRITES) and the
 * [BlockerService] (which READS on every poll tick).
 *
 * WHY a persisted native store instead of a JS-held list + JS timers:
 *
 *   1. The SERVICE owns the re-block timer — this is the core invariant, mirroring the
 *      extension's "site opens only for the granted minutes then relocks". JS calls
 *      [grant] ONCE to write an absolute EXPIRY timestamp. From then on the service, on
 *      every tick, decides purely from `System.currentTimeMillis() < expiry` whether the
 *      app is still open. JS can crash, be GC'd, or lie about elapsed time — none of it
 *      can leave a blocked app permanently open, because the countdown lives in native
 *      state and is evaluated natively.
 *
 *   2. Backed by SharedPreferences so a service restart (low-memory kill, or a future
 *      boot-persistent variant) rehydrates the exact blocked set + outstanding grants
 *      without a round-trip to a possibly-dead JS runtime.
 *
 * All methods take a Context and touch only SharedPreferences, so this object holds no
 * leaked references and is safe to call from either the module or the service.
 */
object BlockerStore {
    private const val PREFS = "mp_blocker_store"
    private const val KEY_BLOCKED = "blocked_packages"
    private const val KEY_GRANTS = "grants" // Set of "pkg=expiryMillis" entries.

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Replace the blocked-app set. Empty/blank entries are dropped, order irrelevant. */
    fun setBlocked(ctx: Context, packages: List<String>) {
        val clean = packages.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        prefs(ctx).edit().putStringSet(KEY_BLOCKED, clean).apply()
    }

    fun blocked(ctx: Context): Set<String> =
        prefs(ctx).getStringSet(KEY_BLOCKED, emptySet()) ?: emptySet()

    fun isBlocked(ctx: Context, pkg: String): Boolean = blocked(ctx).contains(pkg)

    /** Record (or extend) a grant that opens [pkg] until [expiryMillis] (absolute epoch ms). */
    fun grant(ctx: Context, pkg: String, expiryMillis: Long) {
        val current = grantsMap(ctx).toMutableMap()
        current[pkg] = expiryMillis
        persistGrants(ctx, current)
    }

    /** True only while [pkg] has a grant whose expiry is still in the future. */
    fun hasActiveGrant(ctx: Context, pkg: String): Boolean {
        val expiry = grantsMap(ctx)[pkg] ?: return false
        return System.currentTimeMillis() < expiry
    }

    private fun grantsMap(ctx: Context): Map<String, Long> {
        val raw = prefs(ctx).getStringSet(KEY_GRANTS, emptySet()) ?: emptySet()
        val out = HashMap<String, Long>()
        for (entry in raw) {
            // Split on the LAST '=' so package names (which never contain '=') survive intact.
            val i = entry.lastIndexOf('=')
            if (i <= 0) continue
            val pkg = entry.substring(0, i)
            val expiry = entry.substring(i + 1).toLongOrNull() ?: continue
            out[pkg] = expiry
        }
        return out
    }

    private fun persistGrants(ctx: Context, map: Map<String, Long>) {
        val now = System.currentTimeMillis()
        // Prune already-expired grants on every write so the stored set can't grow forever.
        val alive = map.filterValues { it > now }.map { "${it.key}=${it.value}" }.toSet()
        prefs(ctx).edit().putStringSet(KEY_GRANTS, alive).apply()
    }
}
