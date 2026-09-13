package online.eduignite.apkinstaller;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Hands a downloaded APK to Android's own system package installer. Used by
 * apps/mobile and apps/offline-companion (both sideloaded, no Play Store) to
 * make an in-app update as automatic as the platform allows: Android never
 * lets a non-system app silently replace itself, so the OS's own installer
 * screen is always the final step -- this plugin is what gets the user
 * there in one tap instead of hunting through a Downloads folder.
 *
 * The host app's AndroidManifest.xml must declare a matching FileProvider
 * (authority "${applicationId}.apkinstaller.fileprovider") -- see each
 * app's mobile.yml/offline-companion.yml CI manifest-patching step, which
 * adds this alongside the app's other manifest patches at build time.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean canInstall = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            canInstall = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject result = new JSObject();
        result.put("value", canInstall);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("A file path is required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Install-unknown-apps permission has not been granted");
            return;
        }

        try {
            // `path` arrives as either a plain filesystem path or a file://
            // URI -- both are what @capacitor/filesystem's getUri() can hand
            // back depending on Capacitor version. Normalize to a File
            // either way.
            String filePath = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("File not found: " + filePath);
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".apkinstaller.fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not launch the installer: " + e.getMessage(), e);
        }
    }
}
