package com.routeoptimizer.app

import android.annotation.SuppressLint
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.GeolocationPermissions
import android.webkit.SslErrorHandler
import android.graphics.Color
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var currentUrlIndex = 0
    private val timeoutHandler = Handler(Looper.getMainLooper())
    private var pageLoaded = false

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

    private fun getCandidateUrls(): List<String> {
        val urls = mutableListOf<String>()
        if (isEmulator()) {
            urls.add("http://10.0.2.2:5000")
        } else {
            urls.add(BuildConfig.WEB_APP_URL)
            if (BuildConfig.WEB_APP_URL != "http://191.252.193.10:5000") {
                urls.add("http://191.252.193.10:5000")
            }
        }
        return urls.distinct()
    }

    private fun loadCurrentUrl() {
        val urls = getCandidateUrls()
        if (currentUrlIndex < 0 || currentUrlIndex >= urls.size) {
            currentUrlIndex = 0
        }
        pageLoaded = false
        webView.loadData(
            """
            <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
            <h3>Abrindo RouteOptimizer...</h3>
            <p>Tentando: <b>${urls[currentUrlIndex]}</b></p>
            </body></html>
            """.trimIndent(),
            "text/html",
            "UTF-8"
        )
        webView.loadUrl(urls[currentUrlIndex])
        scheduleLoadTimeout()
    }

    private fun scheduleLoadTimeout() {
        timeoutHandler.removeCallbacksAndMessages(null)
        timeoutHandler.postDelayed({
            if (!pageLoaded) {
                val urls = getCandidateUrls().joinToString("<br>")
                webView.loadData(
                    """
                    <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
                    <h3>Conexao nao concluida</h3>
                    <p>O app nao conseguiu abrir em tempo esperado.</p>
                    <p><b>URLs testadas:</b><br>$urls</p>
                    <p>Abra no navegador do celular: <b>http://191.252.193.10:5000</b></p>
                    <p>Se nao abrir, o problema e rede/firewall/porta do servidor.</p>
                    </body></html>
                    """.trimIndent(),
                    "text/html",
                    "UTF-8"
                )
            }
        }, 10000)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView.setBackgroundColor(Color.parseColor("#0f141b"))
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val currentTarget = getCandidateUrls().getOrNull(currentUrlIndex) ?: ""
                if (!url.isNullOrBlank() && (url.startsWith("http://") || url.startsWith("https://")) && url.startsWith(currentTarget)) {
                    pageLoaded = true
                    timeoutHandler.removeCallbacksAndMessages(null)
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    val urls = getCandidateUrls()
                    if (currentUrlIndex < urls.lastIndex) {
                        currentUrlIndex += 1
                        loadCurrentUrl()
                        return
                    }

                    val baseUrl = urls.getOrNull(currentUrlIndex) ?: "URL nao definida"
                    val message = error?.description ?: "Falha ao carregar o app."
                    view?.loadData(
                        """
                        <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
                        <h3>Nao foi possivel abrir o app</h3>
                        <p>URL configurada: <b>$baseUrl</b></p>
                        <p>Erro: $message</p>
                        <p>Verifique se o servidor esta online e acessivel no celular.</p>
                        </body></html>
                        """.trimIndent(),
                        "text/html",
                        "UTF-8"
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                if (request?.isForMainFrame == true) {
                    val statusCode = errorResponse?.statusCode ?: 0
                    if (statusCode >= 400) {
                        val baseUrl = getCandidateUrls().getOrNull(currentUrlIndex) ?: "URL nao definida"
                        view?.loadData(
                            """
                            <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
                            <h3>Erro HTTP $statusCode</h3>
                            <p>URL: <b>$baseUrl</b></p>
                            <p>Verifique login/rota e status do servidor.</p>
                            </body></html>
                            """.trimIndent(),
                            "text/html",
                            "UTF-8"
                        )
                    }
                }
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                val baseUrl = getCandidateUrls().getOrNull(currentUrlIndex) ?: "URL nao definida"
                view?.loadData(
                    """
                    <html><body style='font-family:sans-serif;padding:16px;background:#0f141b;color:#e7edf7;'>
                    <h3>Erro de certificado SSL</h3>
                    <p>URL: <b>$baseUrl</b></p>
                    <p>Instale certificado valido (HTTPS) no servidor.</p>
                    </body></html>
                    """.trimIndent(),
                    "text/html",
                    "UTF-8"
                )
                handler?.cancel()
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
            userAgentString = "${userAgentString} RouteOptimizerAndroidApp/1.2"
        }

        // Em alguns aparelhos restoreState pode manter pagina em branco.
        // Forca sempre um carregamento novo da URL configurada.
        loadCurrentUrl()
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
