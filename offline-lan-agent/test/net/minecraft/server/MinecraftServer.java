package net.minecraft.server;

public class MinecraftServer {
    private boolean authentication = true;

    public boolean usesAuthentication() { return authentication; }
    public void setUsesAuthentication(boolean value) { authentication = value; }
    public boolean enforceSecureProfile() { return false; }
}
