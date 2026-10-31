package net.minecraft.server.network;

import net.minecraft.server.MinecraftServer;

public class ServerLoginPacketListenerImpl {
    public boolean handleHello(MinecraftServer server) {
        if (server == null) throw new IllegalStateException("Unexpected hello packet");
        return server.usesAuthentication();
    }
}
