import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import { ParserService } from "server/parser/index.js";
import { WorkspaceService } from "server/workspace/service.js";
import { WorkspaceIndex } from "server/workspace/workspace-index.js";

export const parserService = new ParserService();
export const workspaceService = new WorkspaceService(new WorkspaceIndex(parserService));
export const wrapperClient = new RumbleWrapperClient();
