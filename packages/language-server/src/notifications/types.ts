export type NotificationHandler<Payload> = (payload: Payload) => void | Promise<void>;

export interface Notification<Method extends string, Payload> {
    method: Method;
    handle(handler: NotificationHandler<Payload>): NotificationHandler<Payload>;
}

export interface NotificationInitializer<Method extends string, Payload> {
    notification: Notification<Method, Payload>;
    initialize(send: RawNotificationSender): Notification<Method, Payload>;
}

export type RawNotificationSender = <Payload>(method: string, payload: Payload) => void;

interface NotificationInitializerDefinition<Method extends string, Payload> {
    method: Method;
    initialize?: (send: (payload: Payload) => void) => void;
}

export function defineNotificationInitializer<Method extends string, Payload>(
    definition: NotificationInitializerDefinition<Method, Payload>,
): NotificationInitializer<Method, Payload> {
    const notification = defineNotification<Method, Payload>(definition.method);

    return {
        notification,
        initialize: (send) => {
            definition.initialize?.((payload) => {
                send(notification.method, payload);
            });
            return notification;
        },
    };
}

function defineNotification<Method extends string, Payload>(
    method: Method,
): Notification<Method, Payload> {
    return {
        method,
        handle: (handler) => handler,
    };
}
