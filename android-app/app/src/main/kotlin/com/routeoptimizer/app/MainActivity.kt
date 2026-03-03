package com.routeoptimizer.app

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private fun isEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase()
        val model = Build.MODEL.lowercase()
        val product = Build.PRODUCT.lowercase()
        val brand = Build.BRAND.lowercase()
        val device = Build.DEVICE.lowercase()
        return fingerprint.contains("generic")
            || fingerprint.contains("emulator")
            || model.contains("emulator")
            || product.contains("sdk")
            || (brand.contains("generic") && device.contains("generic"))
    }

    private fun getBaseUrl(): String {
        return if (isEmulator()) {
            "http://10.0.2.2:5000"
        } else {
            BuildConfig.WEB_APP_URL
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    val baseUrl = getBaseUrl()
                    val message = error?.description ?: "Falha ao carregar o app."
                    view?.loadData(
                        """
                        <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
                        <h3>Nao foi possivel abrir o app</h3>
                        <p>URL configurada: <b>$baseUrl</b></p>
                        <p>Erro: $message</p>
                        <p>No celular real, configure WEB_APP_URL no build.gradle com sua URL publica HTTPS.</p>
                        </body></html>
                        """.trimIndent(),
                        "text/html",
                        "UTF-8"
                    )
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(getBaseUrl())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
