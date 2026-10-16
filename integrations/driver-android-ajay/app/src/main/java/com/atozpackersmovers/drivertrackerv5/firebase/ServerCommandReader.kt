package com.atozpackersmovers.drivertrackerv5.firebase

import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/** Firebase SDK get() can fall back to optimistic local writes. REST GET has no SDK cache. */
class ServerCommandReader(
    private val connect: (URL) -> HttpsURLConnection = { it.openConnection() as HttpsURLConnection },
) {
    suspend fun read(databaseUrl: String, root: String, driverId: String, commandId: String, idToken: String): String =
        withContext(Dispatchers.IO) {
            fun segment(value: String): String {
                require(value.isNotBlank() && value.none { it in "/.#$[]" || it.code < 32 || it.code == 127 })
                return URLEncoder.encode(value, "UTF-8").replace("+", "%20")
            }
            val base = URL(databaseUrl)
            require(base.protocol == "https" && base.userInfo == null && base.query == null &&
                base.ref == null && base.port == -1 && base.path in listOf("", "/") &&
                (base.host.endsWith(".firebasedatabase.app") || base.host.endsWith(".firebaseio.com")))
            require(commandId.length <= 128 && idToken.isNotBlank())
            val path = (root.split("/") + listOf("drivers", driverId, "commands", commandId)).joinToString("/") { segment(it) }
            // Existing Firebase ID token, used transiently. Never log this URL or attach it to errors.
            val address = URL("${base.protocol}://${base.host}/$path.json?auth=${URLEncoder.encode(idToken, "UTF-8")}")
            var connection: HttpsURLConnection? = null
            try {
                ensureActive()
                connection = connect(address)
                connection.requestMethod = "GET"
                connection.useCaches = false
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.setRequestProperty("Cache-Control", "no-cache, no-store")
                connection.setRequestProperty("Accept", "application/json")
                check(connection.responseCode == 200) { "SERVER_COMMAND_READ_REJECTED" }
                val bytes = connection.inputStream.use { stream ->
                    val buffer = ByteArray(65_537)
                    var count = 0
                    while (count < buffer.size) {
                        val read = stream.read(buffer, count, buffer.size - count)
                        if (read == -1) break
                        count += read
                    }
                    check(count <= 65_536) { "SERVER_COMMAND_RESPONSE_TOO_LARGE" }
                    buffer.copyOf(count)
                }
                ensureActive()
                bytes.toString(Charsets.UTF_8)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Transport exceptions may contain the authenticated URL. Keep them out of the outbox/logs.
                throw IllegalStateException("SERVER_COMMAND_READ_FAILED")
            } finally {
                connection?.disconnect()
            }
        }
}
