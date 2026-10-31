package net.minecraft.client.server;

import net.minecraft.server.MinecraftServer;

public class IntegratedServer extends MinecraftServer {
    public boolean published;
    public boolean isPublished() { return published; }
}
