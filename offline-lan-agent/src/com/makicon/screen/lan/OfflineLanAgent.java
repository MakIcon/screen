package com.makicon.screen.lan;

import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassTransform;
import java.lang.constant.ClassDesc;
import java.lang.constant.ConstantDescs;
import java.lang.constant.MethodTypeDesc;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;

/** Enables the host's explicit offline-LAN setting without changing remote logins. */
public final class OfflineLanAgent implements ClassFileTransformer {
    static final String TARGET = "net/minecraft/client/server/IntegratedServer";
    private static final ClassDesc INTEGRATED = ClassDesc.ofInternalName(TARGET);
    private static final ClassDesc SERVER = ClassDesc.of("net.minecraft.server.MinecraftServer");
    private static final MethodTypeDesc BOOLEAN = MethodTypeDesc.of(ConstantDescs.CD_boolean);

    public static void premain(String options, Instrumentation instrumentation) {
        instrumentation.addTransformer(new OfflineLanAgent());
        System.out.println("[ScreenLauncher LAN] Offline LAN hosting enabled for this launch.");
    }

    @Override
    public byte[] transform(ClassLoader loader, String name, Class<?> redefined,
                            ProtectionDomain domain, byte[] bytes) {
        if (!TARGET.equals(name) || redefined != null) return null;
        try {
            byte[] result = patch(bytes);
            System.out.println("[ScreenLauncher LAN] LAN worlds accept offline players when opened to the network.");
            return result;
        } catch (RuntimeException error) {
            System.err.println("[ScreenLauncher LAN] Could not enable offline LAN hosting: " + error);
            return null;
        }
    }

    static byte[] patch(byte[] bytes) {
        var classFile = ClassFile.of();
        var model = classFile.parse(bytes);
        if (!model.thisClass().asInternalName().equals(TARGET)
                || !model.superclass().orElseThrow().asSymbol().equals(SERVER)
                || model.methods().stream().anyMatch(method ->
                    method.methodName().equalsString("usesAuthentication")
                        && method.methodType().equalsString("()Z"))) {
            throw new IllegalArgumentException("Unsupported IntegratedServer class");
        }
        return classFile.transformClass(model, ClassTransform.endHandler(builder ->
            builder.withMethodBody("usesAuthentication", BOOLEAN, ClassFile.ACC_PUBLIC, code ->
                code.aload(0).invokevirtual(INTEGRATED, "isPublished", BOOLEAN)
                    .ifThenElse(
                        published -> published.iconst_0().ireturn(),
                        privateWorld -> privateWorld.aload(0)
                            .invokespecial(SERVER, "usesAuthentication", BOOLEAN).ireturn()))));
    }
}
