package expo.modules.amicall

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// Quick Settings tile (Android's Control Center button): opens Amixos straight
// into an Ami call via amixos://ami/call (handled in app/+native-intent.tsx).
class AmiTileService : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = "Ami"
      updateTile()
    }
  }

  override fun onClick() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("amixos://ami/call"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
