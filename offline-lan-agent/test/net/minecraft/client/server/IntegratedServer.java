package net.minecraft.client.server;

import net.minecraft.server.MinecraftServer;

public class IntegratedServer extends MinecraftServer {
    public String startupMessage() { return "Starting integrated minecraft server version fixture"; }
    public boolean published;
    public boolean isPublished() { return published; }
}
