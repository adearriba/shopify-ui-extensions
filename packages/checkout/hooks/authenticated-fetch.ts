import { useCallback } from 'react';
import { useApi } from "@shopify/ui-extensions-react/checkout";

const useAuthenticatedFetch = () => {
    const { sessionToken } = useApi();

    const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init?: RequestInit | undefined) => {
        try {
            const token = await sessionToken.get();

            const defaultHeaders = {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            };

            const mergedHeaders = {
                ...defaultHeaders,
                ...(init?.headers || {}) // Merge incoming headers with default ones
            };

            const mergedInit: RequestInit = {
                ...init,
                headers: mergedHeaders,
            };

            const response = await fetch(input, {
                ...mergedInit
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }, [sessionToken]);

    return fetchWithAuth;
};

export default useAuthenticatedFetch;
