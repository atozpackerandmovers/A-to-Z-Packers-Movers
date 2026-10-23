package com.atozpackersmovers.drivertrackerv5

import com.atozpackersmovers.drivertrackerv5.firebase.ServerCommandReader
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.URL
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class ServerCommandReaderTest {
    private val base = "https://fixture.firebasedatabase.app"
    private class Connection(url: URL, val code: Int = 200, val body: String = "{}") : HttpsURLConnection(url) {
        var disconnected = false
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun connect() = Unit
        override fun getResponseCode() = code
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
        override fun getCipherSuite() = "FIXTURE"
        override fun getLocalCertificates(): Array<Certificate>? = null
        override fun getServerCertificates(): Array<Certificate> = emptyArray()
    }

    @Test fun `server request scopes path and disables HTTP cache and redirects`() = runBlocking {
        var connection: Connection? = null
        val reader = ServerCommandReader { Connection(it, body = "{\"status\":\"RECEIVED\"}").also { c -> connection = c } }
        assertEquals("{\"status\":\"RECEIVED\"}", reader.read(base, "gpsProduction/v1", "DRIVER", "CMD 1", "FIXTURE_TOKEN"))
        val c = checkNotNull(connection)
        assertEquals("/gpsProduction/v1/drivers/DRIVER/commands/CMD%201.json", c.url.path)
        assertEquals("auth=FIXTURE_TOKEN", c.url.query)
        assertEquals("GET", c.requestMethod); assertFalse(c.useCaches); assertFalse(c.instanceFollowRedirects)
        assertEquals("no-cache, no-store", c.getRequestProperty("Cache-Control"))
        assertTrue(c.disconnected)
    }

    @Test fun `permission denial and redirects never return cached data`() = runBlocking {
        for (status in listOf(301, 401, 403, 500)) {
            val c = Connection(URL(base), status, "{\"status\":\"EXECUTED\"}")
            try {
                ServerCommandReader { c }.read(base, "gpsProduction/v1", "DRIVER", "CMD", "FIXTURE_TOKEN")
                fail("HTTP $status accepted")
            } catch (expected: IllegalStateException) { assertEquals("SERVER_COMMAND_READ_FAILED", expected.message) }
            assertTrue(c.disconnected)
        }
    }

    @Test fun `network errors cannot leak authenticated URL through outbox error`() = runBlocking {
        try {
            ServerCommandReader { throw IOException("Secret URL $it") }.read(base, "gpsProduction/v1", "DRIVER", "CMD", "FIXTURE_TOKEN")
            fail("Expected error")
        } catch (expected: IllegalStateException) {
            assertEquals("SERVER_COMMAND_READ_FAILED", expected.message)
            // Coroutine stack recovery may wrap a sanitized exception in another sanitized copy.
            assertFalse(expected.stackTraceToString().contains("FIXTURE_TOKEN"))
            assertFalse(expected.stackTraceToString().contains("Secret URL"))
        }
    }

    @Test fun `invalid path or host is rejected before connection`() = runBlocking {
        for (id in listOf("../CMD", "CMD/other", "CMD#", "", "CMD\n")) {
            try {
                ServerCommandReader { fail("Unexpected connection"); Connection(it) }.read(base, "gpsProduction/v1", "DRIVER", id, "FIXTURE")
                fail("Accepted invalid id")
            } catch (_: IllegalArgumentException) { }
        }
        try {
            ServerCommandReader { fail("Unexpected connection"); Connection(it) }.read("https://example.com", "root", "DRIVER", "CMD", "FIXTURE")
            fail("Accepted invalid host")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun `oversized response stays retryable and connection closes`() = runBlocking {
        val c = Connection(URL(base), body = "x".repeat(65_537))
        try {
            ServerCommandReader { c }.read(base, "gpsProduction/v1", "DRIVER", "CMD", "FIXTURE")
            fail("Accepted oversized response")
        } catch (expected: IllegalStateException) { assertEquals("SERVER_COMMAND_READ_FAILED", expected.message) }
        assertTrue(c.disconnected)
    }
}
