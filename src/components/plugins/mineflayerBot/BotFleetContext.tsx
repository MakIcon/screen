import { createContext, useContext } from "react";
import type { MineflayerBotProfile, MineflayerBotStatus } from "../../../types";
import type { FleetRequest } from "./fleetControl";

export type BotFleetWorkspace = {
  profiles: MineflayerBotProfile[];
  recipients: MineflayerBotProfile[];
  statuses: MineflayerBotStatus[];
  busy: boolean;
  crowdAvoidance: boolean;
  setCrowdAvoidance: (enabled: boolean) => void;
  setStorageBusy: (busy: boolean) => void;
  focusId: string;
  focus: (id: string) => void;
  nameFor: (bot: MineflayerBotProfile) => string;
  run: (
    label: string,
    requests: (bot: MineflayerBotProfile, status?: MineflayerBotStatus) => FleetRequest[],
    emergency?: boolean,
  ) => Promise<void>;
};

export const BotFleetContext = createContext<BotFleetWorkspace | null>(null);
export const useBotFleet = () => useContext(BotFleetContext);
