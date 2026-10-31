package com.makicon.screen.lan;

/** Loads the real game's host class without opening a window or creating a world. */
public final class RealMinecraftLanTest {
    public static void main(String[] args) throws Exception {
        boolean enabled = Boolean.parseBoolean(args[0]);
        var unsafeClass = Class.forName("sun.misc.Unsafe");
        var singleton = unsafeClass.getDeclaredField("theUnsafe");
        singleton.setAccessible(true);
        var unsafe = singleton.get(null);
        var integrated = Class.forName("net.minecraft.client.server.IntegratedServer");
        var instance = unsafeClass.getMethod("allocateInstance", Class.class).invoke(unsafe, integrated);
        var port = integrated.getDeclaredField("publishedPort");
        port.setAccessible(true);
        var usesAuthentication = integrated.getMethod("usesAuthentication");
        var setUsesAuthentication = integrated.getMethod("setUsesAuthentication", boolean.class);
        setUsesAuthentication.invoke(instance, true);
        port.setInt(instance, -1);
        check((boolean) usesAuthentication.invoke(instance), "Private world's original auth mode");
        port.setInt(instance, 25565);
        check((boolean) usesAuthentication.invoke(instance) != enabled, "Published world's auth mode");
        check(!(boolean) integrated.getMethod("enforceSecureProfile").invoke(instance),
            "Vanilla LAN does not require signed profiles");
        port.setInt(instance, -1);
        check((boolean) usesAuthentication.invoke(instance), "Closing LAN restores auth mode");
        System.out.println("Real Minecraft class checks passed (enabled=" + enabled + ").");
    }

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
