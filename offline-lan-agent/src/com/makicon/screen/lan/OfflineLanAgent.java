package com.makicon.screen.lan;

import com.makicon.screen.lan.bootstrap.LanAuthentication;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import java.nio.charset.StandardCharsets;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.*;

/** Recognizes vanilla's login flow independently of obfuscated class/method names. */
public final class OfflineLanAgent implements ClassFileTransformer {
    static final String SERVER = "net/minecraft/server/MinecraftServer";
    static final String INTEGRATED_MARKER = "Starting integrated minecraft server version";
    static final String LOGIN_MARKER = "Unexpected hello packet";
    private static final String HELPER = "com/makicon/screen/lan/bootstrap/LanAuthentication";

    public static void premain(String options, Instrumentation instrumentation) {
        if (LanAuthentication.class.getClassLoader() != null) {
            System.err.println("[ScreenLauncher LAN] Bootstrap helper is unavailable; keeping original login behavior.");
            return;
        }
        instrumentation.addTransformer(new OfflineLanAgent());
        System.out.println("[ScreenLauncher LAN] Automatic offline LAN support ready.");
    }

    @Override
    public byte[] transform(ClassLoader loader, String name, Class<?> redefined,
                            ProtectionDomain domain, byte[] bytes) {
        if (loader == null || name == null || redefined != null
                || name.startsWith("com/makicon/screen/lan/")) return null;
        try {
            if (contains(bytes, INTEGRATED_MARKER)) {
                ClassReader reader = new ClassReader(bytes);
                if (SERVER.equals(reader.getSuperName())) {
                    LanAuthentication.register(loader, reader.getClassName().replace('/', '.'));
                    System.out.println("[ScreenLauncher LAN] Recognized integrated LAN host: " + name);
                }
            }
            if (!contains(bytes, LOGIN_MARKER)) return null;
            byte[] patched = patchLogin(bytes);
            if (patched != null) System.out.println("[ScreenLauncher LAN] Offline LAN login support applied.");
            return patched;
        } catch (RuntimeException error) {
            System.err.println("[ScreenLauncher LAN] Keeping original login behavior: " + error);
            return null;
        }
    }

    static boolean contains(byte[] bytes, String text) {
        byte[] pattern = text.getBytes(StandardCharsets.US_ASCII);
        outer: for (int i = 0; i <= bytes.length - pattern.length; i++) {
            if (bytes[i] != pattern[0]) continue;
            for (int j = 1; j < pattern.length; j++) {
                if (bytes[i + j] != pattern[j]) continue outer;
            }
            return true;
        }
        return false;
    }

    static byte[] patchLogin(byte[] bytes) {
        ClassReader reader = new ClassReader(bytes);
        ClassNode model = new ClassNode(Opcodes.ASM9);
        reader.accept(model, 0);
        MethodNode hello = null;
        MethodInsnNode authentication = null;
        for (MethodNode method : model.methods) {
            boolean helloMarker = false;
            for (AbstractInsnNode instruction : method.instructions) {
                if (instruction instanceof LdcInsnNode
                        && LOGIN_MARKER.equals(((LdcInsnNode) instruction).cst)) helloMarker = true;
            }
            if (!helloMarker) continue;
            if (hello != null) return null;
            hello = method;
            for (AbstractInsnNode instruction : method.instructions) {
                if (instruction instanceof MethodInsnNode) {
                    MethodInsnNode call = (MethodInsnNode) instruction;
                    if (HELPER.equals(call.owner)) return null;
                    if (authentication == null && call.getOpcode() == Opcodes.INVOKEVIRTUAL
                            && SERVER.equals(call.owner) && "()Z".equals(call.desc)) {
                        authentication = call;
                    }
                }
            }
        }
        if (hello == null || authentication == null) return null;
        // Keep the original decision for dedicated servers. Only a recognized
        // integrated server instance accepts offline logins automatically.
        hello.instructions.insertBefore(authentication, new InsnNode(Opcodes.DUP));
        hello.instructions.insert(authentication, new MethodInsnNode(Opcodes.INVOKESTATIC,
            HELPER, "requiresAuthentication", "(Ljava/lang/Object;Z)Z", false));
        ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
        model.accept(writer);
        return writer.toByteArray();
    }
}
