package com.makicon.screen.lan;

import java.lang.classfile.ClassFile;
import java.lang.classfile.attribute.CodeAttribute;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.jar.JarFile;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.server.MinecraftServer;

public final class OfflineLanAgentTest {
    public static void main(String[] args) throws Exception {
        boolean enabled = Boolean.parseBoolean(args[0]);
        var server = new IntegratedServer();
        check(server.usesAuthentication(), "Private world keeps the original authentication mode");
        server.published = true;
        check(server.usesAuthentication() != enabled, "Only shared LAN worlds accept offline players");
        check(!server.enforceSecureProfile(), "Vanilla integrated server allows unsigned profiles");
        check(new MinecraftServer().usesAuthentication(), "Dedicated/remote server mode is unchanged");
        server.published = false;
        check(server.usesAuthentication(), "Closing LAN restores the original authentication mode");
        server.setUsesAuthentication(false);
        check(!server.usesAuthentication(), "Private world delegates to the original superclass");

        var transformer = new OfflineLanAgent();
        check(transformer.transform(null, "net/minecraft/server/MinecraftServer", null, null,
            new byte[0]) == null, "Superclass is never transformed");
        check(transformer.transform(null, "net/minecraft/client/multiplayer/ClientPacketListener",
            null, null, new byte[0]) == null, "Remote client login is never transformed");

        for (int i = 1; i < args.length; i++) {
            try (var jar = new JarFile(Path.of(args[i]).toFile())) {
                var entry = jar.getJarEntry(OfflineLanAgent.TARGET + ".class");
                check(entry != null, "Real Minecraft JAR contains the expected host class");
                byte[] original;
                try (var stream = jar.getInputStream(entry)) { original = stream.readAllBytes(); }
                byte[] patched = OfflineLanAgent.patch(original);
                var classFile = ClassFile.of();
                var before = classFile.parse(original);
                var after = classFile.parse(patched);
                check(after.methods().size() == before.methods().size() + 1,
                    "Exactly one inherited host method is overridden");
                check(after.methods().stream().filter(method ->
                    method.methodName().equalsString("usesAuthentication")
                        && method.methodType().equalsString("()Z")).count() == 1,
                    "Authentication override exists in the real Minecraft class");
                for (var method : before.methods()) {
                    var unchanged = after.methods().stream().filter(candidate ->
                        candidate.methodName().equalsString(method.methodName().stringValue())
                            && candidate.methodType().equalsString(method.methodType().stringValue()))
                        .findFirst().orElseThrow();
                    check(method.code().isEmpty() || Arrays.equals(
                        ((CodeAttribute) method.code().orElseThrow()).codeArray(),
                        ((CodeAttribute) unchanged.code().orElseThrow()).codeArray()),
                        "Original Minecraft method bytecode is preserved");
                }
                try {
                    OfflineLanAgent.patch(patched);
                    throw new AssertionError("An already overridden method must be rejected");
                } catch (IllegalArgumentException expected) { }
                System.out.println("Verified Minecraft JAR: " + args[i]);
            }
        }
        System.out.println("Offline LAN agent checks passed (enabled=" + enabled + ").");
    }

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
