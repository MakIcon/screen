package com.makicon.screen.obs.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.makicon.screen.obs.OBSTelemetry;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;

public class OBSTelemetryClient implements ClientModInitializer {
	private static final Gson GSON = new Gson();
	private static final long SEND_INTERVAL_MS = 250L;
	private static final int PORT = Integer.getInteger("screen.obs.port", -1);
	private static final String TOKEN = System.getProperty("screen.obs.token", "");
	private static final String MINECRAFT_VERSION = FabricLoader.getInstance()
		.getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString();

	private final HttpClient httpClient = HttpClient.newBuilder()
		.connectTimeout(Duration.ofMillis(600))
		.build();
	private final AtomicBoolean sending = new AtomicBoolean(false);
	private final AtomicBoolean sampleQueued = new AtomicBoolean(false);
	private volatile long nextAttemptMs = 0L;
	private int failures = 0;
	private volatile long lastErrorLogMs = 0L;

	@Override
	public void onInitializeClient() {
		if (!isConfigured()) {
			OBSTelemetry.LOGGER.info("OBS telemetry is disabled because launcher JVM properties are missing.");
			return;
		}

		Thread worker = new Thread(this::runTelemetryLoop, "Screen OBS Telemetry");
		worker.setDaemon(true);
		worker.start();
		OBSTelemetry.LOGGER.info("OBS telemetry is sending to 127.0.0.1:{}.", PORT);
	}

	private static boolean isConfigured() {
		return PORT > 0 && PORT <= 65535 && TOKEN != null && !TOKEN.isBlank();
	}

	private void runTelemetryLoop() {
		while (!Thread.currentThread().isInterrupted()) {
			try {
				Minecraft minecraft = Minecraft.getInstance();
				if (minecraft != null && !sending.get() && System.currentTimeMillis() >= nextAttemptMs
					&& sampleQueued.compareAndSet(false, true)) {
					minecraft.execute(() -> {
						try {
							sampleAndSend(minecraft);
						} catch (RuntimeException error) {
							sending.set(false);
							logSendError(error);
						} finally {
							sampleQueued.set(false);
						}
					});
				}
				Thread.sleep(SEND_INTERVAL_MS);
			} catch (InterruptedException error) {
				Thread.currentThread().interrupt();
			} catch (RuntimeException error) {
				sampleQueued.set(false);
				logSendError(error);
				sleepQuietly(1000L);
			}
		}
	}

	private void sampleAndSend(Minecraft minecraft) {
		LocalPlayer player = minecraft.player;
		if (player == null || player.level() == null || !sending.compareAndSet(false, true)) {
			return;
		}

		String body = GSON.toJson(createPayload(player));
		HttpRequest request = HttpRequest.newBuilder()
			.uri(URI.create("http://127.0.0.1:" + PORT + "/api/telemetry"))
			.timeout(Duration.ofMillis(900))
			.header("Content-Type", "application/json")
			.header("X-Screen-OBS-Token", TOKEN)
			.POST(HttpRequest.BodyPublishers.ofString(body))
			.build();

		httpClient
			.sendAsync(request, HttpResponse.BodyHandlers.discarding())
			.whenComplete((response, error) -> {
				if (error != null) {
					backoff();
					logSendError(error);
				} else if (response.statusCode() >= 400) {
					backoff();
					logSendError(new IllegalStateException("HTTP " + response.statusCode()));
				} else {
					failures = 0;
					nextAttemptMs = 0L;
				}
				sending.set(false);
			});
	}

	private JsonObject createPayload(LocalPlayer player) {
		JsonObject payload = new JsonObject();
		BlockPos block = player.blockPosition();

		payload.addProperty("minecraftVersion", MINECRAFT_VERSION);
		payload.addProperty("playerName", player.getName().getString());
		payload.addProperty("dimension", player.level().dimension().location().toString());
		payload.addProperty("health", player.getHealth());
		payload.addProperty("maxHealth", player.getMaxHealth());
		payload.addProperty("armor", player.getArmorValue());
		payload.addProperty("food", player.getFoodData().getFoodLevel());
		payload.addProperty("saturation", player.getFoodData().getSaturationLevel());
		payload.addProperty("experienceLevel", player.experienceLevel);
		payload.addProperty("experienceProgress", player.experienceProgress);
		payload.addProperty("totalExperience", player.totalExperience);
		payload.addProperty("yaw", player.getYRot());
		payload.addProperty("pitch", player.getXRot());
		payload.addProperty("sentAtMs", System.currentTimeMillis());

		JsonObject position = new JsonObject();
		position.addProperty("x", player.getX());
		position.addProperty("y", player.getY());
		position.addProperty("z", player.getZ());
		payload.add("position", position);

		JsonObject blockPosition = new JsonObject();
		blockPosition.addProperty("x", block.getX());
		blockPosition.addProperty("y", block.getY());
		blockPosition.addProperty("z", block.getZ());
		payload.add("blockPosition", blockPosition);

		payload.add("heldItem", itemToJson(player.getMainHandItem(), "main_hand"));
		payload.add("offhandItem", itemToJson(player.getOffhandItem(), "offhand"));

		JsonArray armorItems = new JsonArray();
		addArmorItem(armorItems, player, EquipmentSlot.HEAD, "head");
		addArmorItem(armorItems, player, EquipmentSlot.CHEST, "chest");
		addArmorItem(armorItems, player, EquipmentSlot.LEGS, "legs");
		addArmorItem(armorItems, player, EquipmentSlot.FEET, "feet");
		payload.add("armorItems", armorItems);

		return payload;
	}

	private void addArmorItem(JsonArray armorItems, LocalPlayer player, EquipmentSlot slot, String slotName) {
		ItemStack stack = player.getItemBySlot(slot);
		if (!stack.isEmpty()) {
			armorItems.add(itemToJson(stack, slotName));
		}
	}

	private JsonObject itemObject(ItemStack stack, String slot) {
		JsonObject item = new JsonObject();
		int maxDamage = Math.max(0, stack.getMaxDamage());
		int damage = Math.max(0, stack.getDamageValue());
		int durability = Math.max(0, maxDamage - damage);
		float durabilityPercent = maxDamage > 0 ? (durability * 100.0F) / maxDamage : 0.0F;

		item.addProperty("slot", slot);
		item.addProperty("itemId", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
		item.addProperty("displayName", stack.getHoverName().getString());
		item.addProperty("count", stack.getCount());
		item.addProperty("damage", damage);
		item.addProperty("maxDamage", maxDamage);
		item.addProperty("durability", durability);
		item.addProperty("durabilityPercent", durabilityPercent);
		return item;
	}

	private com.google.gson.JsonElement itemToJson(ItemStack stack, String slot) {
		if (stack == null || stack.isEmpty()) {
			return JsonNull.INSTANCE;
		}
		return itemObject(stack, slot);
	}

	private void logSendError(Throwable error) {
		long now = System.currentTimeMillis();
		if (now - lastErrorLogMs < 5000L) {
			return;
		}
		lastErrorLogMs = now;
		OBSTelemetry.LOGGER.warn("OBS telemetry send failed: {}", error.getMessage());
	}

	private void backoff() {
		failures = Math.min(failures + 1, 5);
		nextAttemptMs = System.currentTimeMillis() + Math.min(5000L, SEND_INTERVAL_MS << failures);
	}

	private static void sleepQuietly(long millis) {
		try {
			Thread.sleep(millis);
		} catch (InterruptedException error) {
			Thread.currentThread().interrupt();
		}
	}
}
