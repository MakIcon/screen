package com.makicon.screen.lan.bootstrap;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

/** Shared by vanilla and mod class loaders through Boot-Class-Path. */
public final class LanAuthentication {
    private static final Map<ClassLoader, Set<String>> INTEGRATED = new WeakHashMap<ClassLoader, Set<String>>();
    private LanAuthentication() { }

    public static synchronized void register(ClassLoader loader, String name) {
        Set<String> names = INTEGRATED.get(loader);
        if (names == null) {
            names = new HashSet<String>();
            INTEGRATED.put(loader, names);
        }
        names.add(name);
    }

    public static synchronized boolean requiresAuthentication(Object server, boolean original) {
        if (!original || server == null) return original;
        for (Class<?> type = server.getClass(); type != null; type = type.getSuperclass()) {
            Set<String> names = INTEGRATED.get(type.getClassLoader());
            if (names != null && names.contains(type.getName())) return false;
        }
        return original;
    }
}
