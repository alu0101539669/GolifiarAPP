package com.donsecanarias.golifiar;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Recibe el ZIP de Instagram desde «Compartir» o «Abrir con», lo copia a la caché
 * privada de la app y se lo entrega a la web (window.golifiarArchivoCompartido).
 * El archivo no sale del dispositivo y se borra a los pocos minutos.
 */
public class MainActivity extends BridgeActivity {

    private static final String CARPETA = "recibidos";
    private static final int REINTENTOS = 40;          // 40 x 500 ms = 20 s esperando a que cargue la web
    private static final long BORRAR_TRAS_MS = 5 * 60 * 1000L;

    private final Handler principal = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        manejarIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        manejarIntent(intent);
    }

    private Intent ultimoIntent;

    private void manejarIntent(Intent intent) {
        // BridgeActivity.load() ya llama a onNewIntent durante el arranque: se evita entregar dos veces
        if (intent == null || intent == ultimoIntent) return;
        ultimoIntent = intent;
        final String accion = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(accion)) {
            if (Build.VERSION.SDK_INT >= 33) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                @SuppressWarnings("deprecation")
                Uri extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                uri = extra;
            }
        } else if (Intent.ACTION_VIEW.equals(accion)) {
            uri = intent.getData();
        }
        if (uri == null) return;
        // Para que un giro de pantalla o recrear la actividad no vuelva a entregar el archivo
        setIntent(new Intent(Intent.ACTION_MAIN));

        final Uri origen = uri;
        // Se copia fuera del hilo principal: el ZIP puede pesar cientos de MB
        new Thread(() -> {
            try {
                final File destino = copiarACache(origen);
                final String nombre = nombreDe(origen);
                final String url = "/_capacitor_file_" + destino.getAbsolutePath();
                final String js = "window.golifiarArchivoCompartido && window.golifiarArchivoCompartido("
                        + JSONObject.quote(url) + "," + JSONObject.quote(nombre) + ")";
                principal.post(() -> entregar(js, 0));
                principal.postDelayed(destino::delete, BORRAR_TRAS_MS);
            } catch (Exception e) {
                // Si falla, el usuario siempre puede elegir el ZIP desde la pantalla principal
                e.printStackTrace();
            }
        }).start();
    }

    private File copiarACache(Uri origen) throws Exception {
        File carpeta = new File(getCacheDir(), CARPETA);
        if (!carpeta.exists()) carpeta.mkdirs();
        File[] viejos = carpeta.listFiles();
        if (viejos != null) for (File f : viejos) f.delete();

        File destino = new File(carpeta, System.currentTimeMillis() + ".zip");
        try (InputStream in = getContentResolver().openInputStream(origen);
             OutputStream out = new FileOutputStream(destino)) {
            if (in == null) throw new IllegalStateException("No se pudo abrir el archivo recibido");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        return destino;
    }

    private String nombreDe(Uri uri) {
        String nombre = "descarga.zip";
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) nombre = c.getString(0);
        } catch (Exception ignorada) {
            // se usa el nombre por defecto
        }
        return nombre.toLowerCase().endsWith(".zip") ? nombre : nombre + ".zip";
    }

    /** Espera a que la web esté cargada y le entrega el archivo. Debe ejecutarse en el hilo principal. */
    private void entregar(final String js, final int intento) {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            if (intento < REINTENTOS) principal.postDelayed(() -> entregar(js, intento + 1), 500);
            return;
        }
        web.evaluateJavascript("typeof window.golifiarArchivoCompartido", valor -> {
            if ("\"function\"".equals(valor)) {
                web.evaluateJavascript(js, null);
            } else if (intento < REINTENTOS) {
                principal.postDelayed(() -> entregar(js, intento + 1), 500);
            }
        });
    }
}
