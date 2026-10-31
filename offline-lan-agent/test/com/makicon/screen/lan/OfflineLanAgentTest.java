package com.makicon.screen.lan;

import com.makicon.screen.lan.bootstrap.LanAuthentication;
import java.io.*;
import java.util.*;
import java.util.jar.*;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerLoginPacketListenerImpl;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class OfflineLanAgentTest {
    public static void main(String[] args) throws Exception {
        boolean enabled = Boolean.parseBoolean(args[0]);
        IntegratedServer integrated = new IntegratedServer();
        ServerLoginPacketListenerImpl login = new ServerLoginPacketListenerImpl();
        check(integrated.usesAuthentication(), "Original server getter remains unchanged");
        check(login.handleHello(integrated) != enabled, "LAN logins accept offline accounts by default");
        check(login.handleHello(new MinecraftServer()), "Dedicated servers retain original authentication");
        integrated.setUsesAuthentication(false);
        check(!login.handleHello(integrated), "Existing offline decisions remain offline");
        check(LanAuthentication.requiresAuthentication(null, true), "Unknown/null servers keep their original decision");
        for (int i = 1; i < args.length; i++) verifyJar(args[i], enabled);
        System.out.println("Agent/JVM checks passed (enabled=" + enabled + ").");
    }

    static void verifyJar(String path, boolean execute) throws Exception {
        ClassNode host = null;
        ClassNode login = null;
        ClassNode base = null;
        try (JarFile jar = new JarFile(path)) {
            Enumeration<JarEntry> entries = jar.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (!entry.getName().endsWith(".class")) continue;
                byte[] bytes;
                try (InputStream input = jar.getInputStream(entry); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                    byte[] chunk = new byte[8192]; int size;
                    while ((size = input.read(chunk)) != -1) buffer.write(chunk, 0, size);
                    bytes = buffer.toByteArray();
                }
                boolean integrated = OfflineLanAgent.contains(bytes, OfflineLanAgent.INTEGRATED_MARKER);
                boolean hello = OfflineLanAgent.contains(bytes, OfflineLanAgent.LOGIN_MARKER);
                if (!integrated && !hello && !entry.getName().equals(OfflineLanAgent.SERVER + ".class")) continue;
                ClassNode model = parse(bytes);
                if (model.name.equals(OfflineLanAgent.SERVER)) base = model;
                if (integrated && OfflineLanAgent.SERVER.equals(model.superName)) {
                    check(host == null, "Exactly one integrated host"); host = model;
                }
                if (hello) {
                    byte[] patched = OfflineLanAgent.patchLogin(bytes);
                    check(patched != null, "Real login layout is recognized");
                    check(OfflineLanAgent.patchLogin(patched) == null, "Already patched login is left alone");
                    ClassNode after = parse(patched);
                    check(after.methods.size() == model.methods.size(), "No game methods are added or removed");
                    int changed = 0;
                    for (int n = 0; n < model.methods.size(); n++) {
                        int delta = after.methods.get(n).instructions.size() - model.methods.get(n).instructions.size();
                        check(delta == 0 || delta == 2, "Only DUP and helper invocation are inserted");
                        if (delta != 0) changed++;
                    }
                    check(changed == 1, "Exactly one login method changes");
                    login = model;
                }
            }
        }
        if (host == null) {
            check(login == null, "Pre-LAN clients need no host transformation");
            System.out.println("Native pre-LAN client: " + path); return;
        }
        check(base != null, "Integrated server has its expected superclass");
        if (login == null) {
            // Pre-Netty LAN versions already disable authentication at startup.
            boolean nativeOffline = false;
            for (MethodNode method : host.methods) {
                if (!hasMarker(method, OfflineLanAgent.INTEGRATED_MARKER, true)) continue;
                for (AbstractInsnNode insn : method.instructions) {
                    if (insn instanceof MethodInsnNode && "(Z)V".equals(((MethodInsnNode) insn).desc)) {
                        AbstractInsnNode previous = previousOpcode(insn);
                        nativeOffline = previous != null && previous.getOpcode() == Opcodes.ICONST_0;
                        break;
                    }
                }
            }
            check(nativeOffline, "Legacy LAN already accepts offline players");
            System.out.println("Verified native offline LAN: " + path); return;
        }
        MethodInsnNode auth = null;
        for (MethodNode method : login.methods) {
            if (!hasMarker(method, OfflineLanAgent.LOGIN_MARKER, false)) continue;
            for (AbstractInsnNode insn : method.instructions) {
                if (insn instanceof MethodInsnNode) {
                    MethodInsnNode call = (MethodInsnNode) insn;
                    if (call.getOpcode() == Opcodes.INVOKEVIRTUAL && call.owner.equals(base.name) && call.desc.equals("()Z")) {
                        auth = call; break;
                    }
                }
            }
        }
        check(auth != null, "Real login checks a superclass boolean getter");
        boolean fieldGetter = false;
        for (MethodNode method : base.methods) {
            if (!method.name.equals(auth.name) || !method.desc.equals("()Z")) continue;
            int fields = 0;
            for (AbstractInsnNode insn : method.instructions)
                if (insn instanceof FieldInsnNode && insn.getOpcode() == Opcodes.GETFIELD && ((FieldInsnNode) insn).desc.equals("Z")) fields++;
            fieldGetter = fields == 1;
        }
        check(fieldGetter, "Selected check reads the real server authentication flag");
        if (execute) executeIsolated(host.name, auth.name);
        System.out.println("Verified obfuscated/remapped LAN login: " + path);
    }

    static void executeIsolated(String hostName, String getter) throws Exception {
        IsolatedLoader loader = new IsolatedLoader();
        Class<?> base = loader.define(OfflineLanAgent.SERVER, serverClass(OfflineLanAgent.SERVER, "java/lang/Object", getter, false));
        byte[] hostBytes = serverClass(hostName, OfflineLanAgent.SERVER, getter, true);
        new OfflineLanAgent().transform(loader, hostName, null, null, hostBytes);
        Class<?> host = loader.define(hostName, hostBytes);
        ClassWriter writer = new ClassWriter(0);
        writer.visit(Opcodes.V1_8, Opcodes.ACC_PUBLIC, "matrix/Login", null, "java/lang/Object", null);
        MethodVisitor method = writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC, "hello", "(L" + OfflineLanAgent.SERVER + ";)Z", null, null);
        method.visitCode(); method.visitLdcInsn(OfflineLanAgent.LOGIN_MARKER); method.visitInsn(Opcodes.POP);
        method.visitVarInsn(Opcodes.ALOAD, 0); method.visitMethodInsn(Opcodes.INVOKEVIRTUAL, OfflineLanAgent.SERVER, getter, "()Z", false);
        method.visitInsn(Opcodes.IRETURN); method.visitMaxs(1, 1); method.visitEnd(); writer.visitEnd();
        Class<?> login = loader.define("matrix/Login", OfflineLanAgent.patchLogin(writer.toByteArray()));
        java.lang.reflect.Method hello = login.getMethod("hello", base);
        check(!(Boolean) hello.invoke(null, host.getConstructor().newInstance()), "Isolated game loader accepts offline LAN");
        check((Boolean) hello.invoke(null, base.getConstructor().newInstance()), "Isolated dedicated server still checks authentication");
    }

    static byte[] serverClass(String name, String parent, String getter, boolean host) {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(Opcodes.V1_8, Opcodes.ACC_PUBLIC, name, null, parent, null);
        MethodVisitor ctor = writer.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
        ctor.visitCode(); ctor.visitVarInsn(Opcodes.ALOAD, 0); ctor.visitMethodInsn(Opcodes.INVOKESPECIAL, parent, "<init>", "()V", false);
        ctor.visitInsn(Opcodes.RETURN); ctor.visitMaxs(1, 1); ctor.visitEnd();
        MethodVisitor method = writer.visitMethod(Opcodes.ACC_PUBLIC, host ? "startupMessage" : getter, host ? "()Ljava/lang/String;" : "()Z", null, null);
        method.visitCode(); if (host) method.visitLdcInsn(OfflineLanAgent.INTEGRATED_MARKER); else method.visitInsn(Opcodes.ICONST_1);
        method.visitInsn(host ? Opcodes.ARETURN : Opcodes.IRETURN); method.visitMaxs(1, 1); method.visitEnd();
        writer.visitEnd(); return writer.toByteArray();
    }

    static final class IsolatedLoader extends ClassLoader {
        IsolatedLoader() { super(null); }
        Class<?> define(String name, byte[] bytes) { return defineClass(name.replace('/', '.'), bytes, 0, bytes.length); }
    }
    static ClassNode parse(byte[] bytes) { ClassNode model = new ClassNode(); new ClassReader(bytes).accept(model, 0); return model; }
    static AbstractInsnNode previousOpcode(AbstractInsnNode insn) { do { insn = insn.getPrevious(); } while (insn != null && insn.getOpcode() < 0); return insn; }
    static boolean hasMarker(MethodNode method, String marker, boolean prefix) {
        for (AbstractInsnNode insn : method.instructions) if (insn instanceof LdcInsnNode && ((LdcInsnNode) insn).cst instanceof String) {
            String value = (String) ((LdcInsnNode) insn).cst; if (prefix ? value.startsWith(marker) : value.equals(marker)) return true;
        }
        return false;
    }
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
