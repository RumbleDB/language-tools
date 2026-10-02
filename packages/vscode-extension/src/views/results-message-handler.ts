import type {
    ExportResultsRequest,
    ExportResult,
    OpenErrorLocationRequest,
    ResultsRequest,
    ResultsResponse,
} from "../shared/results-protocol.js";

interface ResultsHandlers {
    exportResults: (message: ExportResultsRequest) => Promise<ExportResult>;
    openErrorLocation: (message: OpenErrorLocationRequest) => Promise<void>;
}

export async function handleResultsMessage(
    message: ResultsRequest,
    handlers: ResultsHandlers,
    respond: (response: ResultsResponse) => void | PromiseLike<unknown>,
): Promise<void> {
    let response: ResultsResponse;
    try {
        switch (message.type) {
            case "EXPORT_RESULTS":
                response = await handlers.exportResults(message);
                break;
            case "OPEN_ERROR_LOCATION":
                await handlers.openErrorLocation(message);
                return;
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        response =
            message.type === "EXPORT_RESULTS"
                ? { type: "EXPORT_RESULT", status: "error", message: detail }
                : { type: "OPEN_ERROR_LOCATION_ERROR", message: detail };
    }
    await respond(response);
}
