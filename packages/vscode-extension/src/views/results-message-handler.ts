import type {
    ExportResultsRequest,
    OpenErrorLocationRequest,
    ResultsRequest,
    ResultsResponse,
} from "../shared/results-protocol.js";

interface ResultsHandlers {
    exportResults: (message: ExportResultsRequest) => Promise<void>;
    openErrorLocation: (message: OpenErrorLocationRequest) => Promise<void>;
}

export async function handleResultsMessage(
    message: ResultsRequest,
    handlers: ResultsHandlers,
    respond: (response: ResultsResponse) => void | PromiseLike<unknown>,
): Promise<void> {
    switch (message.type) {
        case "EXPORT_RESULTS":
            await handlers.exportResults(message);
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
    }
}
