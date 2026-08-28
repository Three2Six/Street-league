package com.streetleague.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int LOCATION_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The map, challenges, and SOS all depend on GPS via the browser's navigator.geolocation
        // API — ask for the OS-level permission up front so the in-app prompt below has
        // something to grant.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                LOCATION_PERMISSION_REQUEST
            );
        }

        // Android's WebView does not forward web geolocation requests to the OS by default —
        // without this, navigator.geolocation silently fails inside the app even with the OS
        // permission granted above. This is the one piece of native code the web app actually
        // needs; everything else about the app is loaded live from the server.
        this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
    }
}
