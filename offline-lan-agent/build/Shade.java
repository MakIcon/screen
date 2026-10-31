import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.commons.*;

/** Isolates the agent's ASM from versions supplied by Minecraft mod loaders. */
public final class Shade {
    public static void main(String[] args) throws Exception {
        Path output = Paths.get(args[0]);
        Remapper remapper = new Remapper(Opcodes.ASM9) {
            @Override public String map(String name) {
                return name.startsWith("org/objectweb/asm/")
                    ? "com/makicon/screen/lan/internal/asm/" + name.substring("org/objectweb/asm/".length())
                    : name;
            }
        };
        for (int i = 1; i < args.length; i++) {
            try (JarFile jar = new JarFile(args[i])) {
                Enumeration<JarEntry> entries = jar.entries();
                while (entries.hasMoreElements()) {
                    JarEntry entry = entries.nextElement();
                    if (!entry.getName().endsWith(".class") || entry.getName().equals("module-info.class")) continue;
                    byte[] bytes;
                    try (InputStream input = jar.getInputStream(entry); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                        byte[] chunk = new byte[8192];
                        int size;
                        while ((size = input.read(chunk)) != -1) buffer.write(chunk, 0, size);
                        bytes = buffer.toByteArray();
                    }
                    ClassReader reader = new ClassReader(bytes);
                    ClassWriter writer = new ClassWriter(0);
                    reader.accept(new ClassRemapper(writer, remapper), 0);
                    Path target = output.resolve(remapper.map(reader.getClassName()) + ".class");
                    Files.createDirectories(target.getParent());
                    Files.write(target, writer.toByteArray());
                }
            }
        }
    }
}
