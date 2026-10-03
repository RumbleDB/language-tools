import type {
    OpenErrorLocationRequest,
    OpenRawOutputRequest,
    ResultsRequest,
    ResultsResponse,
} from "../shared/results-protocol.js";

interface ResultsHandlers {
    openErrorLocation: (message: OpenErrorLocationRequest) => Promise<void>;
    openRawOutput: (message: OpenRawOutputRequest) => Promise<void>;
    rerunQuery: () => Promise<void>;
}

export async function handleResultsMessage(
    message: ResultsRequest,
    handlers: ResultsHandlers,
    respond: (response: ResultsResponse) => void | PromiseLike<unknown>,
): Promise<void> {
    switch (message.type) {
        case "RERUN_QUERY":
            await handlers.rerunQuery();
            return;
        case "OPEN_ERROR_LOCATION":
            try {
                await handlers.openErrorLocation(message);
            } catch (error) {
                await respond({
                    type: "OPEN_ERROR_LOCATION_ERROR",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        case "OPEN_RAW_OUTPUT":
            await handlers.openRawOutput(message);
    }
}
