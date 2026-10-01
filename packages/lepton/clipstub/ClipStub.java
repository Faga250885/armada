import android.os.Binder;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.os.RemoteException;

// Lepton's Android starts no clipboard service, so ClipboardManager is null
// and anything that touches it at startup (SDL's activity) dies. This is an
// empty clipboard registered under the service's name.
public class ClipStub extends Binder {
    private static final String DESCRIPTOR = "android.content.IClipboard";

    @Override
    protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        if (code == INTERFACE_TRANSACTION) {
            reply.writeString(DESCRIPTOR);
            return true;
        }
        if (code < FIRST_CALL_TRANSACTION || code > FIRST_CALL_TRANSACTION + 7) {
            return super.onTransact(code, data, reply, flags);
        }
        data.enforceInterface(DESCRIPTOR);
        if (reply != null) {
            reply.writeNoException();
            switch (code - FIRST_CALL_TRANSACTION) {
                case 2: // getPrimaryClip
                case 3: // getPrimaryClipDescription
                case 4: // hasPrimaryClip
                case 7: // hasClipboardText
                    reply.writeInt(0);
                    break;
            }
        }
        return true;
    }

    public static void main(String[] args) throws Exception {
        Looper.prepareMainLooper();
        Class<?> sm = Class.forName("android.os.ServiceManager");
        sm.getMethod("addService", String.class, IBinder.class).invoke(null, "clipboard", new ClipStub());
        System.out.println("clipstub: registered");
        Looper.loop();
    }
}
