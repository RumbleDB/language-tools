export type NotificationHandler<Payload> = (payload: Payload) => void | Promise<void>;

export interface Notification<Method extends string, Payload> {
    readonly method: Method;
    handle(handler: NotificationHandler<Payload>): NotificationHandler<Payload>;
}

export function defineNotification<Method extends string, Payload>(
    method: Method,
): Notification<Method, Payload> {
    return {
        method,
        handle: (handler) => handler,
    };
}
