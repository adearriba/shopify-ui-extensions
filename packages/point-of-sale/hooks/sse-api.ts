import {
    type RemoteSubscribable,
    StatefulRemoteSubscribable,
    makeStatefulSubscribable,
} from '@remote-ui/async-subscription';
import { useEffect, useRef, useState } from 'react';


export interface SSEClient {
    clientId?: string;
    connected: boolean;
    lastMessage?: any;
    error?: string;
    reconnect: () => void;
}

export const defaultSSEClient: SSEClient = {
    connected: false,
    reconnect: () => { return; },
};

/**
 * Global instance of the subscribable that is created on the first `useStatefulSubscribableSSE` call.
 * Use `destroyStatefulSubscribableSSE` to destroy it and all of the subscribers.
 */
let statefulSubscribable: StatefulRemoteSubscribable<SSEClient> | undefined;

/**
 * A function destroying the subscriptions `useStatefulSubscribableSSE` has.
 */
export function destroyStatefulSubscribableSSE(): void {
    statefulSubscribable?.destroy();
    statefulSubscribable = undefined;
}

/**
 * A hook utilizing `useState` and the `useStatefulSubscribableSSE` function to create a component state.
 * @returns this hook returns the latest SSE state which re-renders on change.
 */
export function useSSESubscription(url: string | undefined): SSEClient {
    const statefulSubscribableSSE = useStatefulSubscribableSSE(url);
    const [sseState, setSSEState] = useState<SSEClient>(statefulSubscribableSSE?.current ?? defaultSSEClient);

    const unsubscribeRef = useRef<() => void>();

    useEffect(() => {
        if (!statefulSubscribableSSE) return;

        if (!unsubscribeRef.current && url && url.length > 0) {
            unsubscribeRef.current = statefulSubscribableSSE.subscribe((sseState: SSEClient) => {
                setSSEState(sseState);
            });
        }

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = undefined;
            }
        };
    }, [statefulSubscribableSSE]);

    return sseState;
}

/**
 * A hook utilizing the `makeStatefulSubscribable` function to allow multiple SSE subscriptions.
 * @returns StatefulRemoteSubscribable object with a SSEState in it.
 */
export function useStatefulSubscribableSSE(url: string | undefined): StatefulRemoteSubscribable<SSEClient> | undefined {
    if (!statefulSubscribable && url) {
        statefulSubscribable = makeStatefulSubscribable(new RemoteSSESubscribable(url));
    }

    return statefulSubscribable;
}


// Simple TextDecoder polyfill
const TextDecoderPolyfill = function (encoding) {
    this.encoding = encoding;
};

TextDecoderPolyfill.prototype.decode = function (input) {
    if (this.encoding === "utf-8") {
        return decodeURIComponent(escape(String.fromCharCode.apply(null, new Uint8Array(input))));
    }
    throw new Error("Unsupported encoding");
};

export class RemoteSSESubscribable implements RemoteSubscribable<SSEClient> {
    private url: string;
    private client: SSEClient;
    private subscribers: Set<(value: SSEClient) => void>;
    private reader?: ReadableStreamDefaultReader<Uint8Array>;

    constructor(url: string) {
        this.url = url;
        this.client = {
            ...defaultSSEClient,
            reconnect: () => {
                this._disconnect();
                this._connect();
            }
        };
        this.subscribers = new Set();
        this.reader = undefined;
    }

    get initial() {
        return defaultSSEClient;
    }

    get current() {
        return defaultSSEClient;
    }

    async subscribe(subscriber: (value: SSEClient) => void): Promise<[() => void, SSEClient]> {
        this.subscribers.add(subscriber);

        if (!this.reader) {
            await this._connect();
        }

        const unsubscribe = () => {
            this.subscribers.delete(subscriber);
            if (this.subscribers.size === 0) {
                this._disconnect();
            }
        };

        return [unsubscribe, this.client];
    }

    private async _connect() {
        if (!this.url || this.url.length <= 1) return;
        try {
            const response = await fetch(this.url, {
                method: "GET",
            });

            if (!response.body) {
                throw new Error("ReadableStream not supported in this environment");
            }

            this.reader = response.body.getReader();
            const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : new TextDecoderPolyfill("utf-8");

            while (true) {
                const { done, value } = await this.reader!.read();
                if (done) {
                    console.log("Reader is done");
                    break
                };
                this._onMessage(decoder.decode(value));
            }
        } catch (error) {
            console.error("Error connecting to SSE:", error);
            this._notifySubscribers({
                ...this.client,
                error: error.message,
                connected: false,
            });
        } finally {
            this._notifySubscribers({
                ...this.client,
                connected: false,
            });
        }
    }

    private _onMessage(message: string) {
        const messageObjects = this._extractFromSSE(message);
        messageObjects.forEach(obj => {
            this._notifySubscribers({
                ...this.client,
                connected: true,
                lastMessage: obj,
            });
        });
    }

    private _disconnect() {
        if (this.reader) {
            this.reader.cancel();
            this._notifySubscribers({
                ...this.client,
                connected: false,
            });
        }
    }

    private _notifySubscribers(state: SSEClient) {
        this.subscribers.forEach((subscriber) => {
            subscriber(state);
        });
    }

    private _extractFromSSE(ssePayload: string) {
        const dataLines: string[] = [];
        let startIndex = 0;
        while (true) {
            const dataIndex = ssePayload.indexOf('data: ', startIndex);
            if (dataIndex === -1) break;

            startIndex = dataIndex + 6;
            const endIndex = ssePayload.indexOf('\n', startIndex);
            dataLines.push(ssePayload.slice(startIndex, endIndex).trim());
            startIndex = endIndex;
        }

        try {
            return dataLines.map(line => JSON.parse(line));
        } catch (error) {
            console.error("Failed to parse JSON data:", error);

            this._notifySubscribers({
                ...this.client,
                error: `Failed to parse JSON data: ${ssePayload}`,
            });

            return [];
        }
    }
}
